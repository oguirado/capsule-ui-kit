import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Escape the initial character so the guard can scan its own source unchanged.
const forbidden = [
  ['', 'home', ''].join('/'),
  '\u004detaViewer',
  '\u0048oldings-int',
  '\u0048oldings',
  '\u0054eamWork_Antigravity2',
  '\u0076isual-qa-0',
  '\u0061r_k_',
  '\u0070apersmath-0',
  '\u004fRQUESTADOR_WAVEMIND_PROYECTOS',
];

function assertPublishable(text, label) {
  const normalized = text.toLowerCase();
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
    `${label}: e-mail-shaped string`);
  const roots = ['ho' + 'me', 'Us' + 'ers', 'ro' + 'ot'].join('|');
  assert.doesNotMatch(text, new RegExp(`/(?:${roots})/[\\w.-]+`, 'i'),
    `${label}: absolute home path`);
  assert.doesNotMatch(text, /[A-Za-z]:\\+(?:Us)(?:ers)\\+[\w.-]+/i,
    `${label}: absolute Windows home path`);
  for (const term of forbidden) {
    assert.equal(normalized.includes(term.toLowerCase()), false,
      `${label}: private path or internal name (${term})`);
  }
}

test('publication guard rejects each forbidden in-memory sample (must-FAIL)', () => {
  for (const term of forbidden) {
    for (const sample of [term, term.toUpperCase()]) {
      assert.throws(() => assertPublishable(`prefix ${sample} suffix`, 'sample'),
        { code: 'ERR_ASSERTION' });
    }
  }
  assert.doesNotThrow(() => assertPublishable(
    'See docs/UI_ARCHITECTURE.md in the consuming product; Vue 3.5.43.', 'clean'));
});

test('entire publication tree is free of private paths and internal names', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      const label = relative(root, path);
      assertPublishable(label, 'filename');
      assert.equal(entry.isSymbolicLink(), false, `${label}: external reference`);
      if (entry.isDirectory()) walk(path);
      else assertPublishable(readFileSync(path, 'utf8'), label);
    }
  }
  walk(root);
});

test('publication guard rejects address-shaped and home-path runtime fixtures (must-FAIL)', () => {
  const samples = [
    ['reviewer', 'private.invalid'].join('@'),
    ['person+tag', 'sub.example.test'].join('@'),
    ['vue', '3.5.43'].join('@'),
    ['', 'ho' + 'me', 'tester', 'private.txt'].join('/'),
    ['', 'Us' + 'ers', 'tester', 'private.txt'].join('/'),
    ['', 'ro' + 'ot', 'private.txt'].join('/'),
    ['C:', 'Us' + 'ers', 'tester', 'private.txt'].join('\\'),
  ];
  for (const sample of samples) {
    assert.throws(() => assertPublishable(sample, 'runtime fixture'), { code: 'ERR_ASSERTION' });
  }
  assert.doesNotThrow(() => assertPublishable('vue version 3.5.43; @vue/compiler-sfc', 'clean'));
});
