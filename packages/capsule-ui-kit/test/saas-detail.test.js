/**
 * @file Behavioral and structural oracle for the SAAS-2 capsule detail split
 * (`SaasDetailLayout`, `SaasGeometryBar`, `SaasSplitter`, `SaasConsoleRow`,
 * `SaasShellToggle`, `SaasEdgeStrip`, `SaasFrameStrip`).
 * - Plain JS/JSDoc SFC compilation via @vue/compiler-sfc (no lang="ts").
 * - Token-only styles: no hex colors, no px/rem literals in <style> blocks.
 * - Stable ids, roles and accessible names (agent_lane/v1 surface).
 * - Panes hide with v-show and never unmount; no save affordance anywhere.
 * - One generic fixture-driven demo per component through the pure helpers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { matchControlFamily } from '../src/agent/controlRegistry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SFC = {
  SaasDetailLayout: path.resolve(here, '../src/saas/SaasDetailLayout.vue'),
  SaasGeometryBar: path.resolve(here, '../src/saas/SaasGeometryBar.vue'),
  SaasSplitter: path.resolve(here, '../src/saas/SaasSplitter.vue'),
  SaasConsoleRow: path.resolve(here, '../src/saas/SaasConsoleRow.vue'),
  SaasShellToggle: path.resolve(here, '../src/saas/SaasShellToggle.vue'),
  SaasEdgeStrip: path.resolve(here, '../src/saas/SaasEdgeStrip.vue'),
  SaasFrameStrip: path.resolve(here, '../src/saas/SaasFrameStrip.vue'),
};

const sourceOf = {};
for (const [name, file] of Object.entries(SFC)) {
  assert.ok(fs.existsSync(file), `missing SFC: ${name}`);
  sourceOf[name] = fs.readFileSync(file, 'utf8');
}

function loadCompilerSfc() {
  try {
    return require('@vue/compiler-sfc');
  } catch {
    throw new Error('Unable to resolve @vue/compiler-sfc');
  }
}

/**
 * Extracts and dynamically imports the pure JS module `<script>` block.
 * @param {string} name
 * @returns {Promise<Record<string, any>>}
 */
async function loadHelpers(name) {
  const { parse } = loadCompilerSfc();
  const source = sourceOf[name];
  const { descriptor, errors } = parse(source, { filename: `${name}.vue` });
  assert.deepEqual(errors, [], `${name}: SFC parse errors`);
  assert.ok(descriptor.script, `${name}: expected a <script> block with pure helpers`);
  assert.ok(descriptor.scriptSetup, `${name}: expected a <script setup> block`);
  assert.equal(descriptor.script.lang, undefined, `${name}: <script> must not use lang="ts"`);
  assert.equal(descriptor.scriptSetup.lang, undefined, `${name}: <script setup> must not use lang="ts"`);
  const encoded = Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

test('all seven detail SFCs compile as plain JS with clean templates', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  for (const [name, source] of Object.entries(sourceOf)) {
    const { descriptor, errors } = parse(source, { filename: `${name}.vue` });
    assert.deepEqual(errors, [], name);
    const script = compileScript(descriptor, { id: `saas-detail-${name}` });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: `${name}.vue`,
      id: `saas-detail-${name}`,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], `${name}: template errors`);
  }
});

const HEX_COLOR = /#[0-9a-f]{3,8}\b/i;
const RAW_SIZE = /\b\d*\.?\d+(?:px|rem)\b/i;

test('detail styles use tokens only (no hex colors, no px/rem literals)', () => {
  const { parse } = loadCompilerSfc();
  for (const [name, source] of Object.entries(sourceOf)) {
    const { descriptor } = parse(source, { filename: `${name}.vue` });
    assert.ok(descriptor.styles.length > 0, `${name}: expected a <style> block`);
    for (const style of descriptor.styles) {
      assert.equal(HEX_COLOR.test(style.content), false, `${name}: hex color in styles`);
      assert.equal(RAW_SIZE.test(style.content), false, `${name}: px/rem literal in styles`);
      assert.ok(style.content.includes('var(--cuk-'), `${name}: expected token references`);
    }
  }
});

