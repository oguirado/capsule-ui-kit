import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc';

// R7: the right-terminal "+ New" menu keeps a comfortable width with one
// line per entry (icon, label, hint) while holding the stable menu contract.

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('src/side-terminal/SideTerminalNewMenu.vue', root), 'utf8');
const theme = readFileSync(new URL('src/design/theme.css', root), 'utf8');
const { descriptor, errors } = parse(source, { filename: 'SideTerminalNewMenu.vue' });
const css = descriptor.styles.map((style) => style.content).join('\n');


function definedTokenNames() {
  const names = new Set();
  for (const match of theme.matchAll(/^\s*(--cuk-[a-z0-9-_]+)\s*:/gm)) names.add(match[1]);
  return names;
}

test('menu compiles as plain JS with strict bindings and scoped styles', () => {
  assert.deepEqual(errors, []);
  assert.ok(descriptor.scriptSetup, 'script setup required');
  assert.equal(descriptor.scriptSetup.lang, undefined, 'must not set lang="ts"');
  assert.equal(descriptor.script?.lang, undefined, 'plain script must not set lang="ts"');
  const script = compileScript(descriptor, { id: 'side-terminal-menu' });
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: 'SideTerminalNewMenu.vue',
    id: 'side-terminal-menu',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, []);
  assert.ok(descriptor.styles.length >= 1, 'menu styles required');
  for (const style of descriptor.styles) {
    assert.equal(style.scoped, true, 'scoped');
    const compiled = compileStyle({ source: style.content, filename: 'SideTerminalNewMenu.vue', id: 'side-terminal-menu', scoped: true });
    assert.deepEqual(compiled.errors, []);
  }
});

test('menu styles stay token-only with defined tokens and no raw fallbacks', () => {
  const defined = definedTokenNames();
  assert.ok(defined.size > 100, 'kit token contract in theme.css');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(bare, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex colours');
  assert.doesNotMatch(bare, /rgba?\s*\(/, 'no raw rgb() colours');
  assert.doesNotMatch(bare, /hsla?\s*\(/, 'no raw hsl() colours');
  assert.doesNotMatch(bare, /\d+(\.\d+)?px/, 'no raw px sizes');
  assert.doesNotMatch(bare, /\d+(\.\d+)?(em|rem)\b/, 'no raw em/rem sizes');
  for (const match of bare.matchAll(/var\(\s*(--[a-z0-9-_]+)\s*([^)]*)\)/g)) {
    assert.ok(defined.has(match[1]), 'undefined token ' + match[1]);
    assert.equal(match[2].trim(), '', 'var(' + match[1] + ') must not carry a raw fallback');
  }
});

test('R7: dialog keeps a comfortable token width instead of the trigger width', () => {
  const dialog = css.match(/\.cui-side-terminal-new__dialog\s*\{[^}]*\}/);
  assert.ok(dialog, 'dialog rule required');
  const rule = dialog[0];
  assert.ok(rule.includes('width: max-content'), 'grows with content');
  assert.ok(rule.includes('min-width: calc(var(--cuk-primitive-space-16) * 11)'), 'comfortable token min-width');
  assert.ok(rule.includes('max-width: calc(100vw - var(--cuk-semantic-spacing-xl))'), 'viewport-bounded max-width');
  assert.equal(css.includes('max-width: 100%'), false, 'trigger-width cap is gone');
  const defined = definedTokenNames();
  assert.ok(defined.has('--cuk-primitive-space-16'), 'min-width token defined');
  assert.ok(defined.has('--cuk-semantic-spacing-xl'), 'max-width token defined');
});

test('R7: every entry renders one line with an icon, a label and a hint', () => {
  const template = descriptor.template.content;
  const icons = template.match(/cui-side-terminal-new__option-icon/g) ?? [];
  assert.equal(icons.length, 3, 'one icon per entry kind (shell, provider, custom), got ' + icons.length);
  assert.ok(template.includes('<svg viewBox="0 0 16 16"'), 'icon art');
  const option = css.match(/\.cui-side-terminal-new__option\s*\{[^}]*\}/);
  assert.ok(option, 'option rule required');
  assert.ok(option[0].includes('flex-direction: row'), 'icon and text share one row');
  assert.ok(option[0].includes('align-items: center'), 'row centers');
  const text = css.match(/\.cui-side-terminal-new__option-text\s*\{[^}]*\}/);
  assert.ok(text, 'option text rule required');
  assert.ok(text[0].includes('white-space: nowrap'), 'single line');
  assert.ok(text[0].includes('overflow: hidden'), 'clips instead of wrapping');
  const hint = css.match(/\.cui-side-terminal-new__option-hint\s*\{[^}]*\}/);
  assert.ok(hint, 'hint rule required');
  assert.ok(hint[0].includes('text-overflow: ellipsis'), 'long hints ellipsize');
  const label = css.match(/\.cui-side-terminal-new__option-label\s*\{[^}]*\}/);
  assert.ok(label && label[0].includes('white-space: nowrap'), 'label never wraps');
});

