#!/usr/bin/env node

const API_BASE = "https://app.launchdarkly.com/api/v2";
const PROJECT_KEY = process.env.LD_PROJECT_KEY || "default";
const ENV_KEY = process.env.LD_ENV_KEY || "test";
const DEMO_KEY_PREFIX = normalizePrefix(process.env.LD_DEMO_KEY_PREFIX);
const FLAG_KEY = process.env.LD_FLAG_KEY || demoKey("new-landing-page-hero");
const AI_CONFIG_KEY = process.env.LD_AI_CONFIG_KEY || demoKey("support-chatbot-ai-config");
const METRIC_KEY = process.env.LD_METRIC_KEY || demoKey("landing-page-cta-clicked");
const CHATBOT_METRIC_KEYS = [
  process.env.LD_CHATBOT_MESSAGE_METRIC_KEY || demoKey("chatbot-message-sent"),
  process.env.LD_CHATBOT_HELPFUL_METRIC_KEY || demoKey("chatbot-helpful-clicked"),
  process.env.LD_CHATBOT_ESCALATION_METRIC_KEY || demoKey("chatbot-escalation-clicked"),
];
const TOKEN = process.env.LD_API_TOKEN;
const CONFIRM_VALUE = "delete-demo-resources";
const CONFIRMED = process.env.LD_CLEANUP_CONFIRM === CONFIRM_VALUE;

const resources = [
  {
    type: "flag",
    key: AI_CONFIG_KEY,
    path: `/flags/${PROJECT_KEY}/${AI_CONFIG_KEY}`,
  },
  {
    type: "flag",
    key: FLAG_KEY,
    path: `/flags/${PROJECT_KEY}/${FLAG_KEY}`,
  },
  {
    type: "metric",
    key: METRIC_KEY,
    path: `/metrics/${PROJECT_KEY}/${METRIC_KEY}`,
  },
  ...CHATBOT_METRIC_KEYS.map((key) => ({
    type: "metric",
    key,
    path: `/metrics/${PROJECT_KEY}/${key}`,
  })),
];

function normalizePrefix(value) {
  return (value || "").trim().replace(/^-+|-+$/g, "");
}

function demoKey(defaultKey) {
  return DEMO_KEY_PREFIX ? `${DEMO_KEY_PREFIX}-${defaultKey}` : defaultKey;
}

if (!TOKEN) {
  console.error("Missing LD_API_TOKEN. Export a LaunchDarkly API token before running cleanup.");
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

function collectionItems(body) {
  if (Array.isArray(body)) {
    return body;
  }

  return body?.items || [];
}

function semanticPatchHeaders() {
  return {
    "Content-Type": "application/json; domain-model=launchdarkly.semanticpatch",
  };
}

function isArchivedFlag(flag) {
  return flag?.archived === true || flag?._archived === true || Boolean(flag?.archivedDate);
}

async function exists(resource) {
  try {
    await ldRequest(resource.path);
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }

    throw error;
  }
}

async function getFlag(key) {
  return ldRequest(`/flags/${PROJECT_KEY}/${key}?filterEnv=${ENV_KEY}`);
}

async function listExperiments(filter) {
  const params = new URLSearchParams({
    filter,
    limit: "100",
    lifecycleState: "active",
  });

  const body = await ldRequest(`/projects/${PROJECT_KEY}/environments/${ENV_KEY}/experiments?${params}`);
  return collectionItems(body);
}

async function findRelatedExperiments() {
  const byKey = new Map();
  const filters = [`flagKey:${FLAG_KEY}`, ...[METRIC_KEY, ...CHATBOT_METRIC_KEYS].map((key) => `metricKey:${key}`)];

  for (const filter of filters) {
    for (const experiment of await listExperiments(filter)) {
      byKey.set(experiment.key, experiment);
    }
  }

  return [...byKey.values()];
}

function experimentStatus(experiment) {
  return experiment.currentIteration?.status || experiment.draftIteration?.status || "not started";
}

