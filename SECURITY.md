# Security Policy

WristAgent Bridge runs locally on the user's Mac and can send requests to a local compatible local agent session. Treat the bridge as local automation software with access to the same user context as the terminal process that runs it.

## Supported Versions

The `main` branch is the supported development line until the first tagged release.

## Reporting a Vulnerability

Please open a private security advisory on GitHub or contact Samboy Development through the repository owner profile. Do not publish pairing secrets, pairing files, local logs, or private Tailscale hostnames in public issues.

## Sensitive Files

Never publish generated files from:

```text
~/.openclaw/openclaw-watch/config.env
~/.openclaw/openclaw-watch/pairing.json
~/.openclaw/openclaw-watch/pairing.url
~/.openclaw/openclaw-watch/pairing-qr.svg
~/.openclaw/openclaw-watch/pairing.html
~/.openclaw/openclaw-watch/*.log
```

These may contain pairing secrets, local hostnames, agent session ids, or machine-specific paths.

## Default Safeguards

- Binds to `127.0.0.1` by default.
- Requires bearer-token authentication for Watch/iPhone requests.
- Uses private Tailscale Serve as the recommended remote access path.
- Does not require Tailscale Funnel or public internet exposure.
- Stores setup config with private file permissions.

## Public Exposure

Public internet exposure is not part of the default design. If a user intentionally exposes the bridge beyond their tailnet, they are responsible for TLS, authentication, network policy, logs, rate limits, and operational monitoring.
