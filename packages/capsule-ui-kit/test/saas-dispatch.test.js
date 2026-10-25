/**
 * @fileoverview SaaS dispatch skin tests (SAAS-4): SFC compile contracts, helper units,
 * fixture-driven demos, drawer-model parity, tokens-only styles, and the Send gate.
 * Covers the SaasDispatchSkin / SaasTargetRow / SaasFrozenReview / SaasAccessibleBox /
 * SaasResultRows presentation over the drawer models (props in, intents out).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  evaluateTargetEligibility,
  resolveSessionTabStatus
} from './fixtures/retired/src/orchestrator/drawerModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');

const SFC_FILES = [
  'SaasDispatchSkin.vue',
  'SaasTargetRow.vue',
  'SaasFrozenReview.vue',
  'SaasAccessibleBox.vue',
  'SaasResultRows.vue'
];

/** @type {Record<string, string>} */
const sfcSources = {};
/** @type {Record<string, any>} */
const sfcModules = {};
/** @type {any} */
let dispatchResultsModule = null;
/** @type {string} */
let themeCss = '';

async function loadScriptModule(absolutePath, filename) {
  const source = await readFile(absolutePath, 'utf8');
  const { descriptor, errors } = compilerSfc.parse(source, { filename });
  assert.equal(errors.length, 0, `${filename} parse errors: ${errors.map((e) => e.message).join('; ')}`);
  assert.ok(descriptor.script, `${filename} must include a <script> block exporting pure helpers`);
  const encoded = Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  return { source, module: await import(`data:text/javascript;base64,${encoded}`) };
}

before(async () => {
  for (const file of SFC_FILES) {
    const absolute = resolve(__dirname, '../src/saas', file);
    const { source, module } = await loadScriptModule(absolute, file);
    sfcSources[file] = source;
    sfcModules[file] = module;
  }
  const correlated = await loadScriptModule(
    resolve(__dirname, './fixtures/retired/src/orchestrator/DispatchResults.vue'),
    'DispatchResults.vue'
  );
  dispatchResultsModule = correlated.module;
  themeCss = await readFile(resolve(__dirname, '../src/design/theme.css'), 'utf8');
});

/** Neutral demo fixtures: Operator/Agent/Capsule-NN labels only, no export copy. */
function makeSessionDescriptor(overrides = {}) {
  return {
    sessionId: 'sid-01',
    capsuleId: 'cap-01',
    workspaceId: 'workspace-default',
    slotId: 'slot-01',
    generation: 1,
    epoch: 7,
    activity: 'ready',
    attachment: 'live',
    visibleInWorkspace: true,
    supportsQueue: false,
    maxQueueDepth: 0,
    currentQueueDepth: 0,
    inFlightLock: false,
    ownership: 'operator',
    adapterProtocol: 'AUSENTE',
    ...overrides
  };
}

function makeSkinTargets() {
  const descriptors = [
    makeSessionDescriptor({ sessionId: 'sid-01', capsuleId: 'cap-01', slotId: 'slot-01' }),
    makeSessionDescriptor({ sessionId: 'sid-02', capsuleId: 'cap-02', slotId: 'slot-02', activity: 'waiting-input' }),
    makeSessionDescriptor({ sessionId: 'sid-03', capsuleId: 'cap-03', slotId: 'slot-03', activity: 'exited' }),
    makeSessionDescriptor({ sessionId: 'sid-04', capsuleId: 'cap-04', slotId: 'slot-04' })
  ];
  return descriptors.map((desc, index) => {
    const elig = evaluateTargetEligibility(desc, { allowQueue: false });
    return {
      sessionId: desc.sessionId,
      capsuleId: desc.capsuleId,
      label: `Capsule-0${index + 1}`,
      eligible: elig.eligible,
      ...(elig.eligible ? {} : { ineligibleCode: elig.code, ineligibleReason: elig.reason })
    };
  });
}

function makeReviewFixture() {
  return {
    promptSha256: '8f3b2a9d'.repeat(8),
    promptByteLength: 384,
    targetIds: ['sid-01', 'sid-02'],
    targetLabels: ['Capsule-01', 'Capsule-02'],
    signatureLabel: 'LOCAL SIGNING KEY (Operator)',
    ceilingLabel: '60s HARD CEILING'
  };
}

