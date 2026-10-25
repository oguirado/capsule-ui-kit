# Design tokens and vendor theme contract

Status: sealed repository-owned token schema (`capsule-ui-kit.design-tokens/v1`) and vendor mapping manifest (`capsule-ui-kit.token-mappings/v1`) [TARGET]. Grounded against installed declarations under the consuming product’s `app/shell/node_modules/` [MEASURED].

<a id="reading-map"></a>
Reading map: authority and token hierarchy §1; preference axes and root bridge §2; pinned vendor surfaces and AUSENTE declarations §3; fail-closed validation and negative contrasts §4; computed-property verification oracle §5.

<a id="section-1"></a>
## 1. Authority and token hierarchy

`packages/capsule-ui-kit/src/design/tokens.json` is the single design authority for consuming product renderer shells (`UI_ARCHITECTURE.md` §2, §8, §13). Token resolution flows strictly one way:

1. **Primitive (`primitive.*`)**: raw hex/RGBA color scales (`neutral`, `accent`, `emerald`, `amber`, `rose`, `cyan`, `purple`, `orange`, `pink`, `alpha`, and the S1 `s1` ramp: `background`, `lowest`, `low`, `container`, `high`, `highest`, `bright`, `primary`/`onPrimary`/`primaryContainer`/`inversePrimary`, `secondary`/`onSecondary`/`secondaryContainer`/`onSecondaryContainer`, `tertiary`/`onTertiary`/`tertiaryContainer`/`onTertiaryContainer`, `error`/`onError`/`errorContainer`/`onErrorContainer`, `text`, `textVariant`, `outline`, `outlineVariant`), pixel spacing steps (`0`..`16`), border radii (`none`, `xs`, `sm`, `md`, `lg`, `s1_xl` 12px, `pill`), font stacks, weights, line heights, millisecond durations, cubic-bezier easings, z-index layers, and opacities. Primitive tokens never reference semantic or component tokens.
2. **Semantic (`semantic.*`)**: role-bound tokens required by `UI_ARCHITECTURE.md` §8:
   - `surface`: `canvas`, `panel`, `chrome`, `elevated`, `sunken`, `overlay`, `interactive`, `interactiveHover`, `interactiveActive`, `hoverS1` (doc-alternate `#182234`; the export hovers with a `container/60` overlay instead).
   - `text`: `primary`, `muted`, `disabled`, `inverse`, `accent`.
   - `border`: `default`, `subtle`, `strong`, `divider`, `width`.
   - `focus`: `ringColor`, `ringWidth`, `ringOffset`, `ringStyle`, `ringShadow`.
   - `selection`: `background`, `text`, `inactiveBackground`, `border`.
   - `accent`: `primary`, `primaryHover`, `primaryActive`, `primaryContrast`, plus the S1 `secondary` and `tertiary` quartets (`<base>`, `on<Base>`, `<base>Container`, `on<Base>Container`).
   - `status`: `success`, `warning`, `error`, `info` (each with `surface`, `border`, `text`, `icon`).
   - `spacing`, `radius`, `typography` (`fontFamily`, `fontSize` with `xs`/`sm`/`md`/`lg`/`xl`/`terminal` plus S1 `s1_10`/`s1_14`/`s1_16`/`s1_20`, `fontWeight`, `lineHeight`, `roles`: `pageTitle`, `sectionTitle`, `body`, `label`, `supporting`, `tableCell`, `code` plus S1 `headlineLg`/`headlineMd`/`headlineSm`, `bodyMd`/`bodySm`, `labelMd`/`labelSm`, `codeMd`/`codeSm`, `tableHeader`), `zIndex`, `motion` (`duration`, `easing`), `size` (`control`, `tab`, `separator`, `rail`, `drawer`), `elevation` (`floatingShadow`, `scrollbarShadow`, S1 `s1Floating`), `opacity`, and `terminal` (viewport + 16 ANSI colors).
3. **Component (`component.*`)**: capsule-ui-kit component roles for `shellGrid`, `dockWorkspace`, `capsulePanel`, `surfaceView`, `multiSlot`, `orchestratorDrawer`, `fleetPanel`, `inspectorPanel`, `alertBoard`, `timelinePanel`, `missingPanel`, `dialogHost`, `accessibleOutput`, `appShell`, and the S1 `s1` group (`capsuleHeaderHeight` 36px, `tableHeaderHeight` 28px, `tableRowHeight` 32px, `statusDot` 8px, `moraleBarWidth` 48px, `moraleBarHeight` 6px, `kpiValue` 13px mono semibold) (`UI_ARCHITECTURE.md` §3).

Shared tokens never reference vendor CSS variables (`--dv-*`, `--p-*`, `--px-*`, `--vscode-*`) or `dt(...)` expressions. All vendor adapters read from `tokens.json` through `packages/capsule-ui-kit/src/design/tokenMappings.json`.

<a id="section-2"></a>
## 2. Preference axes and root bridge

A single committed preference and resolved mode object drives root document attributes, the OpenVue dark-mode selector, Dockview theme metadata, and xterm `ITheme` (`UI_ARCHITECTURE.md` §8):

