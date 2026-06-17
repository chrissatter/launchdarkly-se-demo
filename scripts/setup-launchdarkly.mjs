#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API_BASE = "https://app.launchdarkly.com/api/v2";
const ENV_FILE = resolve(process.cwd(), ".env");
const FLAG_KEY = process.env.LD_FLAG_KEY || "new-landing-page-hero";
const PROJECT_KEY = process.env.LD_PROJECT_KEY || "default";
const ENV_KEY = process.env.LD_ENV_KEY || "test";
const TOKEN = process.env.LD_API_TOKEN;
const CREATE_TRIGGER = process.env.LD_CREATE_TRIGGER === "true";

const AI_CONFIG_KEY = "support-chatbot-ai-config";
const DEMO_TARGET_KEY = "alice-beta-001";
const ENTERPRISE_RULE_VALUE = "enterprise";
const EXPERIMENT_COHORT = "landing-page-q3";
const METRIC_KEY = "landing-page-cta-clicked";
const METRIC_EVENT_KEY = "hero-cta-clicked";
const AI_CONFIG_VARIATIONS = [
  {
    value: {
      name: "Concise support guide",
      model: "gpt-4o-mini",
      temperature: 0.2,
      systemPrompt:
        "You are an ABC SaaS support assistant. Give concise, accurate answers, ask one clarifying question when needed, and recommend escalation for account-specific issues.",
      welcomeMessage: "Ask about onboarding, billing, incidents, or release safety.",
      responseStyle: "concise",
      escalationThreshold: 0.7,
    },
    name: "concise",
    description: "Lower-cost concise support configuration",
  },
  {
    value: {
      name: "Empathetic escalation guide",
      model: "gpt-4o",
      temperature: 0.45,
      systemPrompt:
        "You are an empathetic ABC SaaS support assistant. Reassure the customer, provide step-by-step help, and escalate quickly for account-specific or incident-impacting questions.",
      welcomeMessage: "Ask me about a support issue and I will guide the next safe action.",
      responseStyle: "empathetic",
      escalationThreshold: 0.55,
    },
    name: "empathetic",
    description: "Higher-touch support configuration",
  },
];

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

