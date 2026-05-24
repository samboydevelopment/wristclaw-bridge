#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const scriptPath = fileURLToPath(import.meta.url);
const skillDir = resolve(dirname(scriptPath), "..");
const configDir = process.env.OPENCLAW_WATCH_CONFIG_DIR || resolve(homedir(), ".openclaw", "openclaw-watch");
const configPath = process.env.OPENCLAW_WATCH_CONFIG_FILE || resolve(configDir, "config.env");
const launchAgentPath = resolve(homedir(), "Library", "LaunchAgents", "com.openclaw.watch-bridge.plist");
const defaultSessionsPath = resolve(homedir(), ".openclaw", "agents", "main", "sessions", "sessions.json");
const args = new Set(process.argv.slice(2));
const command = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "help";

if (command === "setup") {
  await setup();
} else if (command === "show") {
  await show();
} else if (command === "pair") {
  await pair();
} else {
  help();
}

async function setup() {
  console.log("OpenClaw Watch setup wizard");
  console.log("");

  await mkdir(configDir, { recursive: true });

  const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const values = parseEnv(existing);
  const force = args.has("--force");
  const checks = await runPreflight(values);
  printChecks(checks);

  const token = force || !envOrExisting(values, "OPENCLAW_WATCH_BRIDGE_TOKEN", "")
    ? randomBytes(24).toString("base64url")
    : envOrExisting(values, "OPENCLAW_WATCH_BRIDGE_TOKEN", "");
  const detectedSession = await detectMainSession(values);
  if (detectedSession?.warning) {
    console.log(`[warn] ${detectedSession.warning}`);
  }

  const next = {
    OPENCLAW_WATCH_BRIDGE_HOST: envOrExisting(values, "OPENCLAW_WATCH_BRIDGE_HOST", "127.0.0.1"),
    OPENCLAW_WATCH_BRIDGE_PORT: envOrExisting(values, "OPENCLAW_WATCH_BRIDGE_PORT", "8787"),
    OPENCLAW_WATCH_BRIDGE_TOKEN: token,
    OPENCLAW_WATCH_AGENT_NAME: envOrExisting(values, "OPENCLAW_WATCH_AGENT_NAME", "Nova"),
    OPENCLAW_WATCH_FAST_THINKING: envOrExisting(values, "OPENCLAW_WATCH_FAST_THINKING", "minimal"),
    OPENCLAW_WATCH_FAST_TIMEOUT_SECONDS: envOrExisting(values, "OPENCLAW_WATCH_FAST_TIMEOUT_SECONDS", "120"),
    OPENCLAW_WATCH_TIMEOUT_SECONDS: envOrExisting(values, "OPENCLAW_WATCH_TIMEOUT_SECONDS", "600"),
    OPENCLAW_WATCH_LONG_TIMEOUT_SECONDS: envOrExisting(values, "OPENCLAW_WATCH_LONG_TIMEOUT_SECONDS", "1800"),
    OPENCLAW_WATCH_USER_DISPLAY_ROLE: envOrExisting(values, "OPENCLAW_WATCH_USER_DISPLAY_ROLE", "freddy"),
    OPENCLAW_WATCH_ASSISTANT_DISPLAY_ROLE: envOrExisting(values, "OPENCLAW_WATCH_ASSISTANT_DISPLAY_ROLE", "nova"),
  };

  if (values.OPENCLAW_WATCH_AGENT_SESSION_ID || detectedSession?.sessionId) {
    next.OPENCLAW_WATCH_AGENT_SESSION_ID = envOrExisting(
      values,
      "OPENCLAW_WATCH_AGENT_SESSION_ID",
      detectedSession.sessionId,
    );
  }
  if (values.OPENCLAW_WATCH_AGENT_CHANNEL) {
    next.OPENCLAW_WATCH_AGENT_CHANNEL = values.OPENCLAW_WATCH_AGENT_CHANNEL;
  }
  if (values.OPENCLAW_WATCH_AGENT_TO) {
    next.OPENCLAW_WATCH_AGENT_TO = values.OPENCLAW_WATCH_AGENT_TO;
  }
  if (values.OPENCLAW_WATCH_SESSIONS_PATH) {
    next.OPENCLAW_WATCH_SESSIONS_PATH = values.OPENCLAW_WATCH_SESSIONS_PATH;
  } else if (existsSync(defaultSessionsPath)) {
    next.OPENCLAW_WATCH_SESSIONS_PATH = defaultSessionsPath;
  }

  const publicAskUrl = normalizeAskUrl(
    envOrExisting(values, "OPENCLAW_WATCH_PUBLIC_ASK_URL", "")
      || envOrExisting(values, "OPENCLAW_WATCH_PUBLIC_URL", "")
      || await detectTailscaleAskUrl(),
  );
  if (publicAskUrl) {
    next.OPENCLAW_WATCH_PUBLIC_ASK_URL = publicAskUrl;
  }

  await writeFile(configPath, serializeEnv(next), { mode: 0o600 });

  if (args.has("--launch-agent")) {
    await writeLaunchAgent(next);
  }

  await writePairingBundle(next);

  printSetup(next);
}

