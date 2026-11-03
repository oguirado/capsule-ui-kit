import { assertPackageImports } from './publication-rules.js';
/**
 * @file S4 orchestrator drawer contract: unread-output tracking in the drawer
 * model plus the collapsed bar (activity summary, unread count, latest
 * preview) and session tab chips in S1 language. Review/dispatch invariants
 * are untouched: seen state is display-only.
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

const DRAWER_PATH = path.resolve(__dirname, './fixtures/retired/src/orchestrator/OrchestratorDrawer.vue');
const THEME_PATH = path.resolve(__dirname, '../src/design/theme.css');

import {
  TAB_STATUSES,
  resolveSessionTabStatus,
  createDrawerModel
} from './fixtures/retired/src/orchestrator/drawerModel.js';

/**
 * @param {Record<string, unknown>} [overrides]
 */
function makeSession(overrides = {}) {
  return {
    sessionId: 'sid-alpha',
    capsuleId: 'cap-1',
    workspaceId: 'ws-main',
    slotId: 'slot-1',
    generation: 1,
    epoch: 10,
    activity: 'ready',
    attachment: 'live',
    visibleInWorkspace: true,
    supportsQueue: false,
    maxQueueDepth: 0,
    currentQueueDepth: 0,
    inFlightLock: false,
    ownership: 'human',
    adapterProtocol: 'AUSENTE',
    ...overrides
  };
}

/**
 * Drives one model to a submitted two-target dispatch.
 * @returns {{ model: ReturnType<typeof createDrawerModel>, requestId: string }}
 */
function makeSubmittedModel() {
  const model = createDrawerModel({ workspaceId: 'ws-main' });
  const synced = model.syncProjectedSessions([
    makeSession({ sessionId: 'sid-1', slotId: 'slot-1' }),
    makeSession({ sessionId: 'sid-2', slotId: 'slot-2' })
  ]);
  assert.equal(synced.ok, true);
  model.setPromptText('Summarize capsule telemetry');
  model.selectManyTargets(['sid-1', 'sid-2']);
  assert.equal(model.beginReview().ok, true);
  const sub = model.submitReviewedDispatch({
    session: 's1',
    authenticated_sender_instance: 'u1',
    nonce: 'n1',
    seq: 10
  });
  assert.equal(sub.ok, true);
  if (!sub.ok) throw new Error('Dispatch setup failed');
  return { model, requestId: sub.requestId };
}

test('resolveSessionTabStatus — activity vocabulary maps to idle/busy/exited', () => {
  assert.deepEqual([...TAB_STATUSES], ['idle', 'busy', 'exited']);
  for (const activity of ['unknown', 'ready', 'bogus', '', null, undefined, 42]) {
    assert.equal(resolveSessionTabStatus(activity), 'idle', `${String(activity)} must map to idle`);
  }
  for (const activity of ['busy', 'waiting-input', 'waiting-permission']) {
    assert.equal(resolveSessionTabStatus(activity), 'busy', `${activity} must map to busy`);
  }
  for (const activity of ['exited', 'failed']) {
    assert.equal(resolveSessionTabStatus(activity), 'exited', `${activity} must map to exited`);
  }
});

test('drawerModel — streams while collapsed accrue unread outputs with bounded previews', () => {
  const { model, requestId } = makeSubmittedModel();
  assert.equal(model.getState().unreadOutputCount, 0);
  assert.deepEqual(model.getState().unreadOutputs, []);

  assert.equal(model.appendTargetStreamResult(requestId, 'sid-1', 'chunk-one').ok, true);
  let state = model.getState();
  assert.equal(state.unreadOutputCount, 1);
  assert.equal(state.unreadOutputs.length, 1);
  assert.equal(state.unreadOutputs[0].requestId, requestId);
  assert.equal(state.unreadOutputs[0].sessionId, 'sid-1');
  assert.equal(state.unreadOutputs[0].unseenBytes, 9);
  assert.equal(state.unreadOutputs[0].preview, 'chunk-one');

  assert.equal(model.appendTargetStreamResult(requestId, 'sid-2', `${'y'.repeat(200)}-tail`).ok, true);
  state = model.getState();
  assert.equal(state.unreadOutputCount, 2);
  const second = state.unreadOutputs.find((entry) => entry.sessionId === 'sid-2');
  assert.ok(second, 'Second target must appear in unread outputs');
  assert.ok(second.preview.length <= 160, 'Preview must stay bounded');
  assert.ok(second.preview.endsWith('-tail'), 'Preview must keep the tail');
});

test('drawerModel — opening the drawer marks outputs seen; review untouched', () => {
  const { model, requestId } = makeSubmittedModel();
  assert.equal(model.appendTargetStreamResult(requestId, 'sid-1', 'output-while-collapsed').ok, true);
  assert.equal(model.getState().unreadOutputCount, 1);

  const opened = model.toggleDrawer();
  assert.equal(opened.presentation, 'expanded');
  assert.equal(model.getState().unreadOutputCount, 0);
  assert.deepEqual(model.getState().unreadOutputs, []);

  assert.equal(model.appendTargetStreamResult(requestId, 'sid-1', 'output-while-open').ok, true);
  assert.equal(model.getState().unreadOutputCount, 0);

  model.collapse();
  assert.equal(model.getState().presentation, 'collapsed');
  assert.equal(model.appendTargetStreamResult(requestId, 'sid-2', 'output-after-recollapse').ok, true);
  assert.equal(model.getState().unreadOutputCount, 1);

  assert.equal(
    model.getState().lastInvalidation,
    null,
    'Streaming and seen tracking must not invalidate any review'
  );
});