| Axis | Admitted values | Root attribute | Independence / behavioral invariant |
|---|---|---|---|
| `scheme` | Preference: `system`, `light`, `dark`; resolved: `light`, `dark` | `data-theme-scheme` | Drives `[data-theme-scheme="dark"]` OpenVue selector and `DockviewTheme.colorScheme` |
| `contrast` | `normal`, `high` | `data-theme-contrast` | Application-owned `modes` (`<scheme>.<contrast>`); never relies on invented vendor `colorScheme.highContrast` |
| `density` | `compact`, `regular`, `comfortable` (S1 default: `compact`) | `data-theme-density` | Scales control heights, paddings, tab strip height, and spacing without altering typography `fontSize` |
| `textScale` | `0.875`, `1`, `1.125`, `1.25` | `data-theme-text-scale` | Scales `semantic.typography.fontSize.*` independently of `density` |
| `forcedColors` | `none`, `active` | `data-theme-forced-colors` | Mirrors `@media (forced-colors: active)` onto CSS system color keywords (`Canvas`, `CanvasText`, `Highlight`, `GrayText`) |
| `reducedMotion` | `no-preference`, `reduce` | `data-theme-motion` | Mirrors `@media (prefers-reduced-motion: reduce)`; collapses `fast`/`normal`/`slow` durations to `0ms` while `semantic.motion.duration.fold` is `0ms` in all modes |

Bootstrap preferences initialize before first paint via a bundled CSP-compatible script and propagate to every window document (`UI_ARCHITECTURE.md` §8). Minimum qualified viewports are `1280x720` desktop and `1280x800` Steam Deck.

<a id="section-3"></a>
## 3. Pinned vendor surfaces and AUSENTE declarations

`packages/capsule-ui-kit/src/design/tokenMappings.json` inventories every token and theme option exposed by the pinned packages in the consuming product’s `app/shell/node_modules/`:

| Vendor surface | Installed package & version [MEASURED] | Inspected files | Classification summary |
|---|---|---|---|
| `dockview` | `dockview-core version 8.4.1`, `dockview-vue version 8.4.1` | `dist/cjs/dockview/theme.d.ts`, `dist/styles/dockview.css` | 11 `DockviewTheme` properties + 125 `--dv-*` CSS custom properties: 73 `mapped`, 2 `approved_default` (`--dv-max-tab-rows`, `--dv-tab-group-line-opacity`), 50 `irrelevant` (`--dv-color-{abyss,gh,mocha,monokai,nord,sol}-*` internal preset palettes) |
| `openvue` | `openvue version 1.0.0`, `@openvue/core version 1.0.0`, `@openuxkit/styled version 1.0.3`, `@openuxkit/styles version 1.1.0` | `openvue/config/index.d.ts`, `@openvue/core/config/index.d.ts`, `@openuxkit/styled/dist/index.d.mts`, `@openuxkit/styles/dist/*/index.mjs` | Base tokens (`disabled.opacity`, `icon.size`, `mask.*`), `PrimeVueZIndexOptions` (`modal`, `overlay`, `menu`, `tooltip`), semantic tokens, and allowed §9 control-family tokens (`button`, `inputtext`, `textarea`, `select`, `checkbox`, `dialog`, `drawer`, `tabs`, `datatable` (cells, rows, S1 header/row heights, S1 header font size), `message`, `badge` (background, color), `tag` (background, color, border), `progressbar` (track, value, radius), `chart` (revenue line, burn line, grid passthrough), `divider`, `toolbar`, `tooltip`, `panel`, `splitter`) `mapped`; disallowed widget families (`terminal.*`, `dock.*`, `editor.*`, `carousel.*`, `galleria.*`, `organizationchart.*`, `speeddial.*`) `irrelevant` |
| `xterm` | `@xterm/xterm version 6.0.0` | `typings/xterm.d.ts`, `css/xterm.css` | 28 `ITheme` properties (`foreground`, `background`, `cursor`, `cursorAccent`, `selection*`, `scrollbarSlider*`, `overviewRulerBorder`, 16 ANSI colors `mapped`; `extendedAnsi` `approved_default` `null`) + `--vscode-scrollbar-shadow` `mapped` |

### Explicit AUSENTE declarations

- **External OpenVue preset package (`@openuxkit/themes` / `@primeuix/themes`)**: `AUSENTE` in `node_modules`. `capsule-ui-kit` generates the OpenVue preset and CSS custom properties directly from `tokens.json` and `tokenMappings.json`.
- **`colorScheme.highContrast` in `@openuxkit/styled`**: `AUSENTE` in `node_modules/@openuxkit/styled/dist/index.mjs` (`ThemeUtils` only branches on `colorScheme.light` and `colorScheme.dark`). High contrast is application-owned via `[data-theme-contrast="high"]` and `modes` keys `<scheme>.high`.
- **`dockview-vue version 8.6.1` tarball/declarations**: `AUSENTE` in `node_modules` and `PINS_EVIDENCE.json` (`8.4.1` is installed; tracked under `UI_ARCHITECTURE.md` §2/§14 R1).

