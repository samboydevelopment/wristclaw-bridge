#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

const port = Number(process.env.OPENCLAW_WATCH_BRIDGE_PORT ?? 8787);
const host = process.env.OPENCLAW_WATCH_BRIDGE_HOST ?? "127.0.0.1";
const token = process.env.OPENCLAW_WATCH_BRIDGE_TOKEN ?? "";
const defaultAgentName = process.env.OPENCLAW_WATCH_AGENT_NAME ?? "agent";
const agentSessionId = process.env.OPENCLAW_WATCH_AGENT_SESSION_ID ?? "";
const agentChannel = process.env.OPENCLAW_WATCH_AGENT_CHANNEL ?? "";
const agentTo = process.env.OPENCLAW_WATCH_AGENT_TO ?? "";
const sessionsPath = process.env.OPENCLAW_WATCH_SESSIONS_PATH
  ?? `${homedir()}/.openclaw/agents/main/sessions/sessions.json`;
const watchSessionsPath = process.env.OPENCLAW_WATCH_CREATED_SESSIONS_PATH
  ?? `${homedir()}/.openclaw/openclaw-watch/watch-sessions.json`;
const agentThinking = process.env.OPENCLAW_WATCH_AGENT_THINKING ?? "";
const fastThinking = process.env.OPENCLAW_WATCH_FAST_THINKING ?? "minimal";
const fastTimeoutSeconds = Number(process.env.OPENCLAW_WATCH_FAST_TIMEOUT_SECONDS ?? 120);
const defaultTimeoutSeconds = Number(process.env.OPENCLAW_WATCH_TIMEOUT_SECONDS ?? 600);
const longTimeoutSeconds = Number(process.env.OPENCLAW_WATCH_LONG_TIMEOUT_SECONDS ?? 1800);
const userDisplayRole = process.env.OPENCLAW_WATCH_USER_DISPLAY_ROLE ?? "freddy";
const assistantDisplayRole = process.env.OPENCLAW_WATCH_ASSISTANT_DISPLAY_ROLE ?? "nova";
const shortcutFriendlyErrors = process.env.OPENCLAW_WATCH_SHORTCUT_FRIENDLY_ERRORS !== "false";

function normalizePath(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.pathname.replace(/\/+$/, "") || "/";
}

function requestUrl(req) {
  return new URL(req.url ?? "/", "http://localhost");
}

