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
  const manualPayload = JSON.stringify({
    agentName: pairing.agentName,
    askUrl: pairing.askUrl,
    healthUrl: pairing.healthUrl,
    diagnosticsUrl: pairing.diagnosticsUrl,
    token: pairing.token,
  }, null, 2);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenClaw Watch Pairing</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0d12;
      --panel: #10131a;
      --panel-strong: #171b22;
      --border: #272d36;
      --text: #f6f7fb;
      --muted: rgba(246, 247, 251, 0.68);
      --subtle: rgba(246, 247, 251, 0.10);
      --accent: #ff5b57;
      --accent-strong: #ef3436;
      --accent-dark: #c81f29;
      --cyan: #8ee4ff;
    }

    * { box-sizing: border-box; }

    body {
      min-height: 100vh;
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 72% 16%, rgba(142, 228, 255, 0.13), transparent 28rem),
        radial-gradient(circle at 16% 24%, rgba(255, 91, 87, 0.20), transparent 26rem),
        linear-gradient(135deg, #1f232b 0%, var(--bg) 48%, #030405 100%);
      color: var(--text);
    }

    main {
      width: min(1040px, calc(100% - 32px));
      min-height: 100vh;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
      gap: 24px;
      align-items: center;
      padding: 32px 0;
    }

    .hero, .card {
      border: 1px solid rgba(255, 255, 255, 0.10);
      background: rgba(16, 19, 26, 0.82);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
      backdrop-filter: blur(18px);
    }

    .hero {
      min-height: 560px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border-radius: 8px;
      padding: 32px;
      overflow: hidden;
      position: relative;
    }

    .hero::after {
      content: "";
      position: absolute;
      inset: auto -15% -28% 18%;
      height: 280px;
      background: linear-gradient(90deg, rgba(255, 91, 87, 0.34), rgba(142, 228, 255, 0.13));
      filter: blur(70px);
      pointer-events: none;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
      z-index: 1;
    }

    .mark {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: linear-gradient(145deg, var(--accent), var(--accent-dark));
      box-shadow: 0 12px 32px rgba(239, 52, 54, 0.32);
      font-size: 24px;
      font-weight: 800;
      line-height: 1;
    }

    .eyebrow {
      margin: 0;
      color: var(--cyan);
      font-size: 13px;
      font-weight: 700;
    }

    h1 {
      max-width: 680px;
      margin: 40px 0 14px;
      font-size: clamp(42px, 7vw, 78px);
      line-height: 0.95;
      letter-spacing: 0;
      position: relative;
      z-index: 1;
    }

    .lead {
      max-width: 620px;
      margin: 0;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.55;
      position: relative;
      z-index: 1;
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 32px;
      position: relative;
      z-index: 1;
    }

    .step {
      min-height: 106px;
      padding: 14px;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
    }

    .step strong {
      display: block;
      margin-bottom: 7px;
      color: var(--text);
      font-size: 14px;
    }

    .step span {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }

    .card {
      border-radius: 8px;
      padding: 22px;
    }

    .qr {
      display: block;
      width: min(320px, 100%);
      height: auto;
      margin: 0 auto 18px;
      padding: 14px;
      border-radius: 8px;
      background: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.16);
    }

    .primary {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      min-height: 48px;
      padding: 0 18px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #ffffff;
      font-weight: 800;
      text-decoration: none;
      box-shadow: 0 16px 40px rgba(239, 52, 54, 0.28);
    }

    .meta {
      display: grid;
      gap: 8px;
      margin: 18px 0;
      padding: 14px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.35;
    }

    .meta strong { color: var(--text); }

    details {
      margin-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.09);
      padding-top: 14px;
    }

    summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    pre {
      max-height: 220px;
      overflow: auto;
      margin: 12px 0 0;
      padding: 12px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.32);
      color: rgba(246, 247, 251, 0.82);
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .security {
      margin: 14px 0 0;
      color: rgba(246, 247, 251, 0.54);
      font-size: 12px;
      line-height: 1.45;
    }

    @media (max-width: 820px) {
      main {
        grid-template-columns: 1fr;
        align-items: start;
        padding: 18px 0;
      }

      .hero {
        min-height: auto;
        padding: 24px;
      }

      h1 {
        margin-top: 28px;
        font-size: 44px;
      }

      .steps {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero" aria-labelledby="title">
      <div class="brand">
        <div class="mark" aria-hidden="true">OC</div>
        <div>
          <p class="eyebrow">OpenClaw Watch</p>
          <p class="security">Private pairing over your Tailscale network</p>
        </div>
      </div>

      <div>
        <h1 id="title">Pair your Watch with ${html(pairing.agentName)}</h1>
        <p class="lead">Scan the QR from the iPhone app, confirm diagnostics, then sync the saved configuration to Apple Watch.</p>

        <div class="steps" aria-label="Pairing steps">
          <div class="step"><strong>1. Scan</strong><span>Open the iPhone app and scan this QR from the pairing screen.</span></div>
          <div class="step"><strong>2. Confirm</strong><span>The iPhone stores the token securely and runs diagnostics.</span></div>
          <div class="step"><strong>3. Sync</strong><span>Send the verified config to Apple Watch and run a test message.</span></div>
        </div>
      </div>
    </section>

    <section class="card" aria-label="Pairing code">
      <img class="qr" src="./pairing-qr.svg" alt="OpenClaw Watch pairing QR code">
      <a class="primary" href="${html(pairing.deepLink)}">Open pairing link</a>

      <div class="meta">
        <div><strong>Agent</strong> ${html(pairing.agentName)}</div>
        <div><strong>Bridge</strong> ${html(new URL(pairing.askUrl).host)}</div>
        <div><strong>Created</strong> ${html(pairing.createdAt)}</div>
      </div>

      <details>
        <summary>Manual fallback</summary>
        <pre>${html(manualPayload)}</pre>
      </details>

      <p class="security">This page contains a bearer token. Keep it local, do not publish it, and regenerate pairing if it is shared by mistake.</p>
    </section>
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
