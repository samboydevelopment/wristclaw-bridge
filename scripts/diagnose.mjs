#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const configDir = process.env.OPENCLAW_WATCH_CONFIG_DIR || resolve(homedir(), ".openclaw", "openclaw-watch");
const configPath = process.env.OPENCLAW_WATCH_CONFIG_FILE || resolve(configDir, "config.env");

if (!existsSync(configPath)) {
  console.error(`No config found at ${configPath}`);
  console.error("Run setup first: npm run setup");
  process.exit(1);
}

const values = parseEnv(await readFile(configPath, "utf8"));
const host = process.env.OPENCLAW_WATCH_BRIDGE_HOST || values.OPENCLAW_WATCH_BRIDGE_HOST || "127.0.0.1";
const port = process.env.OPENCLAW_WATCH_BRIDGE_PORT || values.OPENCLAW_WATCH_BRIDGE_PORT || "8787";
const token = process.env.OPENCLAW_WATCH_BRIDGE_TOKEN || values.OPENCLAW_WATCH_BRIDGE_TOKEN || "";
const url = `http://${host}:${port}/watch/diagnostics`;

try {
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const payload = await response.json();
  console.log(`${payload.status ?? "unknown"} - ${payload.text ?? "No diagnostic text"}`);
  for (const check of payload.checks ?? []) {
    console.log(`[${check.status}] ${check.label}: ${check.message}`);
  }
  if (!response.ok || payload.status === "error") process.exit(1);
} catch (error) {
  console.error(`Diagnostics failed for ${url}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
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

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}
