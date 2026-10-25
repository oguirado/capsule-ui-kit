import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const source = readFileSync(new URL('../src/shell/Sidebar.vue', import.meta.url), 'utf8');
const { descriptor, errors } = parse(source, { filename: 'Sidebar.vue' });

test('generic sidebar navigation compiles with caller-supplied groups and active item', () => {
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'generic-sidebar-navigation' });
  const template = compileTemplate({ source: descriptor.template.content,
    filename: 'Sidebar.vue', id: 'generic-sidebar-navigation',
    compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
  assert.ok(source.includes('groups: { type: Array, required: true }'));
  assert.ok(source.includes('props.groups'));
  assert.ok(source.includes('item.id === props.activeId'));
  assert.ok(source.includes('key: nav.id'));
  assert.ok(source.includes("emit('open', nav)"));
});
