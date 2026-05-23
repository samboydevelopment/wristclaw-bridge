# OpenClaw Watch Setup

## Configure

```bash
node Skills/openclaw-watch/scripts/setup.mjs setup
```

This creates:

```text
~/.openclaw/openclaw-watch/config.env
```

The config includes:

- `OPENCLAW_WATCH_BRIDGE_HOST`
- `OPENCLAW_WATCH_BRIDGE_PORT`
- `OPENCLAW_WATCH_BRIDGE_TOKEN`
- adaptive timeout defaults

## Run

```bash
node Skills/openclaw-watch/scripts/start-bridge.mjs
```

When this skill is installed as its own private repo, run the same command from the skill repo root:

```bash
node scripts/start-bridge.mjs
```

## Health Check

```bash
Scripts/healthcheck-bridge.sh
```

## Tailscale Serve

```bash
tailscale serve --bg --set-path /watch http://127.0.0.1:8787
```

Use the resulting HTTPS URL in the iPhone app, ending in:

```text
/watch/ask
```

## Optional LaunchAgent

```bash
node Skills/openclaw-watch/scripts/setup.mjs setup --launch-agent
launchctl load ~/Library/LaunchAgents/com.openclaw.watch-bridge.plist
```

Logs:

```text
~/.openclaw/openclaw-watch/bridge.log
~/.openclaw/openclaw-watch/bridge.err.log
```
