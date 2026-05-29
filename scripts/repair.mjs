#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = process.env.OPENCLAW_WATCH_CONFIG_DIR || resolve(homedir(), ".openclaw", "openclaw-watch");
const configPath = process.env.OPENCLAW_WATCH_CONFIG_FILE || resolve(configDir, "config.env");
const setupScript = fileURLToPath(new URL("./setup.mjs", import.meta.url));
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  help();
  process.exit(0);
}

if (!existsSync(configPath)) {
  console.error(`No config found at ${configPath}`);
  console.error("Run setup first: npm run setup");
  process.exit(1);
}

const values = parseEnv(await readFile(configPath, "utf8"));
for (const [key, value] of Object.entries(values)) {
  if (!process.env[key]) process.env[key] = value;
}

const host = process.env.OPENCLAW_WATCH_BRIDGE_HOST || "127.0.0.1";
const port = process.env.OPENCLAW_WATCH_BRIDGE_PORT || "8787";
const token = process.env.OPENCLAW_WATCH_BRIDGE_TOKEN || "";
const localBaseUrl = `http://${host}:${port}`;
const publicAskUrl = normalizeAskUrl(
  process.env.OPENCLAW_WATCH_PUBLIC_ASK_URL || process.env.OPENCLAW_WATCH_PUBLIC_URL || "",
);
const repairTailscale = !args.has("--no-tailscale");
const repairPairing = !args.has("--no-pair");
const checks = [];

console.log("WristClaw Bridge repair");
console.log(`Config: ${configPath}`);
console.log("");

checks.push(await commandCheck("openclaw", ["--version"], "OpenClaw CLI"));
checks.push(await commandCheck("tailscale", ["version"], "Tailscale CLI"));
checks.push(await httpCheck(`${localBaseUrl}/health`, {}, "Local bridge health"));
checks.push(await diagnosticsCheck());

let tailscaleResult = null;
if (repairTailscale) {
  tailscaleResult = await runTailscaleServe();
  checks.push(tailscaleResult);
} else {
  checks.push(warnCheck("Tailscale Serve", "Skipped by --no-tailscale."));
}

let pairingResult = null;
if (repairPairing) {
  pairingResult = await regeneratePairing();
  checks.push(pairingResult);
} else {
  checks.push(warnCheck("Pairing files", "Skipped by --no-pair."));
}

printChecks(checks);
printSummary(checks, { tailscaleResult, pairingResult });

const hasError = checks.some((check) => check.status === "error");
process.exit(hasError ? 1 : 0);

async function diagnosticsCheck() {
  if (!token) return errorCheck("Bridge diagnostics", "Missing OPENCLAW_WATCH_BRIDGE_TOKEN in config.env.");
  return httpCheck(
    `${localBaseUrl}/watch/diagnostics`,
    { headers: { authorization: `Bearer ${token}` } },
    "Bridge diagnostics",
    async (response) => {
      const payload = await response.json();
      const status = payload.status === "ok" ? "ok" : "warn";
      const text = payload.text || `HTTP ${response.status}`;
      return { status, label: "Bridge diagnostics", detail: text, payload };
    },
  );
}

async function httpCheck(url, options, label, parse = null) {
  try {
    const response = await fetch(url, options);
    if (parse) return await parse(response);
    const text = await response.text();
    if (!response.ok) return errorCheck(label, `HTTP ${response.status}: ${text}`);
    return okCheck(label, text.trim() || `HTTP ${response.status}`);
  } catch (error) {
    return errorCheck(label, `${url} failed: ${errorMessage(error)}`);
  }
}

async function runTailscaleServe() {
  const tailscale = await commandOutput("tailscale", ["serve", "--bg", "--set-path", "/watch", localBaseUrl]);
  if (!tailscale.ok) {
    return warnCheck("Tailscale Serve", firstLine(tailscale.stderr || tailscale.stdout) || "Could not reapply /watch route.");
  }
  const target = publicAskUrl || "https://<your-device>.<tailnet>.ts.net/watch/ask";
  return okCheck("Tailscale Serve", `/watch route reapplied to ${localBaseUrl}. Public ask URL: ${target}`);
}

