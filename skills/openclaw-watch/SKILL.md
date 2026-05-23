---
name: openclaw-watch
description: Configure, run, debug, or document the private Apple Watch bridge for OpenClaw.
---

# OpenClaw Watch

Use when setting up, running, debugging, or documenting the OpenClaw Watch bridge.

## Workflow

1. Run `node ../../scripts/setup.mjs setup` from this skill directory, or `node scripts/setup.mjs setup` from the plugin root.
2. Start the bridge with `node ../../scripts/start-bridge.mjs` from this skill directory, or `node scripts/start-bridge.mjs` from the plugin root.
3. Verify locally with `curl http://127.0.0.1:8787/health`.
4. Expose it privately with Tailscale Serve using the setup output.
5. Put the Tailscale HTTPS `/watch/ask` URL, token, and agent name in the iPhone app.

Keep the bridge private to the user's tailnet. Do not use Tailscale Funnel unless explicitly requested.

## Scripts

- `scripts/setup.mjs`: generates config, token, optional LaunchAgent, and setup instructions.
- `scripts/start-bridge.mjs`: loads private config and starts the local bridge.
- `scripts/watch-bridge.mjs`: local HTTP bridge used by the iPhone app.

## Security Model

- The bridge binds to `127.0.0.1` by default.
- Requests require a bearer token when `OPENCLAW_WATCH_BRIDGE_TOKEN` is set.
- Public internet exposure is not part of the default flow.
- The bridge executes local `openclaw` CLI commands, so package it as an explicit plugin/service rather than hiding that behavior inside a generic skill install.

See `../../references/setup.md` and `../../references/security.md` for install and verification commands.
