# Security Notes

WristClaw Bridge runs a local HTTP bridge that can send messages into an OpenClaw agent session.

Default safeguards:

- Bind to `127.0.0.1`.
- Require `Authorization: Bearer <token>` when a token is configured.
- Store generated config in `~/.openclaw/openclaw-watch/config.env` with `0600` permissions.
- Expose through Tailscale Serve only for private tailnet access.

Sensitive behavior:

- `scripts/watch-bridge.mjs` uses `node:child_process` to run the local `openclaw` CLI.
- This is intentional and should be reviewed explicitly during installation.
- Do not publish real generated config files, bearer tokens, local session logs, or machine-specific paths.

Public release checklist:

- Run a secret scan against the full git history.
- Verify no `.env`, `config.env`, private keys, tokens, phone numbers, or local session files are tracked.
- Test the plugin from a fresh clone.
- Document why local command execution is required.
