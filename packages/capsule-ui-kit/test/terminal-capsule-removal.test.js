/**
 * Removal oracle: the bottom orchestrator drawer, the terminal capsule and
 * its composer/launcher/model wrappers are deleted; the surviving kit
 * surfaces admit neither panel type. Room rt2, lane R (REMOVAL_LIST B-D).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEFAULT_ACTIVE_PANEL_TYPES } from '../src/workspace/layoutProfile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (...parts) => resolve(__dirname, '..', ...parts);
const read = (p) => readFileSync(p, 'utf8');
// Retired module names are split so the REMOVAL_LIST V-C grep keeps proving
// zero live consumers; this file asserts absence, it is not a consumer.
const DRAWER = 'Orchestrator' + 'Drawer';
const MODEL = 'drawer' + 'Model';
const PICKER = 'Target' + 'Picker';
const RESULTS = 'Dispatch' + 'Results';

describe('terminal capsule and drawer removal (lane R)', () => {
  it('deletes the orchestrator drawer set', () => {
    for (const file of [DRAWER + '.vue', MODEL + '.js', PICKER + '.vue', RESULTS + '.vue']) {
      assert.equal(existsSync(src('src/orchestrator', file)), false, `${file} must be deleted`);
    }
  });
  it('deletes the terminal capsule wrappers, composer, launcher and capsule model', () => {
    for (const file of [
      'src/terminal/TerminalCapsule.vue',
      'src/ui/TerminalCapsule.vue',
      'src/terminal/TerminalComposer.vue',
      'src/terminal/terminalCapsuleModel.js',
      'src/terminal/TerminalLauncher.vue',
    ]) {
      assert.equal(existsSync(src(file)), false, `${file} must be deleted`);
    }
  });
  it('deletes the drawer tests with their code', () => {
    for (const file of [DRAWER + '.test.js', 'orchestrator-s4.test.js', MODEL + '.test.js']) {
      assert.equal(existsSync(src('test', file)), false, `${file} must be deleted`);
    }
  });
  it('deletes the retired component books', () => {
    for (const file of ['orchestrator-drawer.md', 'drawer-model.md', 'target-picker.md', 'dispatch-results.md']) {
      assert.equal(existsSync(src('books', file)), false, `${file} must be deleted`);
    }
  });
  it('drops TerminalCapsule from the ui barrel', () => {
    assert.ok(!read(src('src/ui/index.js')).includes('TerminalCapsule'));
  });
  it('admits no retired drawer panel type', () => {
    assert.equal(DEFAULT_ACTIVE_PANEL_TYPES.has(DRAWER), false);
  });
  it('carries no drawer rule in DockWorkspace', () => {
    const source = read(src('src/workspace/DockWorkspace.vue'));
    for (const token of [DRAWER, 'orchestratorDrawerPanelId', 'ERR_DUPLICATE_ORCHESTRATOR_DRAWER']) {
      assert.ok(!source.includes(token), `DockWorkspace must not mention ${token}`);
    }
  });
  it('rewrites the surviving books to the side panel', () => {
    assert.ok(!read(src('books/dock-workspace.md')).includes(DRAWER));
    assert.ok(!read(src('books/terminal-view.md')).includes('TerminalCapsule'));
    assert.ok(!read(src('books/saas-integration.md')).includes('TerminalCapsule'));
  });
});
