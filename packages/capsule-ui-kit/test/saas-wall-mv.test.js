/**
 * @fileoverview Lane W wall tests: release-control on the wall tile header
 * (KIT_NEEDS section 1). The header control button swaps between take and
 * release modes via the `controlHeld` prop while the DOM id stays stable
 * (float/dock-back precedent); untouched helpers keep their exact shape.
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

const SFC_PATH = path.resolve(__dirname, '../src/saas/SaasWallTile.vue');
const source = fs.readFileSync(SFC_PATH, 'utf8');
const parsed = compilerSfc.parse(source, { filename: 'SaasWallTile.vue' });
assert.equal(parsed.errors.length, 0, 'SFC parse must produce zero errors');
const { descriptor } = parsed;
const compiled = compilerSfc.compileTemplate({
  source: descriptor.template.content,
  filename: 'SaasWallTile.vue',
  id: 'cuk-saas-SaasWallTile',
});
assert.equal((compiled.errors || []).length, 0, 'template compile must produce zero errors');
const scriptDataUrl =
  'data:text/javascript;base64,' + Buffer.from(descriptor.script.content, 'utf8').toString('base64');
const helpers = await import(scriptDataUrl);

const template = descriptor.template.content;
const setup = descriptor.scriptSetup.content;
const style = descriptor.styles.map((entry) => entry.content).join('\n');

test('wall control verb follows the held state, defaulting to take', () => {
  assert.equal(helpers.wallControlVerb(true), 'release-control');
  assert.equal(helpers.wallControlVerb(false), 'take-control');
  assert.equal(helpers.wallControlVerb(undefined), 'take-control');
  assert.equal(helpers.wallControlVerb('held'), 'take-control');
});

test('wall control label follows the held state', () => {
  assert.equal(helpers.wallControlLabel(true), 'Release Control');
  assert.equal(helpers.wallControlLabel(false), 'Take Control');
  assert.equal(helpers.wallControlLabel(undefined), 'Take Control');
});

test('wall control accessible name names the capsule in both modes', () => {
  assert.equal(
    helpers.wallControlAccessibleName({ capsuleTitle: 'Capsule-01', capsuleId: 'capsule-01', controlHeld: true }),
    'Release control of Capsule-01',
  );
  assert.equal(
    helpers.wallControlAccessibleName({ capsuleTitle: 'Capsule-01', capsuleId: 'capsule-01', controlHeld: false }),
    'Take control of Capsule-01',
  );
  assert.equal(
    helpers.wallControlAccessibleName({ capsuleId: 'capsule-01', controlHeld: true }),
    'Release control of capsule-01',
  );
  assert.equal(
    helpers.wallControlAccessibleName({ capsuleTitle: '  ', capsuleId: 'capsule-01' }),
    'Take control of capsule-01',
  );
});

test('release-control anchor uses the capsule family with a kebab slot', () => {
  assert.equal(helpers.wallReleaseControlAnchor('cap-01'), 'capsule/cap-01/release-control');
  assert.match(
    helpers.wallReleaseControlAnchor('cap-01'),
    /^capsule\/[^/\s]+\/release-control$/,
  );
  const slot = helpers.wallReleaseControlAnchor('cap-01').split('/').pop();
  assert.match(slot, /^[a-z][a-z0-9-]*$/, 'kebab slot, never a numeric token');
});

test('release-control payload keeps the CapsulePanel control shape', () => {
  assert.deepEqual(
    helpers.buildWallControlPayload({ capsuleId: 'capsule-01', verb: 'release-control' }),
    { capsuleId: 'capsule-01', verb: 'release-control' },
  );
  assert.deepEqual(
    helpers.buildWallControlPayload({ capsuleId: 'capsule-01' }),
    { capsuleId: 'capsule-01', verb: 'take-control' },
  );
});

test('fixture covers the held flag defaulting to the take mode', () => {
  assert.equal(helpers.saasWallTileFixture().controlHeld, false);
  assert.equal(helpers.saasWallTileFixture({ controlHeld: true }).controlHeld, true);
});

test('header control button swaps anchor, name and label on one stable id', () => {
  assert.ok(setup.includes('controlHeld: { type: Boolean, default: false }'), 'controlHeld prop');
  assert.ok(setup.includes('wallControlVerb(props.controlHeld)'), 'verb follows controlHeld');
  assert.ok(setup.includes('wallReleaseControlAnchor(props.capsuleId)'), 'release anchor branch');
  assert.ok(template.includes(':id="domIds.takeControl"'), 'stable DOM id kept');
  assert.ok(template.includes(':data-semantic-anchor="controlAnchor"'), 'anchor swaps by mode');
  assert.ok(template.includes(':aria-label="controlName"'), 'accessible name swaps by mode');
  assert.ok(template.includes('{{ controlLabel }}'), 'visible label swaps by mode');
  assert.ok(template.includes('@click="requestControl"'), 'click requests the mode verb');
  assert.ok(template.includes('role="button"'), 'explicit button role');
  assert.equal(template.includes('@click="takeControl"'), false, 'no stale take-only handler');
});

test('untouched wall helpers keep their exact contract', () => {
  assert.deepEqual(helpers.wallTileAnchors('capsule-01'), {
    panel: 'capsule/capsule-01/panel',
    fold: 'capsule/capsule-01/fold',
    float: 'capsule/capsule-01/float',
    close: 'capsule/capsule-01/close',
    control: 'capsule/capsule-01/control',
    popout: 'capsule/capsule-01/popout',
  });
  assert.deepEqual(
    [...helpers.SAAS_WALL_TILE_EMITS].sort(),
    ['submit-intent', 'activate-surface', 'fold-change', 'control-request', 'close-panel', 'select-session'].sort(),
  );
  assert.equal(helpers.wallTileDomIds('capsule-01').takeControl, 'cuk-saas-wall-control-capsule-01');
});

test('wall tile stays plain JS with tokens-only styles', () => {
  assert.equal(source.includes('lang="ts"'), false, 'no lang="ts"');
  assert.doesNotMatch(style, /#[0-9a-fA-F]{3,8}\b/, 'no hardcoded hex colors');
  for (const match of style.matchAll(/var\(\s*(--[\w-]+)/g)) {
    assert.ok(match[1].startsWith('--cuk-'), `token var ${match[1]}`);
  }
});
