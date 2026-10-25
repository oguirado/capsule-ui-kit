# Theming and tokens

Import `capsule-ui-kit/theme.css` once in the renderer. The authoritative inputs are `src/design/tokens.json` and `tokenMappings.json`; `packages/capsule-ui-kit/tools/generate-theme.py` generates the stylesheet. Use the semantic `--cuk-*` tokens, and do not make a component palette independent of those inputs.

The current snapshot has no `theme` service or `ui` barrel export. The starter therefore sets attributes on document.documentElement.dataset directly:

```js
Object.assign(document.documentElement.dataset, {
  themeScheme: 'dark', themeContrast: 'normal', themeDensity: 'regular'
});
```

Theme toggling changes themeScheme between light and dark, and passes the same scheme into DockWorkspace. It never changes a command model or stored economic value. The starter's native buttons, fields and palette retain visible labels, keyboard focus and semantic anchors. Keep the compact header and spacious capsule content when adding consumer controls. Fonts are system fonts; no font download is required.

Token mapping details are indexed in `packages/capsule-ui-kit/books/design-tokens.md`. Newer kit exports must be verified from the manifest after an upgrade rather than assumed from future documentation.
