import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const TOPBAR = path.resolve(here, '../src/shell/TopBar.vue');
const topSource = readFileSync(TOPBAR, 'utf8');

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

function styleText() {
  const { parse } = loadCompilerSfc();
  const { descriptor } = parse(topSource, { filename: 'TopBar.vue' });
  assert.ok(descriptor.styles.length > 0);
  return descriptor.styles.map((style) => style.content).join('\n');
}

test('top bar never scrolls horizontally (pl1-008)', () => {
  const css = styleText();
  const bar = css.match(/\.s1-topbar\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(/overflow-x:\s*(hidden|clip)/.test(bar), 'bar clips horizontal overflow');
  assert.equal(/overflow-x:\s*(auto|scroll)/.test(bar), false, 'no horizontal scrollbar');
});

test('narrow viewports collapse labels to icons with names kept (pl1-008)', () => {
  const css = styleText();
  assert.ok(css.includes('@media (max-width: 80em)'), 'narrow breakpoint at 80em');
  const narrow = css.slice(css.indexOf('@media (max-width: 80em)'));
  assert.ok(/\.s1-topbar-new-label\s*\{\s*display:\s*none/.test(narrow), 'primary label collapses');
  assert.ok(/\.s1-topbar-kbd\s*\{\s*display:\s*none/.test(narrow), 'kbd hint collapses');
  assert.ok(/\.s1-topbar-wordmark\s*\{[^}]*text-overflow:\s*ellipsis/.test(narrow), 'wordmark ellipsizes');
  assert.ok(topSource.includes('class="s1-topbar-new-label"'), 'label span carries the collapse class');
  assert.ok(topSource.includes(':aria-label="newLabel"'), 'accessible name stays bound');
  assert.ok(topSource.includes(':title="newLabel"'), 'tooltip keeps the label for sighted users');
});

test('search region flexes instead of forcing overflow (pl1-008)', () => {
  const css = styleText();
  const search = css.match(/\.s1-topbar \.s1-topbar-search\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(search.includes('max-width: 100%'), 'search clamps to the center region');
  assert.ok(search.includes('min-width: 0'), 'search has no rigid minimum');
  const center = css.match(/\.s1-topbar-center\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(center.includes('min-width: 0'), 'center region may shrink');
});