function readBody(req, { maxBytes = 64_000 } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendAskError(res, error) {
  const message = error instanceof Error ? error.message : "Unknown bridge error";
  sendJson(res, shortcutFriendlyErrors ? 200 : 500, {
    text: `OpenClaw Watch error: ${message}`,
    status: "error",
    actions: [],
  });
}

function assertAuth(req) {
  if (!token) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${token}`;
}

function commandStatus(commandName, commandArgs, label) {
  return new Promise((resolveStatus) => {
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
      resolveStatus({
        id: commandName,
        label,
        status: "error",
        message: `${commandName} was not found on this Mac.`,
      });
    });
    child.on("close", (code) => {
      const line = String(output).trim().split(/\r?\n/)[0] ?? "";
      resolveStatus({
        id: commandName,
        label,
        status: code === 0 ? "ok" : "error",
        message: code === 0 ? line : line || `${commandName} exited with code ${code}`,
      });
    });
  });
}

async function premiumVoiceStatus() {
  // Detect whether OpenClaw has a premium TTS provider configured under `talk`.
  // Used by the iPhone app and Watch settings to decide whether the
  // "ElevenLabs voice" toggle will produce premium audio or fall back to
  // the on-device Apple voice.
  const configPath = `${homedir()}/.openclaw/openclaw.json`;
  const baseId = "premium-voice";
  const baseLabel = "Premium voice";

  if (!existsSync(configPath)) {
    return {
      id: baseId,
      label: baseLabel,
      status: "warn",
      message: "Not configured. The Watch will use the on-device Apple voice.",
    };
  }

  try {
    const raw = await readFile(configPath, "utf8");
    const config = JSON.parse(raw);
    const talk = config?.talk ?? {};
    const provider = String(talk.provider ?? "").toLowerCase();
    const providerConfig = talk.providers?.[provider];

    if (!provider || provider === "system") {
      return {
        id: baseId,
        label: baseLabel,
        status: "warn",
        message: "No premium provider set in talk.provider. Apple voice will be used.",
      };
    }

    if (!providerConfig) {
      return {
        id: baseId,
        label: baseLabel,
        status: "warn",
        message: `talk.provider is "${provider}" but providers.${provider} is missing.`,
      };
    }

    const hasCredential = Boolean(
      providerConfig.apiKey
        ?? providerConfig.token
        ?? providerConfig.key
        ?? providerConfig.credential
    );

    if (!hasCredential) {
      return {
        id: baseId,
        label: baseLabel,
        status: "warn",
        message: `${provider} configured without an apiKey. Apple voice will be used.`,
      };
    }

    return {
      id: baseId,
      label: baseLabel,
      status: "ok",
      message: `${provider} ready — toggle "ElevenLabs voice" in Watch settings to use it.`,
    };
  } catch (error) {
    return {
      id: baseId,
      label: baseLabel,
      status: "warn",
      message: error instanceof Error ? error.message : "Could not read openclaw.json",
    };
  }
}

async function buildDiagnostics() {
  const checks = [
    {
      id: "bridge",
      label: "Watch bridge",
      status: "ok",
      message: `Listening on http://${host}:${port}`,
    },
    {
      id: "auth",
      label: "Pairing token",
      status: token ? "ok" : "warn",
      message: token ? "Bearer token is configured." : "No bearer token is configured.",
    },
    {
      id: "target",
      label: "OpenClaw target",
      status: agentSessionId || agentChannel || agentTo ? "ok" : "warn",
      message: agentSessionId
        ? "A session id is configured."
        : agentChannel || agentTo
          ? "A channel target is configured."
          : "No session or channel target is configured.",
    },
    {
      id: "sessions-file",
      label: "OpenClaw sessions file",
      status: existsSync(sessionsPath) ? "ok" : "warn",
      message: existsSync(sessionsPath) ? sessionsPath : `Not found at ${sessionsPath}`,
    },
    await commandStatus("openclaw", ["--version"], "OpenClaw CLI"),
    await commandStatus("tailscale", ["status", "--json"], "Tailscale status"),
    await premiumVoiceStatus(),
  ];

  try {
    const session = await findSessionRecord("");
    checks.push({
      id: "session",
      label: "Agent session",
      status: session?.sessionId ? "ok" : "warn",
      message: session?.sessionId ? "Configured session was found." : "No usable agent session was found.",
    });
  } catch (error) {
    checks.push({
      id: "session",
      label: "Agent session",
      status: "warn",
      message: error instanceof Error ? error.message : "Could not inspect the configured session.",
    });
  }

  const status = checks.some((check) => check.status === "error")
    ? "error"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "ok";

  return {
    status,
    text: diagnosticText(status, checks),
    checks,
    configuration: {
      agentName: defaultAgentName,
      host,
      port,
      tokenConfigured: Boolean(token),
      targetConfigured: Boolean(agentSessionId || agentChannel || agentTo),
    },
  };
}

function diagnosticText(status, checks) {
  if (status === "ok") return "OpenClaw Watch is ready.";
  const firstProblem = checks.find((check) => check.status === "error" || check.status === "warn");
  return firstProblem?.message || "OpenClaw Watch needs attention.";
}

function thinkingForMessage(message) {
  if (agentThinking) return agentThinking;

  const normalized = normalizeUserMessage(message);

  const fastPatterns = [
    /^responde\s+solo\s+ok\b/,
    /^reply\s+only\s+ok\b/,
    /^solo\s+ok\b/,
    /^just\s+ok\b/,
  ];

  return fastPatterns.some((pattern) => pattern.test(normalized)) ? fastThinking : "";
}

function normalizeUserMessage(message) {
  return String(message ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^\[apple watch:[^\]]+\]\s*/i, "")
    .trim();
}