async function archiveExperiment(experiment) {
  if (experiment.archivedDate) {
    console.log(`Already archived experiment: ${experiment.name || experiment.key}`);
    return;
  }

  await ldRequest(`/projects/${PROJECT_KEY}/environments/${ENV_KEY}/experiments/${experiment.key}`, {
    method: "PATCH",
    body: JSON.stringify({
      comment: "Archive LaunchDarkly SE demo experiment before cleanup",
      instructions: [{ kind: "archiveExperiment" }],
    }),
  });

  console.log(`Archived experiment: ${experiment.name || experiment.key}`);
}

async function restoreFlag(key) {
  await ldRequest(`/flags/${PROJECT_KEY}/${key}`, {
    method: "PATCH",
    headers: semanticPatchHeaders(),
    body: JSON.stringify({
      comment: "Restore retained LaunchDarkly SE demo flag after cleanup",
      instructions: [{ kind: "restoreFlag" }],
    }),
  });

  console.log(`Restored retained flag: ${key}`);
}

async function restoreIfArchivedFlag(resource) {
  if (resource.type !== "flag") {
    return;
  }

  const flag = await getFlag(resource.key);
  if (isArchivedFlag(flag)) {
    await restoreFlag(resource.key);
  }
}

async function deleteResource(resource) {
  try {
    await ldRequest(resource.path, { method: "DELETE" });
    console.log(`Deleted ${resource.type}: ${resource.key}`);
    return { status: "deleted", resource };
  } catch (error) {
    if (error.status === 404) {
      console.log(`Already absent ${resource.type}: ${resource.key}`);
      return { status: "absent", resource };
    }

    if (resource.type === "metric" && error.status === 409) {
      console.log(`Retained metric: ${resource.key}`);
      console.log(`  LaunchDarkly still reports this metric as in use: ${error.body?.message || error.message}`);
      console.log("  This is safe for reruns because setup will reuse the existing metric.");
      return { status: "retained", resource, error };
    }

    if (resource.type === "flag" && error.status === 409) {
      console.log(`Retained flag: ${resource.key}`);
      console.log(`  LaunchDarkly still reports this flag as in use: ${error.body?.message || error.message}`);
      await restoreIfArchivedFlag(resource);
      console.log("  This is safe for reruns because setup will reuse the existing flag.");
      return { status: "retained", resource, error };
    }

    throw error;
  }
}

try {
  console.log(`LaunchDarkly cleanup target: project ${PROJECT_KEY}, environment ${ENV_KEY}`);
  console.log("");

  const experiments = await findRelatedExperiments();
  if (experiments.length) {
    console.log("Found related experiment(s):");

    for (const experiment of experiments) {
      console.log(`- ${experiment.name || experiment.key} (${experiment.key}, ${experimentStatus(experiment)})`);
    }
  } else {
    console.log("No active experiments found for the demo flag or metric.");
  }

  console.log("");

  const existing = [];
  for (const resource of resources) {
    if (await exists(resource)) {
      existing.push(resource);
      console.log(`Found ${resource.type}: ${resource.key}`);
    } else {
      console.log(`Not found ${resource.type}: ${resource.key}`);
    }
  }

  if (!CONFIRMED) {
    console.log("");
    console.log("Dry run only. No LaunchDarkly resources were deleted.");
    console.log(`To delete the resources above, rerun with LD_CLEANUP_CONFIRM=${CONFIRM_VALUE}.`);
    process.exit(0);
  }

  console.log("");
  console.log("Archiving related experiments...");

  for (const experiment of experiments) {
    await archiveExperiment(experiment);
  }

  console.log("");
  console.log("Deleting demo resources...");

  const retained = [];
  for (const resource of existing) {
    const result = await deleteResource(resource);
    if (result.status === "retained") {
      retained.push(result.resource);
    }
  }

  console.log("");
  if (retained.length) {
    console.log(`LaunchDarkly cleanup complete with retained resource(s): ${retained.map((resource) => resource.key).join(", ")}`);
  } else {
    console.log("LaunchDarkly cleanup complete.");
  }
} catch (error) {
  console.error("");
  console.error("LaunchDarkly cleanup failed.");
  console.error(error.message);

  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }

  console.error("");
  console.error("If LaunchDarkly reports an experiment dependency, stop or archive that experiment in the UI and rerun cleanup.");
  process.exit(1);
}
