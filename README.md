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

## User Onboarding

Use this flow for a fresh user installing OpenClaw Watch.

### 1. Prepare the Mac

Prerequisites:

- OpenClaw is installed and authenticated on the Mac.
- Tailscale is installed, connected, and signed in.
- Node.js is available.
- The iPhone is signed in to the same Tailscale tailnet.

Install and configure the bridge:

```bash
git clone https://github.com/marciaris21/openclaw-watch-skill.git
cd openclaw-watch-skill
npm install
npm run setup
```

Start the bridge:

```bash
npm start
```

In another terminal, verify the local bridge:

```bash
npm run health
npm run diagnose
```

### 2. Expose It Privately With Tailscale Serve

Keep the bridge private to the user's tailnet:

```bash
tailscale serve --bg --set-path /watch http://127.0.0.1:8787
```

After Tailscale Serve is active, regenerate pairing artifacts:

```bash
npm run pair
```

This creates the production pairing page:

```text
~/.openclaw/openclaw-watch/pairing.html
```

Open that file on the Mac. It contains the branded QR page used by the iPhone
app. Do not upload or share the page because it contains a bearer token.

### 3. Pair the iPhone App

On the iPhone:

1. Install or open the OpenClaw Watch iPhone app.
2. Make sure Tailscale is connected.
3. Scan the QR from `pairing.html`, or tap the pairing link if the page is open on the iPhone.
4. Confirm the app shows diagnostics as passing.
5. Tap **Sync Watch** if the app does not sync automatically.

### 4. Finish QC on Apple Watch

On Apple Watch:

1. Open OpenClaw Watch.
2. Open Settings and confirm the session list loads.
3. Select a session or create a new one.
4. Return to chat and send a short test message.
5. Confirm the response appears on the Watch.

The setup is complete when the Watch can send a message, receive a response,
load session messages, and create/select sessions.

### 5. Optional: Premium Voice Replies (ElevenLabs)

By default the Watch reads replies using the on-device Apple voice. If
OpenClaw is configured with ElevenLabs (or another premium TTS provider)
under `talk.provider` in `~/.openclaw/openclaw.json`, the Watch can use
that voice instead.

To enable it:

1. Make sure `~/.openclaw/openclaw.json` has `talk.provider: "elevenlabs"`
   and `talk.providers.elevenlabs.apiKey` configured.
2. Run `npm run diagnose` — you should see
   `[ok] Premium voice: elevenlabs ready` in the output.
3. On Apple Watch open **Settings → ElevenLabs voice** and turn it on.

If the premium provider is not configured the toggle has no effect —
the Watch will keep using the Apple voice. There is no penalty for
turning it on without ElevenLabs configured; replies just stay on the
on-device voice.

## Agent → Watch Images (screenshots & file attachments)

The agent can attach an outgoing image to its reply by including one of
the following markers anywhere in its response text:

```
[screenshot]              Captures the current Mac screen
[image: /path/to/file]    Attaches an existing image file
```

The bridge strips the marker before returning the text reply, compresses
the image to a Watch-friendly JPEG (≤ ~220 KB) using `sips`, and forwards
it to the Watch via WCSession. The image appears inside the agent's chat
bubble and is persisted locally on the Watch so it survives session
switches and app restarts.

**Permissions:** `[screenshot]` uses macOS `screencapture`, which requires
**Screen Recording** permission for the process running the bridge
(System Settings → Privacy & Security → Screen Recording → enable for
Node / Terminal / your launch agent). Without permission the marker is
stripped from the response and the text-only reply is delivered.

**Example agent prompt the user might send from the Watch:**
- "Take a screenshot of my screen"
- "Show me the latest chart in /Users/me/Reports/today.png"

The agent can then return a reply such as:
> Here's what's on your screen. `[screenshot]`

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
