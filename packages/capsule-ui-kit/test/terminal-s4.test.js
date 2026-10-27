import { assertPackageImports } from './publication-rules.js';
/**
 * @file S4 terminal capsule contract (tabs, launcher, composer) in S1 language.
 * Verifies the new terminal SFCs compile as plain JS/JSDoc (no lang="ts", no
 * product imports, no OpenVue imports, no v-html), expose stable ids/roles/
 * accessible names, emit only from explicit user actions (no auto-exec), and
 * style exclusively with defined kit tokens (no raw colours/sizes).
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

const TABS_PATH = path.resolve(__dirname, '../src/terminal/TerminalSessionTabs.vue');
const LAUNCHER_PATH = path.resolve(__dirname, './fixtures/retired/src/terminal/TerminalLauncher.vue');
const COMPOSER_PATH = path.resolve(__dirname, './fixtures/retired/src/terminal/TerminalComposer.vue');
const VIEW_PATH = path.resolve(__dirname, '../src/terminal/TerminalView.vue');
const THEME_PATH = path.resolve(__dirname, '../src/design/theme.css');

import {
  TERMINAL_LAUNCHERS,
  TERMINAL_LAUNCHER_HINTS
} from './fixtures/retired/src/terminal/terminalCapsuleModel.js';

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
 * Shared SFC gate: plain JS/JSDoc, no product/OpenVue imports, compilable.
 * @param {string} sfcPath
 * @param {string} filename
 * @param {string} id
 */
