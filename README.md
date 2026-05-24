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

## Run

```bash
npm start
```

Then verify:

```bash
npm run health
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
