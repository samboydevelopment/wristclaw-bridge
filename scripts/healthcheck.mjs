#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const configDir = process.env.OPENCLAW_WATCH_CONFIG_DIR || resolve(homedir(), ".openclaw", "openclaw-watch");
const configPath = process.env.OPENCLAW_WATCH_CONFIG_FILE || resolve(configDir, "config.env");

let host = process.env.OPENCLAW_WATCH_BRIDGE_HOST || "127.0.0.1";
let port = process.env.OPENCLAW_WATCH_BRIDGE_PORT || "8787";

if (existsSync(configPath)) {
  const values = parseEnv(await readFile(configPath, "utf8"));
  host = process.env.OPENCLAW_WATCH_BRIDGE_HOST || values.OPENCLAW_WATCH_BRIDGE_HOST || host;
  port = process.env.OPENCLAW_WATCH_BRIDGE_PORT || values.OPENCLAW_WATCH_BRIDGE_PORT || port;
}

const url = `http://${host}:${port}/health`;

try {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    console.error(`Healthcheck failed: HTTP ${response.status} ${text}`);
    process.exit(1);
  }
  console.log(text);
} catch (error) {
  console.error(`Healthcheck failed for ${url}`);
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