test('detailLayout keeps the TerminalView props-only contract and kit emits', () => {
  const source = sourceOf.SaasDetailLayout;
  assert.ok(source.includes("from '../terminal/TerminalView.vue'"), 'TerminalView import');
  for (const binding of [
    ':session-id="selectedSessionId"',
    ':capsule-id="capsuleId"',
    ':attachment-state="attachmentState"',
    ':activity-state="activityState"',
    ':view-retention="effectiveRetention"',
    ':stream-registry="streamRegistry"',
    ':reduced-motion="reducedMotion"',
  ]) {
    assert.ok(source.includes(binding), binding);
  }
  for (const emit of [
    "'fold-change'", "'control-request'", "'close-panel'", "'submit-intent'",
    "'select-session'", "'request-attach'", "'request-stop'", "'request-replay'",
    "'select-target'", "'confirm-staged-paste'", "'resize'", "'update:consoleDraft'",
  ]) {
    assert.ok(source.includes(emit), `emit ${emit}`);
  }
});

test('detailLayout exposes stable anchors, roles and accessible names', () => {
  const source = sourceOf.SaasDetailLayout;
  for (const anchor of [
    'shell/navigation/detail-back',
    'capsule/${capsuleId}/fold',
    'capsule/${capsuleId}/control',
    'capsule/${capsuleId}/record',
    'capsule/${capsuleId}/close',
    'capsule/${capsuleId}/popout',
    'detail/${capsuleId}/scaled-badge',
    'capsule/${capsuleId}/session/${sess.sessionId}/tab',
  ]) {
    assert.ok(source.includes(anchor), `anchor ${anchor}`);
  }
  assert.ok(source.includes('`${controlBase}-attach`'), 'attach CTA keeps a stable control id');
  for (const role of [
    'role="tablist"', 'role="tab"', 'role="status"', 'role="alert"',
  ]) {
    assert.ok(source.includes(role), role);
  }
  for (const name of [
    'Back to wall', 'Take control', 'Close detail', 'Policy: window open disabled',
    'READ ONLY REPLAY', 'RAM only', 'Retry surface attach', 'Attach session',
  ]) {
    assert.ok(source.includes(name), `accessible copy: ${name}`);
  }
  assert.ok(source.includes('aria-disabled="true"'), 'disabled popout is exposed as disabled');
  assert.ok(source.includes('<slot name="surface"'), 'live surface is a consumer slot');
});

test('DetailLayout hides panes with v-show (never unmounts) and has no save affordance', () => {
  const source = sourceOf.SaasDetailLayout;
  assert.ok(source.includes('v-show="surfaceVisible"'), 'surface pane v-show');
  assert.ok(source.includes('v-show="surfaceVisible && terminalVisible"'), 'splitter v-show');
  assert.ok(source.includes('v-show="terminalVisible"'), 'terminal pane v-show');
  assert.equal(/save/i.test(source), false, 'no save affordance anywhere in the detail layout');
});

test('geometry helpers clamp, step and anchor per the geometry law', async () => {
  const helpers = await loadHelpers('SaasGeometryBar');
  assert.equal(helpers.SAAS_GEOMETRY_BAR_SCHEMA, 'capsule-ui-kit.saas-geometry-bar/v1');
  assert.deepEqual(helpers.clampGeometry(1280, 960, {}), { width: 1280, height: 960 });
  assert.deepEqual(helpers.clampGeometry(50, 99999, {}), { width: 200, height: 2160 });
  assert.deepEqual(helpers.clampGeometry('nope', null, {}), { width: 900, height: 800 });
  assert.equal(helpers.stepGeometryAxis(1280, 1, { min: 200, max: 4096 }), 1281);
  assert.equal(helpers.stepGeometryAxis(200, -1, { min: 200, max: 4096 }), null);
  assert.equal(helpers.stepGeometryAxis(4096, 1, { min: 200, max: 4096 }), null);
  assert.equal(helpers.geometryStepperAnchor('capsule-01', 'w'), 'detail/capsule-01/stepper-w');
  assert.equal(helpers.geometryStepperAnchor('capsule-01', 'h'), 'detail/capsule-01/stepper-h');
  assert.equal(helpers.geometryStepperAnchor('capsule-01', 'bogus'), 'detail/capsule-01/stepper-w');
  assert.equal(helpers.siblingTone('running'), 'running');
  assert.equal(helpers.siblingTone('bogus'), 'idle');
  const source = sourceOf.SaasGeometryBar;
  assert.ok(source.includes('role="toolbar"'), 'geometry bar toolbar role');
  assert.ok(source.includes('aria-label="Capsule geometry"'), 'geometry bar name');
  assert.ok(source.includes('Snap to Size'), 'snap control');
  assert.ok(source.includes('role="spinbutton"'), 'stepper value spinbutton role');
  assert.ok(source.includes(':aria-valuenow='), 'spinbutton value');
  assert.ok(source.includes('aria-label="Width in pixels"'), 'width name');
  assert.ok(source.includes("onSpinKey('w', $event)"), 'spinbutton keyboard');
});

