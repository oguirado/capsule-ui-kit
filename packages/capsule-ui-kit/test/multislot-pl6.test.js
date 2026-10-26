import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import {
  CONTROL_FAMILY_INVENTORY,
  matchControlFamily,
} from '../src/agent/controlRegistry.js';
import { MULTISLOT_REGISTRY_ROWS } from '../src/multislot/multislotRegistryRows.js';
import {
  PL6_AGENT_LANE_IDS,
  PL6_FAMILY_RULES,
  PL6_FIXTURE_IDS,
  PL6_REGISTRY_ROWS,
  matchPl6ControlFamily,
  pl6AnchorFor,
} from '../src/agent/pl6RegistryRows.js';

// PL6 lane M: the multislot terminal host gains a declared family, and the
// slot anchor is emitted by the slot root only. Resolution assertions try
// the central registry first and fall back to the additive pl6 families,
// so they hold both before and after the conductor merges the additive
// rule into the central registry.

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const css = text('src/design/theme.css');

/**
 * Central match with the additive pl6 fallback.
 * @param {string} anchor Concrete semantic anchor.
 * @returns {{ template: string, allowedRoles: readonly string[] } | null} Matching rule.
 */
function resolveFamily(anchor) {
  return matchControlFamily(anchor) ?? matchPl6ControlFamily(anchor);
}

test('pl6 rows carry shape, unique ids and a working anchor builder', () => {
  assert.equal(PL6_REGISTRY_ROWS.length, 1);
  assert.equal(PL6_AGENT_LANE_IDS.length, 1);
  assert.equal(new Set(PL6_AGENT_LANE_IDS).size, 1);
  assert.deepEqual({ ...PL6_FIXTURE_IDS }, { capsuleId: 'cap-01' });
  const row = PL6_REGISTRY_ROWS[0];
  assert.equal(row.agentLaneId, 'multislot.terminal');
  assert.equal(row.anchorTemplate, 'capsule/{id}/terminal');
  assert.equal(row.anchorExample, 'capsule/cap-01/terminal');
  assert.equal(row.role, 'region');
  assert.equal(row.lane, 'M');
  assert.equal(row.component, 'AiTerminalPane');
  assert.equal(row.anchorStatus, 'new');
  assert.ok(Object.isFrozen(PL6_REGISTRY_ROWS) && Object.isFrozen(row));
  assert.equal(pl6AnchorFor('multislot.terminal'), 'capsule/cap-01/terminal');
  assert.equal(pl6AnchorFor('multislot.terminal', { id: 'cap-09' }), 'capsule/cap-09/terminal');
  assert.throws(() => pl6AnchorFor('pl6.nope'), /Unknown pl6 agent_lane id/);
});

test('pl6 terminal family matches the host anchor with region only', () => {
  assert.equal(PL6_FAMILY_RULES.length, 1);
  const rule = matchPl6ControlFamily('capsule/cap-01/terminal');
  assert.ok(rule);
  assert.equal(rule.template, 'capsule/{id}/terminal');
  assert.equal(rule.rowIndex, 5);
  assert.deepEqual([...rule.allowedRoles], ['region']);
  assert.equal(rule.requiresReasonWhenDisabled, false);
  assert.equal(rule.forbidsZeroWhenUnknown, false);
  assert.ok(matchPl6ControlFamily('capsule/gal-slot-01/terminal'));
  for (const bad of [
    'capsule/1/terminal',
    'capsule/cap-01/terminal/extra',
    'capsule/cap-01/slot',
    'surface/cap-01/tile',
    'capsule//terminal',
    '',
  ]) {
    assert.equal(matchPl6ControlFamily(bad), null, bad);
  }
});

test('pl6 additive rule is central-registry shaped', () => {
  const [rule] = PL6_FAMILY_RULES;
  assert.equal(typeof rule.rowIndex, 'number');
  assert.equal(typeof rule.template, 'string');
  assert.ok(rule.pattern instanceof RegExp);
  assert.ok(Array.isArray(rule.allowedRoles));
  assert.equal(typeof rule.requiresReasonWhenDisabled, 'boolean');
  assert.equal(typeof rule.forbidsZeroWhenUnknown, 'boolean');
  assert.ok(Object.isFrozen(PL6_FAMILY_RULES) && Object.isFrozen(rule) && Object.isFrozen(rule.allowedRoles));
  const found = matchPl6ControlFamily(PL6_REGISTRY_ROWS[0].anchorExample);
  assert.ok(found, 'row example resolves additively');
  assert.ok(found.allowedRoles.includes(PL6_REGISTRY_ROWS[0].role), 'row role admitted');
});

