# OpenClaw Watch Skill

Private OpenClaw skill that runs the local bridge used by the OpenClaw iPhone and Apple Watch companion app.

The bridge stays private by default:

- It binds to `127.0.0.1`.
- It requires a bearer token.
- It is intended to be exposed only through Tailscale Serve inside the user's tailnet.
- It should not be exposed with Tailscale Funnel unless the user explicitly chooses that tradeoff.

## Setup

```bash
node scripts/setup.mjs setup
```

This creates private config at:

```text
~/.openclaw/openclaw-watch/config.env
```

## Run

```bash
node scripts/start-bridge.mjs
```

Then verify:

```bash
curl http://127.0.0.1:8787/health
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
node scripts/setup.mjs setup --launch-agent
launchctl load ~/Library/LaunchAgents/com.openclaw.watch-bridge.plist
```