async function regeneratePairing() {
  if (!publicAskUrl) {
    return warnCheck("Pairing files", "No OPENCLAW_WATCH_PUBLIC_ASK_URL configured. Run npm run setup or set the Tailscale URL, then run npm run pair.");
  }
  if (!token) {
    return errorCheck("Pairing files", "Missing bearer token; run npm run setup.");
  }

  const result = await commandOutput(process.execPath, [setupScript, "pair"]);
  if (!result.ok) {
    return errorCheck("Pairing files", firstLine(result.stderr || result.stdout) || "Could not regenerate pairing files.");
  }
  return okCheck("Pairing files", `Regenerated ${resolve(configDir, "pairing.html")}`);
}

function commandCheck(commandName, commandArgs, label) {
  return commandOutput(commandName, commandArgs).then((result) => {
    const output = firstLine(result.stdout || result.stderr);
    if (result.ok) return okCheck(label, output || `${commandName} ok`);
    return warnCheck(label, output || `${commandName} exited with code ${result.code ?? "unknown"}`);
  });
}

function commandOutput(commandName, commandArgs) {
  return new Promise((resolveOutput) => {
    const child = spawn(commandName, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      resolveOutput({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolveOutput({ ok: code === 0, stdout, stderr, code });
    });
  });
}

function printChecks(items) {
  console.log("Repair checks:");
  for (const check of items) {
    const marker = check.status === "ok" ? "[ok]" : check.status === "warn" ? "[warn]" : "[error]";
    const detail = check.detail ? ` - ${check.detail}` : "";
    console.log(`  ${marker} ${check.label}${detail}`);
    if (check.payload?.checks?.length) {
      for (const nested of check.payload.checks) {
        console.log(`       [${nested.status}] ${nested.label}: ${nested.message}`);
      }
    }
  }
  console.log("");
}

function printSummary(items, { pairingResult }) {
  const errors = items.filter((check) => check.status === "error");
  const warnings = items.filter((check) => check.status === "warn");

  if (errors.length) {
    console.log("Repair result: action required.");
    console.log("Fix the [error] items above. If OpenClaw sessions changed after an update, run npm run setup to select or detect a valid session.");
    return;
  }

  if (warnings.length) {
    console.log("Repair result: completed with warnings.");
    console.log("The bridge may still work, but review the [warn] items above.");
  } else {
    console.log("Repair result: connection looks healthy.");
  }

  if (pairingResult?.status === "ok") {
    console.log("Re-pair is only needed if the iPhone still fails diagnostics or if the Tailscale URL/token changed.");
    console.log(`Pairing page: ${resolve(configDir, "pairing.html")}`);
  } else {
    console.log("No re-pair required if the iPhone already passes diagnostics.");
  }
}

function normalizeAskUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/watch/ask";
    } else if (url.pathname === "/watch") {
      url.pathname = "/watch/ask";
    } else if (!url.pathname.endsWith("/ask")) {
      url.pathname = `${url.pathname}/watch/ask`.replace(/\/+/g, "/");
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function okCheck(label, detail = "") {
  return { status: "ok", label, detail };
}

function warnCheck(label, detail = "") {
  return { status: "warn", label, detail };
}

function errorCheck(label, detail = "") {
  return { status: "error", label, detail };
}

function firstLine(value) {
  return String(value ?? "").trim().split(/\r?\n/)[0] ?? "";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function help() {
  console.log(`Usage:
  npm run repair
  node scripts/repair.mjs [--no-tailscale] [--no-pair]

Repairs common connection drift after OpenClaw, Tailscale, or bridge updates.
It does not rotate tokens or overwrite the configured OpenClaw session.
`);
}
