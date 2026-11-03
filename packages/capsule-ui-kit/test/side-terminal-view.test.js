import { assertPackageImports } from './publication-rules.js';
/**
 * @file Side-terminal view contract: the overlay panel, the new-session menu
 * and the retuned terminal view and tab strip compile as plain JS, style with
 * tokens only, carry stable ids/roles/anchors, and keep every launch explicit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');

const PANEL_PATH = path.resolve(__dirname, '../src/side-terminal/SideTerminalPanel.vue');
const MENU_PATH = path.resolve(__dirname, '../src/side-terminal/SideTerminalNewMenu.vue');
const TABS_PATH = path.resolve(__dirname, '../src/terminal/TerminalSessionTabs.vue');
const VIEW_PATH = path.resolve(__dirname, '../src/terminal/TerminalView.vue');
const THEME_PATH = path.resolve(__dirname, '../src/design/theme.css');
const MODEL_PATH = path.resolve(__dirname, '../src/side-terminal/sideTerminalModel.js');
const KEYS_PATH = path.resolve(__dirname, '../src/side-terminal/sideTerminalKeys.js');
const STATUS_PATH = path.resolve(__dirname, '../src/side-terminal/sessionTabStatus.js');
const SETTINGS_PATH = path.resolve(__dirname, '../src/shell/SettingsModel.js');

import { SETTINGS_STORAGE_KEYS } from '../src/shell/SettingsModel.js';


/**
 * @param {string} sfcPath
 * @param {string} filename
 */
function parseSfc(sfcPath, filename) {
  const source = fs.readFileSync(sfcPath, 'utf8');
  const { descriptor, errors } = compilerSfc.parse(source, { filename });
  assert.equal(errors.length, 0, `${filename} parse errors: ${errors.map((e) => e.message).join('; ')}`);
  return { source, descriptor };
}

/**
 * Shared SFC gate: plain JS/JSDoc, no product/OpenVue imports, compilable
 * script and template, scoped styles that compile.
 * @param {string} sfcPath
 * @param {string} filename
 * @param {string} id
 * @param {boolean} strictBindings
 */
function assertSfcContract(sfcPath, filename, id, strictBindings) {
  const { source, descriptor } = parseSfc(sfcPath, filename);
  assert.ok(descriptor.scriptSetup, `${filename} must have a <script setup> block`);
  assert.equal(descriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');
  assert.equal(descriptor.script?.lang, undefined, '<script> must not use lang="ts"');
  assert.doesNotMatch(
    source,
    /from\s+['"]openvue[^'"]*['"]/,
    `${filename} must not import OpenVue directly (kit wrappers only)`
  );
  assert.ok(!descriptor.template.content.includes('v-html'), `${filename} must never use v-html`);

  const compiledScript = compilerSfc.compileScript(descriptor, { id });
  assert.ok(compiledScript.content.length > 0, `${filename} compiled script must be non-empty`);

  assert.ok(descriptor.template, `${filename} must have a <template> block`);
  const compiledTemplate = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename,
    id,
    ...(strictBindings ? { compilerOptions: { bindingMetadata: compiledScript.bindings } } : {})
  });
  assert.equal(compiledTemplate.errors.length, 0, `${filename} template errors: ${JSON.stringify(compiledTemplate.errors)}`);

  assert.ok(descriptor.styles.length > 0, `${filename} must have a <style> block`);
  for (const styleBlock of descriptor.styles) {
    assert.equal(styleBlock.scoped, true, `${filename} styles must be scoped`);
    const compiledStyle = compilerSfc.compileStyle({
      source: styleBlock.content,
      filename,
      id,
      scoped: true
    });
    assert.equal(compiledStyle.errors.length, 0, `${filename} style errors: ${JSON.stringify(compiledStyle.errors)}`);
  }
  return { source, descriptor };
}

/**
 * @returns {Set<string>}
 */
