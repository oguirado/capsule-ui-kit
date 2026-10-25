# Capsule UI Kit

A living workspace UI kit and a minimal Electron + Vite + Vue starter. Consumers own capsule registration and backend authority; the kit owns presentation, layout, semantics and rendering contracts.

Start with [Getting started](docs/GETTING_STARTED.md), then [Register capsule types](docs/REGISTER_CAPSULE_TYPES.md). The starter demonstrates greeting, notes and a disconnected Terminal capsule, a theme toggle and a keyboard command palette. It contains no application simulation code.

| Area | Entry |
| --- | --- |
| Kit | packages/capsule-ui-kit/package.json (explicit exports) |
| Starter | starter/src/main.js |
| IPC boundary | docs/IPC_CONTRACT.md |
| Themes | docs/THEMING_AND_TOKENS.md |
| Window behavior | docs/WINDOW_SEMANTICS.md |
| Agent operation | docs/AI_OPERABILITY.md |
| Upgrades | docs/UPGRADING.md |
| File router | router/llms.txt |
| Peer licences | packages/capsule-ui-kit/THIRD_PARTY_NOTICES.md |

Run `npm ci`, `npm test`, `npm run check`, `npm run build`, and `npm run router` from the root. `npm run proof` performs the offline copy-and-boot proof. Read the offline Electron runtime requirement before running with network disabled.

The package is not granted an inferred open-source licence: project licence is UNLICENSED pending the owner's choice. Dependency licences remain those in the pinned evidence. No Git history is initialized by this delivery.
