#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ignoredDirs = new Set([".git", "node_modules"]);
const ignoredFiles = new Set(["package-lock.json"]);
const findings = [];

const patterns = [
  { name: "private key", regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { name: "github token", regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: "slack token", regex: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
  { name: "aws access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "openai style key", regex: /sk-[A-Za-z0-9_-]{32,}/ },
  { name: "jwt", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "assigned secret", regex: /\b(?:password|passwd|api[_-]?key|secret|token)\b\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{16,})["']?/i },
];

await scan(".");

if (findings.length) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: possible ${finding.name}`);
  }
  process.exit(1);
}

console.log("No high-confidence secrets found.");

async function scan(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) await scan(join(dir, entry.name));
      continue;
    }

    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    const file = join(dir, entry.name);
    const text = await readText(file);
    if (text == null) continue;

    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        const match = line.match(pattern.regex);
        if (!match) continue;
        if (isKnownSafeLine(line, match[1] ?? "")) continue;
        findings.push({ file, line: index + 1, name: pattern.name });
      }
    });
  }
}

async function readText(file) {
  const buffer = await readFile(file);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

function isKnownSafeLine(line, value) {
  const trimmed = line.trim();
  if (!value) return false;
  if (trimmed.includes("OPENCLAW_WATCH_BRIDGE_TOKEN")) return true;
  if (trimmed.startsWith("- `OPENCLAW_")) return true;
  return false;
}
