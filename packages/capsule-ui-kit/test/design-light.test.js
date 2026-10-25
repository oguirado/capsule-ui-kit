import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenValue, validateTokenContract } from '../src/design/tokenContract.js';

// S7 daylight theme: light values resolve per the Stitch S7 export, semantic
// colors keep WCAG AA contrast, and every dark S1 value stays unchanged.

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const tokens = JSON.parse(text('src/design/tokens.json'));
const css = text('src/design/theme.css');

function luminance(hex) {
  const a = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('S7 contract validates and keeps the pinned light values', () => {
  assert.ok(validateTokenContract(tokens).leaves > 0);
  const pinned = {
    'semantic.surface.canvas': '#f1f5f9',
    'semantic.surface.panel': '#ffffff',
    'semantic.text.primary': '#0f172a',
    'semantic.text.muted': '#475569',
    'semantic.accent.primary': '#2563eb',
  };
  for (const [path, hex] of Object.entries(pinned)) assert.equal(tokenValue(path, 'light.normal'), hex, path);
});

test('S7 hover and elevation resolve per scheme with dark values unchanged', () => {
  assert.equal(tokenValue('semantic.surface.hoverS1', 'light.normal'), '#f8fafc');
  assert.equal(tokenValue('semantic.surface.hoverS1', 'light.high'), '#e2e8f0');
  assert.equal(tokenValue('semantic.surface.hoverS1', 'dark.normal'), '#182234');
  assert.equal(tokenValue('semantic.surface.hoverS1', 'dark.high'), '#182234');
  const light = {
    floatingShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
    scrollbarShadow: 'inset 0 4px 6px -4px rgba(15, 23, 42, 0.12)',
    s1Floating: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)',
  };
  const dark = {
    floatingShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.35)',
    scrollbarShadow: 'inset 0 4px 6px -4px rgba(0, 0, 0, 0.35)',
    s1Floating: '0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(51, 65, 85, 0.4)',
  };
  for (const [key, value] of Object.entries(light)) {
    assert.equal(tokenValue(`semantic.elevation.${key}`, 'light.normal'), value, key);
    assert.equal(tokenValue(`semantic.elevation.${key}`, 'light.high'), value, key);
  }
  for (const [key, value] of Object.entries(dark)) {
    assert.equal(tokenValue(`semantic.elevation.${key}`, 'dark.normal'), value, key);
    assert.equal(tokenValue(`semantic.elevation.${key}`, 'dark.high'), value, key);
  }
});

test('generated theme.css carries the S7 light variables without touching dark output', () => {
  assert.ok(css.includes('--cuk-semantic-surface-hover-s1: var(--cuk-primitive-color-neutral-50);'));
  assert.ok(css.includes('--cuk-semantic-surface-hover-s1: #182234;'));
  assert.ok(css.includes('--cuk-semantic-elevation-s1-floating: 0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03);'));
  assert.ok(css.includes('--cuk-semantic-elevation-s1-floating: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(51, 65, 85, 0.4);'));
  assert.ok(!css.includes('undefined'));
});

test('S7 semantic colors satisfy WCAG AA in both schemes', () => {
  for (const mode of ['light.normal', 'dark.normal']) {
    for (const status of ['success', 'warning', 'error', 'info']) {
      const textRatio = contrast(tokenValue(`semantic.status.${status}.text`, mode), tokenValue(`semantic.status.${status}.surface`, mode));
      assert.ok(textRatio >= 4.5, `${mode}/${status} text: ${textRatio}`);
      const borderRatio = contrast(tokenValue(`semantic.status.${status}.border`, mode), tokenValue(`semantic.status.${status}.surface`, mode));
      assert.ok(borderRatio >= 3, `${mode}/${status} border: ${borderRatio}`);
    }
    for (const fg of ['primary', 'muted']) {
      for (const bg of ['canvas', 'panel', 'chrome', 'elevated', 'sunken', 'interactive', 'hoverS1']) {
        const ratio = contrast(tokenValue('semantic.text.' + fg, mode), tokenValue('semantic.surface.' + bg, mode));
        assert.ok(ratio >= 4.5, `${mode}/${fg}/${bg}: ${ratio}`);
      }
    }
    const badge = contrast(tokenValue('semantic.accent.primaryContrast', mode), tokenValue('semantic.accent.primary', mode));
    assert.ok(badge >= 4.5, `${mode}/badge: ${badge}`);
    const accent = contrast(tokenValue('semantic.accent.primary', mode), tokenValue('semantic.surface.canvas', mode));
    assert.ok(accent >= 3, `${mode}/accent-on-canvas: ${accent}`);
  }
});

test('S7 overlay and terminal surfaces resolve in the light scheme', () => {
  assert.equal(tokenValue('component.dialogHost.surface', 'light.normal'), '#ffffff');
  assert.equal(tokenValue('component.dialogHost.backdrop', 'light.normal'), 'rgba(15, 23, 42, 0.45)');
  assert.equal(tokenValue('semantic.terminal.background', 'light.normal'), '#f8fafc');
  assert.equal(tokenValue('semantic.terminal.foreground', 'light.normal'), '#0f172a');
  const terminal = contrast(tokenValue('semantic.terminal.foreground', 'light.normal'), tokenValue('semantic.terminal.background', 'light.normal'));
  assert.ok(terminal >= 4.5, `light/terminal: ${terminal}`);
});