function timeoutForMessage(message, requestedTimeout) {
  const explicitTimeout = Number(requestedTimeout);
  if (Number.isFinite(explicitTimeout) && explicitTimeout > 0) {
    return Math.min(Math.max(Math.round(explicitTimeout), fastTimeoutSeconds), longTimeoutSeconds);
  }

  const normalized = normalizeUserMessage(message);
  const fastPatterns = [
    /^responde\s+solo\s+ok\b/,
    /^reply\s+only\s+ok\b/,
    /^solo\s+ok\b/,
    /^just\s+ok\b/,
  ];
  if (fastPatterns.some((pattern) => pattern.test(normalized))) return fastTimeoutSeconds;

  const longPatterns = [
    /\b(programa|programar|programando|codigo|codifica|implementa|arregla|corrige|debug|debugging|compila|build|commit|push|repo|proyecto)\b/,
    /\b(code|coding|implement|fix|debug|compile|build|commit|push|repo|project)\b/,
    /\b(tomate|toma|necesitas|requieras)\b.*\b(tiempo|time)\b/,
    /\b(todo\s+el\s+tiempo|all\s+the\s+time)\b/,
  ];

  return longPatterns.some((pattern) => pattern.test(normalized)) ? longTimeoutSeconds : defaultTimeoutSeconds;
}

/**
 * Handle a Watch request that includes an attached photo.
 *
 * The payload arrives as JSON `{ text, agentName, sessionId, imageBase64 }`.
 * We write the image to a temp file, run `openclaw infer image describe`
 * with the user's text as the prompt, and return the model's reply as a
 * WatchResponse. The temp file is unlinked unconditionally.
 *
 * Limitation: `infer image describe` is a one-shot model call — it does
 * NOT route through the agent session, so this exchange is NOT persisted
 * in the OpenClaw session store. The Watch will display the reply but
 * subsequent full-replace refreshes will not preserve photo-turn bubbles.
 */
async function handleImageDescribe(payload) {
  const text = String(payload?.text ?? "").trim();
  const imageBase64 = String(payload?.imageBase64 ?? "").trim();

  if (!imageBase64) {
    return { text: "Missing image data.", status: "error", actions: [] };
  }

  const promptText = text || "Describe this image in 2-3 sentences.";
  const tmpPath = join(tmpdir(), `openclaw-watch-image-${randomUUID()}.jpg`);

  try {
    const imageBuffer = Buffer.from(imageBase64, "base64");
    await writeFile(tmpPath, imageBuffer);

    const description = await runInferImageDescribe(tmpPath, promptText);
    return {
      text: truncateForWatch(description),
      status: "ok",
      actions: [],
    };
  } catch (error) {
    return {
      text: error instanceof Error ? error.message : "Image describe failed.",
      status: "error",
      actions: [],
    };
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

function runInferImageDescribe(filePath, prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      "infer", "image", "describe",
      "--file", filePath,
      "--prompt", prompt,
      "--json",
    ];
    const child = spawn("openclaw", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `openclaw infer image describe exited with ${code}`));
        return;
      }
      try {
        // openclaw infer image describe --json returns:
        //   { ok, capability, outputs: [{ path, text, provider, ... }] }
        // Fall back to a few other common shapes in case the provider
        // contract changes in a future OpenClaw release.
        const parsed = JSON.parse(stdout);
        const description = parsed?.outputs?.[0]?.text
          ?? parsed?.outputs?.[0]?.description
          ?? parsed?.description
          ?? parsed?.text
          ?? parsed?.output
          ?? parsed?.message
          ?? parsed?.content
          ?? stdout.trim();
        resolve(String(description).trim());
      } catch {
        resolve(stdout.trim());
      }
    });
  });
}

function runOpenClawAgent(message, sessionId = "", requestedTimeout = null) {
  return new Promise((resolve, reject) => {
    const args = ["agent"];
    const targetSessionId = String(sessionId || agentSessionId || "").trim();
    if (targetSessionId) {
      args.push("--session-id", targetSessionId);
    } else {
      if (agentChannel) args.push("--channel", agentChannel);
      if (agentTo) args.push("--to", agentTo);
    }
    const selectedThinking = thinkingForMessage(message);
    if (selectedThinking) {
      args.push("--thinking", selectedThinking);
    }
    args.push("--message", message, "--json", "--timeout", String(timeoutForMessage(message, requestedTimeout)));

    const child = spawn("openclaw", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `openclaw exited with code ${code}`));
        return;
      }
      resolve(parseAgentText(stdout));
    });
  });
}

