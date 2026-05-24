# OpenClaw Watch

Private/local OpenClaw plugin that runs the bridge used by the OpenClaw iPhone and Apple Watch companion app.

The bridge stays private by default:

- It binds to `127.0.0.1`.
- It requires a bearer token.
- It is intended to be exposed only through Tailscale Serve inside the user's tailnet.
- It should not be exposed with Tailscale Funnel unless the user explicitly chooses that tradeoff.

## Plugin Structure

```text
.codex-plugin/plugin.json       Plugin manifest
skills/openclaw-watch/SKILL.md  Agent instructions
scripts/setup.mjs               Config/token/LaunchAgent setup
scripts/start-bridge.mjs        Starts the local bridge
scripts/healthcheck.mjs         Checks the local bridge
scripts/diagnose.mjs            Prints user-facing bridge diagnostics
scripts/watch-bridge.mjs        HTTP bridge implementation
references/                     Setup and security notes
```

## Setup

```bash
npm run setup
```

The setup command is a guided CLI wizard. It checks Node.js, OpenClaw, Tailscale,
the local bridge port, and the OpenClaw main session before writing config.

It creates private config at:

```text
~/.openclaw/openclaw-watch/config.env
```

The generated config includes the bearer token and the detected OpenClaw session
target so the Watch shortcut can send requests without manual config edits.

Setup also creates private iPhone pairing artifacts when it can detect the
Tailscale HTTPS URL:

```text
~/.openclaw/openclaw-watch/pairing.json
~/.openclaw/openclaw-watch/pairing.url
~/.openclaw/openclaw-watch/pairing-qr.svg
~/.openclaw/openclaw-watch/pairing.html
```

The QR/deep link uses the `openclaw-watch://pair` scheme and includes the ask
URL, health URL, diagnostics URL, agent name, and bearer token. Keep these files
private.

By default, `/watch/ask` returns agent/runtime failures as HTTP 200 JSON with
`status: "error"` so Apple Shortcuts can display the bridge error instead of
surfacing a generic `NSURLErrorDomain -1011`. Set
`OPENCLAW_WATCH_SHORTCUT_FRIENDLY_ERRORS=false` to preserve HTTP 500 responses.

## Run

```bash
npm start
```

Then verify:

```bash
npm run health
npm run diagnose
```

## Private Tailscale URL

```bash
tailscale serve --bg --set-path /watch http://127.0.0.1:8787
```

Use this in the iPhone app:

```text
https://<your-device>.<tailnet>.ts.net/watch/ask
```

The token printed by setup goes in the app's token field.

To regenerate only the pairing files after changing Tailscale Serve or the app:

```bash
npm run pair
```

The app can call `GET /watch/diagnostics` with the bearer token to show clear
setup errors such as invalid token, missing OpenClaw CLI, Tailscale not running,
or missing agent session.

The Watch session picker uses `GET /watch/sessions`, `GET /watch/messages`, and
`POST /watch/sessions` to create a named session from the Watch before the first
message is sent.

## Optional LaunchAgent

```bash
npm run setup:launch-agent
launchctl load ~/Library/LaunchAgents/com.openclaw.watch-bridge.plist
```

## Public Release Readiness

This repo is safe to keep private while the bridge behavior is still being shaped. Before making it public:

```bash
npm run validate:plugin
npm run scan:secrets
```

Review `references/security.md` and test from a fresh clone.
