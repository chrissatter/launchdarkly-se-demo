# Terraform Option

Use Terraform if you want the LaunchDarkly tenant setup to be repeatable infrastructure instead of a one-time UI or REST setup. This also serves as the LaunchDarkly **Integrations** extra credit because Terraform is one of LaunchDarkly's supported integrations.

The official LaunchDarkly provider is here:

```text
https://registry.terraform.io/providers/launchdarkly/launchdarkly/latest/docs
```

## Suggested Shape

Model these resources:

- `launchdarkly_feature_flag` for `new-landing-page-hero`
- `launchdarkly_feature_flag_environment` for the `test` environment behavior
- `launchdarkly_feature_flag` for the `support-chatbot-ai-config` JSON AI config fallback
- `launchdarkly_feature_flag_environment` for the chatbot config's environment behavior

The desired end state should match the REST script:

```text
Flag key: new-landing-page-hero
Variations: true, false
Client-side SDK availability: enabled
Environment: test
Flag targeting: on
Off variation: false
Default/fallthrough variation: false
Individual target: user alice-beta-001 serves true
Rule: if user.plan is one of enterprise, serve true
Rule: if user.experimentCohort is one of landing-page-q3, serve false
Metric: landing-page-cta-clicked listens for hero-cta-clicked
AI config flag: support-chatbot-ai-config serves concise by default
```

## Example Workflow

1. Create a LaunchDarkly API token with write access to the project.
2. Export it for Terraform:

   ```bash
   export TF_VAR_launchdarkly_access_token="api-..."
   ```

3. Copy the example into place:

   ```bash
   cp terraform/main.tf.example terraform/main.tf
   ```

4. Review `terraform/main.tf` and adjust `project_key` or `environment_key` if your tenant does not use `default` and `test`.

5. Run:

   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

6. Copy the environment Client-side ID into the app's `.env`:

   ```bash
   VITE_LD_CLIENT_ID=your-client-side-id
   ```

## Important Notes

The example manages the flags and environment targeting rules. Create the experiment metric with the LaunchDarkly UI or REST setup script, then create and start the experiment in the LaunchDarkly UI. The remediation trigger is also easier to create with the REST setup script because the REST API can return the generated `triggerURL` directly.

## Why This Repo Uses REST First

The REST script is intentionally lightweight for a demo review: it does not require Terraform to be installed, it can print the client-side ID directly, and it can optionally create the generic remediation trigger URL. Terraform is still the better path if this demo needs to be recreated many times or promoted into a formal enablement asset.
