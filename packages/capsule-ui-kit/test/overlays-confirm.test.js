import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, rel), 'utf8');
const OVERLAYS = ['ConfirmDialog'];
const sources = Object.fromEntries(OVERLAYS.map((name) => [name, read(`../src/overlays/${name}.vue`)]));
const themeCss = read('../src/design/theme.css');
const themeVars = new Set(
  Array.from(themeCss.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((match) => match[1]),
);

test('confirm dialog compiles against the installed Vue compiler as plain JS (no lang="ts")', () => {
  for (const name of OVERLAYS) {
    const file = `${name}.vue`;
    const { descriptor, errors } = parse(sources[name], { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: `overlays-${file}` });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: file,
      id: `overlays-${file}`,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
  }
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('overlay styles use tokens only and every variable is declared in theme.css', () => {
  for (const name of OVERLAYS) {
    const file = `${name}.vue`;
    const { descriptor } = parse(sources[name], { filename: file });
    assert.ok(descriptor.styles.length > 0, file);
    for (const style of descriptor.styles) {
      assert.equal(rawStyle(style.content), false, file);
      for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
        assert.ok(themeVars.has(match[1]), `${file}: undeclared token ${match[1]}`);
      }
    }
  }
});

test('overlay carries no consumer names and imports only vue', () => {
  const allowed = new Set(['vue']);
  for (const name of OVERLAYS) {
    const source = sources[name];
    assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(source), name);
    assert.doesNotMatch(source, /from\s+['"][^'"]*(?:app\/shell|src\/renderer|\u0068oldings\.owner|node:)/i);
    for (const match of source.matchAll(/from '([^']+)'/g)) {
      assert.ok(allowed.has(match[1]), `${name}: unexpected import ${match[1]}`);
    }
  }
});

test('confirm dialog exposes the generic consent contract', () => {
  const dialog = sources.ConfirmDialog;
  for (const prop of ['id', 'title', 'description', 'open', 'confirmLabel', 'backLabel', 'confirmDisabled', 'busy']) {
    assert.ok(dialog.includes(prop), `dialog/${prop}`);
  }
  for (const event of ['confirm', 'back']) {
    assert.ok(dialog.includes(`'${event}'`), `event/${event}`);
  }
  assert.ok(dialog.includes('role="dialog"'));
  assert.ok(dialog.includes('aria-modal'));
  assert.ok(dialog.includes('aria-labelledby'));
  assert.ok(dialog.includes('aria-describedby'));
  assert.ok(dialog.includes(`id + '-title'`));
  assert.ok(dialog.includes(`id + '-desc'`));
  assert.ok(dialog.includes(`id + '-back'`));
  assert.ok(dialog.includes(`id + '-confirm'`));
  assert.ok(dialog.includes('tabindex="-1"'));
  assert.ok(dialog.includes('keydown.escape'));
  assert.ok(dialog.includes('.focus()'));
  assert.ok(dialog.includes('<slot'));
  assert.ok(dialog.includes('s1-confirm-backdrop'));
  assert.ok(dialog.includes('s1-confirm-panel'));
  assert.ok(dialog.includes('s1-confirm-btn-primary'));
  assert.ok(dialog.includes('--cuk-component-dialog-host-backdrop'));
  assert.ok(dialog.includes('--cuk-component-dialog-host-surface'));
  assert.ok(dialog.includes('--cuk-component-dialog-host-border-color'));
  assert.ok(dialog.includes('--cuk-component-dialog-host-border-radius'));
  assert.ok(dialog.includes('--cuk-component-dialog-host-z-index'));
});
