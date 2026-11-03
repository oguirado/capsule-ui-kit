import assert from 'node:assert/strict';
import { readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, babelParse } from '@vue/compiler-sfc';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const dependencies = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies }));
const inside = (root, target) => { const rel = relative(root, target); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); };

export function assertPublishable(text, label = 'text') {
  assert.doesNotMatch(text, /\/(?:home|Users|root)\/[\w.-]+/i, `${label}: absolute host path`);
  assert.doesNotMatch(text, /(?<![A-Za-z0-9_-])[A-Za-z]:[\\/]+[\w.-]+/i, `${label}: absolute drive path`);
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/, `${label}: e-mail address`);
  assert.doesNotMatch(text, /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:sk|ghp|github_pat)[_-][A-Za-z0-9_-]{20,}|\bBearer\s+[A-Za-z0-9_.-]{20,}/, `${label}: credential material`);
}

export function assertImportAllowed(specifier, filename, root = packageRoot) {
  assert.equal(typeof specifier, 'string', `${filename}: imports must be statically resolvable`);
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const target = resolve(dirname(filename), specifier);
    assert.ok(inside(root, target), `${filename}: relative import escapes package`);
    assert.ok(existsSync(target), `${filename}: unresolved relative import ${specifier}`);
    assert.ok(inside(realpathSync(root), realpathSync(target)), `${filename}: resolved import escapes package`);
  } else {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    assert.ok(dependencies.has(name), `${filename}: undeclared import ${specifier}`);
  }
}

export function assertSourceImports(source, filename, root = packageRoot) {
  const blocks = filename.endsWith('.vue') ? (() => {
    const result = parse(source, { filename });
    assert.deepEqual(result.errors, [], `${filename}: parse errors`);
    const { descriptor } = result;
    for (const block of [descriptor.script, descriptor.scriptSetup, descriptor.template, ...descriptor.styles]) {
      if (block?.src) assertImportAllowed(block.src, filename, root);
    }
    return [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean);
  })() : [source];
  for (const code of blocks) {
    const ast = babelParse(code, { sourceType: 'module', plugins: ['importAttributes'] });
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
        assertImportAllowed(node.source.value, filename, root);
      }
      if (node.type === 'ImportExpression') assertImportAllowed(node.source?.value, filename, root);
      if (node.type === 'CallExpression' && (node.callee.type === 'Import' || node.callee.name === 'require')) {
        assertImportAllowed(node.arguments[0]?.value, filename, root);
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') walk(value);
      }
    }
    walk(ast);
  }
}

export function assertPackageImports(root = packageRoot) {
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = resolve(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `${filename}: symlink`);
      if (entry.isDirectory()) walk(filename);
      else if (/\.(js|vue)$/.test(entry.name)) assertSourceImports(readFileSync(filename, 'utf8'), filename, root);
    }
  }
  walk(resolve(root, 'src'));
  for (const extra of ['tools', 'test/fixtures/retired/src']) {
    if (existsSync(resolve(root, extra))) walk(resolve(root, extra));
  }
  assertSourceImports(readFileSync(resolve(root, 'index.js'), 'utf8'), resolve(root, 'index.js'), root);
}