function synthesizeTalkSpeech(text) {
  return new Promise((resolve, reject) => {
    // Per-call overrides — short Watch replies favor low latency over max
    // quality. Trade Eleven v3's deeper voice for Flash's ~75ms time-to-first-byte.
    // These do NOT modify ~/.openclaw/openclaw.json; they only affect this call.
    const params = JSON.stringify({
      text,
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_22050_32",
      latency_tier: 4,
      optimize_streaming_latency: 4,
    });
    const child = spawn("openclaw", [
      "gateway",
      "call",
      "talk.speak",
      "--json",
      "--params",
      params,
      "--timeout",
      "60000",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `openclaw gateway call exited with code ${code}`));
        return;
      }

      try {
        const payload = parseGatewayPayload(stdout);
        if (!payload?.audioBase64) {
          reject(new Error("talk.speak returned no audio"));
          return;
        }
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function listOpenClawSessions() {
  const [openClawSessions, watchSessions] = await Promise.all([
    loadOpenClawSessions(),
    loadWatchCreatedSessions(),
  ]);

  // Auto-prune watch-only sessions that never produced an OpenClaw session
  // and are past the grace period. Persist back if anything was removed.
  const { kept: liveWatchSessions, removed } = pruneStaleWatchSessions(watchSessions, openClawSessions);
  if (removed > 0) {
    await saveWatchSessions(liveWatchSessions).catch(() => undefined);
  }

  const watchSessionById = new Map(liveWatchSessions.map((session) => [session.id, session]));
  const merged = openClawSessions.map((session) => watchSessionById.get(session.id) ?? session);
  const seen = new Set(merged.map((session) => session.id));

  for (const session of liveWatchSessions) {
    if (!seen.has(session.id)) {
      merged.unshift(session);
    }
  }

  return merged.slice(0, 20);
}

function loadOpenClawSessions() {
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", ["sessions", "--json", "--limit", "15"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `openclaw sessions exited with code ${code}`));
        return;
      }

      try {
        const payload = JSON.parse(stdout);
        resolve((payload.sessions ?? []).map(formatSessionOption).filter(Boolean));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function loadWatchCreatedSessions() {
  try {
    const payload = JSON.parse(await readFile(watchSessionsPath, "utf8"));
    if (!Array.isArray(payload.sessions)) return [];
    return payload.sessions.map(normalizeWatchCreatedSession).filter(Boolean);
  } catch {
    return [];
  }
}

async function createWatchSession(title) {
  const now = new Date();
  const session = {
    id: randomUUID(),
    title: normalizeSessionTitle(title, now),
    subtitle: "Created on Watch",
    createdAt: now.toISOString(),
  };
  const sessions = [session, ...await loadWatchCreatedSessions()]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 25);

  await mkdir(dirname(watchSessionsPath), { recursive: true });
  await writeFile(watchSessionsPath, JSON.stringify({ sessions }, null, 2), "utf8");
  return session;
}

function normalizeWatchCreatedSession(session) {
  const id = String(session?.id ?? "").trim();
  const title = String(session?.title ?? "").trim();
  if (!id || !title) return null;

  // Preserve createdAt so auto-purge can reason about session age.
  const createdAt = session?.createdAt ? String(session.createdAt) : new Date().toISOString();

  return {
    id,
    title: title.slice(0, 80),
    subtitle: String(session?.subtitle ?? "Created on Watch").trim() || "Created on Watch",
    createdAt,
  };
}

async function saveWatchSessions(sessions) {
  await mkdir(dirname(watchSessionsPath), { recursive: true });
  await writeFile(watchSessionsPath, JSON.stringify({ sessions }, null, 2), "utf8");
}

/**
 * Drop watch-created sessions that never produced an OpenClaw session
 * (i.e. the user named them but never sent a message) and are older
 * than the grace period. Without this, abandoned sessions pile up in
 * watch-sessions.json forever because there's nothing to evict them.
 */
const WATCH_SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

function pruneStaleWatchSessions(watchSessions, openClawSessions) {
  const openIds = new Set(openClawSessions.map((s) => s.id));
  const now = Date.now();
  const kept = [];
  let removed = 0;

  for (const session of watchSessions) {
    if (openIds.has(session.id)) {
      kept.push(session);
      continue;
    }
    const createdMs = Date.parse(session.createdAt ?? "");
    const age = Number.isFinite(createdMs) ? now - createdMs : Infinity;
    if (age > WATCH_SESSION_GRACE_MS) {
      removed += 1;
      continue;
    }
    kept.push(session);
  }

  return { kept, removed };
}

async function deleteSessionById(id) {
  const targetId = String(id ?? "").trim();
  if (!targetId) return { ok: false, reason: "missing id" };

  // 1. If the session lives in watch-sessions.json, drop it.
  const watchSessions = await loadWatchCreatedSessions();
  const filtered = watchSessions.filter((s) => s.id !== targetId);
  let removedFromWatchFile = false;
  if (filtered.length !== watchSessions.length) {
    await saveWatchSessions(filtered);
    removedFromWatchFile = true;
  }

  // 2. If the session also exists in OpenClaw, ask the CLI to delete it.
  let removedFromOpenClaw = false;
  try {
    const openClawSessions = await loadOpenClawSessionsRaw();
    const match = openClawSessions.find((s) => s.sessionId === targetId);
    if (match?.key) {
      await runOpenClawSessionsDelete(match.key);
      removedFromOpenClaw = true;
    }
  } catch {
    // Non-fatal: the user can still re-run the delete later.
  }

  return {
    ok: removedFromWatchFile || removedFromOpenClaw,
    removedFromWatchFile,
    removedFromOpenClaw,
  };
}

function runOpenClawSessionsDelete(sessionKey) {
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", ["sessions", "delete", "--key", sessionKey, "--yes"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `openclaw sessions delete exited with ${code}`));
    });
  });
}

