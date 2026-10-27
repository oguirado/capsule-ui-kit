import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// R17 (PL4 H1): the kit ships alone, so no kit test may read outside
// packages/capsule-ui-kit. Static guard over every *.test.js under this
// directory (fixtures/ excluded: retired data, not tests; kit-boundary*
// excluded: this guard names the outside markers it forbids).
// Scope: path-ish string literals. Computed escapes with no literal marker
// stay a review duty.

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = resolve(HERE, '..');

/** Absolute POSIX prefixes that can only be host paths, never kit routes. */
const ABS_PREFIX = /^\/(tmp|home|root|work|Users|private|var|etc|opt|usr|data|mnt|srv)\//;
const WIN_ABS = /^[A-Za-z]:[\\/]/;
const DOTDOT = /(?:\.\.\/)+[A-Za-z0-9_@.\-/]*/g;

/**
 * String-literal spans with 1-based line numbers. Templates are blanked first
 * so quotes inside ${} cannot pair across.
 * @param {string} code
 * @returns {{text: string, line: number}[]}
 */
function literals(code) {
  const spans = [];
  const blanked = code.replace(/`(?:[^`\\]|\\.)*`/gs, (m, offset) => {
    spans.push({ text: m.slice(1, -1), index: offset });
    return ' '.repeat(m.length);
  });
  for (const re of [/'(?:[^'\\\n]|\\.)*'/g, /"(?:[^"\\\n]|\\.)*"/g]) {
    for (const m of blanked.matchAll(re)) spans.push({ text: m[0].slice(1, -1), index: m.index });
  }
  return spans.map((s) => ({ text: s.text, line: code.slice(0, s.index).split('\n').length }));
}

/**
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]}
 */
function collectTests(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'fixtures' || entry.name === 'node_modules') continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) collectTests(path, out);
    else if (entry.name.endsWith('.test.js') && !entry.name.startsWith('kit-boundary')) out.push(path);
  }
  return out;
}

/**
 * @param {string} file
 * @param {string} literal
 * @param {number} line
 * @param {string[]} hits
 */
function checkLiteral(file, literal, line, hits) {
  const tag = `${file}:${line}`;
  if (ABS_PREFIX.test(literal) || WIN_ABS.test(literal)) {
    hits.push(`${tag}: absolute host path ${JSON.stringify(literal)}`);
  }
  for (const m of literal.matchAll(DOTDOT)) {
    const resolved = resolve(dirname(file), m[0]);
    if (resolved !== KIT_ROOT && !resolved.startsWith(KIT_ROOT + sep)) {
      hits.push(`${tag}: escapes kit root: ${JSON.stringify(m[0])} -> ${resolved}`);
    }
  }
}

test('R17: no kit test reads outside packages/capsule-ui-kit', () => {
  const files = collectTests(HERE);
  assert.ok(files.length > 0, 'guard scanned zero test files');
  const hits = [];
  for (const file of files) {
    for (const { text, line } of literals(readFileSync(file, 'utf8'))) checkLiteral(file, text, line, hits);
  }
  assert.deepEqual(hits, [], `kit-boundary violations:\n${hits.join('\n')}`);
});