function makePlanFixture() {
  return {
    session: 'dispatch-session-01',
    targets: ['Capsule-01', 'Capsule-02'],
    excluded: ['Capsule-03 (ineligible)', 'Capsule-04 (unselected)'],
    payloadHash: '8f3b2a9de1',
    streamTimeoutSecs: 45,
    autoRetryOnFailure: false,
    expectedAckNodes: 2
  };
}

function makeResultsFixture() {
  return [
    { requestId: 'req-01', sessionId: 'sid-01', capsuleLabel: 'Capsule-01', hostLabel: 'node-01', status: 'accepted', elapsedSecs: 0.14, hasOutput: false },
    { requestId: 'req-01', sessionId: 'sid-02', capsuleLabel: 'Capsule-02', hostLabel: 'node-02', status: 'executing', elapsedSecs: 1.82, hasOutput: false },
    { requestId: 'req-01', sessionId: 'sid-05', capsuleLabel: 'Capsule-05', hostLabel: 'node-05', status: 'verified-success', elapsedSecs: 3.4, hasOutput: true },
    { requestId: 'req-01', sessionId: 'sid-04', capsuleLabel: 'Capsule-04', hostLabel: 'node-04', status: 'verified-failure', elapsedSecs: 0.45, refusalCode: 'rc 137', refusalMessage: 'rc 137: target fault', hasOutput: false }
  ];
}

