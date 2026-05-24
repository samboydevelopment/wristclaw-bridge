---
name: openclaw-watch
description: Configure, run, debug, or document the private Apple Watch bridge for OpenClaw.
---

# OpenClaw Watch

Use when setting up, running, debugging, or documenting the OpenClaw Watch bridge.

This root `SKILL.md` is kept for compatibility with direct skill-style usage. The plugin entrypoint is `skills/openclaw-watch/SKILL.md`, declared by `.codex-plugin/plugin.json`.

## Workflow

1. Run `npm run setup` from the plugin root to create local config.
2. Start the bridge with `npm start`.
3. Verify locally with `npm run health`.
4. Expose it privately with Tailscale Serve using the setup output.
5. Pair the iPhone app with `~/.openclaw/openclaw-watch/pairing-qr.svg` or `pairing.html`.

Keep the bridge private to the user's tailnet. Do not use Tailscale Funnel unless explicitly requested.

## Scripts

- `scripts/setup.mjs`: generates config, token, optional LaunchAgent, and setup instructions.
- `scripts/start-bridge.mjs`: loads private config and starts the local bridge.
- `scripts/healthcheck.mjs`: validates the local `/health` endpoint.
- `scripts/diagnose.mjs`: validates `/watch/diagnostics` with the configured token.
- `scripts/watch-bridge.mjs`: local HTTP bridge used by the iPhone app.

See `references/setup.md` and `references/security.md` for install and verification commands.
