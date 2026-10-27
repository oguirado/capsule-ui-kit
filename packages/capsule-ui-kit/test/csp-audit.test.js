/** Kit-wide CSP and deterministic control identity audit.
 * Real SFCs compile and render with the Vue SSR renderer. Browser-only xterm,
 * dockview and child SFCs use explicit shallow boundaries; every
 * exported child is independently rendered. The vendor Menu is rendered real.
 * Source scans cover all kit sources and all native template controls,
 * including branches that are closed, folded or hidden during SSR.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSSRApp, createRenderer, ref, nextTick, h } from 'vue';
import { useKitGeometry } from '../src/workspace/useKitGeometry.js';
import { createTerminalDocument } from '../src/terminal/nonceDocument.js';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import { createCspDialog } from '../src/workspace/cspDialog.js';
import { cleanMenuVNode } from '../src/workspace/cspMenu.js';
import OpenVue from 'openvue/config';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript } from '@vue/compiler-sfc';
import {
  setKitGeometryRule,
  clearKitGeometryRule,
  geometryRuleText,
  geometrySelectorForId,
  KIT_GEOMETRY_SHEET_ATTR,
} from '../src/workspace/kitGeometrySheet.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const srcRoot = path.join(kitRoot, 'src');
const readKit = (rel) => readFileSync(path.join(kitRoot, rel), 'utf8');

/* ---------------------------------------------------------------------------
 * Source collection.
 * ------------------------------------------------------------------------- */

/**
 * @param {string} dir Absolute directory.
 * @returns {string[]} Kit-relative forward-slash paths of `src` sources.
 */
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSources(full));
      continue;
    }
    if (full.endsWith('.vue') || full.endsWith('.js')) {
      out.push(path.relative(kitRoot, full).replaceAll(path.sep, '/'));
    }
  }
  return out.sort();
}

const ALL_SOURCES = collectSources(srcRoot);

/**
 * @param {string} source Full source text.
 * @param {number} index Offset of the match.
 * @returns {number} 1-based line number.
 */
function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Strips template comments so prose mentioning directives never counts.
 * @param {string} template Raw template source.
 * @returns {string} Comment-free template.
 */
function stripTemplateComments(template) {
  return template.replace(/<!--.*?-->/gs, '');
}

/**
 * Strips full-line `//` comments and `/* ... *\/` blocks from script source so
 * documentation never counts; string literals are left intact (a violation
 * hiding inside a string would still be flagged, which is the safe side).
 * @param {string} script Raw script source.
 * @returns {string} Comment-light script.
 */
