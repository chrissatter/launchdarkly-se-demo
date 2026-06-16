# Terraform Integration Demo

This folder demonstrates LaunchDarkly's Terraform integration/provider as the **Integrations** extra credit. The goal is to show that the same demo tenant setup can be managed as reviewable infrastructure, not only by clicking through the LaunchDarkly UI.

Official provider docs:

```text
https://registry.terraform.io/providers/launchdarkly/launchdarkly/latest/docs
```

LaunchDarkly integrations catalog:

```text
https://launchdarkly.com/docs/integrations
```

## What This Provisions

The example Terraform file provisions the LaunchDarkly resources that are useful for a reviewer demo:

```text
Feature flag: new-landing-page-hero
Client-side SDK availability: enabled
Environment targeting: enabled
Off/default variation: false
Individual target: user alice-beta-001 serves true
Rule target: user.plan is one of enterprise serves true
Experiment cohort rule: user.experimentCohort is one of landing-page-q3 serves false

JSON config flag: support-chatbot-ai-config
Client-side SDK availability: enabled
Default config: concise support guide
Alternate config: empathetic escalation guide
```

This covers the release, targeting, experimentation audience, and AI Config fallback pieces. The LaunchDarkly UI is still the best place to create/start the actual experiment iteration during the live demo.

## Fresh Reviewer Workflow

From a fresh clone:

```bash
git clone https://github.com/chrissatter/launchdarkly-se-demo.git
cd launchdarkly-se-demo
npm install
cp .env.example .env
```

Create a LaunchDarkly API token with write access to the target project. Use `Writer` or `Admin`; `Reader` is not sufficient because Terraform needs to create and update LaunchDarkly resources.

LaunchDarkly API token documentation:

```text
https://launchdarkly.com/docs/home/account/api
```

Then run:

```bash
cd terraform
cp main.tf.example main.tf
export TF_VAR_launchdarkly_access_token="api-..."
terraform init
terraform plan
terraform apply
```

If your LaunchDarkly project or environment keys are not `default` and `test`, override them:

```bash
terraform apply \
  -var="project_key=my-project" \
  -var="environment_key=test"
```

After apply, copy the environment Client-side ID from LaunchDarkly into the app's `.env`:

```bash
VITE_LD_CLIENT_ID=your-client-side-id
```

Then return to the repo root and run:

```bash
cd ..
npm run dev
```

## Reviewer Talk Track

Use this as the integration story:

```text
This demo can be configured manually or through the REST setup script, but Terraform shows how LaunchDarkly fits into an existing platform engineering workflow. Flags, targeting rules, and config flags can be peer-reviewed, versioned, and promoted with the same infrastructure-as-code process teams already use.
```

Useful things to point out in `main.tf`:

- `launchdarkly_feature_flag.landing_hero` creates the release flag.
- `launchdarkly_feature_flag_environment.test` manages environment targeting.
- `targets` demonstrates individual targeting.
- `rules` demonstrates attribute-based targeting and the experiment cohort.
- `launchdarkly_feature_flag.support_chatbot_ai_config` models the AI Config fallback as JSON.

## Boundaries

Terraform intentionally does not cover every part of the demo:

- The remediation trigger is easier through the REST setup script because the REST API returns the generated trigger URL.
- The experiment metric can be created through the REST setup script or LaunchDarkly UI.
- The experiment itself should be created and started in the LaunchDarkly UI so the reviewer can see the experiment design and results workflow.

For the most complete automated setup, use:

```bash
npm run ld:setup
```

For the integrations extra credit, show the Terraform files and optionally run `terraform plan` against a scratch project/environment.