test('splitter helpers move the separator 1px (Shift 10px) and clamp', async () => {
  const helpers = await loadHelpers('SaasSplitter');
  assert.equal(helpers.SAAS_SPLITTER_SCHEMA, 'capsule-ui-kit.saas-splitter/v1');
  assert.equal(helpers.SPLITTER_STEP, 1);
  assert.equal(helpers.SPLITTER_LARGE_STEP, 10);
  assert.equal(helpers.splitterDeltaForKey('ArrowLeft', false), 1);
  assert.equal(helpers.splitterDeltaForKey('ArrowRight', false), -1);
  assert.equal(helpers.splitterDeltaForKey('ArrowLeft', true), 10);
  assert.equal(helpers.splitterDeltaForKey('ArrowRight', true), -10);
  assert.equal(helpers.splitterDeltaForKey('ArrowUp', false), null);
  assert.equal(helpers.splitterDeltaForKey('Enter', false), null);
  assert.equal(helpers.splitterWidthForKey(450, 'ArrowLeft', false, { min: 200, max: 900 }), 451);
  assert.equal(helpers.splitterWidthForKey(450, 'ArrowRight', true, { min: 200, max: 900 }), 440);
  assert.equal(helpers.splitterWidthForKey(200, 'ArrowRight', false, { min: 200, max: 900 }), 200);
  assert.equal(helpers.splitterAnchor('capsule-01'), 'workspace/separator/capsule-01');
  assert.equal(helpers.splitterAnchor('detail-main'), 'workspace/separator/detail-main');
  const source = sourceOf.SaasSplitter;
  assert.ok(source.includes('role="separator"'), 'separator role');
  assert.ok(source.includes('aria-orientation="vertical"'), 'vertical orientation');
  assert.ok(source.includes('Left / Right 1px | Shift 10px'), 'keyboard hint badge');
  assert.ok(source.includes('prefers-reduced-motion'), 'reduced-motion guard');
});

test('console row builds typed intents and rejects unknown actions', async () => {
  const helpers = await loadHelpers('SaasConsoleRow');
  assert.equal(helpers.SAAS_CONSOLE_ROW_SCHEMA, 'capsule-ui-kit.saas-console-row/v1');
  assert.deepEqual(helpers.buildConsoleIntent('submit', 'capsule-01', 'inspect --dense'), {
    intent: 'console.submit', capsuleId: 'capsule-01', value: 'inspect --dense',
  });
  assert.deepEqual(helpers.buildConsoleIntent('cancel', 'capsule-01', 'draft'), {
    intent: 'console.cancel', capsuleId: 'capsule-01', value: '',
  });
  assert.throws(() => helpers.buildConsoleIntent('execute', 'capsule-01', 'x'), /Unknown console action/);
  const source = sourceOf.SaasConsoleRow;
  assert.ok(source.includes('terminal/composer'), 'composer anchor');
  assert.ok(source.includes('aria-label="Console directive"'), 'input name');
  for (const label of ['Inspect', 'Submit', 'Cancel']) {
    assert.ok(source.includes(label), `console action ${label}`);
  }
});

test('shell toggle stays locked unless dev-gated and unlocked', async () => {
  const helpers = await loadHelpers('SaasShellToggle');
  assert.equal(helpers.SAAS_SHELL_TOGGLE_SCHEMA, 'capsule-ui-kit.saas-shell-toggle/v1');
  assert.equal(helpers.shellToggleAnchor('capsule-01'), 'detail/capsule-01/pty-toggle');
  assert.deepEqual(
    helpers.resolveShellToggle({ locked: true, checked: true, devGated: true }),
    { interactive: false, checked: false, caption: 'LOCKED' },
  );
  assert.deepEqual(
    helpers.resolveShellToggle({ locked: false, checked: false, devGated: true }),
    { interactive: true, checked: false, caption: 'OFF' },
  );
  assert.deepEqual(
    helpers.resolveShellToggle({ locked: false, checked: true, devGated: true }),
    { interactive: true, checked: true, caption: 'ON' },
  );
  assert.deepEqual(
    helpers.resolveShellToggle({ locked: false, checked: true, devGated: false }),
    { interactive: false, checked: true, caption: 'ON' },
  );
  const source = sourceOf.SaasShellToggle;
  assert.ok(source.includes('role="switch"'), 'switch role');
  assert.ok(source.includes(':aria-checked='), 'checked state');
  assert.ok(source.includes('Dev Gated Shell'), 'gate label');
});

