# LaunchDarkly SE Technical Exercise Demo

React + Vite demo for the LaunchDarkly SE homework. The app presents a mock ABC SaaS landing page and demonstrates:

- Safe release and rollback with `new-landing-page-hero`
- Live flag change listening with no page reload
- Context attributes for targeting
- Individual targeting and rule-based targeting
- Remediation trigger workflow
- CTA event tracking for experimentation
- AI Config-style chatbot prompt and model control

The primary feature flag is:

```text
new-landing-page-hero
```

## Table of Contents

- [Local Machine Setup](#local-machine-setup)
  - [Using This Repo](#using-this-repo)
- [LaunchDarkly Tenant Setup](#launchdarkly-tenant-setup)
  - [Option A: REST API Setup](#option-a-rest-api-setup)
  - [Option B: Manual UI Setup](#option-b-manual-ui-setup)
  - [Option C: Terraform Setup](#option-c-terraform-setup)
- [Part 1: Release and Remediate](#part-1-release-and-remediate)
- [Part 2: Target](#part-2-target)
- [Extra Credit: Experimentation](#extra-credit-experimentation)
- [Extra Credit: AI Configs](#extra-credit-ai-configs)
- [Extra Credit: Integrations](#extra-credit-integrations)
- [Demo Script](#demo-script)
- [Notes for Reviewers](#notes-for-reviewers)

## Local Machine Setup

### Using This Repo

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

4. Configure LaunchDarkly environment values.

   Follow one of the **LaunchDarkly Tenant Setup** options below, then add the resulting values to `.env`.

5. Run the app:

   ```bash
   npm run dev
   ```

   Open the local URL printed by Vite, usually `http://localhost:5173/`.

## LaunchDarkly Tenant Setup

Use these steps to recreate the demo in a new LaunchDarkly tenant.

### Option A: REST API Setup

The fastest repeatable setup is the included REST script. It uses LaunchDarkly's REST API to:

- Create or reuse `new-landing-page-hero`
- Enable client-side SDK availability
- Turn targeting on for the selected environment
- Set the off/default behavior to `false`
- Add the individual target `alice-beta-001 -> true`
- Add the rule `user.plan is one of enterprise -> true`
- Add the experiment cohort rule `user.experimentCohort is one of landing-page-q3 -> false`
- Create the metric `landing-page-cta-clicked` for the custom event `hero-cta-clicked`
- Create the AI config flag `support-chatbot-ai-config`
- Optionally create a generic remediation trigger that turns the flag off

Create a LaunchDarkly API token with write access to flags and metrics.

LaunchDarkly documentation:

```text
https://launchdarkly.com/docs/home/account/api
```

For this demo, use:

```text
Role: Writer or Admin
API version: latest available
Service token: recommended if available
```

Do not use `Reader`. The setup script creates and updates flags, metrics, targeting rules, and optionally triggers, so read-only access will fail.

Then run:

```bash
export LD_API_TOKEN="api-..."
export LD_PROJECT_KEY="default"
export LD_ENV_KEY="test"
npm run ld:setup
```

To create the remediation trigger during setup:

```bash
export LD_CREATE_TRIGGER=true
npm run ld:setup
```

The script prints the values to copy into `.env`:

```bash
VITE_LD_CLIENT_ID=...
LD_REMEDIATION_TRIGGER_URL=...
```

Keep `LD_API_TOKEN` and the real trigger URL out of Git. The trigger URL is sensitive because anyone with it can invoke the rollback.

The REST script prepares the flag, targeting rules, metric, and chatbot configuration flag. Create and start the experiment in the LaunchDarkly UI using the settings in **Extra Credit: Experimentation**.

### Option B: Manual UI Setup

1. Create or choose a LaunchDarkly project and environment.

   This README assumes the environment is named `Test`, but any environment works as long as its Client-side ID is used in `.env`.

2. Copy the environment's **Client-side ID**.

   Add it to `.env`:

   ```bash
   VITE_LD_CLIENT_ID=your-client-side-id
   ```

   Use the Client-side ID, not the server-side SDK key.

3. Create a boolean feature flag:

   ```text
   Name: new-landing-page-hero
   Key: new-landing-page-hero
   Variations: Boolean
   On variation: true
   Off variation: false
   ```

4. Enable browser SDK access for the flag.

   In the flag's **Advanced controls**, turn on:

   ```text
   Available on client-side SDKs
   ```

5. Configure the basic release/rollback behavior.

   For the Part 1 release demo:

   ```text
   Flag targeting: On
   Default rule: serve true
   Off variation: false
   ```

   Toggle the flag on and off while the local app is open. The hero and the Live listener panel should update without a browser refresh.

6. Configure individual targeting for Part 2.

   Keep flag targeting on, but set the default rule to serve `false`. Add this individual target:

   ```text
   Context kind: user
   Context key: alice-beta-001
   Serve: true
   ```

   If the context is not searchable yet, open the local app and click **Individually targeted beta user** once. This sends the context to LaunchDarkly.

7. Configure rule-based targeting for Part 2.

   Add a custom rule:

   ```text
   Rule name: Enterprise plan visitors
   Context kind: user
   Attribute: plan
   Operator: is one of
   Value: enterprise
   Serve: true
   ```

   The app's **Enterprise rule match** context sends `plan: "enterprise"`.

8. Create a remediation trigger.

   From the flag's environment configuration, add a trigger that turns flag targeting off. Use a generic trigger, copy the generated URL, and store it locally:

   ```bash
   LD_REMEDIATION_TRIGGER_URL=your-launchdarkly-trigger-url
   ```

   Trigger URLs are sensitive because anyone with the URL can invoke the action. Do not commit the real URL.

9. Test remediation.

   With the app showing a `true` variation, run:

   ```bash
   curl -X POST "$LD_REMEDIATION_TRIGGER_URL"
   ```

   LaunchDarkly should turn the flag off, and the local app should roll back to the control hero.

10. Configure the experimentation cohort rule.

   On the same flag targeting page, add a custom rule:

   ```text
   Rule name: Experiment cohort
   Context kind: user
   Attribute: experimentCohort
   Operator: is one of
   Value: landing-page-q3
   Serve: false
   ```

   The app's **Generate sample traffic** button sends synthetic visitors with `experimentCohort: "landing-page-q3"`.

11. Create the experiment metric.

   Go to **Data → Metrics**, create a LaunchDarkly-hosted custom metric, and use:

   ```text
   Name: Landing page CTA clicked
   Metric key: landing-page-cta-clicked
   Event kind: Custom
   Event key: hero-cta-clicked
   Metric definition: Count distinct units (Percent)
   Success criteria: Higher is better
   Randomization unit: user
   ```

12. Create the chatbot AI config.

   If your LaunchDarkly account has **AgentControl / AI Configs**, create an AI Config for the support chatbot with these two variations:

   ```text
   Config key: support-chatbot-ai-config
   Variation: Concise support guide
   Model: gpt-4o-mini
   Temperature: 0.2
   Prompt: You are an ABC SaaS support assistant. Give concise, accurate answers, ask one clarifying question when needed, and recommend escalation for account-specific issues.
   ```

   ```text
   Variation: Empathetic escalation guide
   Model: gpt-4o
   Temperature: 0.45
   Prompt: You are an empathetic ABC SaaS support assistant. Reassure the customer, provide step-by-step help, and escalate quickly for account-specific or incident-impacting questions.
   ```

   If AI Configs are not enabled in the trial, create a JSON feature flag instead:

   ```text
   Name: Support chatbot AI config
   Key: support-chatbot-ai-config
   Variations: JSON
   Available on client-side SDKs: enabled
   Default/off variation: Concise support guide JSON
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

### Option C: Terraform Setup

Terraform is also a good option if you want the LaunchDarkly tenant setup managed as infrastructure. It also satisfies the **Integrations** extra credit by using LaunchDarkly's Terraform integration/provider. Model the same state as the REST script:

```text
Flag: new-landing-page-hero
Environment: test
Client-side SDK availability: enabled
Targeting: on
Off/default variation: false
Individual target: user alice-beta-001 serves true
Rule: user.plan is one of enterprise serves true
Rule: user.experimentCohort is one of landing-page-q3 serves false
Metric: landing-page-cta-clicked listens for hero-cta-clicked
AI config flag: support-chatbot-ai-config
```

See [terraform/README.md](terraform/README.md) for a fresh-clone Terraform workflow, reviewer talk track, and integration boundaries.

## Part 1: Release and Remediate

Scenario: ABC Company wants to release features faster without increasing risk. This demo wraps a new landing page hero in a LaunchDarkly feature flag so the feature can be released, rolled back, and remediated without a deployment.

### Feature Flag

The flag `new-landing-page-hero` controls the landing page hero.

- `false`: control experience, "Reliable operations for modern SaaS teams"
- `true`: new experience, "Launch the new customer experience without waiting for deploys"

To demonstrate release and rollback:

1. Start with the flag off. The local app should show the control hero and `Raw value: false`.
2. Turn the flag on in LaunchDarkly and serve `true` to the current context.
3. The app should switch to the new hero.
4. Turn the flag off again.
5. The app should roll back to the control hero.

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

Recommended LaunchDarkly targeting setup:

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

Use that cohort for the experiment audience so it does not interfere with the Part 2 targeting examples. If you used the REST setup script, the metric and cohort rule are already created. If you used manual setup, complete steps 10 and 11 in **Option B: Manual UI Setup** first.

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