async function show() {
  if (!existsSync(configPath)) {
    console.error(`No config found at ${configPath}`);
    process.exit(1);
  }

  const values = parseEnv(await readFile(configPath, "utf8"));
  printSetup(values);
}

async function pair() {
  if (!existsSync(configPath)) {
    console.error(`No config found at ${configPath}`);
    process.exit(1);
  }

  const values = parseEnv(await readFile(configPath, "utf8"));
  await writePairingBundle(values);
  printPairing(values);
}

async function runPreflight(values) {
  const host = envOrExisting(values, "OPENCLAW_WATCH_BRIDGE_HOST", "127.0.0.1");
  const port = Number(envOrExisting(values, "OPENCLAW_WATCH_BRIDGE_PORT", "8787"));

  const checks = [
    await commandCheck("node", ["--version"], "Node.js"),
    await commandCheck("openclaw", ["--version"], "OpenClaw CLI"),
    await commandCheck("tailscale", ["version"], "Tailscale CLI"),
    existsSync(defaultSessionsPath)
      ? okCheck("OpenClaw sessions file", defaultSessionsPath)
      : warnCheck("OpenClaw sessions file", `Not found at ${defaultSessionsPath}`),
  ];

  checks.push(await portCheck(host, port));
  return checks;
}

function okCheck(label, detail = "") {
  return { status: "ok", label, detail };
}

function warnCheck(label, detail = "") {
  return { status: "warn", label, detail };
}

async function commandCheck(commandName, commandArgs, label) {
  return new Promise((resolveCheck) => {
    const child = spawn(commandName, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => {
      resolveCheck(warnCheck(label, `${commandName} not found in PATH`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolveCheck(okCheck(label, firstLine(output)));
      } else {
        resolveCheck(warnCheck(label, firstLine(output) || `${commandName} exited with code ${code}`));
      }
    });
  });
}

function commandOutput(commandName, commandArgs) {
  return new Promise((resolveOutput) => {
    const child = spawn(commandName, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolveOutput({ ok: false, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolveOutput({ ok: code === 0, stdout, stderr, code });
    });
  });
}

async function portCheck(host, port) {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        resolveCheck(warnCheck(`Port ${port}`, `Already in use on ${host}; stop the old bridge before starting this one.`));
        return;
      }
      resolveCheck(warnCheck(`Port ${port}`, error?.message || "Could not check port"));
    });
    server.once("listening", () => {
      server.close(() => resolveCheck(okCheck(`Port ${port}`, `Available on ${host}`)));
    });
    server.listen(port, host);
  });
}

function printChecks(checks) {
  console.log("Preflight checks:");
  for (const check of checks) {
    const marker = check.status === "ok" ? "[ok]" : "[warn]";
    const detail = check.detail ? ` - ${check.detail}` : "";
    console.log(`  ${marker} ${check.label}${detail}`);
  }
  console.log("");
}

function firstLine(value) {
  return String(value ?? "").trim().split(/\r?\n/)[0] ?? "";
}

async function detectTailscaleAskUrl() {
  const result = await commandOutput("tailscale", ["status", "--json"]);
  if (!result.ok) return "";

  try {
    const payload = JSON.parse(result.stdout);
    const dnsName = String(payload?.Self?.DNSName ?? "").replace(/\.$/, "");
    return dnsName ? `https://${dnsName}/watch/ask` : "";
  } catch {
    return "";
  }
}

