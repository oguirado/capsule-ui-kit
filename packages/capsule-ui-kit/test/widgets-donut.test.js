import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import {
  donutSlices,
  summarizeSlices,
  toneFor,
  DONUT_CENTER,
  DONUT_GAP,
  DONUT_RADIUS,
  DONUT_SIZE,
  DONUT_TONES,
} from '../src/widgets/DonutGeometry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, rel), 'utf8');
const WIDGETS = ['DonutChart'];
const sources = Object.fromEntries(WIDGETS.map((name) => [name, read(`../src/widgets/${name}.vue`)]));
const geometrySource = read('../src/widgets/DonutGeometry.js');
const themeCss = read('../src/design/theme.css');
const themeVars = new Set(
  Array.from(themeCss.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((match) => match[1]),
);

test('donut chart compiles against the installed Vue compiler as plain JS (no lang="ts")', () => {
  for (const name of WIDGETS) {
    const file = `${name}.vue`;
    const { descriptor, errors } = parse(sources[name], { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: `widgets-donut-${file}` });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: file,
      id: `widgets-donut-${file}`,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
  }
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('donut styles use tokens only and every variable is declared in theme.css', () => {
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

test('donut carries no consumer names and imports only vue plus widget siblings', () => {
  const allowed = new Set(['vue', './DonutGeometry.js']);
  for (const name of WIDGETS) {
    const source = sources[name];
    assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(source), name);
    assert.doesNotMatch(source, /from\s+['"][^'"]*(?:app\/shell|src\/renderer|\u0068oldings\.owner|node:)/i);
    for (const match of source.matchAll(/from '([^']+)'/g)) {
      assert.ok(allowed.has(match[1]), `${name}: unexpected import ${match[1]}`);
    }
  }
  assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(geometrySource), 'DonutGeometry');
});

test('donut chart exposes the S1 contract with its own SVG and table toggle', () => {
  const chart = sources.DonutChart;
  for (const prop of ['id', 'title', 'meta', 'totalLabel', 'totalValue', 'slices', 'formatValue', 'emptyText', 'actionsLabel', 'tableCaption']) {
    assert.ok(chart.includes(prop), `chart/${prop}`);
  }
  assert.ok(chart.includes('name="actions"'));
  assert.ok(chart.includes('-table-toggle'));
  assert.ok(chart.includes('aria-expanded'));
  assert.ok(chart.includes('aria-controls'));
  assert.ok(chart.includes('role="img"'));
  assert.ok(chart.includes('<svg'));
  assert.ok(chart.includes('viewBox="0 0 120 120"'));
  assert.ok(chart.includes('<circle'));
  assert.ok(chart.includes('pathLength'));
  assert.ok(chart.includes('rotate(-90 60 60)'));
  assert.ok(chart.includes('s1-donut-track'));
  assert.ok(chart.includes('s1-donut-center-value'));
  assert.ok(chart.includes('s1-donut-legend'));
  assert.ok(chart.includes('<table'));
  assert.ok(chart.includes('Show data'));
  assert.ok(chart.includes('donutSlices'));
  for (const tone of ['primary', 'tertiary', 'success', 'info', 'warning', 'error', 'muted']) {
    assert.ok(chart.includes(`s1-donut-slice-${tone}`), `slice/${tone}`);
    assert.ok(chart.includes(`s1-donut-swatch-${tone}`), `swatch/${tone}`);
  }
});

test('donut geometry scales values onto the 120x120 export ring', () => {
  assert.equal(DONUT_SIZE, 120);
  assert.equal(DONUT_CENTER, 60);
  assert.equal(DONUT_RADIUS, 47);
  assert.equal(DONUT_GAP, 1.5);
  assert.deepEqual([...DONUT_TONES], ['primary', 'tertiary', 'success', 'info', 'warning', 'error', 'muted']);
  assert.deepEqual(donutSlices([]), []);
  assert.deepEqual(
    donutSlices([0, -4, Number.NaN]).map((slice) => [slice.fraction, slice.dashArray, slice.dashOffset]),
    [[0, '0 100', 0], [0, '0 100', 0], [0, '0 100', 0]],
  );
  assert.deepEqual(donutSlices([50]), [
    { value: 50, fraction: 1, pct: 100, dashArray: '100 100', dashOffset: 0 },
  ]);
  assert.deepEqual(donutSlices([1, 1]), [
    { value: 1, fraction: 0.5, pct: 50, dashArray: '48.5 100', dashOffset: 0 },
    { value: 1, fraction: 0.5, pct: 50, dashArray: '48.5 100', dashOffset: -50 },
  ]);
  assert.deepEqual(donutSlices([1, 3]), [
    { value: 1, fraction: 0.25, pct: 25, dashArray: '23.5 100', dashOffset: 0 },
    { value: 3, fraction: 0.75, pct: 75, dashArray: '73.5 100', dashOffset: -25 },
  ]);
  const mixed = donutSlices([2, 0, 2]);
  assert.equal(mixed[1]?.dashArray, '0 100');
  assert.equal(mixed[0]?.dashArray, '48.5 100');
  assert.equal(mixed[2]?.dashOffset, -50);
  assert.equal(toneFor('success', 0), 'success');
  assert.equal(toneFor('bogus', 0), 'primary');
  assert.equal(toneFor(undefined, 1), 'tertiary');
  assert.equal(toneFor(undefined, 7), 'primary');
  assert.equal(summarizeSlices('Own', []), 'Own: no data');
  assert.equal(summarizeSlices('Own', [2, 3]), 'Own: total 5 across 2 slices');
  assert.equal(summarizeSlices('Own', [4]), 'Own: total 4 across 1 slice');
});