<a id="section-4"></a>
## 4. Fail-closed validation and negative contrasts

Every vendor entry in `tokenMappings.json` must have status `"mapped"`, `"approved_default"`, or `"irrelevant"`. Build and test validation refuses with a deterministic error code on any of the following negative contrasts:

1. **`ERR_ABSENT_MAPPING_BLOCK`**: any required vendor surface (`dockview`, `openvue`, `xterm`) is missing or has an empty token inventory.
2. **`ERR_UNCLASSIFIED_VENDOR_TOKEN`**: a CSS custom property or theme interface key present in the pinned vendor declarations is omitted from `tokenMappings.json`.
3. **`ERR_CONTRADICTORY_MAPPING`**:
   - `status: "mapped"` omits `sourceToken` or simultaneously defines `defaultValue` / `irrelevantReason`.
   - `status: "approved_default"` defines `sourceToken` or omits `defaultValue` / `reason`.
   - `status: "irrelevant"` defines `sourceToken` / `defaultValue` or omits `reason`.
4. **`ERR_DUPLICATE_MAPPING`**: a vendor token appears more than once in the same surface block.
5. **`ERR_DANGLING_TOKEN_REF` / `ERR_CYCLIC_TOKEN_REF` / `ERR_TIER_INVERSION`**: any `{...}` reference or `sourceToken` points to an unknown token path, forms a cycle, or inverts `primitive -> semantic -> component`.
6. **`ERR_INCOMPATIBLE_UNIT`**: a reference or vendor mapping links mismatched `$type` categories (for example mapping a `color` property to a `dimension` token) or supplies a value violating its `$type` grammar.
7. **`ERR_VENDOR_VARIABLE_IN_SHARED_TOKENS` / `ERR_FORBIDDEN_OPENVUE_HIGH_CONTRAST`**: `tokens.json` contains `--dv-`, `--p-`, `--px-`, `--vscode-`, `dt(`, or `colorScheme.highContrast`.

<a id="section-5"></a>
## 5. Computed-property verification oracle

Qualification tests (`node --test`) evaluate resolved computed values across the Cartesian product of admitted modes (`light`/`dark` × `normal`/`high` contrast × `compact`/`regular`/`comfortable` density × `0.875`/`1`/`1.125`/`1.25` text scale × `forced-colors` × `prefers-reduced-motion`):

- Resolving `semantic.surface.canvas` and `semantic.text.primary` yields distinct values between `light` and `dark`, and resolves to `Canvas` / `CanvasText` when `forcedColors: "active"`.
- Resolving `semantic.border.default` and `semantic.focus.ringWidth` under `contrast: "high"` yields high-contrast colors and a `3px` focus ring (`2px` border width).
- Changing `density` (`compact` → `regular` → `comfortable`) mutates `semantic.size.control.heightMd` (`26px` → `32px` → `36px`) and `semantic.size.tab.height` (`28px` → `34px` → `40px`) while leaving `semantic.typography.fontSize.md` unchanged.
- Changing `textScale` (`0.875` → `1` → `1.125` → `1.25`) mutates `semantic.typography.fontSize.md` (`12px` → `13px` → `15px` → `16px`) and `semantic.typography.fontSize.terminal` (`11` → `13` → `15` → `16`) independently of `density`.
- `semantic.motion.duration.fold` is `0ms` in all motion modes; `semantic.motion.duration.normal` resolves to `150ms` under `no-preference` and `0ms` under `reduce`.
- S1 scheme (`test/design-s1-tokens.test.js`): `dark.normal` resolves `semantic.surface.canvas`/`sunken`/`panel`/`chrome`/`interactive`/`elevated` to `#0b1326`/`#060e20`/`#131b2e`/`#171f33`/`#222a3d`/`#2d3449`, `semantic.accent.primary` to `#c0c1ff`, and `semantic.text.primary`/`muted`/`disabled` to `#dae2fd`/`#c7c4d7`/`#908fa0`; `light.normal` keeps the existing light counterpart (`#f1f5f9` canvas, `#ffffff` panel, `#0f172a` primary text).
- S1 contrast pairs: `text.primary`/`muted` on all six S1 surfaces `>= 4.5` in both schemes; `secondaryContainer`/`onSecondaryContainer`, `tertiaryContainer`/`onTertiaryContainer`, badge `primary`/`primaryContrast`, and dark `error.surface`/`error.text` `>= 4.5`; dark `accent.primary` on canvas `>= 3`.
- S1 chrome: `component.appShell.sidebarWidth`/`sidebarWidthS1` `15rem` (240px), `topbarHeight` `3rem` (48px), `semantic.size.rail.expandedWidth` `240px`; `component.s1.*` header/row/dot/bar sizes exact; `semantic.typography` S1 roles resolve `20/16/15/14/13/12/11/10px` at text scale `1` with the specified px line-heights.

This companion book is scoped strictly to the supplied `UI_ARCHITECTURE.md`, `ROUTER_BOOTSTRAP.md`, and inspected `node_modules` declarations.