async function detectMainSession(values) {
  const sessionsPath = envOrExisting(values, "OPENCLAW_WATCH_SESSIONS_PATH", defaultSessionsPath);
  if (!existsSync(sessionsPath)) {
    return { warning: "Could not auto-detect the OpenClaw main session. The bridge will still start, but ask requests may fail until a target is configured." };
  }

  try {
    const payload = JSON.parse(await readFile(sessionsPath, "utf8"));
    const main = payload["agent:main:main"] ?? Object.values(payload)
      .filter((session) => session?.sessionId)
      .sort((a, b) => Number(b?.updatedAt ?? 0) - Number(a?.updatedAt ?? 0))[0];
    if (!main?.sessionId) {
      return { warning: "OpenClaw sessions file exists, but no usable session id was found." };
    }
    return { sessionId: String(main.sessionId) };
  } catch (error) {
    return {
      warning: `Could not read OpenClaw sessions file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function envOrExisting(values, key, fallback) {
  return process.env[key] || values[key] || fallback;
}

function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    result[key] = unquote(rawValue);
  }
  return result;
}

function serializeEnv(values) {
  const lines = [
    "# Generated by OpenClaw Watch setup.",
    "# Keep this file private; it contains the iPhone bearer token.",
  ];

  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${quote(value)}`);
  }

  return `${lines.join("\n")}\n`;
}

async function writePairingBundle(values) {
  const pairing = buildPairing(values);
  if (!pairing.askUrl) return null;

  const pairingPath = resolve(configDir, "pairing.json");
  const deepLinkPath = resolve(configDir, "pairing.url");
  const qrPath = resolve(configDir, "pairing-qr.svg");
  const htmlPath = resolve(configDir, "pairing.html");

  await writeFile(pairingPath, `${JSON.stringify(pairing, null, 2)}\n`, { mode: 0o600 });
  await writeFile(deepLinkPath, `${pairing.deepLink}\n`, { mode: 0o600 });
  await QRCode.toFile(qrPath, pairing.deepLink, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
  });
  await chmod(qrPath, 0o600);
  await writeFile(htmlPath, pairingHtml(pairing), { mode: 0o600 });
  return { pairingPath, deepLinkPath, qrPath, htmlPath };
}