test('R7: menu keeps the stable launch contract (ids, order, single emit)', () => {
  const template = descriptor.template.content;
  for (const token of [
    'id="cui-side-terminal-new"',
    'id="cui-side-terminal-launch-shell"',
    'data-semantic-anchor="terminal/launch/shell"',
    'id="cui-side-terminal-custom"',
    'id="cui-side-terminal-cancel"',
    'aria-haspopup="dialog"',
    'role="dialog"',
  ]) {
    assert.ok(template.includes(token), 'menu/' + token);
  }
  const shellAt = template.indexOf('cui-side-terminal-launch-shell');
  const providersAt = template.indexOf('v-for="provider in validProviders"');
  const customAt = template.indexOf('cui-side-terminal-custom"');
  assert.ok(shellAt >= 0 && providersAt > shellAt && customAt > providersAt, 'shell first, providers, custom last');
  assert.equal((source.match(/emit\('launch'/g) ?? []).length, 1, 'launch emits from exactly one handler');
  assert.ok(source.includes('function commitLaunch'), 'single launch funnel');
  assert.ok(source.includes('Escape'), 'Escape closes the menu');
  assert.ok(!source.includes('onMounted'), 'menu never auto-opens on mount');
});

test('PL2 R7b (pl1-020..025): dialog right-anchors so it grows into the panel', () => {
  const dialog = css.match(/\.cui-side-terminal-new__dialog\s*\{[^}]*\}/);
  assert.ok(dialog, 'dialog rule required');
  assert.ok(dialog[0].includes('right: 0'), 'dialog right edge anchors to the trigger');
  assert.ok(dialog[0].includes('left: auto'), 'dialog never extends right past the trigger');
  assert.ok(!dialog[0].includes('left: 0'), 'left-anchored placement is gone');
});

test('PL2 R7b: menu fits the dialog to the measured panel on open and resize', () => {
  assert.ok(source.includes('capSideTerminalMenuWidth'), 'panel cap helper wired');
  assert.ok(source.includes('function fitDialogToPanel'), 'measure-and-cap pass');
  assert.ok(source.includes("addEventListener?.('resize'"), 'refit while open on resize');
  assert.ok(source.includes("removeEventListener?.('resize'"), 'resize listener torn down');
  assert.ok(source.includes('onBeforeUnmount'), 'listener torn down on unmount');
});

test('R7: menu carries no product names, mails, home paths or node imports', () => {
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
  const roots = ['ho' + 'me', 'Us' + 'ers', 'ro' + 'ot'].join('|');
  const homePath = new RegExp(`/(?:${roots})/[\\w.-]+`, 'i');
  assert.doesNotMatch(source, email, 'mail-shaped string');
  assert.doesNotMatch(source, homePath, 'absolute home path');
  assert.doesNotMatch(source, /from\s+['"][^'"]*node:/, 'node runtime import');
  assert.ok(!descriptor.template.content.includes('v-html'), 'never v-html');
});

test('imports use package boundaries and declared dependencies', () => assertPackageImports());
