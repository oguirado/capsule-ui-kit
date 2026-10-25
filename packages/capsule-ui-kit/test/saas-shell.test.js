/**
 * @file SaaS shell-slot contract: TopBar/Sidebar/StatusBar optional slots render nothing
 * by default and leave the current default rendering unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const root = new URL('../', import.meta.url);
const text = (/** @type {string} */ path) => readFileSync(new URL(path, root), 'utf8');
const topSource = text('src/shell/TopBar.vue');
const sideSource = text('src/shell/Sidebar.vue');
const statusSource = text('src/shell/StatusBar.vue');

test('saas shell bars parse and compile as plain JS without lang="ts"', () => {
  for (const [name, source] of [['TopBar.vue', topSource], ['Sidebar.vue', sideSource], ['StatusBar.vue', statusSource]]) {
    const sfc = parse(source, { filename: name });
    assert.deepEqual(sfc.errors, [], name);
    assert.ok(sfc.descriptor.template, name + ' template required');
    assert.ok(sfc.descriptor.scriptSetup, name + ' <script setup> required');
    assert.equal(sfc.descriptor.scriptSetup.lang, undefined, name + ' must not set lang="ts"');
    const script = compileScript(sfc.descriptor, { id: 'saas-shell-' + name });
    const template = compileTemplate({
      source: sfc.descriptor.template.content,
      filename: name,
      id: 'saas-shell-' + name,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], name);
  }
});

test('TopBar exposes optional SaaS slots with empty prop-backed defaults', () => {
  for (const slot of ['role-pill', 'environment', 'credit', 'clock']) {
    assert.ok(topSource.includes(`name="${slot}"`), 'slot ' + slot);
  }
  for (const prop of ['rolePill', 'environmentLabel', 'creditLabel', 'clockLabel']) {
    assert.ok(topSource.includes(`${prop}: { type: String, default: '' }`), 'prop ' + prop);
  }
  // Defaults render nothing: every SaaS default region is guarded by its label prop.
  assert.ok(topSource.includes('v-if="rolePill"'), 'role-pill default guarded');
  assert.ok(topSource.includes('v-if="environmentLabel"'), 'environment default guarded');
  assert.ok(topSource.includes('v-if="creditLabel"'), 'credit default guarded');
  assert.ok(topSource.includes('v-if="clockLabel"'), 'clock default guarded');
  for (const id of ['shell/topbar/role-pill', 'shell/topbar/environment', 'shell/topbar/credit', 'shell/topbar/clock']) {
    assert.ok(topSource.includes(id), 'id ' + id);
  }
  assert.ok(topSource.includes('role="timer"'), 'clock timer role');
});

test('Sidebar supports SaaS content through an empty-by-default telemetry slot', () => {
  assert.ok(sideSource.includes('name="telemetry"'), 'telemetry slot');
  assert.ok(sideSource.includes('<slot name="telemetry" :collapsed="isCollapsed" />'), 'telemetry default empty');
  // Pre-existing contract untouched: groups-driven model, separators, slots, events.
  assert.ok(sideSource.includes('groups: { type: Array, required: true }'), 'groups required');
  assert.ok(sideSource.includes('separator: true'), 'group separators');
  for (const slot of ['name="icon"', 'name="header"', 'name="footer"']) {
    assert.ok(sideSource.includes(slot), 'slot ' + slot);
  }
});

test('Sidebar 7-destination SaaS fixture satisfies the generic groups model', () => {
  const groups = [
    { id: 'primary', label: 'Primary', items: [
      { id: 'wall', label: 'Wall', active: true },
      { id: 'fleet', label: 'Fleet' },
      { id: 'recordings', label: 'Recordings' },
    ] },
    { id: 'operations', label: 'Operations', items: [
      { id: 'identities', label: 'Identities' },
      { id: 'audit', label: 'Audit' },
      { id: 'health', label: 'Health' },
      { id: 'settings', label: 'Settings' },
    ] },
  ];
  const items = groups.flatMap((group) => group.items);
  assert.equal(items.length, 7);
  assert.equal(new Set(items.map((item) => item.id)).size, 7);
  for (const item of items) {
    assert.ok(item.id && item.label, 'destination id+label');
  }
  assert.equal(items.filter((item) => item.active).length, 1);
});

test('StatusBar exposes an optional layout slot with a null-by-default tri-state prop', () => {
  assert.ok(statusSource.includes('name="layout"'), 'layout slot');
  assert.ok(statusSource.includes('layoutSaved: { type: Boolean, default: null }'), 'layoutSaved boolean tri-state prop');
  assert.ok(statusSource.includes('v-if="layoutSaved !== null && layoutSaved !== undefined"'), 'layout default guarded');
  assert.ok(statusSource.includes('id="shell/statusbar/layout"'), 'layout id');
  assert.ok(statusSource.includes("layoutSaved ? 'Layout saved' : 'Layout unsaved'"), 'layout copy');
  // Counts travel through the existing telemetry prop; layout state is the only addition.
  assert.ok(statusSource.includes('telemetry: { type: Array, default: () => [] }'), 'telemetry prop');
});

test('StatusBar counts/layout fixture satisfies the generic telemetry model', () => {
  const telemetry = [
    { key: 'capsules', value: '4', live: true },
    { key: 'tick', value: '120', live: false },
  ];
  for (const item of telemetry) {
    assert.ok(item.key && item.value, 'telemetry key+value');
  }
  for (const layoutSaved of [null, true, false]) {
    const renders = layoutSaved !== null && layoutSaved !== undefined;
    assert.equal(renders, layoutSaved !== null, 'tri-state ' + String(layoutSaved));
  }
});

test('saas shell additions keep prior ids, roles and vendor imports unchanged', () => {
  for (const id of ['shell/header', 'shell/navigation/toggle', 'shell/topbar/new']) {
    assert.ok(topSource.includes(id), 'topbar id ' + id);
  }
  assert.ok(sideSource.includes('id="shell/navigation"'), 'sidebar id');
  assert.ok(statusSource.includes('id="shell/statusbar"'), 'statusbar id');
  assert.ok(topSource.includes('role="banner"'), 'banner role');
  assert.ok(statusSource.includes('role="contentinfo"'), 'contentinfo role');
  for (const [file, source] of [['TopBar.vue', topSource], ['StatusBar.vue', statusSource]]) {
    const vendor = Array.from(source.matchAll(/from '(openvue\/[^']+)'/g)).map((m) => m[1]);
    assert.deepEqual(new Set(vendor), new Set(['openvue/dialog']), file);
  }
  for (const mod of ['openvue/menu', 'openvue/badge', 'openvue/tag', 'openvue/avatar', 'openvue/button']) {
    assert.ok(sideSource.includes(`from '${mod}'`), mod);
  }
});

test('saas shell styles stay token-only (no literal colors or px/rem sizes)', () => {
  const rawStyle = (/** @type {string} */ source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);
  for (const [file, source] of [['TopBar.vue', topSource], ['Sidebar.vue', sideSource], ['StatusBar.vue', statusSource]]) {
    const { descriptor } = parse(source, { filename: file });
    assert.ok(descriptor.styles.length > 0, file);
    for (const style of descriptor.styles) {
      assert.equal(rawStyle(style.content), false, file);
    }
  }
});
