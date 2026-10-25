# Capsule UI consumer contract

Feature screens consume the kit UI wrappers. Direct `openvue` and `@openvue/icons` imports belong to the kit UI implementation; configuration imports belong to the kit theme adapter. The kit accepts consumer capsule registrations; it contains no application names or gameplay commands.

Use only declared wrapper props and slots in `src/ui/component-catalog.json`. Missing capabilities must be reported before adding a wrapper API. Never invent vendor props, slots, token names or layout regions. The AppShell owns global navigation and overlays; Dockview owns the workspace. Do not add template tabs or another split-pane controller around Dockview.

`src/design/tokens.json` owns values. Generate `theme.css` with `tools/generate-theme.py`. Aura and Dockview consume semantic values from this contract. Density changes spacing only. Typography uses page-title, section-title, body, label, supporting, table-cell and code roles.

The staged SaaS renderer requires the Vue Options API and a main-owned CSP-compatible style delivery path. Do not activate it before those preconditions are proven. Do not weaken the CSP to make the preview pass.