test('edge strip restores the preserved slot through the show anchor', async () => {
  const helpers = await loadHelpers('SaasEdgeStrip');
  assert.equal(helpers.SAAS_EDGE_STRIP_SCHEMA, 'capsule-ui-kit.saas-edge-strip/v1');
  assert.deepEqual(helpers.buildEdgeRestore('capsule-01', 'slot-3'), {
    capsuleId: 'capsule-01', slotId: 'slot-3', anchor: 'capsule/capsule-01/show',
  });
  assert.equal(helpers.edgeRestoreName('SLOT 3'), 'Restore SLOT 3');
  assert.equal(helpers.edgeRestoreName(''), 'Restore reserved panel');
  const source = sourceOf.SaasEdgeStrip;
  assert.ok(source.includes('capsule/${props.capsuleId}/show'), 'show anchor');
  assert.ok(source.includes('PRESERVED'), 'preserved caption');
  assert.ok(source.includes('writing-mode: vertical-rl'), 'rotated slot label');
});

test('frame strip formats neutral frame identity without placeholders', async () => {
  const helpers = await loadHelpers('SaasFrameStrip');
  assert.equal(helpers.SAAS_FRAME_STRIP_SCHEMA, 'capsule-ui-kit.saas-frame-strip/v1');
  assert.equal(helpers.shortenDigest('0123456789abcdef0123456789abcdef'), '01234567…abcdef');
  assert.equal(helpers.shortenDigest('short'), 'short');
  assert.equal(helpers.shortenDigest(''), '');
  assert.deepEqual(
    helpers.formatFrameStrip({ frame: '#41', generation: 'gen-4', digest: '', readOnly: true, readOnlyLabel: '' }),
    { frameText: '#41', generationText: 'gen-4', digestText: '', readOnlyText: 'READ-ONLY ISOLATED EXECUTION' },
  );
  assert.equal(
    helpers.formatFrameStrip({ readOnly: false }).readOnlyText,
    '',
  );
  const source = sourceOf.SaasFrameStrip;
  assert.ok(source.includes('role="group"'), 'frame strip group role');
  assert.ok(source.includes('FRAME:'), 'frame key');
  assert.ok(source.includes('SHA256:'), 'digest key');
  assert.ok(source.includes('READ-ONLY ISOLATED EXECUTION'), 'read-only guard');
});

test('fixture demo: detail snapshot exposes the full agent surface', async () => {
  const helpers = await loadHelpers('SaasDetailLayout');
  assert.equal(helpers.SAAS_DETAIL_LAYOUT_SCHEMA, 'capsule-ui-kit.saas-detail-layout/v1');
  assert.equal(helpers.surfaceState('lost'), 'lost');
  assert.equal(helpers.surfaceState('bogus'), 'none');
  assert.equal(helpers.lifecycleTone('running'), 'success');
  assert.equal(helpers.lifecycleTone('booting'), 'warning');
  assert.equal(helpers.lifecycleTone('error'), 'error');
  assert.equal(helpers.formatScaled(0.84), 'SCALED x0.84');
  assert.equal(helpers.formatScaled(null), '');
  assert.equal(helpers.tabDotTone('busy'), 'warning');
  assert.equal(helpers.tabDotTone('exited'), 'error');
  assert.equal(helpers.tabDotTone('ready'), 'success');

  const fixture = {
    capsuleId: 'capsule-01',
    lifecycle: 'running',
    recordingActive: true,
    surfaceState: 'live',
    folded: false,
    surfaceHidden: false,
    terminalHidden: false,
    sessions: [
      { sessionId: 'session-a', title: 'kernel-shell', activity: 'ready' },
      { sessionId: 'session-b', title: 'agent-session', activity: 'busy', restoring: true },
      { sessionId: 'session-c', title: 'audit-replay', activity: 'exited', replay: true },
    ],
  };
  const snapshot = helpers.describeSaasDetail(fixture);
  assert.equal(snapshot.schema, 'capsule-ui-kit.saas-detail-layout/v1');
  assert.equal(snapshot.capsuleId, 'capsule-01');
  assert.deepEqual(snapshot.chips, ['RUNNING', 'REC: ACTIVE']);
  assert.equal(snapshot.surface, 'live');
  assert.equal(snapshot.surfaceVisible, true);
  assert.equal(snapshot.terminalVisible, true);
  assert.equal(snapshot.anchors.fold, 'capsule/capsule-01/fold');
  assert.equal(snapshot.anchors.control, 'capsule/capsule-01/control');
  assert.equal(snapshot.anchors.scaledBadge, 'detail/capsule-01/scaled-badge');
  assert.equal(snapshot.anchors.separator, 'workspace/separator/detail-main');
  assert.equal(snapshot.anchors.ptyToggle, 'detail/capsule-01/pty-toggle');
  assert.equal(snapshot.controls.attachCta, 'saas-detail-capsule-01-attach');
  assert.equal(snapshot.tabs['session-b'], 'capsule/capsule-01/session/session-b/tab');

  const folded = helpers.describeSaasDetail({ ...fixture, folded: true });
  assert.equal(folded.surfaceVisible, false);
  assert.equal(folded.terminalVisible, false);
  const hidden = helpers.describeSaasDetail({ ...fixture, terminalHidden: true });
  assert.equal(hidden.surfaceVisible, true);
  assert.equal(hidden.terminalVisible, false);
});

