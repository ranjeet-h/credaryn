const baseUrl = process.env.CREDARYN_DEPLOY_BASE_URL ?? "http://127.0.0.1:8080";

const health = await fetch(`${baseUrl}/v1/health`);
if (!health.ok) throw new Error(`Verifier health failed with HTTP ${health.status}`);
const healthPayload = await health.json() as { status?: string; apiVersion?: string };
if (healthPayload.status !== "ready" || healthPayload.apiVersion !== "v1") throw new Error("Verifier health response is incomplete");

const version = await fetch(`${baseUrl}/v1/version`);
if (!version.ok) throw new Error(`Verifier version failed with HTTP ${version.status}`);
const versionPayload = await version.json() as { apiVersion?: string; build?: string };
if (versionPayload.apiVersion !== "v1" || typeof versionPayload.build !== "string") throw new Error("Verifier version response is incomplete");

console.log(`Deployment smoke passed: ${baseUrl} (${versionPayload.build})`);
