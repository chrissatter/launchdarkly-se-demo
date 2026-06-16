#!/usr/bin/env node

const API_BASE = "https://app.launchdarkly.com/api/v2";
const PROJECT_KEY = process.env.LD_PROJECT_KEY || "default";
const FLAG_KEY = process.env.LD_FLAG_KEY || "new-landing-page-hero";
const TOKEN = process.env.LD_API_TOKEN;
const CONFIRM_VALUE = "delete-demo-resources";
const CONFIRMED = process.env.LD_CLEANUP_CONFIRM === CONFIRM_VALUE;

const resources = [
  {
    type: "metric",
    key: "landing-page-cta-clicked",
    path: `/metrics/${PROJECT_KEY}/landing-page-cta-clicked`,
  },
  {
    type: "flag",
    key: "support-chatbot-ai-config",
    path: `/flags/${PROJECT_KEY}/support-chatbot-ai-config`,
  },
  {
    type: "flag",
    key: FLAG_KEY,
    path: `/flags/${PROJECT_KEY}/${FLAG_KEY}`,
  },
];

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

async function deleteResource(resource) {
  try {
    await ldRequest(resource.path, { method: "DELETE" });
    console.log(`Deleted ${resource.type}: ${resource.key}`);
  } catch (error) {
    if (error.status === 404) {
      console.log(`Already absent ${resource.type}: ${resource.key}`);
      return;
    }

    throw error;
  }
}

try {
  console.log(`LaunchDarkly cleanup target: project ${PROJECT_KEY}`);
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
  console.log("Deleting demo resources...");

  for (const resource of existing) {
    await deleteResource(resource);
  }

  console.log("");
  console.log("LaunchDarkly cleanup complete.");
} catch (error) {
  console.error("");
  console.error("LaunchDarkly cleanup failed.");
  console.error(error.message);

  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }

  console.error("");
  console.error("If an experiment still references a flag or metric, stop/archive that experiment in LaunchDarkly and rerun cleanup.");
  process.exit(1);
}