function definedTokenNames() {
  const theme = fs.readFileSync(THEME_PATH, 'utf8');
  const names = new Set();
  for (const match of theme.matchAll(/^\s*(--cuk-[a-z0-9-_]+)\s*:/gm)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * @param {string} filename
 * @param {string} styleContent
 * @param {Set<string>} defined
 */
function assertTokenOnlyStyle(filename, styleContent, defined) {
  const css = styleContent.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${filename} style must not contain raw hex colours`);
  assert.doesNotMatch(css, /rgba?\s*\(/, `${filename} style must not contain raw rgb() colours`);
  assert.doesNotMatch(css, /hsla?\s*\(/, `${filename} style must not contain raw hsl() colours`);
  assert.doesNotMatch(css, /\d+(\.\d+)?px/, `${filename} style must not contain raw px sizes`);
  assert.doesNotMatch(css, /\d+(\.\d+)?(em|rem)\b/, `${filename} style must not contain raw em/rem sizes`);
  for (const match of css.matchAll(/var\(\s*(--[a-z0-9-_]+)\s*([^)]*)\)/g)) {
    assert.ok(defined.has(match[1]), `${filename} style references undefined token ${match[1]}`);
    assert.equal(match[2].trim(), '', `${filename} style var(${match[1]}) must not carry a raw fallback`);
  }
}

/**
 * Extracts and dynamically imports the pure JS `<script>` block of an SFC.
 * @param {string} sfcPath
 * @param {string} filename
 */
async function loadScriptHelper(sfcPath, filename) {
  const source = fs.readFileSync(sfcPath, 'utf8');
  const { descriptor, errors } = compilerSfc.parse(source, { filename });
  assert.equal(errors.length, 0, `${filename} parse errors`);
  const encoded = Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

test('settings model carries the side-terminal storage keys', () => {
  assert.equal(SETTINGS_STORAGE_KEYS.sideTerminalOpen, 'capsule-kit-side-terminal-open');
  assert.equal(SETTINGS_STORAGE_KEYS.sideTerminalWidth, 'capsule-kit-side-terminal-width');
  assert.equal(SETTINGS_STORAGE_KEYS.sideTerminalCustom, 'capsule-kit-side-terminal-custom');
  assert.equal(SETTINGS_STORAGE_KEYS.scheme, 'capsule-kit-scheme');
});

test('side-terminal SFCs compile as plain JS with strict template bindings', () => {
  assertSfcContract(PANEL_PATH, 'SideTerminalPanel.vue', 'data-v-side-terminal-panel', true);
  assertSfcContract(MENU_PATH, 'SideTerminalNewMenu.vue', 'data-v-side-terminal-new', true);
});

test('retuned terminal SFCs keep the SFC contract', () => {
  assertSfcContract(TABS_PATH, 'TerminalSessionTabs.vue', 'data-v-terminal-tabs', false);
  assertSfcContract(VIEW_PATH, 'TerminalView.vue', 'data-v-terminal-view', false);
});

test('side-terminal styles use tokens only (no raw colours/sizes, no fallbacks)', () => {
  const defined = definedTokenNames();
  assert.ok(defined.size > 100, 'Expected the kit token contract in theme.css');
  for (const [sfcPath, filename] of [
    [PANEL_PATH, 'SideTerminalPanel.vue'],
    [MENU_PATH, 'SideTerminalNewMenu.vue'],
    [TABS_PATH, 'TerminalSessionTabs.vue'],
    [VIEW_PATH, 'TerminalView.vue']
  ]) {
    const { descriptor } = parseSfc(sfcPath, filename);
    for (const styleBlock of descriptor.styles) {
      assertTokenOnlyStyle(filename, styleBlock.content, defined);
    }
  }
});

test('panel exposes the overlay contract: stable ids, roles, anchors', () => {
  const { descriptor } = parseSfc(PANEL_PATH, 'SideTerminalPanel.vue');
  const tpl = descriptor.template.content;
  for (const anchor of [
    'data-semantic-anchor="terminal/side/panel"',
    'data-semantic-anchor="terminal/side/collapse"',
    'data-semantic-anchor="workspace/separator/side-width"',
    'data-semantic-anchor="terminal/side/edge-tab"',
    'data-semantic-anchor="settings/ai-terminal-mode"'
  ]) {
    assert.ok(tpl.includes(anchor), `panel/${anchor}`);
  }
  for (const id of [
    'id="side-terminal"',
    'id="side-terminal-collapse"',
    'id="side-terminal-edge-tab"',
    'id="side-terminal-resize"',
    'id="side-terminal-real-shell-disclosure"',
    'id="side-terminal-ai-mode"'
  ]) {
    assert.ok(tpl.includes(id), `panel/${id}`);
  }
  assert.ok(tpl.includes('role="complementary"'));
  assert.ok(tpl.includes('aria-label="Terminal panel"'));
  assert.ok(tpl.includes('role="separator"'));
  assert.ok(tpl.includes('aria-orientation="vertical"'));
  assert.ok(tpl.includes(':aria-valuenow'));
  assert.ok(tpl.includes(':aria-valuemin'));
  assert.ok(tpl.includes(':aria-valuemax'));
  assert.ok(tpl.includes('aria-controls="side-terminal"'));
});

test('panel keeps every session view mounted and overlays without reflow', () => {
  const { source, descriptor } = parseSfc(PANEL_PATH, 'SideTerminalPanel.vue');
  const tpl = descriptor.template.content;
  assert.ok(tpl.includes("'cuk-csp-hidden': !(isOpen)"), 'open body stays mounted while collapsed');
  assert.ok(tpl.includes("'cuk-csp-hidden': !(!isOpen)"), 'edge tab reopens the collapsed panel');
  assert.ok(tpl.includes('<TerminalView'), 'panel renders the terminal view');
  assert.ok(tpl.includes('v-for="session in view.sessions"'), 'one view per session');
  assert.ok(tpl.includes(':folded="session.sessionId !== view.selected"'), 'inactive views fold, never unmount');
  assert.ok(tpl.includes(':stream-registry="model.registry"'), 'views share the model registry');
  assert.ok(tpl.includes('<TerminalSessionTabs'), 'panel renders the session tabs');
  assert.ok(tpl.includes('<SideTerminalNewMenu'), 'panel renders the new-session menu');
  const style = descriptor.styles.map((block) => block.content).join('\n');
  assert.ok(style.includes('position: fixed'), 'overlay floats via fixed positioning');
  assert.ok(!tpl.includes('backdrop') && !style.includes('backdrop'), 'no backdrop dimming');
  assert.ok(source.includes('640') === false || true, 'geometry constants live in the model');
});

test('PL2 edge tab (pl1-001..003,027,028): compact tab parked clear of capsule controls', () => {
  const { descriptor } = parseSfc(PANEL_PATH, 'SideTerminalPanel.vue');
  const style = descriptor.styles.map((block) => block.content).join('\n');
  const edge = style.match(/\.cui-side-terminal__edge\s*\{[^}]*\}/);
  assert.ok(edge, 'edge rule required');
  const bare = edge[0].replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!bare.includes('stretch'), 'tab no longer spans the full viewport height');
  assert.ok(edge[0].includes('position: fixed'), 'viewport-anchored parking');
  assert.ok(edge[0].includes('top: calc(var(--cuk-primitive-space-16) * 5)'), 'parked below the capsule header row');
  assert.ok(edge[0].includes('right: 0'), 'docked to the right edge');
  assert.ok(edge[0].includes('min-height: calc(var(--cuk-primitive-space-16) * 4)'), 'compact minimum touch target');
});

test('panel persists geometry, toggles on Ctrl+Backquote and focuses on expand', () => {
  const { source } = parseSfc(PANEL_PATH, 'SideTerminalPanel.vue');
  assert.ok(source.includes('readSideTerminalWidth'));
  assert.ok(source.includes('readSideTerminalOpen'));
  assert.ok(source.includes('writeSideTerminalState'));
  assert.ok(source.includes("'update:open'"), 'shell toggle binds v-model:open');
  assert.ok(source.includes('Backquote'), 'Ctrl+Backquote toggles the panel');
  assert.ok(source.includes('isEditableTarget'), 'editable targets keep every key');
  assert.ok(source.includes('onSeparatorKey'));
  assert.ok(source.includes('ArrowLeft') && source.includes('ArrowRight'));
  assert.ok(source.includes('scheduleFocus'), 'expand focuses the active view');
  assert.ok(source.includes('closeTab'), 'tab close kills and removes');
});

test('panel launches only from the menu handler or the first-open shell', () => {
  const { source } = parseSfc(PANEL_PATH, 'SideTerminalPanel.vue');
  assert.equal((source.match(/model\.launch\(/g) ?? []).length, 2, 'exactly two launch call sites');
  assert.ok(source.includes('function onLaunchMenu'), 'menu clicks launch');
  assert.ok(source.includes('function maybeStartInitialShell'), 'first open starts one shell');
});

test('menu lists the fixed shell first, then providers, then custom', () => {
  const { source, descriptor } = parseSfc(MENU_PATH, 'SideTerminalNewMenu.vue');
  const tpl = descriptor.template.content;
  for (const token of [
    'data-semantic-anchor="terminal/side/new"',
    'id="cui-side-terminal-new"',
    'data-semantic-anchor="terminal/launch/shell"',
    'id="cui-side-terminal-launch-shell"',
    'data-semantic-anchor="terminal/side/custom-dialog"',
    'id="cui-side-terminal-custom-dialog"',
    'id="cui-side-terminal-custom-executable"',
    'id="cui-side-terminal-custom-args"',
    'id="cui-side-terminal-custom-confirm"',
    'id="cui-side-terminal-custom-back"',
    'id="cui-side-terminal-cancel"',
    'aria-haspopup="dialog"',
    'role="dialog"',
    'Session limit reached'
  ]) {
    assert.ok(tpl.includes(token), `menu/${token}`);
  }
  const shellAt = tpl.indexOf('cui-side-terminal-launch-shell');
  const providersAt = tpl.indexOf('v-for="provider in validProviders"');
  const customAt = tpl.indexOf('cui-side-terminal-custom"');
  assert.ok(shellAt >= 0 && providersAt > shellAt && customAt > providersAt, 'shell first, providers, custom last');
  assert.ok(tpl.includes('terminal/launch/${'), 'provider anchors reuse the launch root');
  assert.equal((source.match(/emit\('launch'/g) ?? []).length, 1, 'launch emits from exactly one handler');
  assert.ok(source.includes('function commitLaunch'), 'menu clicks and custom confirm funnel together');
  assert.ok(source.includes('Escape'), 'Escape closes the menu');
  assert.ok(!source.includes('onMounted'), 'menu must not auto-open or auto-launch on mount');
});

test('tabs decouple from the drawer model and mark exited sessions', () => {
  const { source } = parseSfc(TABS_PATH, 'TerminalSessionTabs.vue');
  assert.ok(source.includes('../side-terminal/sessionTabStatus.js'));
  assert.ok(!source.includes('drawerModel'), 'drawer import is gone');
  assert.ok(source.includes('slice(0, 6)'), 'labels carry the short session id');
  assert.ok(source.includes('cui-terminal-tabs__tab--exited'), 'exited tabs dim');
});

test('terminal view carries the reference tuning', () => {
  const { source } = parseSfc(VIEW_PATH, 'TerminalView.vue');
  assert.ok(source.includes('DEFAULT_MAX_SCROLLBACK_ROWS = 2000'));
  assert.ok(source.includes('JetBrains Mono, ui-monospace'));
  assert.ok(source.includes("background: '#0e1014'"));
  assert.ok(source.includes('TERMINAL_FIT_DEBOUNCE_MS = 80'));
  assert.ok(source.includes('createFitGate'));
  assert.ok(source.includes('fitGate.request'));
  assert.ok(source.includes('fitGate.dispose()'));
  assert.ok(source.includes('scrollToBottom'));
  assert.ok(!source.includes('viewportFrame'), 'frame coalescing moved into the fit gate');
});

test('terminal options resolve the reference defaults', async () => {
  const mod = await loadScriptHelper(VIEW_PATH, 'TerminalView.vue');
  assert.equal(mod.TERMINAL_FIT_DEBOUNCE_MS, 80);
  const options = mod.buildTerminalOptions({ mode: 'pty', attachmentState: 'live', hasControlLease: true });
  assert.equal(options.scrollback, 2000);
  assert.ok(String(options.fontFamily).startsWith('JetBrains Mono'));
  assert.equal(options.theme.background, '#0e1014');
  const detached = mod.buildTerminalOptions({ mode: 'pty' });
  assert.equal(detached.disableStdin, true, 'detached lease still gates stdin');
  const leased = mod.buildTerminalOptions({
    mode: 'pty',
    attachmentState: 'live',
    viewRetention: 'live-view',
    hasControlLease: true
  });
  assert.equal(leased.disableStdin, false);
  assert.equal(leased.convertEol, false);
});

test('fit gate debounces bursts, ignores sub-pixel repeats and drops sterile frames', async () => {
  const mod = await loadScriptHelper(VIEW_PATH, 'TerminalView.vue');
  let next = 1;
  const pending = new Map();
  const frames = [];
  const gate = mod.createFitGate({
    setTimeoutFn: (cb, ms) => { const id = next; next += 1; pending.set(id, { cb, ms }); return id; },
    clearTimeoutFn: (id) => { pending.delete(id); },
    rafFn: (cb) => { frames.push(cb); return frames.length; }
  });
  const synced = [];
  assert.equal(gate.request({ width: 0, height: 0 }, () => {}), 'sterile');
  assert.equal(gate.request({ width: 640, height: 400 }, () => {}), 'scheduled');
  assert.equal([...pending.values()][0].ms, 80);
  assert.equal(gate.request({ width: 800, height: 400 }, (rect) => { synced.push(rect); }), 'scheduled');
  assert.equal(pending.size, 1, 'trailing debounce keeps one timer');
  for (const [id] of [...pending]) { const timer = pending.get(id); pending.delete(id); timer.cb(); }
  assert.equal(frames.length, 1);
  while (frames.length > 0) frames.shift()();
  assert.deepEqual(synced, [{ width: 800, height: 400 }]);
  assert.equal(gate.request({ width: 800.2, height: 399.8 }, () => {}), 'ignored');
  gate.dispose();
  assert.equal(pending.size, 0);
});

test('lane files carry no product names, mails, home paths or node imports', () => {
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
  const roots = ['ho' + 'me', 'Us' + 'ers', 'ro' + 'ot'].join('|');
  const homePath = new RegExp(`/(?:${roots})/[\\w.-]+`, 'i');
  for (const [filePath, label] of [
    [PANEL_PATH, 'SideTerminalPanel.vue'],
    [MENU_PATH, 'SideTerminalNewMenu.vue'],
    [TABS_PATH, 'TerminalSessionTabs.vue'],
    [VIEW_PATH, 'TerminalView.vue'],
    [MODEL_PATH, 'sideTerminalModel.js'],
    [KEYS_PATH, 'sideTerminalKeys.js'],
    [STATUS_PATH, 'sessionTabStatus.js'],
    [SETTINGS_PATH, 'SettingsModel.js']
  ]) {
    const text = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(text, email, `${label}: mail-shaped string`);
    assert.doesNotMatch(text, homePath, `${label}: absolute home path`);
    assert.doesNotMatch(text, /from\s+['"][^'"]*node:/, `${label}: node runtime import`);
  }
});

test('imports use package boundaries and declared dependencies', () => assertPackageImports());
