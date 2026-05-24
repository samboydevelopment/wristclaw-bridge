# OpenClaw Watch Setup

## Fresh Clone

```bash
git clone https://github.com/marciaris21/openclaw-watch-skill.git
cd openclaw-watch-skill
npm run validate:plugin
npm run setup
npm start
```

In another terminal:

```bash
npm run health
```

## Configure

```bash
npm run setup
```

This runs the guided setup wizard. It checks:

- Node.js
- OpenClaw CLI
- Tailscale CLI
- OpenClaw sessions file
- local bridge port availability

It creates:

```text
~/.openclaw/openclaw-watch/config.env
```

The config includes:

- `OPENCLAW_WATCH_BRIDGE_HOST`
- `OPENCLAW_WATCH_BRIDGE_PORT`
- `OPENCLAW_WATCH_BRIDGE_TOKEN`
- `OPENCLAW_WATCH_AGENT_SESSION_ID`
- `OPENCLAW_WATCH_SESSIONS_PATH`
- adaptive timeout defaults

## Run

```bash
npm start
```

## Health Check

```bash
npm run health
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
npm run setup:launch-agent
launchctl load ~/Library/LaunchAgents/com.openclaw.watch-bridge.plist
```

Logs:

```text
~/.openclaw/openclaw-watch/bridge.log
~/.openclaw/openclaw-watch/bridge.err.log
```
