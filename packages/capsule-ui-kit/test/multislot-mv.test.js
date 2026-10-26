/**
 * @fileoverview Lane W multislot tests: export in the record cluster gated
 * by a host destination capability (KIT_NEEDS section 2), plus the
 * provider-menu EXISTS cross-check on the multislot terminal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');

const SFC_PATH = path.resolve(__dirname, '../src/multislot/AiRecordCluster.vue');
const source = fs.readFileSync(SFC_PATH, 'utf8');
const parsed = compilerSfc.parse(source, { filename: 'AiRecordCluster.vue' });
assert.equal(parsed.errors.length, 0, 'SFC parse must produce zero errors');
const { descriptor } = parsed;
const compiled = compilerSfc.compileTemplate({
  source: descriptor.template.content,
  filename: 'AiRecordCluster.vue',
  id: 'cuk-multislot-AiRecordCluster',
});
assert.equal((compiled.errors || []).length, 0, 'template compile must produce zero errors');
const scriptDataUrl =
  'data:text/javascript;base64,' + Buffer.from(descriptor.script.content, 'utf8').toString('base64');
const helpers = await import(scriptDataUrl);

const template = descriptor.template.content;
const setup = descriptor.scriptSetup.content;
const style = descriptor.styles.map((entry) => entry.content).join('\n');

test('export control carries a stable id, anchor and accessible name', () => {
  assert.equal(helpers.exportLabel(), 'Export');
  assert.equal(helpers.exportDomId('cap-01'), 'cuk-multislot-export-cap-01');
  assert.equal(helpers.exportDomId('cap-01'), helpers.exportDomId('cap-01'), 'id is stable');
  assert.equal(helpers.exportAnchor('cap-01'), 'capsule/cap-01/export');
  assert.match(helpers.exportAnchor('cap-01'), /^capsule\/[^/\s]+\/export$/);
  assert.equal(
    helpers.exportAccessibleName({ capsuleLabel: 'Capsule-01', capsuleId: 'cap-01' }),
    'Export Capsule-01',
  );
  assert.equal(
    helpers.exportAccessibleName({ capsuleId: 'cap-01' }),
    'Export cap-01',
  );
});

test('export intent carries the host destination and stays frozen', () => {
  assert.deepEqual(
    helpers.buildExportIntent({ capsuleId: 'cap-01', destination: 'stub://exports' }),
    { type: 'export', capsuleId: 'cap-01', destination: 'stub://exports' },
  );
  assert.equal(
    Object.isFrozen(helpers.buildExportIntent({ capsuleId: 'cap-01', destination: 'stub://exports' })),
    true,
  );
});

test('export intent is refused without a host destination', () => {
  assert.equal(helpers.EXPORT_DESTINATION_REASON, 'No export destination advertised by the host');
  for (const destination of [null, undefined, '', '   ', ' stub://x', 42]) {
    assert.throws(
      () => helpers.buildExportIntent({ capsuleId: 'cap-01', destination }),
      /ERR_EXPORT_WITHOUT_DESTINATION/,
      `refused destination ${String(destination)}`,
    );
  }
});

test('export intent never invents the capsule id', () => {
  for (const capsuleId of ['', '   ', 'cap 01', 'cap-01 ']) {
    assert.throws(
      () => helpers.buildExportIntent({ capsuleId, destination: 'stub://exports' }),
      /ERR_INVENTED_CAPSULE_ID/,
      `refused capsule id ${JSON.stringify(capsuleId)}`,
    );
  }
  assert.throws(
    () => helpers.buildExportIntent({ capsuleId: '7', destination: 'stub://exports' }),
    /ERR_NUMERIC_INDEX_ID/,
    'bare numeric index refused',
  );
});

test('fixture leaves the export destination to the host', () => {
  assert.equal(helpers.aiRecordClusterFixture().exportDestination, null);
  assert.equal(
    helpers.aiRecordClusterFixture({ exportDestination: 'stub://exports' }).exportDestination,
    'stub://exports',
  );
});

test('export button gates on the host destination with a literal reason', () => {
  assert.ok(setup.includes('exportDestination: { type: String, default: null }'), 'host destination prop');
  assert.ok(setup.includes('hasExportDestination'), 'destination capability flag');
  assert.ok(
    setup.includes('props.disabled || !hasExportDestination.value'),
    'disabled without a destination',
  );
  assert.ok(setup.includes('EXPORT_DESTINATION_REASON'), 'literal reason when unavailable');
  assert.ok(template.includes(':id="exportId"'), 'stable DOM id');
  assert.ok(template.includes('role="button"'), 'explicit button role');
  assert.ok(template.includes(':data-semantic-anchor="exportAnchorValue"'), 'semantic anchor');
  assert.ok(template.includes(':aria-label="exportName"'), 'accessible name');
  assert.ok(template.includes(':disabled="exportDisabled"'), 'disabled binding');
  assert.ok(
    template.includes(':data-unavailable-reason="exportReason || undefined"'),
    'literal reason binding',
  );
  assert.ok(template.includes('@click="onExportClick"'), 'emits the export intent');
  assert.ok(template.includes('v-if="hasExportDestination"'), 'destination shown only when present');
});

test('export button keeps the multislot focus guard', () => {
  const exportBlock = template.slice(template.indexOf(':id="exportId"'));
  assert.ok(exportBlock.includes('@pointerdown.prevent'), 'pointerdown guard');
  assert.ok(exportBlock.includes('@mousedown.prevent'), 'mousedown guard');
});

test('record cluster keeps the single submit-intent channel', () => {
  assert.deepEqual([...helpers.AI_RECORD_CLUSTER_EMITS], ['submit-intent']);
  const match = setup.match(/defineEmits\(\[([^\]]*)\]\)/);
  const declared = match
    ? [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort()
    : [];
  assert.deepEqual(declared, ['submit-intent']);
});

test('untouched record helpers keep their exact contract', () => {
  assert.equal(helpers.aiRecordAnchor('cap-01'), 'capsule/cap-01/record-ai');
  assert.equal(helpers.diskRecordAnchor('cap-01'), 'capsule/cap-01/record-disk');
  assert.equal(helpers.screenshotAnchor('cap-01'), 'capsule/cap-01/screenshot');
  assert.deepEqual([...helpers.MULTISLOT_RECORD_PHASES], ['idle', 'starting', 'recording', 'stopping', 'sealed', 'error']);
  assert.deepEqual([...helpers.MULTISLOT_SCREENSHOT_STATES], ['idle', 'capturing', 'done', 'error']);
});

test('record cluster stays plain JS with tokens-only styles', () => {
  assert.equal(source.includes('lang="ts"'), false, 'no lang="ts"');
  assert.doesNotMatch(source, /from\s+['"]openvue\//, 'no direct openvue imports');
  assert.doesNotMatch(style, /#[0-9a-fA-F]{3,8}\b/, 'no hardcoded hex colors');
  for (const match of style.matchAll(/var\(\s*(--[\w-]+)/g)) {
    assert.ok(match[1].startsWith('--cuk-'), `token var ${match[1]}`);
  }
  assert.ok(style.includes('.ms-record-export'), 'export keeps the cluster pill shape');
  assert.ok(style.includes('.ms-record:focus-visible'), 'export keeps the focus ring');
});

test('provider menu entry point already exists on the multislot terminal', () => {
  const panePath = path.resolve(__dirname, '../src/multislot/AiTerminalPane.vue');
  const menuPath = path.resolve(__dirname, '../src/side-terminal/SideTerminalNewMenu.vue');
  const pane = fs.readFileSync(panePath, 'utf8');
  const menu = fs.readFileSync(menuPath, 'utf8');
  assert.ok(pane.includes('<SideTerminalNewMenu'), 'terminal embeds the provider menu');
  assert.ok(pane.includes(':providers="providers"'), 'menu receives host providers');
  assert.ok(
    menu.includes("`terminal/launch/${'provider/' + provider.id}`"),
    'menu offers per-provider choices',
  );
});
