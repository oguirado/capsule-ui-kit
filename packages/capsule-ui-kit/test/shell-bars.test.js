import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchControlFamily } from '../src/agent/controlRegistry.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const TOPBAR = path.resolve(here, '../src/shell/TopBar.vue');
const STATUSBAR = path.resolve(here, '../src/shell/StatusBar.vue');
const topSource = readFileSync(TOPBAR, 'utf8');
const statusSource = readFileSync(STATUSBAR, 'utf8');

function loadCompilerSfc() {
  for (const spec of ['@vue/compiler-sfc', '@vue/compiler-sfc']) {
    try {
      return require(spec);
    } catch {
      // try next candidate
    }
  }
  throw new Error('Unable to resolve @vue/compiler-sfc');
}

test('shell bars compile against the installed Vue compiler as plain JS (no lang="ts")', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  for (const [file, source] of [['TopBar.vue', topSource], ['StatusBar.vue', statusSource]]) {
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: 'shell-bars-' + file });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: file,
      id: 'shell-bars-' + file,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
  }
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('shell bar styles use tokens only (no literal colors or px/rem sizes)', () => {
  const { parse } = loadCompilerSfc();
  for (const [file, source] of [['TopBar.vue', topSource], ['StatusBar.vue', statusSource]]) {
    const { descriptor } = parse(source, { filename: file });
    assert.ok(descriptor.styles.length > 0, file);
    for (const style of descriptor.styles) {
      assert.equal(rawStyle(style.content), false, file);
    }
  }
});

test('top bar exposes the S1 slot/prop/event contract with stable control ids', () => {
  for (const slot of ['nav', 'identity', 'context', 'search', 'cluster', 'speed', 'actions', 'actions-extra', 'primary']) {
    assert.ok(topSource.includes(`name="${slot}"`), 'slot ' + slot);
  }
  for (const prop of ['product', 'searchPlaceholder', 'paletteTitle', 'paletteItems', 'unreadCount', 'newLabel', 'speeds', 'navExpanded']) {
    assert.ok(topSource.includes(prop), 'prop ' + prop);
  }
  for (const event of ['open', 'new-capsule', 'speed-change', 'notifications-open', 'help-open', 'toggle-nav']) {
    assert.ok(topSource.includes(`'${event}'`), 'event ' + event);
  }
  for (const id of ['shell/header', 'shell/navigation/toggle', 'shell-command-open', 'shell-command-input', 'shell-command-palette', 'shell/topbar/notifications', 'shell/topbar/help', 'shell/topbar/new']) {
    assert.ok(topSource.includes(id), 'id ' + id);
  }
  for (const role of ['banner', 'group', 'list', 'status']) {
    assert.ok(topSource.includes(`role="${role}"`), 'role ' + role);
  }
  assert.ok(topSource.includes('aria-keyshortcuts="Control+K"'));
  assert.ok(topSource.includes('openPalette'));
});

test('status bar exposes the S1 slot/prop/event contract with stable control ids', () => {
  for (const slot of ['breadcrumb', 'telemetry', 'shortcuts']) {
    assert.ok(statusSource.includes(`name="${slot}"`), 'slot ' + slot);
  }
  for (const prop of ['crumbs', 'telemetry', 'shortcuts']) {
    assert.ok(statusSource.includes(prop), 'prop ' + prop);
  }
  assert.ok(statusSource.includes("'shortcut-activate'"));
  for (const id of ['shell/statusbar', 'shell/statusbar/shortcuts-dialog', 'shell/statusbar/shortcuts-close']) {
    assert.ok(statusSource.includes(id), 'id ' + id);
  }
  for (const role of ['contentinfo']) {
    assert.ok(statusSource.includes(`role="${role}"`), 'role ' + role);
  }
  assert.ok(statusSource.includes('aria-label="Breadcrumb"'));
  assert.ok(statusSource.includes('openShortcuts'));
});

test('every semantic anchor on the bars matches a declared control family', () => {
  for (const [file, source] of [['TopBar.vue', topSource], ['StatusBar.vue', statusSource]]) {
    const anchors = Array.from(source.matchAll(/data-semantic-anchor="([^"]+)"/g)).map((m) => m[1]);
    assert.ok(anchors.length > 0, file);
    for (const anchor of anchors) {
      if (anchor.includes("' +") || anchor.includes('+ ')) continue;
      const rule = matchControlFamily(anchor);
      assert.ok(rule, `${file}: undeclared anchor ${anchor}`);
    }
    const dynamic = Array.from(source.matchAll(/:data-semantic-anchor="'([^']+)' \+/g)).map((m) => `${m[1]}probe-1x`);
    for (const anchor of dynamic) {
      assert.ok(matchControlFamily(anchor), `${file}: undeclared anchor family ${anchor}`);
    }
  }
});

test('kit bars carry no consumer names and import only the Dialog vendor primitive', () => {
  for (const [file, source] of [['TopBar.vue', topSource], ['StatusBar.vue', statusSource]]) {
    assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(source), file);
    const vendor = Array.from(source.matchAll(/from '(openvue\/[^']+)'/g)).map((m) => m[1]);
    assert.deepEqual(new Set(vendor), new Set(['openvue/dialog']), file);
  }
  for (const icon of ['bars', 'thlarge', 'search', 'plus', 'infocircle']) {
    let found = false;
    try {
      require.resolve(`@openvue/icons/${icon}`);
      found = true;
    } catch {
      found = existsSync(path.resolve(here, `../node_modules/@openvue/icons/${icon}/index.mjs`));
    }
    assert.ok(found, 'icon ' + icon);
  }
});
