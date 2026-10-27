import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, rel), 'utf8');
const source = read('../src/widgets/InspectorPanel.vue');
const themeCss = read('../src/design/theme.css');
const themeVars = new Set(
  Array.from(themeCss.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((match) => match[1]),
);

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

test('inspector compiles against the installed Vue compiler as plain JS (no lang="ts")', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  const file = 'InspectorPanel.vue';
  const { descriptor, errors } = parse(source, { filename: file });
  assert.deepEqual(errors, [], file);
  assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
  const script = compileScript(descriptor, { id: 'widgets-inspector' });
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: file,
    id: 'widgets-inspector',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, [], file);
});

const rawStyle = (content) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(content);

test('inspector styles use tokens only and every variable is declared in theme.css', () => {
  const { parse } = loadCompilerSfc();
  const { descriptor } = parse(source, { filename: 'InspectorPanel.vue' });
  assert.ok(descriptor.styles.length > 0, 'styles');
  for (const style of descriptor.styles) {
    assert.equal(rawStyle(style.content), false, 'InspectorPanel.vue');
    for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
      assert.ok(themeVars.has(match[1]), `undeclared token ${match[1]}`);
    }
  }
});

test('inspector carries no consumer names and imports only vue plus widget siblings', () => {
  assertPackageImports();
  const allowed = new Set(['vue', './S1StatusPill.vue']);
  for (const match of source.matchAll(/from '([^']+)'/g)) {
    assert.ok(allowed.has(match[1]), `unexpected import ${match[1]}`);
  }
});

test('inspector exposes the side-panel contract with sections, tiles and actions', () => {
  for (const prop of ['id', 'title', 'subject', 'headline', 'headlineNote', 'dismissLabel', 'factsTitle', 'facts', 'ledgerTitle', 'ledgerBadge', 'ledgerRows', 'ledgerTotal', 'ledgerFoot', 'matrixTitle', 'matrixNote', 'matrixTiles', 'actions', 'actionsLabel', 'emptyText']) {
    assert.ok(source.includes(prop), `prop/${prop}`);
  }
  assert.ok(source.includes("'action'"), 'event action');
  assert.ok(source.includes("'dismiss'"), 'event dismiss');
  assert.ok(source.includes('name="actions"'), 'slot actions');
  assert.ok(source.includes('name="empty"'), 'slot empty');
  assert.ok(source.includes('<aside'), 'aside');
  assert.ok(source.includes(':aria-label="title"'), 'panel name');
  assert.ok(source.includes('<dl'), 'facts list');
  assert.ok(source.includes('<ul'), 'tiles list');
  assert.ok(source.includes('role="group"'), 'actions group');
  assert.ok(source.includes(':aria-label="actionsLabel"'), 'actions name');
  assert.ok(source.includes("id + '-dismiss'"), 'dismiss id');
  assert.ok(source.includes(':aria-label="dismissLabel"'), 'dismiss name');
  assert.ok(source.includes('role="status"'), 'empty status');
  for (const kind of ['primary', 'secondary', 'ghost', 'danger']) {
    assert.ok(source.includes(`'${kind}'`), `kind/${kind}`);
    assert.ok(source.includes(`s1-inspector-btn-${kind}`), `class/${kind}`);
  }
  for (const tone of ['success', 'warning', 'error', 'info']) {
    assert.ok(source.includes(`'${tone}'`), `tone/${tone}`);
    assert.ok(source.includes(`s1-inspector-tone-${tone}`), `tone-class/${tone}`);
  }
  assert.ok(source.includes('S1StatusPill'), 'ledger badge pill');
  assert.ok(source.includes('--cuk-component-inspector-panel-label-color'), 'label token');
  assert.ok(source.includes('--cuk-component-inspector-panel-value-color'), 'value token');
  assert.ok(source.includes('--cuk-semantic-status-error-surface'), 'danger token');
});