function loadOpenClawSessionsRaw() {
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", ["sessions", "--json", "--limit", "50"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) { reject(new Error(stderr || `openclaw sessions exited with ${code}`)); return; }
      try { resolve(JSON.parse(stdout).sessions ?? []); }
      catch (error) { reject(error); }
    });
  });
}

function normalizeSessionTitle(title, now = new Date()) {
  const clean = String(title ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (clean) return clean;
  return `Watch Session ${now.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

async function listOpenClawMessages(sessionId = "", limit = 12) {
  const session = await findSessionRecord(sessionId);
  if (!session?.sessionFile) return [];

  const text = await readFile(session.sessionFile, "utf8");
  const messages = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const message = formatVisibleMessage(entry);
    if (message) messages.push(message);
  }

  return messages.slice(-limit);
}

async function findSessionRecord(sessionId = "") {
  const payload = JSON.parse(await readFile(sessionsPath, "utf8"));
  const targetSessionId = String(sessionId || agentSessionId || "").trim();

  if (targetSessionId) {
    return Object.values(payload).find((session) => session?.sessionId === targetSessionId) ?? null;
  }

  return payload["agent:main:main"] ?? Object.values(payload)
    .sort((a, b) => Number(b?.updatedAt ?? 0) - Number(a?.updatedAt ?? 0))[0] ?? null;
}

function formatVisibleMessage(entry) {
  const role = entry?.message?.role;
  if (role !== "user" && role !== "assistant") return null;
  if (entry?.message?.sourceChannel === "heartbeat" || entry?.message?.sourceChannel === "system") return null;
  if (entry?.message?.model === "delivery-mirror") return null;

  const text = visibleTextFromContent(entry.message.content);
  if (!text) return null;
  if (shouldHideFromWatch(text)) return null;

  return {
    id: normalizedUuid(entry.id),
    role: role === "user" ? userDisplayRole : assistantDisplayRole,
    text: truncateForWatch(text),
    status: "ok",
    createdAt: normalizeTimestamp(entry.timestamp),
  };
}

function normalizedUuid(value) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : randomUUID();
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return validDate.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function shouldHideFromWatch(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("Read HEARTBEAT.md")
    || trimmed.startsWith("OpenClaw runtime context for this turn:")
    || trimmed === "Done.";
}

function visibleTextFromContent(content) {
  if (typeof content === "string") return stripSystemLines(content);
  if (!Array.isArray(content)) return "";

  return stripSystemLines(content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim());
}

function stripSystemLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("System:"))
    .join("\n")
    .trim();
}

function truncateForWatch(text, maxLength = 900) {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}...`;
}

function formatSessionOption(session) {
  const id = String(session.sessionId ?? "").trim();
  if (!id) return null;

  const title = sessionTitleFromKey(session);
  const subtitle = session.updatedAt ? new Date(Number(session.updatedAt)).toLocaleString() : id;

  return { id, title, subtitle };
}

/**
 * Derive a human-readable title from the OpenClaw session key.
 *
 * Key format: `agent:<agentId>:<channelOrKind>:<kind?>:<...target?>`
 * Examples:
 *   agent:main:main                                    → "Main"
 *   agent:main:explicit:<uuid>                         → "Explicit"
 *   agent:main:telegram:direct:8246904047              → "Telegram · 8246904047"
 *   agent:main:whatsapp:direct:+16466238506            → "WhatsApp · +16466238506"
 *
 * Previously every non-main session collapsed to `"main direct"`, so three
 * different channels all looked like duplicates in the Watch picker.
 */
function sessionTitleFromKey(session) {
  const key = String(session.key ?? "");
  if (key === "agent:main:main") return "Main";

  const parts = key.split(":");
  if (parts.length < 3) {
    const kind = session.kind ? String(session.kind) : "session";
    const agentId = session.agentId ? String(session.agentId) : "agent";
    return `${agentId} ${kind}`;
  }

  const channelOrKind = parts[2];
  if (channelOrKind === "explicit") return "Explicit";

  const channelLabel = channelDisplayName(channelOrKind);
  // Anything after the channel:kind pair is the target (handle id, phone, etc.)
  const target = parts.length >= 5 ? parts.slice(4).join(":") : "";
  if (!target) return channelLabel;

  // Long opaque IDs stay readable; short targets (phone numbers, handles) untouched.
  const displayTarget = target.length > 24 ? `${target.slice(0, 21)}…` : target;
  return `${channelLabel} · ${displayTarget}`;
}

function channelDisplayName(channel) {
  const titles = {
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    signal: "Signal",
    sms: "SMS",
    imessage: "iMessage",
    email: "Email",
    discord: "Discord",
    slack: "Slack",
    matrix: "Matrix",
    main: "Main",
  };
  if (titles[channel]) return titles[channel];
  return channel ? channel.charAt(0).toUpperCase() + channel.slice(1) : "Session";
}

function parseGatewayPayload(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Empty gateway response");

  try {
    return JSON.parse(trimmed);
  } catch {}

  for (const line of trimmed.split(/\r?\n/).reverse()) {
    const candidate = line.trim();
    if (!looksLikeJson(candidate)) continue;
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error("Could not parse gateway response");
}

function parseAgentText(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return "Done.";

  const parsed = parseJsonOutput(trimmed);
  if (parsed.length > 0) {
    for (const value of parsed.reverse()) {
      const text = extractAgentText(value);
      if (text) return text;
    }
  }

  if (looksLikeJson(trimmed)) {
    return "Received a response, but I couldn't extract readable text.";
  }

  return trimmed;
}

function parseJsonOutput(text) {
  const values = [];

  try {
    values.push(JSON.parse(text));
    return values;
  } catch {}

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!looksLikeJson(trimmedLine)) continue;

    try {
      values.push(JSON.parse(trimmedLine));
    } catch {}
  }

  return values;
}