function assertSfcContract(sfcPath, filename, id) {
  const { source, descriptor } = parseSfc(sfcPath, filename);
  assert.ok(descriptor.scriptSetup, `${filename} must have a <script setup> block`);
  assert.equal(descriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');
  assert.equal(descriptor.script?.lang, undefined, '<script> must not use lang="ts"');
  assertPackageImports();
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
    id
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
 * Collects every `--cuk-*` custom property name defined in theme.css.
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
 * Tokens-only gate: no raw colours/sizes in <style>, every var() references a
 * defined token and carries no raw fallback.
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

test('TerminalSessionTabs.vue — SFC contract (plain JS, no product/OpenVue imports, compilable)', () => {
  assertSfcContract(TABS_PATH, 'TerminalSessionTabs.vue', 'data-v-terminal-tabs');
});

test('TerminalSessionTabs.vue — tablist roles, stable ids, chips, roving tabindex', () => {
  const { source, descriptor } = parseSfc(TABS_PATH, 'TerminalSessionTabs.vue');
  const tpl = descriptor.template.content;
  const setup = descriptor.scriptSetup.content;
  assert.match(tpl, /role="tablist"/, 'Must render a tablist');
  assert.match(tpl, /aria-label="Terminal sessions"/, 'Tablist needs an accessible name');
  assert.match(tpl, /role="tab"/, 'Must render tabs');
  assert.match(tpl, /cui-terminal-tab-\$\{/, 'Tab id must bind cui-terminal-tab-{sessionId}');
  assert.match(tpl, /terminal\/session\/\$\{/, 'Tab must bind terminal/session/{id}/tab anchor');
  assert.match(tpl, /:aria-selected/, 'Tabs must bind aria-selected');
  assert.match(tpl, /cui-terminal-tabs__chip--\$\{/, 'Tabs must render idle/busy/exited chips');
  assert.match(tpl, /cui-terminal-tabs__unread/, 'Tabs must render an unread count');
  assert.match(tpl, /cui-terminal-tab-\$\{[^}]*\}-close/, 'Tabs must render stable close ids');
  assert.match(tpl, /No terminal sessions/, 'Empty sessions render an accessible status');
  assert.match(setup, /resolveSessionTabStatus/, 'Chips must use the shared tab-status mapping');
  assert.match(setup, /select-tab/, 'Must emit select-tab');
  assert.match(setup, /close-tab/, 'Must emit close-tab');
  assert.match(setup, /ArrowRight/, 'Must support arrow-key tab navigation');
  assert.match(setup, /ArrowLeft/, 'Must support arrow-key tab navigation');
  assert.ok(!source.includes('onMounted'), 'Tab strip must not auto-act on mount');
});

test('TerminalLauncher.vue — SFC contract (plain JS, no product/OpenVue imports, compilable)', () => {
  assertSfcContract(LAUNCHER_PATH, 'TerminalLauncher.vue', 'data-v-terminal-launcher');
});

test('TerminalLauncher.vue — popover dialog, stable ids, explicit-launch only', () => {
  const { source, descriptor } = parseSfc(LAUNCHER_PATH, 'TerminalLauncher.vue');
  const tpl = descriptor.template.content;
  const setup = descriptor.scriptSetup.content;
  assert.match(tpl, /id="cui-terminal-launcher-trigger"/, 'Trigger needs a stable id');
  assert.match(tpl, /aria-haspopup="dialog"/, 'Trigger must announce the dialog');
  assert.match(tpl, /:aria-expanded/, 'Trigger must bind aria-expanded');
  assert.match(tpl, /role="dialog"/, 'Popover must be a labelled dialog');
  assert.match(tpl, /aria-labelledby="cui-terminal-launcher-heading"/, 'Dialog needs an accessible name');
  assert.match(tpl, /cui-terminal-launch-\$\{/, 'Options need cui-terminal-launch-{id} ids');
  assert.match(tpl, /id="cui-terminal-launcher-cancel"/, 'Cancel needs a stable id');
  assert.match(tpl, /Session limit reached/, 'Full sessions render an accessible status');
  assert.match(setup, /TERMINAL_LAUNCHERS/, 'Options must come from the capsule model launchers');
  assert.match(setup, /TERMINAL_LAUNCHER_HINTS/, 'Options must show generic kind hints');
  assert.match(setup, /'launch'/, 'Must emit launch');
  assert.ok(!source.includes('onMounted'), 'Launcher must not auto-open or auto-launch on mount');
  assert.equal(
    (source.match(/emit\('launch'/g) ?? []).length,
    1,
    'launch must emit from exactly one explicit handler'
  );
  assert.match(
    setup,
    /function onLaunchOption[\s\S]{0,500}emit\('launch'/,
    'launch must emit only from the option-click handler'
  );
  assert.match(setup, /Escape/, 'Escape must close the popover');
});

test('TerminalComposer.vue — SFC contract (plain JS, no product/OpenVue imports, compilable)', () => {
  assertSfcContract(COMPOSER_PATH, 'TerminalComposer.vue', 'data-v-terminal-composer');
});

test('TerminalComposer.vue — target picker, composer, Send; emit-only, no auto-exec', () => {
  const { source, descriptor } = parseSfc(COMPOSER_PATH, 'TerminalComposer.vue');
  const tpl = descriptor.template.content;
  const setup = descriptor.scriptSetup.content;
  assert.match(tpl, /<TargetPicker/, 'Composer must embed the kit target picker');
  assert.match(
    setup,
    /from '\.\.\/orchestrator\/TargetPicker\.vue'/,
    'Target picker must come from the kit orchestrator surface'
  );
  assert.match(tpl, /id="cui-terminal-composer"/, 'Composer input needs a stable id');
  assert.match(tpl, /role="textbox"/, 'Composer input must be a labelled textbox');
  assert.match(tpl, /terminal\/composer/, 'Composer must bind the terminal/composer anchor');
  assert.match(tpl, /id="cui-terminal-composer-send"/, 'Send needs a stable id');
  assert.match(tpl, /terminal\/composer\/send/, 'Send must bind an anchor');
  assert.match(tpl, /:disabled="!canSend"/, 'Send must disable on empty targets/draft');
  assert.match(tpl, /Ctrl\+Enter to send/, 'Composer must document the send shortcut');
  assert.match(setup, /ctrlKey/, 'Ctrl+Enter must send');
  assert.match(setup, /metaKey/, 'Cmd+Enter must send');
  assert.match(setup, /isComposing/, 'IME composition must guard the shortcut');
  assert.ok(!source.includes('onMounted'), 'Composer must not auto-send on mount');
  assert.equal(
    (source.match(/emit\('send'/g) ?? []).length,
    1,
    'send must emit from exactly one explicit handler'
  );
  assert.match(
    setup,
    /function onSend\(\)[\s\S]{0,300}emit\('send'/,
    'send must emit only from the Send handler'
  );
});

test('terminalCapsuleModel — every launcher has a generic non-empty hint', () => {
  assert.ok(TERMINAL_LAUNCHERS.length >= 4, 'Expected shell/pi/claude/codex launchers');
  for (const launcher of TERMINAL_LAUNCHERS) {
    const hint = TERMINAL_LAUNCHER_HINTS[launcher.id];
    assert.equal(typeof hint, 'string', `Launcher ${launcher.id} needs a hint`);
    assert.ok(hint.trim().length > 0, `Launcher ${launcher.id} hint must be non-empty`);
  }
});

test('terminal styles — tokens only (no raw colours/sizes, defined tokens, no fallbacks)', () => {
  const defined = definedTokenNames();
  assert.ok(defined.size > 100, 'Expected the kit token contract in theme.css');
  for (const [sfcPath, filename] of [
    [TABS_PATH, 'TerminalSessionTabs.vue'],
    [LAUNCHER_PATH, 'TerminalLauncher.vue'],
    [COMPOSER_PATH, 'TerminalComposer.vue'],
    [VIEW_PATH, 'TerminalView.vue']
  ]) {
    const { descriptor } = parseSfc(sfcPath, filename);
    for (const styleBlock of descriptor.styles) {
      assertTokenOnlyStyle(filename, styleBlock.content, defined);
    }
  }
});
