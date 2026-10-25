# Security Policy

Only the latest commit on `main` is supported.

## Reporting a vulnerability

Use GitHub private vulnerability reporting: the **Security** tab of the repository, then **Report a vulnerability**. Do not open a public issue.
Include what you found, how to reproduce it and the commit you tested. Expect an acknowledgement as soon as the maintainer can, with no promised timeline.

## What counts

- Secrets, tokens, personal data or private paths committed in any file or in history.
- Renderer or IPC behaviour that lets a capsule reach beyond the contract in `docs/IPC_CONTRACT.md` (remote content, remote fonts, CDN scripts, unreviewed code execution).
- Workflows or scripts that reach the network or touch files outside the repository without saying so.

The kit loads no remote fonts, CDN scripts or Tailwind. Treat contributed capsule code as untrusted until a human reviews it.