test('every lane C anchor matches a merged controlRegistry family and role', async () => {
  const geometry = await loadHelpers('SaasGeometryBar');
  const splitter = await loadHelpers('SaasSplitter');
  const shell = await loadHelpers('SaasShellToggle');
  const consoleRow = await loadHelpers('SaasConsoleRow');
  const layout = await loadHelpers('SaasDetailLayout');
  const snapshot = layout.describeSaasDetail({ capsuleId: 'cap-01', lifecycle: 'running' });
  const cases = [
    [geometry.geometryStepperAnchor('cap-01', 'w'), 'detail/{id}/stepper-{w,h}', 'spinbutton'],
    [geometry.geometryStepperAnchor('cap-01', 'h'), 'detail/{id}/stepper-{w,h}', 'spinbutton'],
    [shell.shellToggleAnchor('cap-01'), 'detail/{id}/pty-toggle', 'switch'],
    [consoleRow.CONSOLE_INPUT_ANCHOR, 'terminal/composer', 'textbox'],
    [splitter.splitterAnchor('Detail-main'), 'workspace/separator/{id}', 'separator'],
    [snapshot.anchors.back, 'shell/navigation/{id}', 'button'],
    [snapshot.anchors.fold, 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', 'button'],
    [snapshot.anchors.control, 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', 'button'],
    [snapshot.anchors.record, 'capsule/{id}/{record,destroy}', 'button'],
    [snapshot.anchors.close, 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', 'button'],
    [snapshot.anchors.popout, 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', 'button'],
    [snapshot.anchors.scaledBadge, 'detail/{id}/scaled-badge', 'status'],
    [snapshot.anchors.separator, 'workspace/separator/{id}', 'separator'],
    [snapshot.anchors.ptyToggle, 'detail/{id}/pty-toggle', 'switch'],
    ['capsule/cap-01/hide', 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', 'button'],
    ['capsule/cap-01/show', 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', 'button'],
    ['capsule/cap-01/session/sess-01/tab', 'capsule/{id}/session/{sid}/tab', 'tab'],
    ['session/sess-01/attach', 'session/{sid}/{attach,stop,replay,target}', 'button'],
    ['session/sess-01/replay', 'session/{sid}/{attach,stop,replay,target}', 'button'],
  ];
  for (const [anchor, template, role] of cases) {
    const rule = matchControlFamily(anchor);
    assert.ok(rule, `family for ${anchor}`);
    assert.equal(rule.template, template, `template for ${anchor}`);
    assert.ok(rule.allowedRoles.includes(role), `role ${role} for ${anchor}`);
  }
});

test('fixture demo: geometry bar intent flow clamps at the bounds', async () => {
  const helpers = await loadHelpers('SaasGeometryBar');
  const bounds = { floor: 200, maxWidth: 4096, maxHeight: 2160 };
  const start = helpers.clampGeometry(900, 800, bounds);
  assert.deepEqual(start, { width: 900, height: 800 });
  const stepped = helpers.stepGeometryAxis(start.width, 1, { min: bounds.floor, max: bounds.maxWidth });
  assert.equal(stepped, 901);
  assert.equal(helpers.stepGeometryAxis(bounds.floor, -1, { min: bounds.floor, max: bounds.maxWidth }), null);
});