test('row-5 inventory admits the terminal host role', () => {
  const row5 = CONTROL_FAMILY_INVENTORY.find((entry) => entry.row === 5);
  assert.ok(row5, 'row 5 exists');
  assert.ok(row5.roles.includes('region'), 'row 5 admits region');
});

test('multislot anchors resolve in a declared family with their role', () => {
  const rows = [...MULTISLOT_REGISTRY_ROWS, ...PL6_REGISTRY_ROWS];
  const examples = rows.map((row) => row.anchorExample);
  assert.equal(new Set(examples).size, examples.length, 'examples unique');
  for (const row of rows) {
    const rule = resolveFamily(row.anchorExample);
    assert.ok(rule, `${row.agentLaneId} family admits ${row.anchorExample}`);
    assert.ok(rule.allowedRoles.includes(row.role), `${row.agentLaneId} admits ${row.role}`);
  }
});

test('slot anchor is emitted by the slot root only', () => {
  const files = readdirSync(new URL('../src/multislot/', import.meta.url))
    .filter((name) => name.endsWith('.vue'));
  assert.ok(files.length > 0, 'multislot SFCs present');
  const slotAnchor = /capsule\/\$\{[^}]*\}\/slot/;
  const emitters = files.filter((name) => slotAnchor.test(text(`src/multislot/${name}`)));
  assert.deepEqual(emitters, ['AiMultiSlot.vue']);
  const shell = text('src/multislot/AiMultiSlot.vue');
  assert.ok(shell.includes(':data-semantic-anchor="anchors.slot"'), 'slot root keeps the anchor');
  const pane = text('src/multislot/AiSurfacePane.vue');
  assert.ok(shell.includes('<AiSurfacePane\n        embedded'), 'slot declares ownership to the nested surface');
  assert.ok(pane.includes("v-bind=\"embedded ? { 'data-semantic-anchor': null } : {}\""), 'embedded surface suppresses the shared SaasSurfaceView slot anchor');
  assert.ok(pane.includes('embedded: { type: Boolean, default: false }'), 'standalone surface keeps its anchor');
  assert.equal(pane.includes('surfacePaneAnchor'), false, 'surface pane helper removed');
});

test('terminal host anchor resolves through the declared family', () => {
  const pane = text('src/multislot/AiTerminalPane.vue');
  assert.ok(pane.includes('capsule/${capsuleId}/terminal'), 'host emits the terminal anchor');
  const rule = resolveFamily('capsule/cap-01/terminal');
  assert.ok(rule, 'terminal anchor resolves');
  assert.equal(rule.template, 'capsule/{id}/terminal');
  assert.ok(rule.allowedRoles.includes('region'));
});

test('AiSurfacePane compiles as plain JS with tokens only', () => {
  const themeVars = new Set(Array.from(css.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((m) => m[1]));
  const file = 'src/multislot/AiSurfacePane.vue';
  const source = text(file);
  const { descriptor, errors } = parse(source, { filename: 'AiSurfacePane.vue' });
  assert.deepEqual(errors, [], file);
  assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
  const script = compileScript(descriptor, { id: 'multislot-pl6' });
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: 'AiSurfacePane.vue',
    id: 'multislot-pl6',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, [], file);
  assert.ok(descriptor.styles.length > 0, file);
  for (const style of descriptor.styles) {
    assert.equal(/(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(style.content), false, file);
    for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
      assert.ok(match[1].startsWith('--cuk-'), `${file}: vendor var ${match[1]} (tokens only)`);
    }
  }
  // Name hygiene rides on the existing whole-tree and per-area guards.
});

test('pl6 registry file is data-only', () => {
  const source = text('src/agent/pl6RegistryRows.js');
  assert.equal(/^import\b/m.test(source), false, 'no imports');
  assert.equal(source.includes('node:'), false, 'no runtime imports');
  assert.equal(source.includes('../'), false, 'no relative imports');
});
