# Public Release Checklist

Use this before making the repository public or tagging a release.

## Repository Hygiene

- [ ] `npm run scan:secrets` reports no high-confidence secrets.
- [ ] No generated config, pairing files, pairing secrets, logs, screenshots with private data, or machine-specific paths are tracked.
- [ ] README install flow works from a fresh clone.
- [ ] `SECURITY.md` explains sensitive files and vulnerability reporting.
- [ ] `CONTRIBUTING.md` explains local checks and compatibility rules.
- [ ] License and copyright are correct.

## Product Consistency

- [ ] Public name is `WristAgent Bridge`.
- [ ] Technical compatibility names remain documented: `openclaw-watch`, `OPENCLAW_WATCH_*`, and `~/.openclaw/openclaw-watch`.
- [ ] Pairing uses `wristagent://pair`.
- [ ] URLs point to `samboydevelopment`.

## Security and Privacy

- [ ] Bridge binds to `127.0.0.1` by default.
- [ ] Bearer-token auth is required for iPhone/Watch requests.
- [ ] Tailscale Serve remains the recommended exposure path.
- [ ] Docs do not recommend Tailscale Funnel or public internet exposure by default.
- [ ] Privacy policy matches current behavior.

## Smoke Test

```bash
npm install
node --check scripts/setup.mjs
node --check scripts/watch-bridge.mjs
node --check scripts/start-bridge.mjs
node --check scripts/diagnose.mjs
node --check scripts/healthcheck.mjs
node --check scripts/repair.mjs
npm run scan:secrets
```

On a real Mac with the local agent and Tailscale configured:

```bash
npm run setup
npm start
npm run health
npm run diagnose
npm run repair
npm run pair
```
