import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import {
  areaAttr,
  polylineAttr,
  scalePoints,
  summarizeSeries,
  S1_CHART_HEIGHT,
  S1_CHART_WIDTH,
  S1_GRIDLINES,
} from '../src/widgets/chartGeometry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, rel), 'utf8');
const WIDGETS = ['S1StatusPill', 'S1KpiCard', 'S1KpiGrid', 'S1LineChart', 'S1DataTable'];
const sources = Object.fromEntries(WIDGETS.map((name) => [name, read(`../src/widgets/${name}.vue`)]));
const geometrySource = read('../src/widgets/chartGeometry.js');
const themeCss = read('../src/design/theme.css');
const themeVars = new Set(
  Array.from(themeCss.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((match) => match[1]),
);

test('widgets compile against the installed Vue compiler as plain JS (no lang="ts")', () => {
  for (const name of WIDGETS) {
    const file = `${name}.vue`;
    const { descriptor, errors } = parse(sources[name], { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: `widgets-${file}` });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: file,
      id: `widgets-${file}`,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
  }
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('widget styles use tokens only and every variable is declared in theme.css', () => {
  for (const name of WIDGETS) {
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

test('widgets carry no consumer names and import only vue plus widget siblings', () => {
  const allowed = new Set(['vue', './chartGeometry.js', './S1StatusPill.vue']);
  for (const name of WIDGETS) {
    const source = sources[name];
  assertPackageImports();
    for (const match of source.matchAll(/from '([^']+)'/g)) {
      assert.ok(allowed.has(match[1]), `${name}: unexpected import ${match[1]}`);
    }
  }
  assertPackageImports();
});

test('status pill and KPI card expose the S1 contract', () => {
  const pill = sources.S1StatusPill;
  for (const prop of ['label', 'tone']) assert.ok(pill.includes(prop), `pill/${prop}`);
  for (const tone of ['neutral', 'success', 'warning', 'info', 'error']) {
    assert.ok(pill.includes(`'${tone}'`), `pill/${tone}`);
  }
  for (const tone of ['success', 'warning', 'info', 'error']) {
    assert.ok(pill.includes(`s1-status-pill-${tone}`), `pill/${tone}`);
  }
  assert.ok(pill.includes('--cuk-semantic-status-success-text'));
  assert.ok(pill.includes('--cuk-semantic-status-warning-surface'));
  const card = sources.S1KpiCard;
  for (const prop of ['label', 'value', 'tone', 'sub']) assert.ok(card.includes(prop), `card/${prop}`);
  for (const tone of ['default', 'positive', 'negative', 'accent', 'muted']) {
    assert.ok(card.includes(`'${tone}'`), `card/${tone}`);
  }
  for (const tone of ['positive', 'negative', 'accent', 'muted']) {
    assert.ok(card.includes(`s1-kpi-value-${tone}`), `card/${tone}`);
  }
  assert.ok(card.includes('<article'));
  assert.ok(card.includes('--cuk-component-s1-kpi-value-font-size'));
  assert.ok(card.includes('--cuk-component-s1-kpi-value-font-family'));
  const grid = sources.S1KpiGrid;
  assert.ok(grid.includes('role="group"'));
  assert.ok(grid.includes('<slot'));
  assert.ok(grid.includes('--cuk-primitive-space-4'));
});

test('line chart exposes the S1 contract with its accessible table toggle', () => {
  const chart = sources.S1LineChart;
  for (const prop of ['title', 'meta', 'series', 'formatValue', 'emptyText', 'actionsLabel', 'tableCaption']) {
    assert.ok(chart.includes(prop), `chart/${prop}`);
  }
  assert.ok(chart.includes('name="actions"'));
  assert.ok(chart.includes('-table-toggle'));
  assert.ok(chart.includes('aria-expanded'));
  assert.ok(chart.includes('aria-controls'));
  assert.ok(chart.includes('role="img"'));
  assert.ok(chart.includes('<svg'));
  assert.ok(chart.includes('viewBox="0 0 500 80"'));
  assert.ok(chart.includes('<polyline'));
  assert.ok(chart.includes('S1_GRIDLINES'));
  assert.ok(chart.includes('<table'));
  assert.ok(chart.includes('Show data'));
  assert.ok(chart.includes('s1-action-btn-primary'));
  assert.ok(chart.includes('--cuk-component-s1-table-row-height'));
});

test('data table exposes the S1 contract with every column kind', () => {
  const table = sources.S1DataTable;
  for (const prop of ['label', 'role', 'columns', 'rows', 'rowKey', 'rowAttrs', 'cellAttrs', 'cellText', 'cellValue', 'stickyHeader', 'emptyText', 'tableAttrs', 'caption']) {
    assert.ok(table.includes(prop), `table/${prop}`);
  }
  for (const slot of ['header-cell', 'cell', 'row-actions', 'empty']) {
    assert.ok(table.includes(`name="${slot}"`), `slot/${slot}`);
  }
  for (const kind of ['identity', 'level', 'bar', 'money', 'status', 'actions']) {
    assert.ok(table.includes(`'${kind}'`), `kind/${kind}`);
  }
  assert.ok(table.includes("'row-action'"));
  assert.ok(table.includes("from './S1StatusPill.vue'"));
  assert.ok(table.includes('gridcell'));
  assert.ok(table.includes('columnheader'));
  assert.ok(table.includes('aria-rowindex'));
  assert.ok(table.includes('s1-data-table-sticky'));
  assert.ok(table.includes('::-webkit-scrollbar'));
  assert.ok(table.includes('scrollbar-width'));
  assert.ok(table.includes('--cuk-component-s1-table-header-height'));
  assert.ok(table.includes('--cuk-component-s1-table-row-height'));
  assert.ok(table.includes('--cuk-component-s1-morale-bar-width'));
  assert.ok(table.includes('--cuk-component-s1-morale-bar-height'));
});

test('chart geometry scales series onto the 500x80 export grid', () => {
  assert.equal(S1_CHART_WIDTH, 500);
  assert.equal(S1_CHART_HEIGHT, 80);
  assert.deepEqual(S1_GRIDLINES, [
    { y: 20, dashed: true },
    { y: 45, dashed: true },
    { y: 70, dashed: false },
  ]);
  assert.deepEqual(scalePoints([0, 50, 100]), [
    { x: 4, y: 72 },
    { x: 250, y: 39 },
    { x: 496, y: 6 },
  ]);
  assert.deepEqual(scalePoints([5, 5, 5]).map((point) => point.y), [39, 39, 39]);
  assert.deepEqual(scalePoints([7]), [{ x: 250, y: 39 }]);
  assert.deepEqual(scalePoints([]), []);
  const scaled = scalePoints([0, 100]);
  assert.equal(polylineAttr(scaled), '4,72 496,6');
  assert.equal(areaAttr(scaled), 'M4,80 L4,72 L496,6 L496,80 Z');
  assert.equal(areaAttr([]), '');
  assert.equal(summarizeSeries('Cash', [1, 2, 3]), 'Cash: last 3 (min 1, max 3, 3 points)');
  assert.equal(summarizeSeries('Cash', []), 'Cash: no data');
});