function buildPairing(values) {
  const askUrl = normalizeAskUrl(values.OPENCLAW_WATCH_PUBLIC_ASK_URL || values.OPENCLAW_WATCH_PUBLIC_URL || "");
  if (!askUrl) return { askUrl: "" };

  const healthUrl = endpointUrl(askUrl, "health");
  const diagnosticsUrl = endpointUrl(askUrl, "diagnostics");
  const payload = {
    type: "openclaw-watch-pairing",
    version: 1,
    agentName: values.OPENCLAW_WATCH_AGENT_NAME || "Nova",
    askUrl,
    healthUrl,
    diagnosticsUrl,
    token: values.OPENCLAW_WATCH_BRIDGE_TOKEN || "",
    auth: {
      type: "bearer",
      token: values.OPENCLAW_WATCH_BRIDGE_TOKEN || "",
    },
    createdAt: new Date().toISOString(),
  };

  return {
    ...payload,
    deepLink: `openclaw-watch://pair?payload=${base64UrlJson(payload)}`,
  };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
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

function endpointUrl(askUrl, endpoint) {
  const url = new URL(askUrl);
  url.pathname = url.pathname.replace(/\/ask$/, `/${endpoint}`);
  return url.toString();
}

function pairingHtml(pairing) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenClaw Watch Pairing</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #111; }
    main { max-width: 720px; margin: 0 auto; }
    img { width: min(320px, 100%); height: auto; border: 1px solid #ddd; padding: 12px; }
    code, pre { background: #f5f5f5; border-radius: 6px; padding: 2px 4px; }
    pre { overflow: auto; padding: 12px; }
    a { color: #0645ad; }
  </style>
</head>
<body>
  <main>
    <h1>OpenClaw Watch Pairing</h1>
    <p>Scan this QR with the iPhone app, or open the pairing link on the iPhone.</p>
    <p><img src="./pairing-qr.svg" alt="OpenClaw Watch pairing QR"></p>
    <p><a href="${html(pairing.deepLink)}">Open pairing link</a></p>
    <h2>Manual fallback</h2>
    <pre>${html(JSON.stringify({
      agentName: pairing.agentName,
      askUrl: pairing.askUrl,
      healthUrl: pairing.healthUrl,
      diagnosticsUrl: pairing.diagnosticsUrl,
      token: pairing.token,
    }, null, 2))}</pre>
  </main>
</body>
</html>
`;
}

function quote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

async function writeLaunchAgent(values) {
  await mkdir(dirname(launchAgentPath), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.watch-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>exec node ${xml(shellQuote(resolve(skillDir, "scripts", "start-bridge.mjs")))}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(resolve(configDir, "bridge.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(resolve(configDir, "bridge.err.log"))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
`;
  await writeFile(launchAgentPath, plist);
  values.LAUNCH_AGENT_PATH = launchAgentPath;
}

function xml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(value) {
  return xml(value).replace(/'/g, "&#39;");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function printSetup(values) {
  const host = values.OPENCLAW_WATCH_BRIDGE_HOST || "127.0.0.1";
  const port = values.OPENCLAW_WATCH_BRIDGE_PORT || "8787";

  console.log("");
  console.log("OpenClaw Watch bridge configured");
  console.log(`Config:       ${configPath}`);
  console.log(`Local health: http://${host}:${port}/health`);
  console.log(`Local ask:    http://${host}:${port}/watch/ask`);
  console.log(`Local diag:   http://${host}:${port}/watch/diagnostics`);
  console.log(`Token:        ${values.OPENCLAW_WATCH_BRIDGE_TOKEN}`);
  if (values.OPENCLAW_WATCH_AGENT_SESSION_ID) {
    console.log(`Session:      ${values.OPENCLAW_WATCH_AGENT_SESSION_ID}`);
  } else if (values.OPENCLAW_WATCH_AGENT_CHANNEL || values.OPENCLAW_WATCH_AGENT_TO) {
    console.log(`Target:       ${values.OPENCLAW_WATCH_AGENT_CHANNEL || ""} ${values.OPENCLAW_WATCH_AGENT_TO || ""}`.trim());
  } else {
    console.log("Target:       not configured");
  }
  console.log("");
  printPairing(values);

  console.log("");
  console.log("Next steps:");
  console.log("  1. Start the bridge:");
  console.log(`     node ${displayPath(resolve(skillDir, "scripts", "start-bridge.mjs"))}`);
  console.log("  2. In another terminal, verify local health:");
  console.log("     npm run health");
  console.log("  3. Expose privately through Tailscale Serve:");
  console.log(`     tailscale serve --bg --set-path /watch http://${host}:${port}`);
  console.log("  4. Configure the iPhone/Watch shortcut with:");
  console.log("     URL:   https://<your-device>.<tailnet>.ts.net/watch/ask");
  console.log(`     Token: ${values.OPENCLAW_WATCH_BRIDGE_TOKEN}`);
  console.log("");
  if (values.LAUNCH_AGENT_PATH) {
    console.log("LaunchAgent:");
    console.log(`  launchctl load ${values.LAUNCH_AGENT_PATH}`);
  }
}

function printPairing(values) {
  const pairing = buildPairing(values);
  if (!pairing.askUrl) {
    console.log("");
    console.log("iPhone pairing:");
    console.log("  No Tailscale HTTPS URL found yet.");
    console.log("  After Tailscale Serve is enabled, rerun:");
    console.log("     npm run pair");
    return;
  }

  console.log("");
  console.log("iPhone pairing:");
  console.log(`  Ask URL:      ${pairing.askUrl}`);
  console.log(`  Health URL:   ${pairing.healthUrl}`);
  console.log(`  Diagnostics:  ${pairing.diagnosticsUrl}`);
  console.log(`  Pairing JSON: ${resolve(configDir, "pairing.json")}`);
  console.log(`  Pairing QR:   ${resolve(configDir, "pairing-qr.svg")}`);
  console.log(`  Pairing page: ${resolve(configDir, "pairing.html")}`);
  console.log("");
  console.log("Pairing deep link:");
  console.log(`  ${pairing.deepLink}`);
}

function displayPath(path) {
  const local = relative(process.cwd(), path);
  return local && !local.startsWith("..") && !local.startsWith("/")
    ? local
    : path;
}

function help() {
  console.log(`Usage:
  node Skills/openclaw-watch/scripts/setup.mjs setup [--force] [--launch-agent]
  node Skills/openclaw-watch/scripts/setup.mjs show
  node Skills/openclaw-watch/scripts/setup.mjs pair
`);
}