function extractAgentText(value, depth = 0) {
  if (depth > 10 || value == null) return null;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;

    if (looksLikeJson(text)) {
      try {
        return extractAgentText(JSON.parse(text), depth + 1) ?? text;
      } catch {
        return text;
      }
    }

    return text;
  }

  if (Array.isArray(value)) {
    for (const item of [...value].reverse()) {
      const text = extractAgentText(item, depth + 1);
      if (text) return text;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  const directKeys = [
    "notificationText",
    "finalAssistantVisibleText",
    "finalAssistantRawText",
    "sourceReply",
    "reply",
    "final",
    "finalText",
    "outputText",
    "output_text",
    "answer",
    "text",
    "message",
    "content",
    "result",
    "response",
    "data",
    "payload",
    "payloads",
  ];

  for (const key of directKeys) {
    const text = extractAgentText(value[key], depth + 1);
    if (text) return text;
  }

  return null;
}

function looksLikeJson(text) {
  return (text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"));
}

const server = createServer(async (req, res) => {
  const path = normalizePath(req);

  if (req.method === "GET" && (path === "/health" || path === "/watch/health")) {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method === "GET" && (path === "/watch/diagnostics" || path === "/diagnostics")) {
    if (!assertAuth(req)) {
      sendJson(res, 401, {
        status: "error",
        text: "Token invalid. Re-pair the iPhone app from the OpenClaw Watch setup wizard.",
        checks: [
          {
            id: "auth",
            label: "Pairing token",
            status: "error",
            message: "The iPhone app token does not match this Mac.",
          },
        ],
      });
      return;
    }

    sendJson(res, 200, await buildDiagnostics());
    return;
  }

  if (req.method === "GET" && (path === "/watch/sessions" || path === "/sessions")) {
    if (!assertAuth(req)) {
      sendJson(res, 401, { sessions: [] });
      return;
    }

    try {
      const sessions = await listOpenClawSessions();
      sendJson(res, 200, { sessions });
    } catch {
      sendJson(res, 200, { sessions: [] });
    }
    return;
  }

  if (req.method === "DELETE" && (path.startsWith("/watch/sessions/") || path.startsWith("/sessions/"))) {
    if (!assertAuth(req)) {
      sendJson(res, 401, { ok: false, text: "Unauthorized" });
      return;
    }

    const id = decodeURIComponent(path.split("/").pop() ?? "");
    try {
      const result = await deleteSessionById(id);
      if (!result.ok) {
        sendJson(res, 404, { ok: false, text: "Session not found" });
        return;
      }
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        text: error instanceof Error ? error.message : "Could not delete session",
      });
    }
    return;
  }

  if (req.method === "POST" && (path === "/watch/sessions" || path === "/sessions")) {
    if (!assertAuth(req)) {
      sendJson(res, 401, { text: "Unauthorized", status: "error", actions: [] });
      return;
    }

    try {
      const body = await readBody(req);
      const payload = body.trim() ? JSON.parse(body) : {};
      const session = await createWatchSession(payload.title);
      sendJson(res, 201, { session });
    } catch (error) {
      sendJson(res, 500, {
        text: error instanceof Error ? error.message : "Could not create session",
        status: "error",
        actions: [],
      });
    }
    return;
  }

  if (req.method === "GET" && (path === "/watch/messages" || path === "/messages")) {
    if (!assertAuth(req)) {
      sendJson(res, 401, { messages: [] });
      return;
    }

    try {
      const url = requestUrl(req);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 12), 24);
      const messages = await listOpenClawMessages(url.searchParams.get("sessionId") ?? "", limit);
      sendJson(res, 200, { messages });
    } catch {
      sendJson(res, 200, { messages: [] });
    }
    return;
  }

  if (req.method === "POST" && (path === "/watch/talk-speak" || path === "/talk-speak")) {
    if (!assertAuth(req)) {
      sendJson(res, 401, { text: "Unauthorized", status: "error", actions: [] });
      return;
    }

    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      const text = String(payload.text ?? "").trim();
      if (!text) {
        sendJson(res, 400, { text: "Missing speech text", status: "error", actions: [] });
        return;
      }

      const speech = await synthesizeTalkSpeech(text);
      sendJson(res, 200, speech);
    } catch (error) {
      sendJson(res, 503, {
        text: error instanceof Error ? error.message : "Unknown talk.speak error",
        status: "error",
        actions: [],
      });
    }
    return;
  }

  if (req.method === "POST" && (path === "/watch/ask-with-image" || path === "/ask-with-image")) {
    if (!assertAuth(req)) {
      sendJson(res, 401, { text: "Unauthorized", status: "error", actions: [] });
      return;
    }

    try {
      // Image payloads are several MB after base64 — relax the default
      // 64 KB body cap for this endpoint only.
      const body = await readBody(req, { maxBytes: 4_000_000 });
      const payload = body.trim() ? JSON.parse(body) : {};
      const result = await handleImageDescribe(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        text: error instanceof Error ? error.message : "Could not process image",
        status: "error",
        actions: [],
      });
    }
    return;
  }

  if (req.method !== "POST" || (path !== "/watch/ask" && path !== "/ask")) {
    sendJson(res, 404, { text: "Not found", status: "error", actions: [] });
    return;
  }

  if (!assertAuth(req)) {
    sendJson(res, 401, { text: "Unauthorized", status: "error", actions: [] });
    return;
  }

  try {
    const body = await readBody(req);
    const command = JSON.parse(body);
    const agentName = String(command.agentName ?? "").trim() || defaultAgentName;
    const prefix = `[Apple Watch — reply in 2-3 sentences max, plain text only, no markdown: ${command.kind ?? "askAgent"}:${agentName}]`;
    const text = String(command.text ?? "").trim();
    const reply = await runOpenClawAgent(`${prefix} ${text}`, command.sessionId, command.timeoutSeconds);
    sendJson(res, 200, { text: reply, status: "ok", actions: [] });
  } catch (error) {
    sendAskError(res, error);
  }
});

server.listen(port, host, () => {
  console.log(`OpenClaw Watch bridge listening on http://${host}:${port}/watch/ask`);
});
