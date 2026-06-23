#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, rename, rm, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const configDir = process.env.OPENCLAW_WATCH_CONFIG_DIR || resolve(homedir(), ".openclaw", "openclaw-watch");
const launchAgentPath = process.env.OPENCLAW_WATCH_LAUNCH_AGENT_PATH
  || resolve(homedir(), "Library", "LaunchAgents", "com.openclaw.watch-bridge.plist");
const launchAgentLabel = process.env.OPENCLAW_WATCH_LAUNCH_AGENT_LABEL || "com.openclaw.watch-bridge";
const port = String(process.env.OPENCLAW_WATCH_BRIDGE_PORT || "8787");
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  help();
  process.exit(0);
}

const purge = args.has("--purge");
const keepConfig = args.has("--keep-config");

if (purge && keepConfig) {
  console.error("Choose either --purge or --keep-config, not both.");
  process.exit(1);
}

console.log("WristAgent Bridge uninstall");
console.log("");

await stopLaunchAgent();
await stopBridgeProcess();
await removeLaunchAgent();
await handleConfig();

console.log("");
console.log("Uninstall complete.");
console.log("local agent sessions under ~/.openclaw/agents were not changed.");
console.log("If you enabled Tailscale Serve only for WristAgent, remove or replace the /watch route from Tailscale when you no longer need it.");

async function stopLaunchAgent() {
  if (!existsSync(launchAgentPath)) {
    console.log(`[skip] LaunchAgent plist not found: ${launchAgentPath}`);
    return;
  }

  const uid = typeof process.getuid === "function" ? process.getuid() : "";
  if (uid !== "") {
    const bootout = await commandOutput("launchctl", ["bootout", `gui/${uid}`, launchAgentPath]);
    if (bootout.ok) {
      console.log(`[ok] Stopped LaunchAgent: ${launchAgentLabel}`);
    } else {
      console.log(`[warn] Could not bootout LaunchAgent: ${firstLine(bootout.stderr || bootout.stdout) || "not loaded"}`);
    }
  }

  const remove = await commandOutput("launchctl", ["remove", launchAgentLabel]);
  if (!remove.ok && firstLine(remove.stderr || remove.stdout)) {
    console.log(`[warn] launchctl remove: ${firstLine(remove.stderr || remove.stdout)}`);
  }
}

async function stopBridgeProcess() {
  const pids = await commandOutput("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"]);
  if (!pids.ok || !pids.stdout.trim()) {
    console.log(`[skip] No process is listening on port ${port}.`);
    return;
  }

  for (const pidText of pids.stdout.trim().split(/\s+/)) {
    const pid = Number(pidText);
    if (!Number.isInteger(pid) || pid <= 0) continue;

    const ps = await commandOutput("ps", ["-p", String(pid), "-o", "command="]);
    const command = ps.stdout.trim();
    const looksLikeBridge = command.includes("scripts/start-bridge.mjs")
      || command.includes("scripts/watch-bridge.mjs")
      || command.includes("watch-bridge.mjs");

    if (!looksLikeBridge) {
      console.log(`[warn] Port ${port} is used by PID ${pid}, but it does not look like WristAgent Bridge: ${command || "unknown command"}`);
      continue;
    }

    try {
      process.kill(pid, "SIGTERM");
      console.log(`[ok] Stopped bridge process PID ${pid}.`);
    } catch (error) {
      console.log(`[warn] Could not stop PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function removeLaunchAgent() {
  if (!existsSync(launchAgentPath)) return;
  await unlink(launchAgentPath);
  console.log(`[ok] Removed LaunchAgent plist: ${launchAgentPath}`);
}

async function handleConfig() {
  if (keepConfig) {
    console.log(`[keep] Config left in place: ${configDir}`);
    return;
  }

  if (!existsSync(configDir)) {
    console.log(`[skip] Config directory not found: ${configDir}`);
    return;
  }

  if (purge) {
    await rm(configDir, { recursive: true, force: true });
    console.log(`[ok] Deleted config directory: ${configDir}`);
    return;
  }

  const backupPath = await uniqueBackupPath(`${configDir}.backup-${timestamp()}`);
  await mkdir(dirname(backupPath), { recursive: true });
  await rename(configDir, backupPath);
  console.log(`[ok] Moved config to backup: ${backupPath}`);
  console.log("[note] The backup contains pairing files and pairing secrets. Keep it private or delete it when no longer needed.");
}

async function uniqueBackupPath(basePath) {
  if (!existsSync(basePath)) return basePath;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${basePath}-${index}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find an available backup path for ${basePath}`);
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

function firstLine(value) {
  return String(value ?? "").trim().split(/\r?\n/)[0] ?? "";
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function help() {
  console.log(`Usage:
  npm run uninstall
  npm run uninstall -- --purge
  npm run uninstall -- --keep-config

Stops the WristAgent Bridge LaunchAgent, stops the local bridge process when it
is listening on the configured port, removes the LaunchAgent plist, and moves
~/.openclaw/openclaw-watch to a timestamped backup by default.

Options:
  --purge        Delete ~/.openclaw/openclaw-watch instead of backing it up.
  --keep-config  Stop/remove the service but leave local config in place.
`);
}
