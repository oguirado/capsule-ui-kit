import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Hashed deny-list: sha256 hex of lowercased terms. No term appears here.
const FORBIDDEN_HASHES = new Set([
  '3b122b9d4638c4ddb162f8b7c7de993f1ed87faafb21796fcebe2540fe6d8f4d',
  'f3e0f62e477c2a77c0e0030333940766ebf08b2bccac871646ac86aea5672e01',
  '3b0493733cf2cf82565a9a7ac636f0d6298bf4b2530e1ad017aeb1de4a735933',
  'b8412a7082b42c4b616e8349ad13462a8650ff4706388191ab3b530013eed281',
  '4d0f43f3e81b83426c793bc8b321d5c1930c909ac3f27a83821fcac0718c2343',
  '3a7a45ec9c91cfab9b56ba3c34cc1e0086a739987b5f547514d8561f5623c745',
  '4526396bddaf5799499e344f4ba219846d008bef46fe662b6c29d6c07b330765',
  '94819eaebc292ccdf747102ba9dc6f452e0b7fbbb7b80bdd17e3e7fcb36e2833',
  'd2779f2492ad4922036cb8054402ba72b67485f002e986e5df903f914b69a992',
]);
const FORBIDDEN_LENS = [5, 6, 8, 10, 11, 12, 21, 30];

function sha256hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function findForbiddenHash(lower) {
  const runs = lower.split(/[^a-z0-9_./-]+/);
  for (const run of runs) {
    for (const len of FORBIDDEN_LENS) {
      if (run.length < len) continue;
      for (let i = 0; i + len <= run.length; i += 1) {
        const digest = sha256hex(run.slice(i, i + len));
        if (FORBIDDEN_HASHES.has(digest)) return digest;
      }
    }
  }
  return null;
}

function assertPublishable(text, label) {
  const normalized = text.toLowerCase();
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
    `${label}: e-mail-shaped string`);
  const roots = ['ho' + 'me', 'Us' + 'ers', 'ro' + 'ot'].join('|');
  assert.doesNotMatch(text, new RegExp(`/(?:${roots})/[\\w.-]+`, 'i'),
    `${label}: absolute home path`);
  assert.doesNotMatch(text, /[A-Za-z]:\\+(?:Us)(?:ers)\\+[\w.-]+/i,
    `${label}: absolute Windows home path`);
  const hit = findForbiddenHash(normalized);
  assert.equal(hit, null, `${label}: private path or internal name (hash ${hit})`);
}

// Rebuilt samples without spelling terms: char codes of lowercased terms.
const FORBIDDEN_CODES = [
  [47, 104, 111, 109, 101, 47],
  [109, 101, 116, 97, 118, 105, 101, 119, 101, 114],
  [104, 111, 108, 100, 105, 110, 103, 115, 45, 105, 110, 116],
  [104, 111, 108, 100, 105, 110, 103, 115],
  [116, 101, 97, 109, 119, 111, 114, 107, 95, 97, 110, 116, 105, 103, 114, 97, 118, 105, 116, 121, 50],
  [118, 105, 115, 117, 97, 108, 45, 113, 97, 45, 48],
  [97, 114, 95, 107, 95],
  [112, 97, 112, 101, 114, 115, 109, 97, 116, 104, 45, 48],
  [111, 114, 113, 117, 101, 115, 116, 97, 100, 111, 114, 95, 119, 97, 118, 101, 109, 105, 110, 100, 95, 112, 114, 111, 121, 101, 99, 116, 111, 115],
];

test('publication guard rejects each forbidden in-memory sample (must-FAIL)', () => {
  assert.equal(FORBIDDEN_CODES.length, FORBIDDEN_HASHES.size);
  for (const codes of FORBIDDEN_CODES) {
    const term = String.fromCharCode(...codes);
    assert.ok(FORBIDDEN_HASHES.has(sha256hex(term)));
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
