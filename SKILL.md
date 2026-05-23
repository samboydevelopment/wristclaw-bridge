---
name: openclaw-watch
description: "Configure and run the private Apple Watch bridge for OpenClaw."
---

# OpenClaw Watch

Use when setting up, running, debugging, or documenting the OpenClaw Watch bridge.

## Workflow

1. Run `node scripts/setup.mjs setup` from the skill root to create local config.
2. Start the bridge with `node scripts/start-bridge.mjs`.
3. Expose it privately with Tailscale Serve using the setup output.
4. Put the Tailscale HTTPS `/watch/ask` URL, token, and agent name in the iPhone app.

Keep the bridge private to the user's tailnet. Do not use Tailscale Funnel unless explicitly requested.

## Scripts

- `scripts/setup.mjs`: generates config, token, optional LaunchAgent, and setup instructions.
- `scripts/start-bridge.mjs`: loads private config and starts the local bridge.
- `scripts/watch-bridge.mjs`: local HTTP bridge used by the iPhone app.

See `references/setup.md` for install and verification commands.