test('drawerModel — unknown dispatch targets still refuse without unread side effects', () => {
  const { model } = makeSubmittedModel();
  const res = model.appendTargetStreamResult('missing-request', 'sid-1', 'chunk');
  assert.equal(res.ok, false);
  assert.equal(model.getState().unreadOutputCount, 0);
});

test('OrchestratorDrawer.vue — SFC contract (plain JS, no product imports, compilable)', () => {
  const source = fs.readFileSync(DRAWER_PATH, 'utf8');
  const { descriptor, errors } = compilerSfc.parse(source, { filename: 'OrchestratorDrawer.vue' });
  assert.equal(errors.length, 0, `SFC parse errors: ${JSON.stringify(errors)}`);
  assert.ok(descriptor.scriptSetup, '<script setup> block must exist');
  assert.equal(descriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');
  assert.equal(descriptor.script?.lang, undefined, '<script> must not use lang="ts"');
  assertPackageImports();
  assert.doesNotMatch(source, /from\s+['"]openvue[^'"]*['"]/, 'Must not import OpenVue directly');
  assert.ok(!descriptor.template.content.includes('v-html'), 'Must never use v-html');

  const compiledScript = compilerSfc.compileScript(descriptor, { id: 'data-v-orchdrawer-s4' });
  assert.ok(compiledScript.content.length > 0);
  const compiledTemplate = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename: 'OrchestratorDrawer.vue',
    id: 'data-v-orchdrawer-s4'
  });
  assert.equal(compiledTemplate.errors.length, 0);
  assert.ok(descriptor.styles.length > 0, '<style scoped> block must exist');
  for (const styleBlock of descriptor.styles) {
    assert.equal(styleBlock.scoped, true);
    const compiledStyle = compilerSfc.compileStyle({
      source: styleBlock.content,
      filename: 'OrchestratorDrawer.vue',
      id: 'data-v-orchdrawer-s4',
      scoped: true
    });
    assert.equal(compiledStyle.errors.length, 0);
  }
});

test('OrchestratorDrawer.vue — collapsed bar carries activity, unread count and latest preview', () => {
  const source = fs.readFileSync(DRAWER_PATH, 'utf8');
  const { descriptor } = compilerSfc.parse(source, { filename: 'OrchestratorDrawer.vue' });
  const tpl = descriptor.template.content;
  const setup = descriptor.scriptSetup.content;
  assert.match(tpl, /id="cuk-drawer-activity-summary"/, 'Collapsed bar needs an activity summary');
  assert.match(tpl, /Session activity:/, 'Activity summary needs an accessible name');
  assert.match(tpl, /id="cuk-drawer-unread"/, 'Collapsed bar needs an unread count');
  assert.match(tpl, /unread outputs/, 'Unread count needs an accessible name');
  assert.match(tpl, /id="cuk-drawer-latest-preview"/, 'Collapsed bar needs a latest-output preview');
  assert.match(tpl, /Latest unread output from/, 'Preview needs an accessible name');
  assert.match(
    tpl,
    /cuk-orchestrator-drawer__chip--\$\{/,
    'Session tabs must render idle/busy/exited chips'
  );
  assert.match(
    setup,
    /resolveSessionTabStatus/,
    'Drawer must use the shared tab-status mapping'
  );
  for (const kept of [
    'id="drawer/toggle"',
    'id="cuk-drawer-maximize"',
    'id="cuk-drawer-composer"',
    'id="cuk-drawer-send"',
    'drawer/send',
    'v-show='
  ]) {
    assert.ok(tpl.includes(kept), `Existing contract must keep ${kept}`);
  }
});

test('OrchestratorDrawer.vue style — tokens only (no raw colours/sizes, defined tokens, no fallbacks)', () => {
  const theme = fs.readFileSync(THEME_PATH, 'utf8');
  const defined = new Set();
  for (const match of theme.matchAll(/^\s*(--cuk-[a-z0-9-_]+)\s*:/gm)) {
    defined.add(match[1]);
  }
  assert.ok(defined.size > 100, 'Expected the kit token contract in theme.css');
  const source = fs.readFileSync(DRAWER_PATH, 'utf8');
  const { descriptor } = compilerSfc.parse(source, { filename: 'OrchestratorDrawer.vue' });
  for (const styleBlock of descriptor.styles) {
    const css = styleBlock.content.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'Style must not contain raw hex colours');
    assert.doesNotMatch(css, /rgba?\s*\(/, 'Style must not contain raw rgb() colours');
    assert.doesNotMatch(css, /hsla?\s*\(/, 'Style must not contain raw hsl() colours');
    assert.doesNotMatch(css, /\d+(\.\d+)?px/, 'Style must not contain raw px sizes');
    assert.doesNotMatch(css, /\d+(\.\d+)?(em|rem)\b/, 'Style must not contain raw em/rem sizes');
    for (const match of css.matchAll(/var\(\s*(--[a-z0-9-_]+)\s*([^)]*)\)/g)) {
      assert.ok(defined.has(match[1]), `Style references undefined token ${match[1]}`);
      assert.equal(match[2].trim(), '', `var(${match[1]}) must not carry a raw fallback`);
    }
  }
});
