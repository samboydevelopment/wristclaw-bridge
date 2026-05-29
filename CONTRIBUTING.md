# Contributing

Thanks for helping improve WristClaw Bridge.

## Local Setup

```bash
git clone https://github.com/samboydevelopment/wristclaw-bridge.git
cd wristclaw-bridge
npm install
npm run scan:secrets
```

Run syntax checks before opening a pull request:

```bash
node --check scripts/setup.mjs
node --check scripts/watch-bridge.mjs
node --check scripts/start-bridge.mjs
node --check scripts/diagnose.mjs
node --check scripts/healthcheck.mjs
npm run scan:secrets
```

## Contribution Guidelines

- Keep generated config, pairing files, tokens, logs, and local hostnames out of commits.
- Preserve compatibility for `~/.openclaw/openclaw-watch` and `OPENCLAW_WATCH_*` variables unless a migration plan is included.
- Keep the bridge private-by-default. Do not make public exposure the default path.
- Document any new endpoint, environment variable, or required permission.
- Update README/docs when changing setup behavior.

## Pull Requests

Include:

- What changed.
- How it was tested.
- Any compatibility impact for existing installs.
- Any security/privacy impact.