function semanticPatchHeaders() {
  return {
    "Content-Type": "application/json; domain-model=launchdarkly.semanticpatch",
  };
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

function isArchivedFlag(flag) {
  return flag?.archived === true || flag?._archived === true || Boolean(flag?.archivedDate);
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

function hasExperimentCohortRule(envConfig) {
  return (envConfig.rules || []).some((rule) => {
    return (rule.clauses || []).some((clause) => {
      return (
        clause.contextKind === "user" &&
        clause.attribute === "experimentCohort" &&
        clause.op === "in" &&
        clause.negate === false &&
        (clause.values || []).includes(EXPERIMENT_COHORT)
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

async function getAiConfigFlag() {
  return optionalLdRequest(`/flags/${PROJECT_KEY}/${AI_CONFIG_KEY}?filterEnv=${ENV_KEY}`);
}

async function getMetric() {
  return optionalLdRequest(`/metrics/${PROJECT_KEY}/${METRIC_KEY}`);
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

async function createAiConfigFlag() {
  console.log(`Creating AI config flag ${AI_CONFIG_KEY} in project ${PROJECT_KEY}...`);

  return ldRequest(`/flags/${PROJECT_KEY}`, {
    method: "POST",
    body: JSON.stringify({
      name: "Support chatbot AI config",
      key: AI_CONFIG_KEY,
      description:
        "Client-side demo configuration for changing chatbot prompts, models, temperature, and response style.",
      variations: AI_CONFIG_VARIATIONS,
      defaults: {
        onVariation: 0,
        offVariation: 0,
      },
      clientSideAvailability: {
        usingEnvironmentId: true,
        usingMobileKey: false,
      },
      tags: ["se-demo", "ai-config"],
    }),
  });
}

async function restoreFlag(key) {
  console.log(`Restoring archived flag ${key}...`);

  return ldRequest(`/flags/${PROJECT_KEY}/${key}`, {
    method: "PATCH",
    headers: semanticPatchHeaders(),
    body: JSON.stringify({
      comment: "Restore archived LaunchDarkly SE demo flag before setup",
      instructions: [{ kind: "restoreFlag" }],
    }),
  });
}

async function ensureFlag() {
  const existing = await getFlag();

  if (existing) {
    if (isArchivedFlag(existing)) {
      await restoreFlag(FLAG_KEY);
      return getFlag();
    }

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

async function ensureAiConfigFlag() {
  const existing = await getAiConfigFlag();

  if (existing) {
    if (isArchivedFlag(existing)) {
      await restoreFlag(AI_CONFIG_KEY);
      return getAiConfigFlag();
    }

    console.log(`Using existing AI config flag ${AI_CONFIG_KEY}.`);
    return existing;
  }

  try {
    await createAiConfigFlag();
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }
  }

  return getAiConfigFlag();
}

async function patchFlag(instructions, comment) {
  if (instructions.length === 0) {
    return null;
  }

  return ldRequest(`/flags/${PROJECT_KEY}/${FLAG_KEY}`, {
    method: "PATCH",
    headers: semanticPatchHeaders(),
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
    headers: semanticPatchHeaders(),
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

  if (!hasExperimentCohortRule(envConfig)) {
    instructions.push({
      kind: "addRule",
      variationId: falseVariationId,
      clauses: [
        {
          contextKind: "user",
          attribute: "experimentCohort",
          op: "in",
          negate: false,
          values: [EXPERIMENT_COHORT],
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

async function ensureMetric() {
  const existing = await getMetric();

  if (existing) {
    console.log(`Using existing metric ${METRIC_KEY}.`);
    return existing;
  }

  console.log(`Creating metric ${METRIC_KEY}...`);
  return ldRequest(`/metrics/${PROJECT_KEY}`, {
    method: "POST",
    body: JSON.stringify({
      key: METRIC_KEY,
      name: "Landing page CTA clicked",
      description: "Binary conversion metric for the LaunchDarkly SE demo landing page CTA.",
      kind: "custom",
      eventKey: METRIC_EVENT_KEY,
      isNumeric: false,
      successCriteria: "HigherThanBaseline",
      analysisUnits: ["user"],
      tags: ["se-demo"],
    }),
  });
}

async function createRemediationTrigger() {
  console.log("Creating remediation trigger...");

  return ldRequest(`/flags/${PROJECT_KEY}/${FLAG_KEY}/triggers/${ENV_KEY}`, {
    method: "POST",
    body: JSON.stringify({
      integrationKey: "generic-trigger",
      comment: "Turns the demo flag off for incident remediation.",
      instructions: [{ kind: "turnFlagOff" }],
    }),
  });
}

function upsertEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const separator = content.length && !content.endsWith("\n") ? "\n" : "";
  return `${content}${separator}${line}\n`;
}

function writeLocalEnv({ environment, trigger }) {
  const updates = {
    VITE_LD_CLIENT_ID: environment._id,
  };

  if (trigger?.triggerURL) {
    updates.LD_REMEDIATION_TRIGGER_URL = trigger.triggerURL;
  }

  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";

  for (const [key, value] of Object.entries(updates)) {
    content = upsertEnvValue(content, key, value);
  }

  writeFileSync(ENV_FILE, content);
  return Object.keys(updates);
}

function printSummary({ environment, trigger }) {
  const writtenKeys = writeLocalEnv({ environment, trigger });

  console.log("");
  console.log("LaunchDarkly demo setup complete.");
  console.log("");
  console.log(`Updated .env with: ${writtenKeys.join(", ")}`);
  console.log("");
  console.log("Generated values:");
  console.log(`VITE_LD_CLIENT_ID=${environment._id}`);

  if (trigger?.triggerURL) {
    console.log(`LD_REMEDIATION_TRIGGER_URL=${trigger.triggerURL}`);
  } else {
    console.log("LD_REMEDIATION_TRIGGER_URL=<rerun with LD_CREATE_TRIGGER=true to create one>");
  }

  console.log("");
  console.log("Demo configuration:");
  console.log(`Project: ${PROJECT_KEY}`);
  console.log(`Environment: ${ENV_KEY}`);
  console.log(`Flag: ${FLAG_KEY}`);
  console.log(`Individual target serving true: user ${DEMO_TARGET_KEY}`);
  console.log(`Rule serving true: user.plan is one of ${ENTERPRISE_RULE_VALUE}`);
  console.log(`Experiment rule serving false until experiment runs: user.experimentCohort is one of ${EXPERIMENT_COHORT}`);
  console.log(`Experiment metric: ${METRIC_KEY} listens for ${METRIC_EVENT_KEY}`);
  console.log(`AI config flag: ${AI_CONFIG_KEY}`);
  console.log("Default and off variation: false");
}

try {
  const environment = await getEnvironment();
  let flag = await ensureFlag();
  flag = await ensureClientSideAvailability(flag);
  flag = await configureTargeting(flag);
  await ensureMetric();
  await ensureAiConfigFlag();

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
