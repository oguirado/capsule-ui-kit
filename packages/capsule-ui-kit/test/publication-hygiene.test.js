import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assertPublishable, assertPackageImports, assertSourceImports, packageRoot } from './publication-rules.js';

test('publication tree contains no host paths, addresses, credentials or symlinks', () => {
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const filename = join(directory, entry.name);
      const label = relative(packageRoot, filename);
      assertPublishable(label, 'filename');
      assert.equal(entry.isSymbolicLink(), false, `${label}: symlink`);
      if (entry.isDirectory()) walk(filename);
      else assertPublishable(readFileSync(filename, 'utf8'), label);
    }
  }
  walk(packageRoot);
});

test('generic hygiene rejects planted host paths, e-mail and credentials', () => {
  const samples = [
    ['', 'home', 'tester', 'file'].join('/'),
    ['', 'Users', 'tester', 'file'].join('/'),
    ['C:', 'Users', 'tester', 'file'].join('\\'),
    ['reviewer', 'example.invalid'].join('@'),
    'Bearer ' + 'x'.repeat(24),
    'sk-' + 'x'.repeat(24),
    '-----BEGIN ' + 'PRIVATE KEY-----',
  ];
  for (const sample of samples) assert.throws(() => assertPublishable(sample), { code: 'ERR_ASSERTION' });
  assert.doesNotThrow(() => assertPublishable('vue version 3.5; @vue/compiler-sfc'));
});

test('production imports stay inside the package or declared dependencies', () => assertPackageImports());

test('structural rule rejects planted imports and relative escapes', () => {
  const filename = join(packageRoot, 'src', 'probe.js');
  const escape = ['..', '..', 'external.js'].join('/');
  for (const source of [
    "import 'undeclared-dependency';", "export * from 'undeclared-dependency';",
    "const x = import('undeclared-dependency');", "require('undeclared-dependency');",
    `import '${escape}';`, `import('${["", "absolute", "module.js"].join("/")}');`, 'import(variable);',
  ]) assert.throws(() => assertSourceImports(source, filename), { code: 'ERR_ASSERTION' });
  assert.doesNotThrow(() => assertSourceImports("import { ref } from 'vue';", filename));
  assert.doesNotThrow(() => assertSourceImports("export * from './state/publicProjection.js';", join(packageRoot, 'src', 'probe.js')));
});
