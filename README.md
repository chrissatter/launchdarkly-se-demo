# LaunchDarkly SE Technical Exercise Demo

React + Vite demo for the LaunchDarkly SE homework. The app presents a mock ABC SaaS landing page with a LaunchDarkly-powered demo console and demonstrates:

- Safe release and rollback with `new-landing-page-hero`
- Live flag change listening with no page reload
- Individual targeting and rule-based targeting
- Remediation trigger workflow via generated webhook URL
- LaunchDarkly-hosted metric and experiment setup for CTA conversion
- AI Config-style chatbot prompt and model control
- REST API setup automation for repeatable tenant bootstrap
- Terraform provider example for the integrations extra credit

Primary LaunchDarkly resources:

```text
new-landing-page-hero
support-chatbot-ai-config
landing-page-cta-clicked
```

## Table of Contents

- [Prerequisites and Assumptions](#prerequisites-and-assumptions)
- [Quick Start](#quick-start)
  - [What the Setup Creates](#what-the-setup-creates)
- [Part 1: Release and Remediate](#part-1-release-and-remediate)
- [Part 2: Target](#part-2-target)
- [Extra Credit: Experimentation](#extra-credit-experimentation)
- [Extra Credit: AI Configs](#extra-credit-ai-configs)
- [Extra Credit: Integrations](#extra-credit-integrations)
- [Alternative Setup Paths](#alternative-setup-paths)
  - [Manual UI Setup](#manual-ui-setup)
  - [Terraform Setup](#terraform-setup)
- [Cleanup](#cleanup)
  - [Option 1: REST API Cleanup](#option-1-rest-api-cleanup)
  - [Option 2: Manual UI Cleanup](#option-2-manual-ui-cleanup)
  - [Option 3: Terraform Cleanup](#option-3-terraform-cleanup)
- [Demo Script](#demo-script)
- [Notes for Reviewers](#notes-for-reviewers)

## Prerequisites and Assumptions

This solution is published as a public GitHub repository:

```text
https://github.com/chrissatter/launchdarkly-se-demo
```

Assumptions for running the sample implementation:

- You have a LaunchDarkly account or trial tenant where you can create flags, metrics, triggers, and experiments.
- You have access to a LaunchDarkly project and environment. The examples assume:

  ```text
  Project key: default
  Environment key: test
  ```

  Use different values by changing `LD_PROJECT_KEY` and `LD_ENV_KEY`.

- For automated setup, you can create a LaunchDarkly API access token with `Writer` or `Admin` permissions. `Reader` is not sufficient.
- You have Git, Node.js 18 or newer, and npm installed locally. Node.js 20 LTS is recommended.
- You can run shell commands in a bash/zsh-style terminal. The examples use macOS/Linux syntax for `export`; Windows PowerShell users can set the same environment variables with `$env:NAME="value"`.
- You have a modern browser available to open the Vite dev server URL.
- Optional: install Terraform if you want to demonstrate the integrations extra credit using the Terraform provider.

## Quick Start

Use this path to simulate what a reviewer will do from a fresh GitHub clone. It sets up the local app and bootstraps the required LaunchDarkly resources with the REST API script.

1. Clone the repository:

   ```bash
   git clone https://github.com/chrissatter/launchdarkly-se-demo.git
   cd launchdarkly-se-demo
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create an environment file:

   ```bash
   cp .env.example .env
   ```

4. Create a LaunchDarkly API token with write access to flags and metrics.

   See LaunchDarkly's [API access token documentation](https://launchdarkly.com/docs/home/account/api).

   For this demo, use:

   ```text
   Role: Writer or Admin
   API version: latest available
   Service token: recommended if available
   ```

   Do not use `Reader`. The setup script creates and updates flags, metrics, targeting rules, and a remediation trigger, so read-only access will fail.

5. Run the automated LaunchDarkly setup:

   ```bash
   export LD_API_TOKEN="api-..."
   export LD_PROJECT_KEY="default"
   export LD_ENV_KEY="test"
   export LD_CREATE_TRIGGER=true
   npm run ld:setup
   ```

   The script updates `.env` in the current directory with:

   ```bash
   VITE_LD_CLIENT_ID=...
   LD_REMEDIATION_TRIGGER_URL=...
   ```

   It does not write `LD_API_TOKEN` to `.env`; keep the token shell-only and out of Git.

6. Run the app:

   ```bash
   npm run dev
   ```

   Open the local URL printed by Vite, usually `http://localhost:5173/`. If that port is busy, Vite will print the next available port, such as `http://localhost:5174/`.

### What the Setup Creates

The REST script uses LaunchDarkly's API to:

- Create or reuse `new-landing-page-hero`
- Enable client-side SDK availability
- Turn targeting on for the selected environment
- Set the off/default behavior to `false`
- Add the individual target `alice-beta-001 -> true`
- Add the rule `user.plan is one of enterprise -> true`
- Add the experiment cohort rule `user.experimentCohort is one of landing-page-q3 -> false`
- Create the metric `landing-page-cta-clicked` for the custom event `hero-cta-clicked`
- Create the AI config flag `support-chatbot-ai-config`
- Create a generic remediation trigger that turns the flag off

The script prepares the flag, targeting rules, metric, remediation trigger, and chatbot configuration flag. The only remaining LaunchDarkly UI step is starting the experiment iteration in **Extra Credit: Experimentation**.

## Part 1: Release and Remediate

Scenario: ABC Company wants to release features faster without increasing risk. This demo wraps a new landing page hero in a LaunchDarkly feature flag so the feature can be released, rolled back, and remediated without a deployment.

### Feature Flag

The flag `new-landing-page-hero` controls the landing page hero.

- `false`: control experience, "Reliable operations for modern SaaS teams"
- `true`: new experience, "Launch the new customer experience without waiting for deploys"

To demonstrate release and rollback:

1. Select **Individually targeted beta user** or **Enterprise rule match** in the app's context switcher.
2. Start with the flag off. The local app should show the control hero and `Raw value: false`.
3. Turn the flag on in LaunchDarkly and serve `true` to the current context.
4. The app should switch to the new hero.
5. Turn the flag off again.
6. The app should roll back to the control hero.

### Instant Releases and Rollbacks

The app subscribes to LaunchDarkly flag updates with a change listener:

```js
ldClient.on("change:new-landing-page-hero", handleChange)
```

Keep the local app open while changing the flag in LaunchDarkly. The hero should update without a browser refresh, and the **Live listener** section in the right-side demo console should log the change event.

### Remediation Trigger

The remediation path uses a LaunchDarkly flag trigger that turns targeting off. I tested this by invoking the generated trigger URL with `curl`; after the request, LaunchDarkly showed the flag as off and the app rolled back to the control experience.

Use the trigger URL from your local `.env`:

```bash
curl -X POST "$LD_REMEDIATION_TRIGGER_URL"
```

The same command can include optional incident context:

```bash
curl -X POST "$LD_REMEDIATION_TRIGGER_URL" \
  -H "Content-Type: application/json" \
  -d '{"eventName":"Demo incident: hero conversion errors","url":"http://localhost:5173"}'
```

This satisfies the remediation requirement: a problematic feature can be turned off manually via `curl` with minimal customer impact.

## Part 2: Target

The app includes a context switcher in the right-side demo console. Each card calls `ldClient.identify(...)` with different context attributes.

The automated setup already creates these targeting examples. If you are configuring LaunchDarkly manually, use:

1. Keep the flag on, but set the default rule to serve `false`.
2. Add an individual target:

   ```text
   user key alice-beta-001 serves true
   ```

3. Add a rule-based target:

   ```text
   If user.plan is one of enterprise, serve true
   ```

Expected local behavior:

- **Anonymous prospect**: receives `false` and sees the control hero.
- **Individually targeted beta user**: receives `true` and sees the new hero.
- **Enterprise rule match**: receives `true` through the `plan = enterprise` rule and sees the new hero.

## Extra Credit: Experimentation

Scenario: ABC Company wants to measure whether the redesigned landing page improves CTA conversion before rolling it out broadly.

This repo uses the same feature flag from Part 2:

```text
new-landing-page-hero
```

The app already sends a custom LaunchDarkly event when the CTA is clicked:

```text
hero-cta-clicked
```

The right-side demo console also includes **Generate sample traffic**, which creates synthetic experiment visitors with this attribute:

```text
user.experimentCohort = landing-page-q3
```

Use that cohort for the experiment audience so it does not interfere with the Part 2 targeting examples. If you used the REST setup script, the metric and cohort rule are already created. If you configured LaunchDarkly manually, use the metric and cohort settings in [Manual UI Setup](#manual-ui-setup).

### Experiment

Create an experiment using the existing flag and metric:

```text
Name: Landing page hero CTA experiment
Hypothesis: The new landing page hero increases CTA conversion.
Metric source: LaunchDarkly
Primary metric: Landing page CTA clicked
Flag: new-landing-page-hero
Targeting rule: Experiment cohort
Randomize by: user
Traffic split: 50% false, 50% true
Variation served outside experiment: false
Control: false
```

Turn the flag on, then start an experiment iteration.

### Measure

For a reviewer demo:

1. Start the experiment iteration in LaunchDarkly.
2. Open the local app.
3. Click **Generate sample traffic** a few times.
4. Wait a few minutes for LaunchDarkly to process events.
5. Open the experiment's **Results** tab and compare conversion between `false` and `true`.

For a real product decision, do not rely on the synthetic traffic generator. Run the experiment against real eligible traffic until LaunchDarkly shows enough sample size and confidence to make a decision.

## Extra Credit: AI Configs

Scenario: ABC Company is rolling out a customer support chatbot and wants product managers to change prompts and models without redeploying the app.

The app includes an **AI Config** panel in the right-side demo console. It reads this LaunchDarkly-controlled config:

```text
support-chatbot-ai-config
```

The config controls:

```text
Model
Temperature
System prompt
Welcome message
Response style
Escalation threshold
```

When the config changes in LaunchDarkly, the chatbot panel updates without a code change or redeploy. If you use an AI Config / AgentControl-enabled tenant, map the values above into an AI Config. If not, use the JSON flag fallback created by the REST setup script.

### Optional AI Experiment

To test prompt and model variants, create metrics from these app events:

```text
chatbot-message-sent
chatbot-helpful-clicked
chatbot-escalation-clicked
```

Suggested experiment:

```text
Name: Support chatbot AI config experiment
Hypothesis: The empathetic escalation guide improves helpful feedback without increasing escalations.
Config or flag: support-chatbot-ai-config
Primary metric: chatbot-helpful-clicked
Guardrail metric: chatbot-escalation-clicked
Audience: user.plan is one of pro, enterprise
Split: 50% concise, 50% empathetic
```

For a reviewer demo, ask the chatbot a support question, switch the config variation in LaunchDarkly, and ask again. The visible model, prompt, and generated response style should change immediately.

## Extra Credit: Integrations

This repo uses Terraform as the LaunchDarkly integration story. LaunchDarkly lists Terraform in its integrations catalog, and the provider lets teams manage flags and targeting as infrastructure instead of relying only on UI clicks.

The Terraform example provisions:

```text
new-landing-page-hero
support-chatbot-ai-config
individual targeting for alice-beta-001
enterprise rule-based targeting
experiment cohort targeting
client-side SDK availability
environment-level default/off behavior
```

From a fresh clone, use:

```bash
cd terraform
cp main.tf.example main.tf
export TF_VAR_launchdarkly_access_token="api-..."
terraform init
terraform plan
terraform apply
```

Then copy the environment Client-side ID into `.env` and run the app normally.

The Terraform integration is a strong SE demo point because it shows how LaunchDarkly fits into an existing platform engineering workflow: application teams can review flag and targeting changes, promote them through pull requests, and keep tenant configuration reproducible.

## Alternative Setup Paths

The Quick Start path is the recommended reviewer flow. Use these alternatives when you want to show the underlying LaunchDarkly setup work or demo Terraform as an integration.

### Manual UI Setup

Use this path if you do not want to run the REST setup script.

1. Copy the environment **Client-side ID** into `.env`:

   ```bash
   VITE_LD_CLIENT_ID=your-client-side-id
   ```

2. Create the boolean flag:

   ```text
   Name: new-landing-page-hero
   Key: new-landing-page-hero
   Variations: Boolean
   On variation: true
   Off variation: false
   Available on client-side SDKs: enabled
   ```

3. Configure release behavior:

   ```text
   Flag targeting: On
   Default rule: serve false
   Off variation: false
   ```

4. Add Part 2 targeting:

   ```text
   Individual target: user alice-beta-001 serves true
   Rule: if user.plan is one of enterprise, serve true
   Rule: if user.experimentCohort is one of landing-page-q3, serve false
   ```

5. Create a remediation trigger that turns flag targeting off. Store the generated URL locally:

   ```bash
   LD_REMEDIATION_TRIGGER_URL=your-launchdarkly-trigger-url
   ```

   Trigger URLs are sensitive because anyone with the URL can invoke the rollback. Do not commit the real URL.

6. Create the experiment metric:

   ```text
   Name: Landing page CTA clicked
   Metric key: landing-page-cta-clicked
   Event kind: Custom
   Event key: hero-cta-clicked
   Metric definition: Count distinct units (Percent)
   Success criteria: Higher is better
   Randomization unit: user
   ```

7. Create the chatbot config. If your tenant has AgentControl / AI Configs, create an AI Config with prompt/model variations. If it does not, create a JSON flag:

   ```text
   Name: Support chatbot AI config
   Key: support-chatbot-ai-config
   Variations: JSON
   Available on client-side SDKs: enabled
   ```

   Example JSON variation:

   ```json
   {
     "name": "Concise support guide",
     "model": "gpt-4o-mini",
     "temperature": 0.2,
     "systemPrompt": "You are an ABC SaaS support assistant. Give concise, accurate answers, ask one clarifying question when needed, and recommend escalation for account-specific issues.",
     "welcomeMessage": "Ask about onboarding, billing, incidents, or release safety.",
     "responseStyle": "concise",
     "escalationThreshold": 0.7
   }
   ```

### Terraform Setup

Use Terraform when you want to show LaunchDarkly configuration managed as infrastructure. The example lives in [terraform/README.md](terraform/README.md) and models the same core state as the REST script:

```text
new-landing-page-hero
support-chatbot-ai-config
individual targeting for alice-beta-001
enterprise rule-based targeting
experiment cohort targeting
client-side SDK availability
environment-level default/off behavior
```

## Cleanup

Use the cleanup path that matches how you created the LaunchDarkly resources.

### Option 1: REST API Cleanup

Use this if you created resources with `npm run ld:setup`.

Run a dry run:

```bash
export LD_API_TOKEN="api-..."
export LD_PROJECT_KEY="default"
export LD_ENV_KEY="test"
npm run ld:cleanup
```

The dry run lists demo resources and any active experiments that reference `new-landing-page-hero` or `landing-page-cta-clicked`. If the dry run looks right, rerun with confirmation:

```bash
export LD_CLEANUP_CONFIRM=delete-demo-resources
npm run ld:cleanup
```

The confirmed cleanup archives related experiments first, then deletes:

```text
landing-page-cta-clicked
support-chatbot-ai-config
new-landing-page-hero
```

It does not delete your LaunchDarkly project, environment, API token, or local `.env` file.

### Option 2: Manual UI Cleanup

Use this if you created resources by clicking through the LaunchDarkly UI.

1. Stop or archive any experiment that references:

   ```text
   new-landing-page-hero
   landing-page-cta-clicked
   ```

2. Delete the experiment metric:

   ```text
   Data -> Metrics -> Landing page CTA clicked
   ```

3. Delete the demo flags:

   ```text
   Features -> Flags -> support-chatbot-ai-config
   Features -> Flags -> new-landing-page-hero
   ```

4. Delete or ignore the local `.env` values:

   ```text
   VITE_LD_CLIENT_ID
   LD_REMEDIATION_TRIGGER_URL
   ```

Do not delete the LaunchDarkly project, environment, or API token unless you created them only for this demo and no longer need them.

### Option 3: Terraform Cleanup

Use this if you created resources with Terraform.

Destroy from the Terraform working directory:

```bash
cd terraform
export TF_VAR_launchdarkly_access_token="api-..."
terraform destroy
```

If you overrode `project_key` or `environment_key` during `apply`, pass the same values to `destroy`:

```bash
terraform destroy \
  -var="project_key=my-project" \
  -var="environment_key=test"
```

Terraform only destroys resources tracked in its state. If you also ran `npm run ld:setup`, use the REST cleanup command for those REST-created resources.

## Demo Script

1. Start with the flag off and show the control landing page.
2. Toggle the flag on in LaunchDarkly. The hero should switch to the new experience without a page reload.
3. Use the context switcher:
   - Target `alice-beta-001` directly for individual targeting.
   - Add a rule where `plan` is `enterprise` or `companySize` is greater than `1000` for rule-based targeting.
4. Click the CTA and confirm the app calls `track("hero-cta-clicked")` for experimentation.
5. Start the experiment and click **Generate sample traffic** to send sample exposure and conversion events.
6. Change `support-chatbot-ai-config` and show the chatbot model, prompt, and response style updating.
7. Show the Terraform example as the integration path for repeatable LaunchDarkly setup.
8. Invoke the remediation trigger with `curl -X POST "$LD_REMEDIATION_TRIGGER_URL"` and show the app rolling back.

## Notes for Reviewers

The app uses client-side LaunchDarkly evaluation because the exercise is focused on a landing-page experience and instant UI updates. The visible context switcher is intentionally part of the demo so reviewers can inspect targeting behavior without creating multiple accounts.

Note: `npm audit` currently reports a Vite/esbuild development-tooling advisory. This demo does not ship Vite/esbuild to the browser. I did not run `npm audit fix --force` because it upgrades Vite across a breaking major version.
