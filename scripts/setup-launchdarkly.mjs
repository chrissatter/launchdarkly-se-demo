#!/usr/bin/env node

const API_BASE = "https://app.launchdarkly.com/api/v2";
const FLAG_KEY = process.env.LD_FLAG_KEY || "new-landing-page-hero";
const PROJECT_KEY = process.env.LD_PROJECT_KEY || "default";
const ENV_KEY = process.env.LD_ENV_KEY || "test";
const TOKEN = process.env.LD_API_TOKEN;
const CREATE_TRIGGER = process.env.LD_CREATE_TRIGGER === "true";

const DEMO_TARGET_KEY = "alice-beta-001";
const ENTERPRISE_RULE_VALUE = "enterprise";

if (!TOKEN) {
  console.error("Missing LD_API_TOKEN. Create a LaunchDarkly API token and export it before running this script.");
  process.exit(1);
}

async function ldRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message || body?.error || text || response.statusText;
    const error = new Error(`${response.status} ${response.statusText}: ${message}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function optionalLdRequest(path, options = {}) {
  try {
    return await ldRequest(path, options);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }

    throw error;
  }
}

function variationIdFor(flag, value) {
  const variation = flag.variations?.find((item) => item.value === value);

  if (!variation?._id) {
    throw new Error(`Could not find variation ID for value ${String(value)} on ${FLAG_KEY}.`);
  }

  return variation._id;
}

function envConfigFor(flag) {
  return flag.environments?.[ENV_KEY] || {};
}

function hasIndividualTarget(envConfig, variationId, variationIndex) {
  return (envConfig.targets || []).some((target) => {
    return (
      (target.variation === variationId || target.variation === variationIndex) &&
      (target.values || []).includes(DEMO_TARGET_KEY)
    );
  });
}

function hasEnterpriseRule(envConfig) {
  return (envConfig.rules || []).some((rule) => {
    return (rule.clauses || []).some((clause) => {
      return (
        clause.contextKind === "user" &&
        clause.attribute === "plan" &&
        clause.op === "in" &&
        clause.negate === false &&
        (clause.values || []).includes(ENTERPRISE_RULE_VALUE)
      );
    });
  });
}

async function getEnvironment() {
  return ldRequest(`/projects/${PROJECT_KEY}/environments/${ENV_KEY}`);
}

async function getFlag() {
  return optionalLdRequest(`/flags/${PROJECT_KEY}/${FLAG_KEY}?filterEnv=${ENV_KEY}`);
}

async function createFlag() {
  console.log(`Creating flag ${FLAG_KEY} in project ${PROJECT_KEY}...`);

  return ldRequest(`/flags/${PROJECT_KEY}`, {
    method: "POST",
    body: JSON.stringify({
      name: FLAG_KEY,
      key: FLAG_KEY,
      description: "LaunchDarkly SE demo flag for safe release, targeting, and remediation.",
      variations: [
        {
          value: true,
          name: "true",
          description: "New landing page hero",
        },
        {
          value: false,
          name: "false",
          description: "Control landing page hero",
        },
      ],
      defaults: {
        onVariation: 1,
        offVariation: 1,
      },
      clientSideAvailability: {
        usingEnvironmentId: true,
        usingMobileKey: false,
      },
      tags: ["se-demo"],
    }),
  });
}

async function ensureFlag() {
  const existing = await getFlag();

  if (existing) {
    console.log(`Using existing flag ${FLAG_KEY}.`);
    return existing;
  }

  try {
    await createFlag();
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }
  }

  return getFlag();
}

async function patchFlag(instructions, comment) {
  if (instructions.length === 0) {
    return null;
  }

  return ldRequest(`/flags/${PROJECT_KEY}/${FLAG_KEY}`, {
    method: "PATCH",
    body: JSON.stringify({
      environmentKey: ENV_KEY,
      comment,
      instructions,
    }),
  });
}

async function patchGlobalFlag(instructions, comment) {
  if (instructions.length === 0) {
    return null;
  }

  return ldRequest(`/flags/${PROJECT_KEY}/${FLAG_KEY}`, {
    method: "PATCH",
    body: JSON.stringify({
      comment,
      instructions,
    }),
  });
}

async function ensureClientSideAvailability(flag) {
  if (flag.clientSideAvailability?.usingEnvironmentId === true) {
    return flag;
  }

  console.log("Enabling client-side SDK availability...");
  await patchGlobalFlag(
    [{ kind: "turnOnClientSideAvailability", value: "usingEnvironmentId" }],
    "Enable client-side SDK availability for LaunchDarkly SE demo",
  );

  return getFlag();
}

async function configureTargeting(flag) {
  const trueVariationId = variationIdFor(flag, true);
  const falseVariationId = variationIdFor(flag, false);
  const trueVariationIndex = flag.variations.findIndex((item) => item.value === true);
  const envConfig = envConfigFor(flag);
  const instructions = [];

  if (envConfig.on !== true) {
    instructions.push({ kind: "turnFlagOn" });
  }

  instructions.push(
    { kind: "updateOffVariation", variationId: falseVariationId },
    { kind: "updateFallthroughVariationOrRollout", variationId: falseVariationId },
  );

  if (!hasIndividualTarget(envConfig, trueVariationId, trueVariationIndex)) {
    instructions.push({
      kind: "addTargets",
      contextKind: "user",
      variationId: trueVariationId,
      values: [DEMO_TARGET_KEY],
    });
  }

  if (!hasEnterpriseRule(envConfig)) {
    instructions.push({
      kind: "addRule",
      variationId: trueVariationId,
      clauses: [
        {
          contextKind: "user",
          attribute: "plan",
          op: "in",
          negate: false,
          values: [ENTERPRISE_RULE_VALUE],
        },
      ],
    });
  }

  if (instructions.length === 0) {
    console.log("Targeting already matches the demo setup.");
    return flag;
  }

  console.log(`Applying ${instructions.length} targeting instruction(s)...`);
  await patchFlag(instructions, "Configure LaunchDarkly SE demo targeting");
  return getFlag();
}

async function createRemediationTrigger() {
  console.log("Creating optional remediation trigger...");

  return ldRequest(`/flags/${PROJECT_KEY}/${FLAG_KEY}/triggers/${ENV_KEY}`, {
    method: "POST",
    body: JSON.stringify({
      integrationKey: "generic-trigger",
      comment: "Turns the demo flag off for incident remediation.",
      instructions: [{ kind: "turnFlagOff" }],
    }),
  });
}

function printSummary({ environment, trigger }) {
  console.log("");
  console.log("LaunchDarkly demo setup complete.");
  console.log("");
  console.log("Add this to .env:");
  console.log(`VITE_LD_CLIENT_ID=${environment._id}`);

  if (trigger?.triggerURL) {
    console.log(`LD_REMEDIATION_TRIGGER_URL=${trigger.triggerURL}`);
  } else {
    console.log("LD_REMEDIATION_TRIGGER_URL=<create one in LaunchDarkly or rerun with LD_CREATE_TRIGGER=true>");
  }

  console.log("");
  console.log("Demo configuration:");
  console.log(`Project: ${PROJECT_KEY}`);
  console.log(`Environment: ${ENV_KEY}`);
  console.log(`Flag: ${FLAG_KEY}`);
  console.log(`Individual target serving true: user ${DEMO_TARGET_KEY}`);
  console.log(`Rule serving true: user.plan is one of ${ENTERPRISE_RULE_VALUE}`);
  console.log("Default and off variation: false");
}

try {
  const environment = await getEnvironment();
  let flag = await ensureFlag();
  flag = await ensureClientSideAvailability(flag);
  flag = await configureTargeting(flag);

  let trigger = null;
  if (CREATE_TRIGGER) {
    trigger = await createRemediationTrigger();
  }

  printSummary({ environment, flag, trigger });
} catch (error) {
  console.error("");
  console.error("LaunchDarkly setup failed.");
  console.error(error.message);

  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }

  process.exit(1);
}
