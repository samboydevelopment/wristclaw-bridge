# WristClaw Bridge Setup

## Fresh Clone

```bash
git clone https://github.com/samboydevelopment/openclaw-watch-skill.git
cd openclaw-watch-skill
npm install
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
~/.openclaw/openclaw-watch/pairing.json
~/.openclaw/openclaw-watch/pairing.url
~/.openclaw/openclaw-watch/pairing-qr.svg
~/.openclaw/openclaw-watch/pairing.html
```

The config includes:

- `OPENCLAW_WATCH_BRIDGE_HOST`
- `OPENCLAW_WATCH_BRIDGE_PORT`
- `OPENCLAW_WATCH_BRIDGE_TOKEN`
- `OPENCLAW_WATCH_AGENT_NAME`
- `OPENCLAW_WATCH_AGENT_SESSION_ID`
- `OPENCLAW_WATCH_SESSIONS_PATH`
- `OPENCLAW_WATCH_PUBLIC_ASK_URL`
- adaptive timeout defaults

The pairing files are private. They contain the app deep link and bearer token
needed by the iPhone app. The normal app flow is:

1. Run setup on the Mac.
2. Start the bridge with `npm start`.
3. Enable Tailscale Serve for `/watch`.
4. Regenerate pairing artifacts with `npm run pair`.
5. Open `~/.openclaw/openclaw-watch/pairing.html`.
6. Scan the QR from the iPhone app, or open the deep link on the iPhone.
7. The app saves the payload to Keychain.
8. The app calls `/watch/diagnostics`.
9. The app transfers the saved config to Apple Watch.
10. The user finishes QC by sending a test message from the Watch.

QC passes when the Watch can send a message, receive a response, load messages
for the selected session, and create/select sessions.

Apple Shortcuts treats HTTP 500 responses as `NSURLErrorDomain -1011`, which
hides the bridge error text. The bridge therefore returns `/watch/ask` runtime
failures as HTTP 200 JSON with `status: "error"` by default. To keep strict HTTP
500 behavior, set:

```text
OPENCLAW_WATCH_SHORTCUT_FRIENDLY_ERRORS=false
```

## Run

```bash
npm start
```

## Health Check

```bash
npm run health
npm run diagnose
```

`npm run diagnose` calls `/watch/diagnostics` with the configured bearer token
and prints user-facing checks for the bridge, token, OpenClaw CLI, Tailscale, and
agent session.

## Tailscale Serve

```bash
tailscale serve --bg --set-path /watch http://127.0.0.1:8787
```

Use the resulting HTTPS URL in the iPhone app, ending in:

```text
/watch/ask
```

If Tailscale Serve was enabled after setup, regenerate pairing artifacts:

```bash
npm run pair
```

The generated pairing page is:

```text
~/.openclaw/openclaw-watch/pairing.html
```

Keep it private. The page is branded for WristClaw and contains the
bearer token required for pairing.

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
