import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  centerTextLength,
  DONUT_CENTER_TEXT_MAX_WIDTH,
  DONUT_RADIUS,
} from '../src/widgets/DonutGeometry.js';

// PL2 K3: donut centre text fits inside the ring at every rendered size
// (1920 "Shares charted" overlap). ViewBox units scale with the render.

test('centre shrink only engages past the inner edge', () => {
  assert.equal(DONUT_CENTER_TEXT_MAX_WIDTH, 60);
  assert.ok(DONUT_CENTER_TEXT_MAX_WIDTH < (DONUT_RADIUS - 7) * 2);
  assert.equal(centerTextLength(47), null);
  assert.equal(centerTextLength(60), null);
  assert.equal(centerTextLength(84), 60);
  assert.equal(centerTextLength(60.001), 60);
  assert.equal(centerTextLength(0), null);
  assert.equal(centerTextLength(-3), null);
  assert.equal(centerTextLength(Number.NaN), null);
  assert.equal(centerTextLength('84'), null);
  assert.equal(centerTextLength(84, 0), null);
  assert.equal(centerTextLength(84, -5), null);
});

test('DonutChart measures and clamps both centre lines', () => {
  const source = readFileSync(new URL('../src/widgets/DonutChart.vue', import.meta.url), 'utf8');
  assert.ok(source.includes('centerTextLength'));
  assert.ok(source.includes('getComputedTextLength'));
  assert.ok(source.includes('lengthAdjust="spacingAndGlyphs"'));
  assert.ok(source.includes('ref="centerValueRef"'));
  assert.ok(source.includes('ref="centerLabelRef"'));
  assert.ok(source.includes("setAttribute('textLength'"));
  assert.ok(source.includes("removeAttribute('textLength'"));
  assert.ok(source.includes('onMounted'));
  assert.ok(source.includes('onUpdated'));
});