function stripScriptComments(script) {
  return script
    .replace(/\/\*.*?\*\//gs, '')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

/* ---------------------------------------------------------------------------
 * Source scan.
 * ------------------------------------------------------------------------- */

/**
 * @typedef {{ rel: string, kind: string, line: number, excerpt: string }} SourceFinding
 */

/**
 * Scans one source file for CSP-forbidden patterns.
 * @param {string} rel Kit-relative path.
 * @returns {SourceFinding[]} Findings in file order.
 */
function scanSourceFile(rel) {
  const absolute = path.join(kitRoot, rel);
  const source = readFileSync(absolute, 'utf8');
  const findings = [];
  /**
   * @param {RegExp} pattern Global pattern.
   * @param {string} kind Finding kind.
   * @param {string} haystack Text to search.
   */
  const collect = (pattern, kind, haystack) => {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of haystack.matchAll(re)) {
      findings.push({
        rel,
        kind,
        line: lineOf(haystack, match.index ?? 0),
        excerpt: String(match[0]).slice(0, 80),
      });
    }
  };
  if (rel.endsWith('.vue')) {
    const { descriptor, errors } = parse(source, { filename: path.basename(rel) });
    assert.equal(errors.length, 0, `${rel} parses cleanly`);
    const template = stripTemplateComments(descriptor.template?.content ?? '');
    collect(/(?:^|[\s"'])style\s*=/, 'style-attribute', template);
    collect(/:style\b/, 'style-binding', template);
    collect(/v-bind:style\b/, 'style-binding', template);
    collect(/v-show\b/, 'v-show', template);
    const scripts = stripScriptComments(
      `${descriptor.script?.content ?? ''}\n${descriptor.scriptSetup?.content ?? ''}`,
    );
    collect(/\.style\b/, 'element-style', scripts);
    collect(/setAttribute\(\s*['"]style['"]/, 'setattribute-style', scripts);
  } else {
    const code = stripScriptComments(source);
    collect(/\.style\b/, 'element-style', code);
    collect(/setAttribute\(\s*['"]style['"]/, 'setattribute-style', code);
  }
  collect(/pv_id_[A-Za-z0-9_-]*/, 'pv-id', source);
  return findings.sort((a, b) => a.line - b.line);
}

const SOURCE_FINDINGS = ALL_SOURCES.flatMap(scanSourceFile);


/* ---------------------------------------------------------------------------
 * Template + HTML interactive-control analysis.
 * ------------------------------------------------------------------------- */

/** Roles that make an element an interactive control. @type {ReadonlySet<string>} */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'checkbox',
  'radio',
  'slider',
  'spinbutton',
  'separator',
  'combobox',
  'searchbox',
]);

/** Structural template tags that never render controls themselves. @type {ReadonlySet<string>} */
const TEMPLATE_STRUCTURAL_TAGS = new Set([
  'template',
  'slot',
  'component',
  'transition',
  'transition-group',
  'teleport',
  'suspense',
  'keep-alive',
]);

/**
 * @typedef {{ tag: string, attrs: Record<string, string|true>, raw: string }} ParsedTag
 */

/**
 * Parses opening tags, tolerating `>` inside quoted attribute values.
 * @param {string} html Markup to parse.
 * @returns {ParsedTag[]} Opening tags in document order.
 */
function parseOpeningTags(html) {
  const tags = [];
  const tagPattern = /<([A-Za-z][A-Za-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  for (const match of html.matchAll(tagPattern)) {
    const attrs = {};
    const attrPattern = /([\w:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (const attr of (match[2] ?? '').matchAll(attrPattern)) {
      if (!attr[1]) continue;
      attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? true;
    }
    tags.push({ tag: match[1], attrs, raw: match[0] });
  }
  return tags;
}

/**
 * @param {ParsedTag} parsed Parsed tag.
 * @returns {boolean} True for native (lowercase) HTML tags.
 */
function isNativeTag(parsed) {
  return parsed.tag === parsed.tag.toLowerCase() && !TEMPLATE_STRUCTURAL_TAGS.has(parsed.tag);
}

/**
 * Decides whether a rendered native element is an interactive control.
 * Focusable reading regions (`tabindex` without an interactive role) are not
 * controls; vendor-internal markup is out of scope (stubs stand in for it).
 * @param {ParsedTag} parsed Parsed tag.
 * @returns {boolean} True when id + anchor are required.
 */
function isInteractiveControl(parsed) {
  if (!isNativeTag(parsed)) return false;
  const { tag, attrs } = parsed;
  if (tag === 'button' || tag === 'select' || tag === 'textarea') return true;
  if (tag === 'input') {
    const type = String(attrs.type ?? 'text').toLowerCase();
    return type !== 'hidden';
  }
  if (tag === 'a' && typeof attrs.href === 'string') return true;
  if (tag === 'summary') return true;
  if (attrs.role === 'separator' && !('tabindex' in attrs)) return false;
  const role = typeof attrs.role === 'string' ? attrs.role.toLowerCase() : '';
  return INTERACTIVE_ROLES.has(role);
}

/**
 * @param {ParsedTag} parsed Parsed tag.
 * @returns {boolean} True for kit-authored interactive template tags (native
 * tags; component tags are audited through their own render).
 */
function isTemplateControl(parsed) {
  return isInteractiveControl(parsed);
}

/**
 * @param {Record<string, string|true>} attrs Parsed attributes.
 * @param {string} name Attribute base name.
 * @returns {boolean} True when a static or bound attribute is present.
 */
function hasAttr(attrs, name) {
  return name in attrs || `:${name}` in attrs || `v-bind:${name}` in attrs;
}

/**
 * @param {Record<string, string|true>} attrs Parsed attributes.
 * @param {string} name Attribute base name.
 * @returns {boolean} True when the binding can render empty (`|| undefined`,
 * an explicit `undefined`/`null` arm, or a bare `v-bind` spread as the only
 * source, which cannot be verified statically).
 */
function isNullableBinding(attrs, name) {
  const expr = attrs[`:${name}`] ?? attrs[`v-bind:${name}`];
  if (typeof expr !== 'string') return false;
  return (
    expr.includes('undefined')
    || expr.includes('null')
    || /\|\|\s*['"]{2}/.test(expr)
  );
}

/**
 * @typedef {{ rel: string, tag: string, snippet: string, missing: string }} TemplateFinding
 */

/**
 * Checks kit-authored interactive template tags for explicit id + anchor.
 * @param {string} rel Kit-relative SFC path.
 * @returns {TemplateFinding[]} Findings in template order.
 */
function checkTemplateControls(rel) {
  const source = readKit(rel);
  const { descriptor, errors } = parse(source, { filename: path.basename(rel) });
  assert.equal(errors.length, 0, `${rel} parses cleanly`);
  const template = stripTemplateComments(descriptor.template?.content ?? '');
  const findings = [];
  for (const parsed of parseOpeningTags(template)) {
    if (!isTemplateControl(parsed)) continue;
    const missing = [];
    if (!hasAttr(parsed.attrs, 'id')) missing.push('id');
    else if (isNullableBinding(parsed.attrs, 'id')) missing.push('nullable-id');
    if (!hasAttr(parsed.attrs, 'data-semantic-anchor')) missing.push('data-semantic-anchor');
    else if (isNullableBinding(parsed.attrs, 'data-semantic-anchor')) missing.push('nullable-anchor');
    if (missing.length > 0) {
      findings.push({
        rel,
        tag: parsed.tag,
        snippet: parsed.raw.replace(/\s+/g, ' ').slice(0, 160),
        missing: missing.join('+'),
      });
    }
  }
  return findings;
}

/* ---------------------------------------------------------------------------
 * Exported-SFC enumeration.
 * ------------------------------------------------------------------------- */

/**
 * Collects every SFC the kit exports: barrel re-exports, the shell index and
 * the package subpath maps.
 * @returns {string[]} Kit-relative SFC paths, sorted and deduplicated.
 */
function collectExportedSfcs() {
  const found = new Set();
  const barrels = [
    ...['audit', 'fleet', 'health', 'lists', 'multislot', 'recordings', 'saas', 'surfaces', 'ui']
      .map((dir) => `src/${dir}/index.js`),
    'src/index-shell.js',
  ];
  for (const barrel of barrels) {
    const source = readKit(barrel);
    const dir = path.posix.dirname(barrel);
    for (const match of source.matchAll(/from\s*['"]\.\/([^'"]+\.vue)['"]/g)) {
      found.add(`${dir}/${match[1]}`);
    }
  }
  const pkg = JSON.parse(readKit('package.json'));
  for (const value of Object.values(pkg.exports ?? {})) {
    const candidates = typeof value === 'string' ? [value] : Object.values(value ?? {});
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.endsWith('.vue')) {
        found.add(candidate.replace(/^\.\//, ''));
      }
    }
  }
  return [...found].sort();
}

const EXPORTED_SFCS = collectExportedSfcs();

/* ---------------------------------------------------------------------------
 * SSR harness: compile real SFCs, stub the boundary (vendor, xterm, css and
 * child SFCs stay shallow so each component is audited as its own top level).
 * ------------------------------------------------------------------------- */

const VUE_URL = import.meta.resolve('vue');

/**
 * @param {string} code Module code.
 * @returns {string} Importable data URL with nested quotes encoded.
 */
function dataUrl(code) {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(code).replace(/'/g, '%27')}`;
}

/**
 * @param {string} value Raw regex source.
 * @returns {string} Escaped source.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EMPTY_MODULE_URL = dataUrl('export default {}; export const __cukStub = true;\n');

const XTERM_STUB_URL = dataUrl(`
export class Terminal { constructor() { this.__cukStub = true; } }
export class FitAddon { constructor() { this.__cukStub = true; } }
export default { Terminal, FitAddon };
`);

const DOCKVIEW_STUB_URL = dataUrl(`
import { h } from '${VUE_URL}';
export const DockviewVue = {
  name: 'DockviewStub',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h('div', { ...attrs, class: ['dockview-stub', attrs.class] });
  },
};
export default { DockviewVue };
`);

/**
 * @param {string} name Stub component name for tracing.
 * @returns {string} Data URL of a child-SFC stub: a plain host element that
 * spreads fallthrough attrs (so parent-passed `style`/`class` still surface)
 * and renders the default slot in parent scope.
 */
function vueStubUrl(name, target) {
  let helpers = target ? (parse(readFileSync(target, 'utf8')).descriptor.script?.content ?? '') : '';
  for (const match of [...helpers.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)]) {
    const url = auditUrlFor(match[1], path.dirname(target));
    if (!url) throw new Error(`unknown helper import: ${match[1]}`);
    helpers = helpers.replaceAll(`'${match[1]}'`, `'${url}'`).replaceAll(`"${match[1]}"`, `'${url}'`);
  }
  return dataUrl(helpers + `
import { h } from '${VUE_URL}';
export default {
  name: ${JSON.stringify(`CukStub${name.replace(/\.vue$/, '')}`)},
  inheritAttrs: false,
  setup(_, { slots, attrs }) {
    return () => h('div', { ...attrs, 'data-cuk-stub': ${JSON.stringify(name)} }, slots.default ? slots.default({}) : []);
  },
};
`);
}

const MENU_STUB_URL = dataUrl(`
import { h } from '${VUE_URL}';
let sequence = 0;
export default {
  name: 'MenuStub',
  inheritAttrs: false,
  props: { model: { type: Array, default: () => [] } },
  setup(props, { slots, attrs }) {
    const renderItem = (item) => h('li', { class: 'p-menuitem-stub' }, [
      slots.item
        ? slots.item({ item, props: { action: { class: 'p-menuitem-link', tabindex: '-1' } } })
        : String(item?.label ?? ''),
    ]);
    return () => {
      const id = attrs.id ?? \`pv_id_stub_\${++sequence}\`;
      const children = (props.model ?? []).map((entry) => {
        if (entry && entry.separator === true) return h('li', { class: 'p-separator-stub', 'aria-hidden': 'true' });
        if (entry && Array.isArray(entry.items)) {
          return h('li', { class: 'p-submenu-stub' }, [
            slots.submenulabel ? slots.submenulabel({ item: entry }) : String(entry.label ?? ''),
            h('ul', { class: 'p-submenu-list-stub' }, entry.items.map(renderItem)),
          ]);
        }
        return renderItem(entry);
      });
      return h('div', { ...attrs, id, class: ['p-menu-stub', attrs.class] }, [
        h('ul', { class: 'p-menu-list-stub' }, children),
      ]);
    };
  },
};
`);

const ICON_STUB_URL = dataUrl(`
import { h } from '${VUE_URL}';
export default {
  name: 'IconStub',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h('svg', { 'aria-hidden': 'true', ...attrs });
  },
};
`);

/**
 * Maps an import specifier found in compiled SFC code to its audit URL.
 * @param {string} spec Raw specifier.
 * @param {string} importerDir Absolute directory of the importing SFC.
 * @returns {string|null} Replacement URL, or null when the specifier is
 * outside the known audit boundary (recorded, never silently stubbed).
 */
function auditUrlFor(spec, importerDir) {
  if (spec === 'vue') return VUE_URL;
  if (spec.endsWith('.css')) return EMPTY_MODULE_URL;
  if (spec === '@xterm/xterm' || spec === '@xterm/addon-fit') return XTERM_STUB_URL;
  if (spec === 'dockview-vue') return DOCKVIEW_STUB_URL;
  if (spec.startsWith('openvue/')) return import.meta.resolve(spec);
  if (spec.startsWith('@openvue/icons/')) return ICON_STUB_URL;
  if (spec.startsWith('.')) {
    const target = path.resolve(importerDir, spec);
    if (spec.endsWith('.vue')) return vueStubUrl(path.basename(spec), target);
    return pathToFileURL(target).href;
  }
  return null;
}

/**
 * @typedef {{ ok: true, component: any, namespace: Record<string, any>, url: string } | { ok: false, error: string }} CompiledSfc
 */

/**
 * Compiles one SFC to an importable SSR module. Composition mode compiles
 * the header/slot children exercised by the uniqueness oracle too.
 * @param {string} rel Kit-relative SFC path.
 * @param {boolean} [composition] Render real nested header and slot controls.
 * @returns {Promise<CompiledSfc>} Component or a captured failure.
 */
async function compileSfcModule(rel, composition = false) {
  const absolute = path.join(kitRoot, rel);
  const filename = path.basename(rel);
  const id = `cuk-audit-${filename.replace(/\.vue$/, '').toLowerCase()}`;
  try {
    const source = readFileSync(absolute, 'utf8');
    const found = parse(source, { filename });
    if (found.errors.length > 0) {
      return { ok: false, error: `parse: ${found.errors.map((entry) => entry.message).join('; ')}` };
    }
    if (!found.descriptor.scriptSetup && !found.descriptor.script) {
      return { ok: false, error: 'no script block' };
    }
    const compiled = found.descriptor.scriptSetup
      ? compileScript(found.descriptor, { id, inlineTemplate: true })
      : null;
    if (!compiled) return { ok: false, error: 'template-only SFC (no setup to compile)' };
    let code = compiled.content;
    const importerDir = path.dirname(absolute);
    const specifiers = new Set();
    for (const match of code.matchAll(/from\s*['"]([^'"]+)['"]/g)) specifiers.add(match[1]);
    for (const match of code.matchAll(/import\s*['"]([^'"]+)['"]/g)) specifiers.add(match[1]);
    for (const spec of specifiers) {
      const realChild = composition && /\/(AiMultiSlot|AiSlotControlBar|AiTerminalPane|UiToolbar)\.vue$/.test(spec);
      const child = realChild ? await compileSfcModule(path.relative(kitRoot, path.resolve(importerDir, spec)), true) : null;
      if (child) assert.equal(child.ok, true, `${spec}: ${child.error ?? ''}`);
      const url = child ? child.url : auditUrlFor(spec, importerDir);
      if (!url) return { ok: false, error: `unknown import boundary: ${spec}` };
      code = code
        .replace(
          new RegExp(`from\\s*(['"])${escapeRegExp(spec)}\\1`, 'g'),
          `from '${url}'`,
        )
        .replace(
          new RegExp(`import\\s*(['"])${escapeRegExp(spec)}\\1`, 'g'),
          `import '${url}'`,
        );
    }
    const url = dataUrl(code);
    const namespace = await import(url);
    if (!namespace.default) return { ok: false, error: 'no default export' };
    return { ok: true, component: namespace.default, namespace, url };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).slice(0, 300) };
  }
}

/**
 * @param {any} component Compiled component.
 * @param {Record<string, unknown>} props Props for the render.
 * @returns {Promise<{ ok: true, html: string } | { ok: false, error: string }>} Rendered HTML or a captured failure.
 */
async function renderSfc(component, props, { provide = {}, slots = {} } = {}) {
  try {
    const app = createSSRApp({ render: () => h(component, props, slots) });
    for (const [key, value] of Object.entries(provide)) app.provide(key, value);
    app.use(OpenVue, { unstyled: true });
    const html = await renderToString(app);
    return { ok: true, html };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).slice(0, 300) };
  }
}

/* ---------------------------------------------------------------------------
 * SSR detectors (shared by the audit and the negative controls).
 * ------------------------------------------------------------------------- */

/**
 * @param {string} html Rendered HTML.
 * @returns {boolean} True when a style attribute is present. `<style>`
 * elements never match (no whitespace-or-quote before `style` there).
 */
function hasStyleAttribute(html) {
  return /[\s"']style\s*=/.test(html);
}

/**
 * @param {string} html Rendered HTML.
 * @returns {boolean} True when a vendor-generated id leaks into the markup.
 */
function hasVendorId(html) {
  return html.includes('pv_id');
}

/**
 * @typedef {{ tag: string, snippet: string, missing: string }} HtmlGap
 */

/**
 * @param {string} html Rendered HTML.
 * @returns {HtmlGap[]} Interactive controls missing id and/or anchor.
 */
function findInteractiveGaps(html) {
  const gaps = [];
  for (const parsed of parseOpeningTags(html)) {
    if (!isInteractiveControl(parsed)) continue;
    const missing = [];
    if (typeof parsed.attrs.id !== 'string' || parsed.attrs.id.length === 0) missing.push('id');
    if (typeof parsed.attrs['data-semantic-anchor'] !== 'string' || parsed.attrs['data-semantic-anchor'].length === 0) {
      missing.push('data-semantic-anchor');
    }
    if (missing.length > 0) {
      gaps.push({
        tag: parsed.tag,
        snippet: parsed.raw.replace(/\s+/g, ' ').slice(0, 160),
        missing: missing.join('+'),
      });
    }
  }
  return gaps;
}

/* ---------------------------------------------------------------------------
 * Render plan: every kit SFC, with explicit state fixtures for the affected panels.
 * Identity (id + anchor) is an exported-surface contract, so generic
 * non-exported widgets are audited for style patterns only.
 * ------------------------------------------------------------------------- */

/**
 * @returns {{ getItem: () => null, setItem: () => void }} Inert storage double.
 */
function inertStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
  };
}

const SIDEBAR_GROUPS_FIXTURE = Object.freeze([
  Object.freeze({
    id: 'g1',
    label: 'Group one',
    items: Object.freeze([
      Object.freeze({ id: 'i1', label: 'First', icon: 'grid' }),
      Object.freeze({ id: 'i2', label: 'Second', active: true, unread: 3 }),
    ]),
  }),
]);

/**
 * State fixtures: exported SFCs plus the brief-named
 * side-terminal panels. Every render must carry zero style attributes, zero
 * vendor ids and fully identified interactive controls.
 * @type {ReadonlyArray<{ rel: string, props: ReadonlyArray<Record<string, unknown>> }>}
 */
const STRICT_SSR_PLAN = Object.freeze([
  Object.freeze({
    rel: 'src/shell/Sidebar.vue',
    props: Object.freeze([
      Object.freeze({
        groups: SIDEBAR_GROUPS_FIXTURE,
        user: Object.freeze({ initials: 'OP', name: 'Operator', role: 'Role', presence: 'online', tier: 'PRO' }),
        engine: Object.freeze({ label: 'Engine:', status: 'Synced', state: 'synced' }),
      }),
      Object.freeze({ groups: [] }),
    ]),
  }),
  Object.freeze({ rel: 'src/shell/SidebarIcon.vue', props: Object.freeze([Object.freeze({ name: 'grid' })]) }),
  Object.freeze({
    rel: 'src/side-terminal/SideTerminalPanel.vue',
    props: Object.freeze([
      Object.freeze({ open: false }),
      Object.freeze({ open: true, topOffset: 48, bottomOffset: 24 }),
    ]),
  }),
  Object.freeze({ rel: 'src/side-terminal/SideTerminalNewMenu.vue', props: Object.freeze([Object.freeze({})]) }),
  Object.freeze({
    rel: 'src/workspace/DockWorkspace.vue',
    props: Object.freeze([Object.freeze({ scope: {}, storage: inertStorage() })]),
  }),
  Object.freeze({
    rel: 'src/surfaces/FrameCanvasTile.vue',
    props: Object.freeze([
      Object.freeze({ capsuleId: 'cap-01' }),
      Object.freeze({ capsuleId: 'cap-01', hidden: true }),
    ]),
  }),
  Object.freeze({
    rel: 'src/multislot/AiMultiSlot.vue',
    props: Object.freeze([
      Object.freeze({ capsuleId: 'cap-01' }),
      Object.freeze({ capsuleId: 'cap-01', folded: true }),
      Object.freeze({ capsuleId: 'cap-01', floating: true, floatX: 10, floatY: 12, floatWidth: 400, floatHeight: 300 }),
    ]),
  }),
  Object.freeze({
    rel: 'src/multislot/AiSurfacePane.vue',
    props: Object.freeze([
      Object.freeze({ capsuleId: 'cap-01' }),
      Object.freeze({ capsuleId: 'cap-01', hidden: true }),
    ]),
  }),
  Object.freeze({
    rel: 'src/multislot/AiTerminalPane.vue',
    props: Object.freeze([
      Object.freeze({ capsuleId: 'cap-01' }),
      Object.freeze({
        capsuleId: 'cap-01',
        sessions: Object.freeze([Object.freeze({ sessionId: 'sess-01', title: 'shell', activity: 'busy' })]),
      }),
    ]),
  }),
  Object.freeze({
    rel: 'src/multislot/AiSlotSplitter.vue',
    props: Object.freeze([Object.freeze({ capsuleId: 'cap-01' })]),
  }),
  Object.freeze({
    rel: 'src/saas/SaasFoldedRail.vue',
    props: Object.freeze([
      Object.freeze({
        capsules: Object.freeze([
          Object.freeze({
            capsuleId: 'capsule-05',
            capsuleLabel: 'Capsule-05',
            state: 'idle',
            badges: Object.freeze({ surface: 'guest', terminal: 'shell', port: '8080' }),
            telemetry: Object.freeze([
              Object.freeze({ key: 'RAM USAGE', value: '142MB / 512MB', tone: 'neutral' }),
            ]),
          }),
        ]),
        dockDisabled: false,
        dockReason: '',
      }),
      Object.freeze({ capsules: Object.freeze([]) }),
    ]),
  }),
]);

/**
 * Additional widget fixtures, including populated bar and chart states.
 * The same style, vendor identity and control identity gates apply to these.
 * @type {ReadonlyArray<{ rel: string, props: ReadonlyArray<Record<string, unknown>> }>}
 */
const WIDGET_SSR_PLAN = Object.freeze([
  Object.freeze({
    rel: 'src/widgets/S1DataTable.vue',
    props: Object.freeze([
      Object.freeze({
        id: 'audit-table',
        label: 'Audit table',
        columns: Object.freeze([
          Object.freeze({ key: 'name', label: 'Name' }),
          Object.freeze({ key: 'load', label: 'Load', kind: 'bar' }),
        ]),
        rows: Object.freeze([
          Object.freeze({ name: 'alpha', load: Object.freeze({ pct: 37 }) }),
          Object.freeze({ name: 'beta', load: Object.freeze({ pct: 100, label: 'full' }) }),
        ]),
      }),
    ]),
  }),
  Object.freeze({
    rel: 'src/widgets/DonutChart.vue',
    props: Object.freeze([
      Object.freeze({
        id: 'audit-donut',
        title: 'Audit donut',
        slices: Object.freeze([
          Object.freeze({ label: 'Used', value: 3 }),
          Object.freeze({ label: 'Empty', value: 0 }),
        ]),
      }),
    ]),
  }),
  Object.freeze({
    rel: 'src/widgets/InspectorPanel.vue',
    props: Object.freeze([Object.freeze({ id: 'audit-inspector', title: 'Audit inspector' })]),
  }),
  Object.freeze({
    rel: 'src/widgets/S1KpiCard.vue',
    props: Object.freeze([Object.freeze({ label: 'Audit KPI', value: '42' })]),
  }),
  Object.freeze({
    rel: 'src/widgets/S1KpiGrid.vue',
    props: Object.freeze([Object.freeze({})]),
  }),
  Object.freeze({
    rel: 'src/widgets/S1LineChart.vue',
    props: Object.freeze([Object.freeze({ id: 'audit-line', title: 'Audit line' })]),
  }),
  Object.freeze({
    rel: 'src/widgets/S1StatusPill.vue',
    props: Object.freeze([Object.freeze({ label: 'Audit pill' })]),
  }),
]);

/**
 * @typedef {{ rel: string, label: string, html: string|null, error: string|null }} SsrRender
 */

/**
 * Renders the whole plan sequentially (deterministic vendor-id numbering).
 * @returns {Promise<SsrRender[]>} One entry per (component, props) pair.
 */
function fixtureProps(rel) {
  const common = { capsuleId: 'cap-01', capsuleLabel: 'Capsule', sessionId: 'sess-01', label: 'Control', title: 'Title', id: 'audit-control', open: false, capsule: { id: 'cap-01', capsuleId: 'cap-01', title: 'Capsule' }, forId: 'audit-input', workspaceComponent: { render: () => h('div') } };
  if (rel.endsWith('/AppShell.vue')) return { ...common, product: 'Workspace', loading: true, registry: [{ id: 'entry-01', label: 'Entry', group: 'Workspace', icon: 'grid', unread: 3 }] };
  if (rel.endsWith('/S1TimelineControls.vue')) return { ...common, buttons: [{ id: 'timeline-play', label: 'Play' }, { id: 'timeline-step', label: 'Step', kind: 'advance' }] };
  return { ...common, record: { id: 'record-01', type: 'intent' }, capsuleTitle: 'Capsule', product: 'Workspace', entries: [], tabs: [{ id: 'tab-01', label: 'Tab' }] };
}

async function renderAuditPlan() {
  const renders = [];
  const strictRels = new Set(STRICT_SSR_PLAN.map((entry) => entry.rel));
  const plan = [
    ...STRICT_SSR_PLAN,
    ...WIDGET_SSR_PLAN,
    ...ALL_SOURCES.filter((rel) => rel.endsWith('.vue')).filter((rel) => !strictRels.has(rel)
      && !WIDGET_SSR_PLAN.some((entry) => entry.rel === rel))
      .map((rel) => ({ rel, props: [fixtureProps(rel)] })),
  ];
  for (const entry of plan) {
    const compiled = await compileSfcModule(entry.rel);
    if (!compiled.ok) {
      renders.push({ rel: entry.rel, label: 'compile', html: null, error: compiled.error });
      continue;
    }
    for (const [index, props] of entry.props.entries()) {
      const declared = compiled.component.props ?? {};
      const accepted = Object.fromEntries(Object.entries(props).filter(([key]) => Array.isArray(declared) ? declared.includes(key) : key in declared));
      const rendered = await renderSfc(compiled.component, accepted);
      renders.push({
        rel: entry.rel,
        label: `props#${index}`,
        html: rendered.ok ? rendered.html : null,
        error: rendered.ok ? null : rendered.error,
      });
    }
  }
  return renders;
}

const SSR_RENDERS = await renderAuditPlan();
const SSR_BY_REL = new Map();
for (const render of SSR_RENDERS) {
  if (!SSR_BY_REL.has(render.rel)) SSR_BY_REL.set(render.rel, []);
  SSR_BY_REL.get(render.rel).push(render);
}

/**
 * @param {string} rel Kit-relative SFC path.
 * @param {number} [index] Props index.
 * @returns {string} Rendered HTML, asserting the render succeeded.
 */
function strictHtml(rel, index = 0) {
  const renders = SSR_BY_REL.get(rel) ?? [];
  const render = renders[index];
  assert.ok(render, `${rel} has render #${index}`);
  assert.equal(render.error, null, `${rel} renders cleanly (${render.error ?? ''})`);
  return render.html ?? '';
}

/* ---------------------------------------------------------------------------
 * Tests.
 * ------------------------------------------------------------------------- */

test('csp-audit enumerates the exported SFC surface honestly', () => {
  assert.ok(ALL_SOURCES.length > 70, `sources scanned (${ALL_SOURCES.length})`);
  assert.ok(EXPORTED_SFCS.length >= 50, `exported SFCs (${EXPORTED_SFCS.length})`);
  for (const rel of [
    'src/shell/Sidebar.vue',
    'src/shell/EmptyWall.vue',
    'src/multislot/AiMultiSlot.vue',
    'src/saas/SaasFoldedRail.vue',
    'src/saas/SaasWallTile.vue',
    'src/workspace/DockWorkspace.vue',
    'src/capsules/CapsulePanel.vue',
    'src/terminal/TerminalView.vue',
    'src/surfaces/FrameCanvasTile.vue',
  ]) {
    assert.ok(EXPORTED_SFCS.includes(rel), `exported: ${rel}`);
  }
  for (const rel of ALL_SOURCES.filter((rel) => rel.endsWith('.vue'))) assert.ok(SSR_BY_REL.has(rel), `kit component rendered: ${rel}`);
});

test('csp-audit source scan rejects forbidden patterns throughout the kit', () => {
  const lines = SOURCE_FINDINGS.map(
    (finding) => `${finding.rel}:${finding.line} [${finding.kind}] ${finding.excerpt}`,
  );
  assert.equal(lines.length, 0, `CSP findings:\n${lines.join('\n')}`);
});

test('csp-audit templates carry explicit id + anchor on every native template control', () => {
  const gaps = [];
  for (const rel of ALL_SOURCES.filter((rel) => rel.endsWith('.vue'))) {
    for (const finding of checkTemplateControls(rel)) {
      gaps.push(`${finding.rel} <${finding.tag}> missing ${finding.missing}: ${finding.snippet}`);
    }
  }
  assert.equal(gaps.length, 0, `strict template identity gaps:\n${gaps.join('\n')}`);
});

test('csp-audit SSR renders every component without style attributes', () => {
  const dirty = [];
  for (const entry of SSR_BY_REL.keys()) {
    for (const render of SSR_BY_REL.get(entry) ?? []) {
      assert.equal(render.error, null, `${render.rel} ${render.label} renders (${render.error ?? ''})`);
      if (hasStyleAttribute(render.html ?? '')) dirty.push(`${render.rel} ${render.label} ${(render.html ?? '').match(/<[^>]+style=[^>]+>/g)?.join(' ')}`);
    }
  }
  assert.equal(dirty.length, 0, `renders emitting style=: ${dirty.join('; ')}`);
});

test('csp-audit SSR renders every component without vendor ids', () => {
  const dirty = [];
  for (const entry of SSR_BY_REL.keys()) {
    for (const render of SSR_BY_REL.get(entry) ?? []) {
      if (render.html !== null && hasVendorId(render.html)) dirty.push(`${render.rel} ${render.label} ${(render.html ?? '').match(/<[^>]+style=[^>]+>/g)?.join(' ')}`);
    }
  }
  assert.equal(dirty.length, 0, `renders emitting pv_id_: ${dirty.join('; ')}`);
});

test('csp-audit SSR identifies every interactive control in renders', () => {
  const gaps = [];
  for (const entry of SSR_BY_REL.keys()) {
    for (const render of SSR_BY_REL.get(entry) ?? []) {
      if (render.html === null) continue;
      for (const gap of findInteractiveGaps(render.html)) {
        gaps.push(`${render.rel} ${render.label} <${gap.tag}> missing ${gap.missing}: ${gap.snippet}`);
      }
    }
  }
  assert.equal(gaps.length, 0, `strict SSR identity gaps:\n${gaps.join('\n')}`);
});

test('csp-audit rendered ids are unique within each component state', () => {
  for (const render of SSR_RENDERS) {
    const ids = parseOpeningTags(render.html ?? '').map((tag) => tag.attrs.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${render.rel} ${render.label}: duplicate ids`);
  }
});

test('csp-audit negative control: the style detector fires on style= only', () => {
  assert.equal(hasStyleAttribute('<div id="x" style="display:none;"></div>'), true);
  assert.equal(hasStyleAttribute('<div :style="obj"></div>'), false);
  assert.equal(hasStyleAttribute('<style nonce="n">.a{display:none}</style><div class="a"></div>'), false);
  assert.equal(hasStyleAttribute('<link rel="stylesheet" href="/a.css">'), false);
});

test('csp-audit negative control: the vendor-id detector fires on pv_id_', () => {
  assert.equal(hasVendorId('<div id="pv_id_12"></div>'), true);
  assert.equal(hasVendorId('<div id="shell/navigation/menu"></div>'), false);
});

test('csp-audit negative control: the identity detector flags gaps and passes clean markup', () => {
  const bad = [
    '<button>no id</button>',
    '<a href="/x" id="a1">no anchor</a>',
    '<div role="separator" tabindex="0" id="s1">no anchor</div>',
    '<input type="text" data-semantic-anchor="x/y">',
  ].join('');
  assert.equal(findInteractiveGaps(bad).length, 4);
  const good = [
    '<button id="b1" data-semantic-anchor="x/y">ok</button>',
    '<a href="/x" id="a1" data-semantic-anchor="x/y">ok</a>',
    '<div role="separator" tabindex="0" id="s1" data-semantic-anchor="x/y">ok</div>',
    '<input type="text" id="i1" data-semantic-anchor="x/y">',
    '<div tabindex="0" role="region">reading region, not a control</div>',
    '<span>plain</span>',
  ].join('');
  assert.equal(findInteractiveGaps(good).length, 0);
});

test('csp-audit negative control: the menu stub emits vendor ids without an explicit id', async () => {
  const namespace = await import(MENU_STUB_URL);
  const withId = await renderSfc(namespace.default, { id: 'shell/navigation/menu', model: [] });
  assert.equal(withId.ok, true);
  assert.equal(hasVendorId(withId.html ?? ''), false);
  const withoutId = await renderSfc(namespace.default, { model: [] });
  assert.equal(withoutId.ok, true);
  assert.equal(hasVendorId(withoutId.html ?? ''), true);
});

test('csp-audit hidden controls stay mounted (panel, slot, tile persistence)', () => {
  const closed = strictHtml('src/side-terminal/SideTerminalPanel.vue', 0);
  assert.match(readKit('src/side-terminal/SideTerminalPanel.vue'), /v-for="session in view.sessions"[^>]*cuk-csp-hidden/, 'session hosts remain mounted');
  assert.match(closed, /cui-side-terminal__body[^"']*cuk-csp-hidden/, 'closed body hides via class');
  assert.ok(!/id="side-terminal-edge-tab"[^>]*cui-side-terminal__edge--hidden/.test(closed), 'edge tab visible while closed');
  const open = strictHtml('src/side-terminal/SideTerminalPanel.vue', 1);
  assert.doesNotMatch(open, /cui-side-terminal__body[^"']*cuk-csp-hidden/, 'open body visible');

  const folded = strictHtml('src/multislot/AiMultiSlot.vue', 1);
  assert.ok(folded.includes('data-cuk-stub="AiSurfacePane.vue"'), 'folded slot keeps the surface pane mounted');
  assert.ok(folded.includes('data-cuk-stub="AiTerminalPane.vue"'), 'folded slot keeps the terminal pane mounted');
  assert.ok( /ai-slot__body[^"']*cuk-csp-hidden/.test(folded), 'folded body hides via class');
  assert.ok(!folded.includes('saas-rail--hidden'), 'rail visible while folded');

  const hiddenTile = strictHtml('src/surfaces/FrameCanvasTile.vue', 1);
  assert.ok(hiddenTile.includes('cuk-csp-hidden'), 'hidden tile hides via class');
  assert.ok(hiddenTile.includes('<canvas'), 'hidden tile keeps the canvas mounted');
});

test('csp-audit geometry sheet renders validated rule text', () => {
  assert.equal(
    geometryRuleText('#side-terminal', { top: '48px', width: '320px', minWidth: '0px' }),
    '#side-terminal{min-width:0px;top:48px;width:320px;}',
  );
  assert.equal(geometryRuleText('#a', {}), '');
  assert.equal(geometrySelectorForId('shell/navigation/menu'), '#shell\\/navigation\\/menu');
  assert.throws(() => geometrySelectorForId('a#b'), /kit-shaped element id/);
  assert.throws(() => geometrySelectorForId(''), /kit-shaped element id/);
  assert.throws(() => geometryRuleText('#a', { width: '1px;' }), /rejects declaration value/);
  assert.throws(() => geometryRuleText('#a', { width: '1px}' }), /rejects declaration value/);
  assert.throws(() => geometryRuleText('#a', { '0bad': '1px' }), /rejects declaration name/);
  assert.throws(() => geometryRuleText('', { width: '1px' }), /requires a selector/);
});

/**
 * @param {string|null} nonce Nonce for the fake meta tag.
 * @returns {{ doc: any, head: any }} Fake document twin.
 */
function fakeGeometryDocument(nonce) {
  const headChildren = [];
  const head = {
    children: headChildren,
    querySelector: (selector) => headChildren.find((child) => child.matches(selector)) ?? null,
    appendChild: (child) => { headChildren.push(child); return child; },
  };
  const meta = {
    getAttribute: (name) => (name === 'content' ? nonce : null),
    matches: () => false,
  };
  const doc = {
    head,
    querySelector: (selector) => (selector === 'meta[name$="-style-nonce"]' && nonce ? meta : null),
    createElement: (tag) => {
      const attrs = new Map();
      return {
        tagName: String(tag).toUpperCase(),
        textContent: '',
        setAttribute: (name, value) => { attrs.set(name, value); },
        getAttribute: (name) => attrs.get(name) ?? null,
        matches: (selector) => selector === `style[${KIT_GEOMETRY_SHEET_ATTR}]`
          && String(tag).toLowerCase() === 'style'
          && attrs.has(KIT_GEOMETRY_SHEET_ATTR),
      };
    },
  };
  return { doc, head };
}

test('csp-audit geometry sheet writes one nonce-bearing rule per key', () => {
  const { doc, head } = fakeGeometryDocument('resp-nonce');
  assert.equal(setKitGeometryRule(doc, 'panel:root', 'side-terminal', { top: '48px', width: '320px' }), true);
  assert.equal(head.children.length, 1);
  assert.equal(head.children[0].getAttribute('nonce'), 'resp-nonce');
  assert.equal(head.children[0].textContent, '#side-terminal{top:48px;width:320px;}');
  assert.equal(setKitGeometryRule(doc, 'slot:frame', 'cuk-ai-slot-cap-01', { position: 'fixed' }), true);
  assert.equal(head.children.length, 1, 'one sheet element serves every key');
  assert.ok(head.children[0].textContent.includes('#cuk-ai-slot-cap-01{position:fixed;}'));
  assert.equal(clearKitGeometryRule(doc, 'panel:root'), true);
  assert.ok(!head.children[0].textContent.includes('#side-terminal'));
  assert.equal(clearKitGeometryRule(doc, 'panel:root'), false, 'second clear reports nothing');
  assert.equal(setKitGeometryRule(doc, 'slot:frame', 'cuk-ai-slot-cap-01', {}), true, 'empty collapses the rule');
  assert.equal(head.children[0].textContent, '');
});

test('csp-audit geometry sheet refuses to write without a document or nonce', () => {
  assert.equal(setKitGeometryRule(null, 'k', 'side-terminal', { top: '1px' }), false);
  assert.equal(clearKitGeometryRule(null, 'k'), false);
  const { doc } = fakeGeometryDocument(null);
  assert.equal(setKitGeometryRule(doc, 'k', 'side-terminal', { top: '1px' }), false);
  assert.equal(setKitGeometryRule(doc, '', 'side-terminal', { top: '1px' }), false);
});


test('geometry attributes react to size changes and release rules on unmount', async () => {
  const { doc, head } = fakeGeometryDocument('response-nonce');
  const previous = globalThis.document;
  globalThis.document = doc;
  const width = ref(320);
  const host = createRenderer({
    createElement: tag => ({ tag, children: [], attrs: {} }),
    createText: text => ({ text }), createComment: text => ({ text }),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.text = text; },
    insert: (node, parent) => { parent.children.push(node); },
    remove: () => {}, parentNode: () => null, nextSibling: () => null,
    patchProp: (node, key, old, value) => { node.attrs[key] = value; },
  });
  const root = { children: [] };
  const app = host.createApp({ setup() {
    const key = useKitGeometry(() => ({ width: `${width.value}px` }));
    return () => h('div', { 'data-cuk-geometry-id': key });
  } });
  try {
    app.mount(root);
    assert.equal(head.children[0].getAttribute('nonce'), 'response-nonce');
    const key = root.children[0].attrs['data-cuk-geometry-id'];
    assert.equal(head.children[0].textContent, `[data-cuk-geometry-id="${key}"]{width:320px;}`);
    assert.ok(!('style' in root.children[0].attrs));
    width.value = 640;
    await nextTick();
    assert.equal(head.children[0].textContent, `[data-cuk-geometry-id="${key}"]{width:640px;}`);
    app.unmount();
    assert.equal(head.children[0].textContent, '');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('terminal document moves generated row presentation to the nonce sheet across instances', () => {
  const { doc, head } = fakeGeometryDocument('terminal-nonce');
  const first = createTerminalDocument(doc).createElement('div');
  const second = createTerminalDocument(doc).createElement('div');
  first.setAttribute('style', 'width:32px;height:12px');
  second.setAttribute('style', 'width:48px');
  assert.equal(first.getAttribute('style'), null);
  assert.equal(second.getAttribute('style'), null);
  assert.notEqual(first.getAttribute('data-cuk-geometry-id'), second.getAttribute('data-cuk-geometry-id'));
  assert.match(head.children[0].textContent, /height:12px;width:32px/);
  assert.match(head.children[0].textContent, /width:48px/);
  first.setAttribute('style', '');
  assert.doesNotMatch(head.children[0].textContent, /width:32px/);
});

test('vendor menu adapter rejects planted nonempty inline presentation', () => {
  assert.throws(() => cleanMenuVNode(h('li', { style: { width: '42px' } })), /rejects inline presentation/);
  assert.ok(!('style' in cleanMenuVNode(h('li', { style: {} })).props));
});


test('native dialogs render closed and open states without inline styles or anonymous close controls', async () => {
  const Dialog = createCspDialog({ name: 'Dialog' });
  for (const visible of [false, true]) {
    const rendered = await renderSfc(Dialog, { visible, modal: true, id: 'audit-dialog', header: 'Audit' });
    assert.equal(rendered.error, undefined);
    assert.ok(!hasStyleAttribute(rendered.html));
    assert.ok(!hasVendorId(rendered.html));
    assert.deepEqual(findInteractiveGaps(rendered.html), []);
    assert.equal(/ open(?:[ >])/.test(rendered.html), visible);
  }
});

test('generated control and menu anchors use declared registry families', () => {
  for (const render of SSR_RENDERS) {
    for (const tag of parseOpeningTags(render.html ?? '')) {
      const anchor = tag.attrs['data-semantic-anchor'];
      if (typeof anchor !== 'string' || !(anchor.startsWith('settings/control-') || anchor.startsWith('shell/menu/'))) continue;
      const family = matchControlFamily(anchor);
      assert.ok(family, `${render.rel}: undeclared ${anchor}`);
      const role = tag.attrs.role || (tag.tag === 'button' ? 'button' : tag.tag === 'input' ? 'textbox' : null);
      if (role) assert.ok(family.allowedRoles.includes(role), `${render.rel}: ${anchor} role ${role}`);
    }
  }
});


test('geometry refuses a preexisting sheet with a mismatched nonce', () => {
  const { doc, head } = fakeGeometryDocument('response-nonce');
  const planted = doc.createElement('style');
  planted.setAttribute(KIT_GEOMETRY_SHEET_ATTR, '');
  planted.setAttribute('nonce', 'wrong-nonce');
  head.appendChild(planted);
  assert.equal(setKitGeometryRule(doc, 'guard', 'guard-target', { width: '12px' }), false);
  assert.equal(planted.textContent, '');
});


test('MV-2: dock tabs reject vendor identity and bind panel-derived anchors across rerenders', async () => {
  const { bindDockTabIdentities } = await import('../src/workspace/dockTabIdentity.js');
  const makeTab = (panelId, id) => ({
    id, dataset: {tabPanelId: panelId},
    getAttribute(name) { return name === 'data-tab-panel-id' ? this.dataset.tabPanelId : null; },
    setAttribute(name, value) { if (name === 'data-semantic-anchor') this.dataset.semanticAnchor = value; },
  });
  const alpha = makeTab('panel-alpha', 'dv-tab-91');
  const beta = makeTab('panel-beta', 'dv-tab-2');
  const content = {value: alpha.id, getAttribute() {return this.value;}, setAttribute(name, value) {this.value = value;}};
  const root = {querySelectorAll(selector) {return selector === '.dv-tab[data-tab-panel-id]' ? [beta, alpha] : [content];}};
  const html = tab => `<div role="tab" id="${tab.id}"${tab.dataset.semanticAnchor ? ` data-semantic-anchor="${tab.dataset.semanticAnchor}"` : ''}></div>`;
  assert.equal(findInteractiveGaps(html(alpha)).length, 1, 'negative: real vendor tab shape has no anchor');
  bindDockTabIdentities(root);
  assert.equal(alpha.id, 'workspace-tab-panel-alpha');
  assert.equal(alpha.dataset.semanticAnchor, 'workspace/tab/panel-alpha');
  assert.equal(beta.id, 'workspace-tab-panel-beta');
  assert.equal(content.value, alpha.id, 'tabpanel aria-labelledby follows renamed tab');
  assert.equal(findInteractiveGaps(html(alpha) + html(beta)).length, 0);
  assert.ok(matchControlFamily(alpha.dataset.semanticAnchor), 'tab is discoverable in agent registry');
  alpha.id = 'dv-tab-777'; content.value = alpha.id; // recreated during move/restore
  bindDockTabIdentities(root);
  assert.equal(alpha.id, 'workspace-tab-panel-alpha');
  assert.equal(content.value, alpha.id);
  assert.match(readKit('src/workspace/DockWorkspace.vue'), /bindDockTabIdentities/);
  assert.match(readKit('src/workspace/DockWorkspace.vue'), /MutationObserver/);
});

/** Visible native controls, including ancestor visibility (mounted hidden hosts stay in the DOM). */
function visibleInteractiveControls(html) {
  const stack = [];
  const controls = [];
  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of html.matchAll(/<\/?[A-Za-z][A-Za-z0-9-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g)) {
    if (token[0].startsWith('</')) { stack.pop(); continue; }
    const parsed = parseOpeningTags(token[0])[0];
    if (!parsed) continue;
    const hidden = Boolean(stack.at(-1)) || 'hidden' in parsed.attrs
      || parsed.attrs['aria-hidden'] === 'true'
      || /(?:^|\s)(?:cuk-csp-hidden|saas-rail--hidden)(?:\s|$)/.test(String(parsed.attrs.class ?? ''));
    if (!hidden && isInteractiveControl(parsed)) controls.push(parsed);
    if (!voids.has(parsed.tag) && !token[0].endsWith('/>')) stack.push(hidden);
  }
  return controls;
}

function assertUniqueVisibleAnchors(html) {
  const seen = new Set();
  for (const control of visibleInteractiveControls(html)) {
    const anchor = control.attrs['data-semantic-anchor'];
    assert.equal(typeof anchor, 'string', `missing anchor: ${control.raw}`);
    assert.ok(!seen.has(anchor), `duplicate visible interactive anchor: ${anchor}`);
    seen.add(anchor);
    const family = matchControlFamily(anchor);
    assert.ok(family, `unregistered anchor: ${anchor}`);
    const role = control.attrs.role || (control.tag === 'button' ? 'button' : null);
    if (role) assert.ok(family.allowedRoles.includes(role), `${anchor}: ${role}`);
  }
}

test('KWE negative control: duplicate visible anchors fail; hidden ancestors and reading regions do not collide', () => {
  const button = '<button id="first" data-semantic-anchor="capsule/cap-01/fold">Fold</button>';
  assertUniqueVisibleAnchors(button + '<div hidden>' + button + '</div>');
  assertUniqueVisibleAnchors(button + '<div class="cuk-csp-hidden"><section>' + button + '</section></div>');
  assertUniqueVisibleAnchors(button + '<div role="region" data-semantic-anchor="capsule/cap-01/fold"></div>');
  assert.throws(() => assertUniqueVisibleAnchors(button + button.replace('first', 'second')), /duplicate visible interactive anchor/);
});

test('KWE: window tile and multislot compositions have unique registered interactive anchors', async () => {
  const panel = await compileSfcModule('src/capsules/CapsulePanel.vue', true);
  const slot = await compileSfcModule('src/multislot/AiMultiSlot.vue', true);
  const bar = await compileSfcModule('src/multislot/AiSlotControlBar.vue', true);
  const legacy = await compileSfcModule('src/capsules/MultiSlot.vue', true);
  for (const compiled of [panel, slot, bar, legacy]) assert.equal(compiled.ok, true, compiled.error);
  const presentation = { revision: ref(0), get: () => ({ state: () => ({ floating: false, hidden: false, maximized: false }) }) };
  for (const chrome of ['', 'openvue']) {
    for (const folded of [false, true]) {
      const rendered = await renderSfc(panel.component, { capsuleId: 'cap-01' }, {
        provide: { capsuleWindowPresentation: presentation, capsuleChromeStyle: chrome },
        slots: { multislot: () => [
          h(slot.component, { capsuleId: 'cap-01', folded }, {
            controls: () => h(bar.component, { capsuleId: 'cap-01' }),
          }),
          h(legacy.component, { capsuleId: 'cap-01' }),
        ] },
      });
      assert.equal(rendered.ok, true, rendered.error);
      assertUniqueVisibleAnchors(rendered.html);
      const anchors = visibleInteractiveControls(rendered.html).map((tag) => tag.attrs['data-semantic-anchor']);
      for (const action of ['control', 'fold', 'tab', 'hide', 'float', 'maximize', 'dock-back', 'close']) {
        assert.equal(anchors.filter((anchor) => anchor === `capsule/cap-01/${action}`).length, 1, `${chrome}: ${action}`);
      }
      for (const action of ['pin', 'popout']) assert.ok(!anchors.includes(`capsule/cap-01/${action}`), `${chrome}: window presenter owns placement`);
      for (const action of ['session-slot/fold', 'ai-slot/fold', 'ai-slot/float', 'multislot/fold', 'multislot/float', 'multislot/close']) {
        assert.ok(anchors.includes(`capsule/cap-01/${action}`), `${chrome}: composition exercises ${action}`);
      }
      assert.equal(anchors.includes('capsule/cap-01/ai-terminal/hide-terminal'), !folded);
    }
  }
});

/** Minimal Vue host so setup, mounted hooks, rerenders and event handlers run without a browser. */
function mountControlFixture(component, props, provide) {
  const host = createRenderer({
    createElement: tag => ({ tag, children: [], attrs: {} }),
    createText: text => ({ text }), createComment: text => ({ text }),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.text = text; node.children = []; },
    insert(node, parent, anchor) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      const at = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent;
    },
    remove(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); },
    parentNode: node => node.parent,
    nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    patchProp: (node, key, old, value) => { node.attrs[key] = value; },
  });
  const root = { children: [] };
  const app = host.createApp(component, props);
  for (const [key, value] of Object.entries(provide)) app.provide(key, value);
  app.mount(root);
  const find = (anchor, node = root) => node.attrs?.['data-semantic-anchor'] === anchor ? node
    : node.children?.map(child => find(anchor, child)).find(Boolean);
  return { app, find };
}

test('KWE: window tile takes and releases projected control, keeps pressed/labels, and folds without window actions', async () => {
  const compiled = await compileSfcModule('src/capsules/CapsulePanel.vue');
  assert.equal(compiled.ok, true, compiled.error);
  for (const owner of ['none', 'agent', 'human']) {
    const intents = [];
    const folds = [];
    const projectionView = { envelope: { epoch: 1, revision: 1, projection: { rows: [{ id: 'cap-01', title: 'Capsule', backendLifecycle: 'active', controlOwner: owner }] } } };
    const fixture = mountControlFixture(compiled.component, {
      capsuleId: 'cap-01', projectionView,
      onSubmitIntent: intent => intents.push(intent), onFoldChange: event => folds.push(event),
    }, { capsuleWindowPresentation: { revision: ref(0), get: () => ({ state: () => ({ floating: false, hidden: false, maximized: false }) }) } });
    try {
      await nextTick();
      const control = fixture.find('capsule/cap-01/control');
      assert.ok(control, 'take/release remains reachable');
      assert.equal(control.attrs['aria-pressed'], String(owner === 'human'));
      assert.equal(control.attrs['aria-label'], `${owner === 'human' ? 'Release control of' : 'Take control of'} Capsule`);
      assert.equal(control.attrs.disabled, false);
      control.attrs.onClick();
      assert.deepEqual(intents.pop(), { type: `surface_request.${owner === 'human' ? 'release_control' : 'take_control'}`, capsuleId: 'cap-01' });
      const fold = fixture.find('capsule/cap-01/fold');
      assert.equal(fold.attrs['aria-expanded'], 'true');
      fold.attrs.onClick();
      await nextTick();
      assert.equal(fold.attrs['aria-expanded'], 'false');
      assert.deepEqual(folds, [{ capsuleId: 'cap-01', folded: true }]);
      assert.equal(intents.pop().type, 'surface_visibility');
      fold.attrs.onClick();
      await nextTick();
      assert.equal(fold.attrs['aria-expanded'], 'true');
    } finally { fixture.app.unmount(); }
  }
});