describe('saas dispatch — SFC compilation and structural contracts', () => {
  for (const file of SFC_FILES) {
    it(`${file} parses and compiles script, setup and template with plain JS only`, () => {
      const source = sfcSources[file];
      const { descriptor, errors } = compilerSfc.parse(source, { filename: file });
      assert.equal(errors.length, 0);
      assert.ok(descriptor.script, 'Expected <script> block for exported pure helpers');
      assert.ok(descriptor.scriptSetup, 'Expected <script setup> block for component logic');
      assert.ok(descriptor.template, 'Expected <template> block');
      assert.equal(descriptor.script.lang, undefined, '<script> must not use lang="ts"');
      assert.equal(descriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');
      assert.equal(
        // eslint-disable-next-line no-misleading-character-class
        /from\s+['"][^'\\"]*openvue/i.test(source),
        false,
        'Dispatch skin uses plain elements only (no direct vendor imports)'
      );
      const consumerImport = new RegExp('from\\s+[\'"][^\'"]*' + 'h' + 'oldings', 'i');
      assert.equal(consumerImport.test(source), false, 'Must not contain consumer imports');
      const compiledScript = compilerSfc.compileScript(descriptor, { id: `saas-${file}` });
      assert.ok(compiledScript.content.length > 0);
      const compiledTemplate = compilerSfc.compileTemplate({
        source: descriptor.template.content,
        filename: file,
        id: `saas-${file}`,
        compilerOptions: { bindingMetadata: compiledScript.bindings }
      });
      assert.equal(
        compiledTemplate.errors.length,
        0,
        `Template compile errors: ${compiledTemplate.errors.map((e) => (typeof e === 'string' ? e : e.message)).join('; ')}`
      );
    });
  }

  it('SaasTargetRow template carries checkbox anchors, roles and accessible names', () => {
    const { descriptor } = compilerSfc.parse(sfcSources['SaasTargetRow.vue'], { filename: 'SaasTargetRow.vue' });
    const tpl = descriptor.template.content;
    for (const kept of [
      'drawer/targets/all',
      'drawer/targets/clear',
      'type="checkbox"',
      'aria-label',
      ':checked',
      'aria-disabled',
      'INELIGIBLE',
      'Select all in workspace',
      'No recipients selected (Send disabled)'
    ]) {
      assert.ok(tpl.includes(kept), `SaasTargetRow template must keep ${kept}`);
    }
    assert.ok(
      sfcSources['SaasTargetRow.vue'].includes('drawer/targets/${'),
      'SaasTargetRow script must build drawer/targets/{sid} anchors'
    );
  });

  it('SaasFrozenReview template carries the review-confirm anchor and schematic rows', () => {
    const { descriptor } = compilerSfc.parse(sfcSources['SaasFrozenReview.vue'], { filename: 'SaasFrozenReview.vue' });
    const tpl = descriptor.template.content;
    for (const kept of [
      ':data-semantic-anchor="confirmAnchor"',
      'Confirm dispatch (lock and broadcast)',
      'PRE-COMMIT',
      'role="button"',
      'role="alert"',
      'role="status"'
    ]) {
      assert.ok(tpl.includes(kept), `SaasFrozenReview template must keep ${kept}`);
    }
    for (const kept of [
      'dispatch/${',
      '/review-confirm',
      'drawer/review/confirm',
      'SHA-256 Digest:',
      'Target Capsules:',
      'Signature Auth:',
      'Max Execution Window:'
    ]) {
      assert.ok(
        sfcSources['SaasFrozenReview.vue'].includes(kept),
        `SaasFrozenReview script must build the confirm anchors (${kept})`
      );
    }
  });

  it('SaasAccessibleBox template carries the accessible-text anchor and plan line', () => {
    const { descriptor } = compilerSfc.parse(sfcSources['SaasAccessibleBox.vue'], { filename: 'SaasAccessibleBox.vue' });
    const tpl = descriptor.template.content;
    for (const kept of [
      ':data-semantic-anchor="boxAnchor"',
      'role="region"',
      'Structured accessibility and automation summary',
      'No dispatch plan staged.'
    ]) {
      assert.ok(tpl.includes(kept), `SaasAccessibleBox template must keep ${kept}`);
    }
    for (const kept of ['output/${', '/text', 'drawer/accessible-text']) {
      assert.ok(
        sfcSources['SaasAccessibleBox.vue'].includes(kept),
        `SaasAccessibleBox script must build the box anchors (${kept})`
      );
    }
  });

  it('SaasResultRows template carries result/retry/cancel anchors and four-state actions', () => {
    const { descriptor } = compilerSfc.parse(sfcSources['SaasResultRows.vue'], { filename: 'SaasResultRows.vue' });
    const tpl = descriptor.template.content;
    for (const kept of [
      'role="region"',
      'role="button"',
      'role="status"',
      'Retry target ${',
      'Cancel run on ${',
      'View output for ${',
      'Elapsed:',
      'No target executions recorded.'
    ]) {
      assert.ok(tpl.includes(kept), `SaasResultRows template must keep ${kept}`);
    }
    for (const kept of ['dispatch/${', '/result', '/retry', '/cancel']) {
      assert.ok(
        sfcSources['SaasResultRows.vue'].includes(kept),
        `SaasResultRows script must build dispatch anchors (${kept})`
      );
    }
  });

  it('SaasDispatchSkin template carries drawer anchors, composer and Send gate bindings', () => {
    const { descriptor } = compilerSfc.parse(sfcSources['SaasDispatchSkin.vue'], { filename: 'SaasDispatchSkin.vue' });
    const tpl = descriptor.template.content;
    for (const kept of [
      'drawer/toggle',
      'drawer/maximize',
      'drawer/composer',
      'drawer/send',
      'role="tablist"',
      'role="tab"',
      'aria-selected',
      'Payload Dispatch Composer',
      ':disabled="!sendEnabled"',
      'Send Payload',
      'Dry Run',
      'SaasTargetRow',
      'SaasFrozenReview',
      'SaasAccessibleBox',
      'SaasResultRows'
    ]) {
      assert.ok(tpl.includes(kept), `SaasDispatchSkin template must keep ${kept}`);
    }
  });
});

describe('SaasTargetRow — projection, selection and demos', () => {
  it('validates descriptors fail-closed', () => {
    const { validateSaasTargetDescriptor } = sfcModules['SaasTargetRow.vue'];
    assert.equal(validateSaasTargetDescriptor(null).ok, false);
    assert.equal(validateSaasTargetDescriptor({}).ok, false);
    assert.equal(validateSaasTargetDescriptor({ sessionId: 'sid-01', capsuleId: 'cap-01' }).ok, false);
    const good = validateSaasTargetDescriptor({ sessionId: 'sid-01', capsuleId: 'cap-01', eligible: true });
    assert.equal(good.ok, true);
  });

  it('projects stable anchors and names; ineligible rows carry reason', () => {
    const { projectSaasTargetRow } = sfcModules['SaasTargetRow.vue'];
    const [ready, , exited] = makeSkinTargets();
    const checked = projectSaasTargetRow(ready, ['sid-01']);
    assert.equal(checked.anchor, 'drawer/targets/sid-01');
    assert.equal(checked.checked, true);
    assert.equal(checked.statusBadge, 'Ready');
    assert.match(checked.accessibleName, /Target session sid-01/);
    const blocked = projectSaasTargetRow(exited, ['sid-03']);
    assert.equal(blocked.anchor, 'drawer/targets/sid-03');
    assert.equal(blocked.checked, true);
    assert.equal(blocked.statusBadge, 'Ineligible');
    assert.match(blocked.accessibleName, /ineligible/);
    assert.ok(blocked.ineligibleCode);
  });

  it('toggle never admits ineligible sessions; select-all takes eligible only', () => {
    const { projectSaasTargetRow, toggleSaasTargetSelection, selectAllSaasTargets } =
      sfcModules['SaasTargetRow.vue'];
    const rows = makeSkinTargets().map((t) => projectSaasTargetRow(t, []));
    assert.deepEqual(selectAllSaasTargets(rows), ['sid-01', 'sid-02', 'sid-04']);
    assert.deepEqual(toggleSaasTargetSelection([], 'sid-03', false), []);
    assert.deepEqual(toggleSaasTargetSelection(['sid-01'], 'sid-01', true), []);
    assert.deepEqual(toggleSaasTargetSelection(['sid-02'], 'sid-01', true), ['sid-01', 'sid-02']);
  });

  it('demo: drawer eligibility flows into the skin summary and Send blocker', () => {
    const { projectSaasTargetRow, summarizeSaasTargetSelection } = sfcModules['SaasTargetRow.vue'];
    const rows = makeSkinTargets().map((t) => projectSaasTargetRow(t, ['sid-01', 'sid-02']));
    const summary = summarizeSaasTargetSelection(rows, ['sid-01', 'sid-02']);
    assert.deepEqual({ ...summary }, { selected: 2, eligible: 3, total: 4, sendBlockedByTargets: false });
    const empty = summarizeSaasTargetSelection(rows, []);
    assert.equal(empty.sendBlockedByTargets, true);
    const ineligibleOnly = summarizeSaasTargetSelection(rows, ['sid-03']);
    assert.equal(ineligibleOnly.selected, 0);
    assert.equal(ineligibleOnly.sendBlockedByTargets, true);
  });
});

describe('SaasFrozenReview — schematic review and demos', () => {
  it('validates the frozen shape fail-closed', () => {
    const { validateFrozenReviewShape } = sfcModules['SaasFrozenReview.vue'];
    assert.equal(validateFrozenReviewShape(null).ok, false);
    assert.equal(validateFrozenReviewShape({ promptSha256: 'zz', targetIds: ['sid-01'] }).ok, false);
    assert.equal(validateFrozenReviewShape({ promptSha256: 'a'.repeat(64), targetIds: [] }).ok, false);
    assert.equal(validateFrozenReviewShape(makeReviewFixture()).ok, true);
  });

  it('shortens digests to the 8+...+6 shape and refuses non-hex', () => {
    const { shortFrozenDigest } = sfcModules['SaasFrozenReview.vue'];
    const digest = '8f3b2a9d'.repeat(8);
    assert.equal(shortFrozenDigest(digest), `${digest.slice(0, 8)}...${digest.slice(-6)}`);
    assert.equal(shortFrozenDigest('nope'), 'digest unavailable');
    assert.equal(shortFrozenDigest(null), 'digest unavailable');
  });

  it('builds per-dispatch confirm anchors with a drawer-scoped fallback', () => {
    const { saasReviewConfirmAnchor, SAAS_REVIEW_CONFIRM_ANCHOR } =
      sfcModules['SaasFrozenReview.vue'];
    assert.equal(saasReviewConfirmAnchor('disp-01'), 'dispatch/disp-01/review-confirm');
    assert.equal(saasReviewConfirmAnchor(''), SAAS_REVIEW_CONFIRM_ANCHOR);
    assert.equal(saasReviewConfirmAnchor(null), 'drawer/review/confirm');
  });

  it('demo: review projects the four schematic rows with neutral labels', () => {
    const { projectFrozenReviewRows, eligibleTargetsSummary } = sfcModules['SaasFrozenReview.vue'];
    const review = makeReviewFixture();
    assert.equal(eligibleTargetsSummary(review), '2 Eligible (Capsule-01, Capsule-02)');
    const rows = projectFrozenReviewRows(review);
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.map((r) => r.key),
      ['SHA-256 Digest:', 'Target Capsules:', 'Signature Auth:', 'Max Execution Window:']
    );
    assert.deepEqual(
      rows.map((r) => r.tone),
      ['digest', 'eligible', 'signature', 'ceiling']
    );
    assert.match(rows[0].value, /\.\.\./);
  });
});

describe('SaasAccessibleBox — plan line and demos', () => {
  it('validates the plan shape fail-closed', () => {
    const { validateAccessibleDispatchPlan } = sfcModules['SaasAccessibleBox.vue'];
    assert.equal(validateAccessibleDispatchPlan(null).ok, false);
    assert.equal(validateAccessibleDispatchPlan({ ...makePlanFixture(), payloadHash: 'ZZZ' }).ok, false);
    assert.equal(validateAccessibleDispatchPlan({ ...makePlanFixture(), targets: 'sid-01' }).ok, false);
    assert.equal(validateAccessibleDispatchPlan(makePlanFixture()).ok, true);
  });

  it('demo: plan formats the exact single machine-readable line', () => {
    const { formatAccessibleDispatchLine } = sfcModules['SaasAccessibleBox.vue'];
    assert.equal(
      formatAccessibleDispatchLine(makePlanFixture()),
      '[ORCHESTRATOR_DISPATCH_PLAN] session="dispatch-session-01" | ' +
        'targets=[Capsule-01, Capsule-02] | excluded=[Capsule-03 (ineligible), Capsule-04 (unselected)] | ' +
        'payload_hash="8f3b2a9de1" | stream_timeout=45.0s | auto_retry_on_failure=false | expected_ack_nodes=2'
    );
  });

  it('sanitizes atoms so the line keeps its key="value" shape', () => {
    const { formatAccessibleDispatchLine, sanitizePlanAtom } = sfcModules['SaasAccessibleBox.vue'];
    assert.equal(sanitizePlanAtom('a"b\nc'), "a'b c");
    const line = formatAccessibleDispatchLine({
      ...makePlanFixture(),
      session: 'we\nird "name"',
      expectedAckNodes: 0
    });
    assert.ok(line.includes('session="we ird \'name\'"'));
    assert.ok(line.endsWith('expected_ack_nodes=0'));
  });

  it('builds per-session box anchors with a drawer-scoped fallback', () => {
    const { saasAccessibleBoxAnchor, SAAS_ACCESSIBLE_BOX_ANCHOR } =
      sfcModules['SaasAccessibleBox.vue'];
    assert.equal(saasAccessibleBoxAnchor('sess-01'), 'output/sess-01/text');
    assert.equal(saasAccessibleBoxAnchor(''), SAAS_ACCESSIBLE_BOX_ANCHOR);
    assert.equal(saasAccessibleBoxAnchor(undefined), 'drawer/accessible-text');
  });

  it('defaults timeout, retry and ack count when the consumer omits them', () => {
    const { formatAccessibleDispatchLine } = sfcModules['SaasAccessibleBox.vue'];
    const line = formatAccessibleDispatchLine({
      session: 'dispatch-session-02',
      targets: ['Capsule-01'],
      excluded: [],
      payloadHash: 'ab'.repeat(16)
    });
    assert.ok(line.includes('stream_timeout=45.0s'));
    assert.ok(line.includes('auto_retry_on_failure=false'));
    assert.ok(line.includes('expected_ack_nodes=1'));
  });
});

describe('SaasResultRows — chips, gating and demos', () => {
  it('validates result inputs against the run-status vocabulary', () => {
    const { validateSaasResultInput } = sfcModules['SaasResultRows.vue'];
    assert.equal(validateSaasResultInput(null).ok, false);
    assert.equal(
      validateSaasResultInput({ requestId: 'req-01', sessionId: 'sid-01', status: 'flying' }).ok,
      false
    );
    assert.equal(
      validateSaasResultInput({ requestId: 'req-01', sessionId: 'sid-01', status: 'accepted' }).ok,
      true
    );
  });

  it('maps all twelve run statuses onto the four chips', () => {
    const { mapSaasResultChip, SAAS_TARGET_RUN_STATUSES } = sfcModules['SaasResultRows.vue'];
    assert.equal(SAAS_TARGET_RUN_STATUSES.length, 12);
    const labels = Object.fromEntries(
      SAAS_TARGET_RUN_STATUSES.map((status) => [status, mapSaasResultChip(status).label])
    );
    assert.deepEqual(labels, {
      pending: 'ACCEPTED',
      accepted: 'ACCEPTED',
      queued: 'ACCEPTED',
      executing: 'EXECUTING',
      'waiting-permission': 'ACCEPTED',
      'waiting-input': 'ACCEPTED',
      'completed-unverified': 'COMPLETED',
      'verified-success': 'COMPLETED',
      'verified-failure': 'FAILED',
      refused: 'FAILED',
      cancelled: 'FAILED',
      uncertain: 'FAILED'
    });
    assert.equal(mapSaasResultChip('executing').spinner, true);
    assert.equal(mapSaasResultChip('executing').tone, 'warning');
    assert.equal(mapSaasResultChip('accepted').tone, 'info');
    assert.equal(mapSaasResultChip('verified-success').tone, 'success');
    assert.equal(mapSaasResultChip('refused').tone, 'error');
  });

  it('never renders zero for unknown elapsed; formats finite seconds', () => {
    const { formatSaasElapsed } = sfcModules['SaasResultRows.vue'];
    assert.equal(formatSaasElapsed(0.14), '0.14s');
    assert.equal(formatSaasElapsed(undefined), '—');
    assert.equal(formatSaasElapsed(-1), '—');
    assert.equal(formatSaasElapsed(Number.NaN), '—');
  });

  it('matches DispatchResults gating constants and per-status retry/cancel parity', () => {
    const skin = sfcModules['SaasResultRows.vue'];
    assert.deepEqual(
      [...skin.SAAS_RETRYABLE_STATUSES].sort(),
      [...dispatchResultsModule.TERMINAL_FAILURE_RETRYABLE_STATUSES].sort()
    );
    assert.deepEqual(
      [...skin.SAAS_CANCELLABLE_STATUSES].sort(),
      [...dispatchResultsModule.CANCELLABLE_IN_FLIGHT_STATUSES].sort()
    );
    for (const status of skin.SAAS_TARGET_RUN_STATUSES) {
      const outcome = dispatchResultsModule.classifyTargetOutcomeView({
        status,
        cancelRequested: false,
        adapterCompleted: false,
        cliWithoutCompletionWitness: false
      });
      assert.equal(skin.isSaasRetryAllowed(status), outcome.retryAllowed, `retry parity for ${status}`);
      assert.equal(
        skin.isSaasCancelAllowed(status, false),
        outcome.cancelAllowed,
        `cancel parity for ${status}`
      );
    }
    assert.equal(skin.isSaasCancelAllowed('executing', true), false);
  });

  it('demo: four fixture rows project chips, anchors, elapsed and actions', () => {
    const { projectSaasResultRow } = sfcModules['SaasResultRows.vue'];
    const [accepted, executing, completed, failed] = makeResultsFixture().map(projectSaasResultRow);
    assert.equal(accepted.chip.label, 'ACCEPTED');
    assert.equal(accepted.cancelAllowed, true);
    assert.equal(accepted.retryAllowed, false);
    assert.equal(accepted.elapsedText, '0.14s');
    assert.equal(executing.chip.label, 'EXECUTING');
    assert.equal(executing.chip.spinner, true);
    assert.equal(completed.chip.label, 'COMPLETED');
    assert.equal(completed.viewOutputAllowed, true);
    assert.equal(failed.chip.label, 'FAILED');
    assert.equal(failed.retryAllowed, true);
    assert.equal(failed.detailText, '(rc 137)');
    assert.equal(failed.retryAnchor, 'dispatch/req-01/target/sid-04/retry');
    assert.equal(failed.cancelAnchor, 'dispatch/req-01/target/sid-04/cancel');
    assert.equal(failed.resultAnchor, 'dispatch/req-01/target/sid-04/result');
    assert.match(failed.accessibleName, /Result for sid-04 in dispatch req-01: FAILED/);
    const uncertain = projectSaasResultRow({
      requestId: 'req-01',
      sessionId: 'sid-09',
      status: 'uncertain'
    });
    assert.equal(uncertain.chip.label, 'FAILED');
    assert.match(uncertain.detailText, /reconcile required/);
    assert.equal(uncertain.retryAllowed, false);
  });
});

describe('SaasDispatchSkin — Send gate, tabs, composer and demos', () => {
  it('declares the 705px expanded drawer geometry target', () => {
    const { SAAS_DISPATCH_DRAWER_HEIGHT_PX, SAAS_DISPATCH_PRESENTATIONS } =
      sfcModules['SaasDispatchSkin.vue'];
    assert.equal(SAAS_DISPATCH_DRAWER_HEIGHT_PX, 705);
    assert.deepEqual([...SAAS_DISPATCH_PRESENTATIONS], ['collapsed', 'expanded', 'maximized']);
  });

  it('empty targets disable Send; empty never means all', () => {
    const { isSaasSendEnabled, saasSendUnavailableReason } = sfcModules['SaasDispatchSkin.vue'];
    assert.equal(isSaasSendEnabled({ targetIds: [], promptReady: true, imeComposing: false }), false);
    assert.equal(isSaasSendEnabled({ targetIds: null, promptReady: true, imeComposing: false }), false);
    assert.equal(
      isSaasSendEnabled({ targetIds: undefined, promptReady: true, imeComposing: false }),
      false
    );
    assert.equal(
      isSaasSendEnabled({ targetIds: ['sid-01'], promptReady: false, imeComposing: false }),
      false
    );
    assert.equal(
      isSaasSendEnabled({ targetIds: ['sid-01'], promptReady: true, imeComposing: true }),
      false
    );
    assert.equal(
      isSaasSendEnabled({ targetIds: ['sid-01', 'sid-02'], promptReady: true, imeComposing: false }),
      true
    );
    assert.match(
      saasSendUnavailableReason({ targetIds: [], promptReady: true, imeComposing: false }),
      /empty never means all/
    );
  });

  it('matches the drawer tab-dot mapping across activities', () => {
    const { resolveSaasDispatchTabDot } = sfcModules['SaasDispatchSkin.vue'];
    for (const activity of [
      'unknown',
      'ready',
      'busy',
      'waiting-input',
      'waiting-permission',
      'exited',
      'failed',
      'something-new'
    ]) {
      assert.equal(resolveSaasDispatchTabDot(activity), resolveSessionTabStatus(activity), activity);
    }
  });

  it('projects session tabs with stable names and active flags', () => {
    const { projectSaasDispatchTab } = sfcModules['SaasDispatchSkin.vue'];
    const tab = projectSaasDispatchTab(
      { sessionId: 'dispatch-session-01', label: 'Dispatch 01', activity: 'busy' },
      'dispatch-session-01'
    );
    assert.deepEqual({ ...tab }, {
      sessionId: 'dispatch-session-01',
      label: 'Dispatch 01',
      dot: 'busy',
      active: true,
      accessibleName: 'Dispatch session Dispatch 01 (busy, active)'
    });
  });

  it('measures composer bytes as UTF-8 and formats the counter', () => {
    const { saasComposerByteLength, formatSaasByteCount } = sfcModules['SaasDispatchSkin.vue'];
    assert.equal(saasComposerByteLength('plain ascii'), 11);
    assert.equal(saasComposerByteLength('é'), 2);
    assert.equal(saasComposerByteLength(null), 0);
    assert.equal(formatSaasByteCount(384, 4096), '384 / 4096 BYTES');
    assert.equal(formatSaasByteCount(-1, 0), '0 / 4096 BYTES');
  });

  it('demo: full drawer state enables Send and binds every pane fixture', () => {
    const skin = sfcModules['SaasDispatchSkin.vue'];
    const targets = makeSkinTargets();
    const selected = ['sid-01', 'sid-02'];
    assert.equal(
      skin.isSaasSendEnabled({ targetIds: selected, promptReady: true, imeComposing: false }),
      true
    );
    const tabs = [
      { sessionId: 'dispatch-session-01', label: 'Dispatch 01', activity: 'ready' },
      { sessionId: 'dispatch-session-02', label: 'Dispatch 02', activity: 'busy' },
      { sessionId: 'dispatch-session-03', label: 'Dispatch 03', activity: 'exited' }
    ].map((session) => skin.projectSaasDispatchTab(session, 'dispatch-session-01'));
    assert.deepEqual(
      tabs.map((t) => t.dot),
      ['idle', 'busy', 'exited']
    );
    assert.equal(targets.filter((t) => t.eligible).length, 3);
    assert.equal(skin.formatSaasByteCount(skin.saasComposerByteLength('x'.repeat(384)), 4096), '384 / 4096 BYTES');
  });
});

describe('saas dispatch — agent_lane anchor inventory', () => {
  it('keeps the stable anchor surface across the five templates', () => {
    const anchors = new Set();
    for (const file of SFC_FILES) {
      const { descriptor } = compilerSfc.parse(sfcSources[file], { filename: file });
      const tpl = descriptor.template.content;
      for (const match of tpl.matchAll(/data-semantic-anchor="([^"]+)"/g)) anchors.add(match[1]);
      for (const match of tpl.matchAll(/:data-semantic-anchor="([^"]+)"/g)) anchors.add(match[1]);
    }
    for (const kept of [
      'drawer/toggle',
      'drawer/maximize',
      'drawer/composer',
      'drawer/send',
      'drawer/targets/all',
      'drawer/targets/clear'
    ]) {
      assert.ok(anchors.has(kept), `anchor inventory must keep ${kept}`);
    }
    const shapes = SFC_FILES.map((file) => sfcSources[file]).join('\n');
    assert.match(shapes, /drawer\/targets\/\$\{/);
    assert.match(shapes, /dispatch\/\$\{/);
    assert.match(shapes, /\/target\/\$\{[^}]*\}\/result/);
    assert.match(shapes, /\/target\/\$\{[^}]*\}\/retry/);
    assert.match(shapes, /\/target\/\$\{[^}]*\}\/cancel/);
    assert.match(shapes, /\/review-confirm/);
    assert.match(shapes, /output\/\$\{/);
  });
});

describe('saas dispatch — tokens-only styles', () => {
  it('references only defined kit tokens with no raw colours, sizes or fallbacks', () => {
    const defined = new Set();
    for (const match of themeCss.matchAll(/^\s*(--cuk-[a-z0-9-_]+)\s*:/gm)) {
      defined.add(match[1]);
    }
    assert.ok(defined.size > 100, 'Expected the kit token contract in theme.css');
    for (const file of SFC_FILES) {
      const { descriptor } = compilerSfc.parse(sfcSources[file], { filename: file });
      assert.ok(descriptor.styles.length > 0, `${file} must carry scoped token styles`);
      for (const styleBlock of descriptor.styles) {
        const css = styleBlock.content.replace(/\/\*[\s\S]*?\*\//g, '');
        assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${file}: no raw hex colours`);
        assert.doesNotMatch(css, /rgba?\s*\(/, `${file}: no raw rgb() colours`);
        assert.doesNotMatch(css, /hsla?\s*\(/, `${file}: no raw hsl() colours`);
        assert.doesNotMatch(css, /\d+(\.\d+)?px/, `${file}: no raw px sizes`);
        assert.doesNotMatch(css, /\d+(\.\d+)?(em|rem)\b/, `${file}: no raw em/rem sizes`);
        for (const match of css.matchAll(/var\(\s*(--[a-z0-9-_]+)\s*([^)]*)\)/g)) {
          assert.ok(defined.has(match[1]), `${file}: style references undefined token ${match[1]}`);
          assert.equal(match[2].trim(), '', `${file}: var(${match[1]}) must not carry a raw fallback`);
        }
      }
    }
  });

  it('collapses motion under prefers-reduced-motion and rings Retry focus', () => {
    const { descriptor } = compilerSfc.parse(sfcSources['SaasResultRows.vue'], {
      filename: 'SaasResultRows.vue'
    });
    const css = descriptor.styles.map((s) => s.content).join('\n');
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /animation:\s*none/);
    assert.match(css, /saas-result-rows__btn--retry/);
    assert.match(css, /focus-ring-width/);
    assert.match(css, /focus-ring-color/);
    for (const file of SFC_FILES) {
      if (file === 'SaasAccessibleBox.vue') continue;
      const parsed = compilerSfc.parse(sfcSources[file], { filename: file });
      const all = parsed.descriptor.styles.map((s) => s.content).join('\n');
      assert.match(all, /:focus-visible/, `${file}: visible focus state required`);
    }
  });
});
