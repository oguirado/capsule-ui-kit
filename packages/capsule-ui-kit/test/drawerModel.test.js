import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAWER_REVIEW_SCHEMA,
  toCanonicalJson,
  sha256Hex,
  resolveDispatchRequestId,
  validateSessionTargetDescriptor,
  evaluateTargetEligibility,
  validatePromptDraft,
  createDrawerModel
} from '../src/orchestrator/drawerModel.js';

/**
 * Helper to build a valid session target descriptor with overrides.
 *
 * @param {Partial<import('../src/orchestrator/drawerModel.js').SessionTargetDescriptor>} [overrides]
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

describe('Drawer model — Prompt & Target Schemas First', () => {
  it('validates prompt drafts and rejects non-strings, empty/whitespace, NUL bytes, and over-bound UTF-8 payloads', () => {
    const valid = validatePromptDraft('Inspect sector 4 balances\nand report.');
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.byteLength, Buffer.byteLength('Inspect sector 4 balances\nand report.', 'utf8'));
      assert.match(valid.sha256, /^[0-9a-f]{64}$/);
    }

    assert.equal(validatePromptDraft(123).ok, false);
    assert.equal(validatePromptDraft('').ok, false);
    assert.equal(validatePromptDraft('   \n\t  ').ok, false);

    const nulCheck = validatePromptDraft('hello\u0000world');
    assert.equal(nulCheck.ok, false);
    if (!nulCheck.ok) {
      assert.equal(nulCheck.code, 'PROMPT_NULL_BYTE');
    }

    const overCap = validatePromptDraft('abcd', { maxPromptBytes: 3 });
    assert.equal(overCap.ok, false);
    if (!overCap.ok) {
      assert.equal(overCap.code, 'PROMPT_OVER_BYTE_CAP');
    }
  });

  it('enforces closed schema on session target descriptors and rejects unknown keys or invalid enums', () => {
    const good = validateSessionTargetDescriptor(makeSession());
    assert.equal(good.ok, true);

    const unknownKey = validateSessionTargetDescriptor({ ...makeSession(), injectedField: true });
    assert.equal(unknownKey.ok, false);
    if (!unknownKey.ok) {
      assert.equal(unknownKey.code, 'SCHEMA_UNKNOWN_KEY');
    }

    const badActivity = validateSessionTargetDescriptor(makeSession({ activity: /** @type {any} */ ('running') }));
    assert.equal(badActivity.ok, false);
    if (!badActivity.ok) {
      assert.equal(badActivity.code, 'SCHEMA_INVALID_ACTIVITY');
    }

    const badGen = validateSessionTargetDescriptor(makeSession({ generation: -1 }));
    assert.equal(badGen.ok, false);
    if (!badGen.ok) {
      assert.equal(badGen.code, 'SCHEMA_INVALID_GENERATION');
    }
  });

  it('computes deterministic canonical JSON and rejects floats or undefined properties', () => {
    const a = toCanonicalJson({ b: 2, a: 'x', nested: { z: true, m: null } });
    const b = toCanonicalJson({ nested: { m: null, z: true }, a: 'x', b: 2 });
    assert.equal(a, b);
    assert.equal(a, '{"a":"x","b":2,"nested":{"m":null,"z":true}}');

    assert.throws(() => toCanonicalJson(1.5), TypeError);
    assert.throws(() => toCanonicalJson(NaN), TypeError);
  });
});

describe('Drawer model — Presentation, Independent Identities & Collapse Continuity (§7)', () => {
  it('transitions collapsed/expanded/maximized while preserving draft, targets, scroll, and sessions on collapse', () => {
    const model = createDrawerModel({ workspaceId: 'ws-main', initialHeightPx: 300 });
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1' }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2', activity: 'waiting-input' })
    ]);

    model.setPromptText('consumer quarter summary');
    model.selectManyTargets(['sid-1', 'sid-2']);
    model.setScrollPosition(120);
    model.setViewedSession('sid-1');
    model.setFocusedTerminalSession('sid-2');
    model.setControllingSession('sid-1');

    // Focused/viewed/controlling identities do not alter selected target checkboxes
    assert.deepEqual(model.getState().selectedTargetIds, ['sid-1', 'sid-2']);
    assert.equal(model.getState().viewedSessionId, 'sid-1');
    assert.equal(model.getState().focusedTerminalSessionId, 'sid-2');

    // Expand -> Maximize -> Collapse -> Toggle restores maximized
    const t1 = model.toggleDrawer();
    assert.equal(t1.presentation, 'expanded');
    assert.equal(t1.focusTarget, 'drawer/composer');

    model.resizeExpandedHeight(420);
    assert.equal(model.getState().expandedHeightPx, 420);

    const max = model.toggleMaximize();
    assert.equal(max.presentation, 'maximized');

    const col = model.collapse();
    assert.equal(col.presentation, 'collapsed');
    assert.equal(col.focusTarget, 'drawer/toggle');

    // Collapse preserves draft, targets, scroll position, and sessions
    const afterCollapse = model.getState();
    assert.equal(afterCollapse.promptText, 'consumer quarter summary');
    assert.deepEqual(afterCollapse.selectedTargetIds, ['sid-1', 'sid-2']);
    assert.equal(afterCollapse.draftScrollTop, 120);

    const reopen = model.toggleDrawer();
    assert.equal(reopen.presentation, 'maximized');
    assert.equal(reopen.activeSessionsPreserved, 2);
  });
});

describe('Drawer model — Negative Contrast: Empty Targets & All/Basis/Prompt Change Invalidates Review (§7, §13)', () => {
  it('refuses review and disables Send when targets are empty (empty NEVER means all)', () => {
    const model = createDrawerModel({ workspaceId: 'ws-main' });
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1' }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2' })
    ]);
    model.setPromptText('Audit production lines');

    // No targets selected initially
    assert.equal(model.getState().sendEnabled, false);
    const rev = model.beginReview();
    assert.equal(rev.ok, false);
    if (!rev.ok) {
      assert.equal(rev.code, 'TARGETS_EMPTY');
    }

    const sendControl = model
      .getSemanticControlInventory()
      .find((c) => c.anchor === 'drawer/send');
    assert.ok(sendControl);
    assert.equal(sendControl.disabled, true);
    assert.match(sendControl.reason ?? '', /Empty targets disable Send/);
  });

  it('invalidates review when prompt, selected targets, or target readiness basis changes', () => {
    const model = createDrawerModel({ workspaceId: 'ws-main' });
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1' }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2' })
    ]);
    model.setPromptText('Verify supply chain');
    model.selectOneTarget('sid-1');

    // 1. Freeze review, then mutate prompt -> invalidates review
    const r1 = model.beginReview();
    assert.equal(r1.ok, true);
    assert.equal(model.getState().reviewing, true);

    model.setPromptText('Verify supply chain (edited)');
    assert.equal(model.getState().reviewing, false);
    assert.equal(model.getState().lastInvalidation?.code, 'REVIEW_INVALIDATED_PROMPT_CHANGED');

    // Submitting after invalidation refuses
    const subAfterPromptEdit = model.submitReviewedDispatch({
      session: 'sess-a',
      authenticated_sender_instance: 'ui-1',
      nonce: 'n-1',
      seq: 1
    });
    assert.equal(subAfterPromptEdit.ok, false);
    if (!subAfterPromptEdit.ok) {
      assert.equal(subAfterPromptEdit.code, 'REVIEW_INVALIDATED_PROMPT_CHANGED');
    }

    // 2. Freeze review again, then clear/change targets -> invalidates review
    assert.equal(model.beginReview().ok, true);
    model.toggleTarget('sid-2');
    assert.equal(model.getState().reviewing, false);
    assert.equal(model.getState().lastInvalidation?.code, 'REVIEW_INVALIDATED_TARGETS_CHANGED');

    assert.equal(model.beginReview().ok, true);
    model.clearTargets();
    assert.equal(model.getState().reviewing, false);
    assert.equal(model.getState().lastInvalidation?.code, 'REVIEW_INVALIDATED_TARGETS_EMPTY');

    // 3. Freeze review again, then target epoch/ownership/activity changes -> invalidates review
    model.selectOneTarget('sid-1');
    assert.equal(model.beginReview().ok, true);
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1', epoch: 11 }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2' })
    ]);
    assert.equal(model.getState().reviewing, false);
    assert.equal(model.getState().lastInvalidation?.code, 'REVIEW_INVALIDATED_BASIS_CHANGED');
  });

  it('expands "All" into explicit visible set before review, and invalidates review if a new session appears or visibility changes (all-change invalidates review)', () => {
    const model = createDrawerModel({ workspaceId: 'ws-main' });
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1', visibleInWorkspace: true }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2', visibleInWorkspace: true }),
      makeSession({ sessionId: 'sid-hidden', slotId: 'slot-3', visibleInWorkspace: false })
    ]);
    model.setPromptText('Run diagnostic across workspace');

    const allSel = model.selectAllVisibleInWorkspace();
    assert.deepEqual(allSel.targetIds, ['sid-1', 'sid-2']);

    const rev = model.beginReview();
    assert.equal(rev.ok, true);
    if (rev.ok) {
      assert.equal(rev.review.schema, DRAWER_REVIEW_SCHEMA);
      assert.deepEqual(rev.review.targetIds, ['sid-1', 'sid-2']);
      assert.deepEqual(rev.review.visibleScopeIds, ['sid-1', 'sid-2']);
    }

    // Newly created visible session arrives while in "all" mode -> cannot silently join reviewed dispatch; invalidates review!
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1', visibleInWorkspace: true }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2', visibleInWorkspace: true }),
      makeSession({ sessionId: 'sid-hidden', slotId: 'slot-3', visibleInWorkspace: false }),
      makeSession({ sessionId: 'sid-new', slotId: 'slot-4', visibleInWorkspace: true })
    ]);

    assert.equal(model.getState().reviewing, false);
    assert.equal(model.getState().lastInvalidation?.code, 'REVIEW_INVALIDATED_ALL_SCOPE_CHANGED');

    const subAttempt = model.submitReviewedDispatch({
      session: 'sess-a',
      authenticated_sender_instance: 'ui-1',
      nonce: 'n-2',
      seq: 2
    });
    assert.equal(subAttempt.ok, false);
    if (!subAttempt.ok) {
      assert.equal(subAttempt.code, 'REVIEW_INVALIDATED_ALL_SCOPE_CHANGED');
    }
  });
});

describe('Drawer model — G2 Request Identity & Dedup, G3 Slot Locks, G4 Target Eligibility', () => {
  it('derives deterministic request_id per G2 formula and refuses missing session/sender/nonce/seq', () => {
    const meta = {
      session: 'core-sess-01',
      authenticated_sender_instance: 'renderer-main-1',
      nonce: 'nonce-abc',
      seq: 42
    };
    const r1 = resolveDispatchRequestId(meta);
    const r2 = resolveDispatchRequestId({ ...meta });
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    if (r1.ok && r2.ok) {
      assert.equal(r1.derived, true);
      assert.equal(r1.requestId, r2.requestId);
      const expectedCanonical = JSON.stringify([
        'dispatch-request/v1',
        'core-sess-01',
        'renderer-main-1',
        'nonce-abc',
        42
      ]);
      assert.equal(r1.requestId, sha256Hex(expectedCanonical));
    }

    assert.equal(
      resolveDispatchRequestId({ session: '', authenticated_sender_instance: 'a', nonce: '1', seq: 0 }).ok,
      false
    );
    assert.equal(
      resolveDispatchRequestId({ session: 's', authenticated_sender_instance: '', nonce: '1', seq: 0 }).ok,
      false
    );
    assert.equal(
      resolveDispatchRequestId({ session: 's', authenticated_sender_instance: 'a', nonce: '', seq: 0 }).ok,
      false
    );
    assert.equal(
      resolveDispatchRequestId({ session: 's', authenticated_sender_instance: 'a', nonce: '1', seq: -1 }).ok,
      false
    );
  });

  it('enforces G4 eligibility: only ready and waiting-input are eligible; busy/unknown/exited/failed/waiting-permission/disconnected refuse', () => {
    for (const act of ['ready', 'waiting-input']) {
      const res = evaluateTargetEligibility(makeSession({ activity: /** @type {any} */ (act) }));
      assert.equal(res.eligible, true);
    }
    for (const act of ['unknown', 'busy', 'waiting-permission', 'exited', 'failed']) {
      const res = evaluateTargetEligibility(makeSession({ activity: /** @type {any} */ (act) }));
      assert.equal(res.eligible, false);
      if (!res.eligible) {
        assert.equal(res.code, 'G4_ACTIVITY_INELIGIBLE');
      }
    }
    const detachedRes = evaluateTargetEligibility(makeSession({ activity: 'ready', attachment: 'disconnected' }));
    assert.equal(detachedRes.eligible, false);
    if (!detachedRes.eligible) {
      assert.equal(detachedRes.code, 'G4_ATTACHMENT_NOT_LIVE');
    }

    // Queue exception only when supportsQueue + allowQueue + within maxQueueDepth
    const busyQueueable = makeSession({
      activity: 'busy',
      supportsQueue: true,
      maxQueueDepth: 2,
      currentQueueDepth: 1
    });
    assert.equal(evaluateTargetEligibility(busyQueueable, { allowQueue: false }).eligible, false);
    const qOk = evaluateTargetEligibility(busyQueueable, { allowQueue: true });
    assert.equal(qOk.eligible, true);
    if (qOk.eligible) {
      assert.equal(qOk.admissionMode, 'queue');
    }
  });

  it('enforces G2 duplicate nonce/seq refusal, request_id collision refusal, and G3 per-slot dispatch locks', () => {
    const model = createDrawerModel({ workspaceId: 'ws-main' });
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1', generation: 1 }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2', generation: 1 })
    ]);
    model.setPromptText('Execute order 1');
    model.selectOneTarget('sid-1');
    assert.equal(model.beginReview().ok, true);

    const sub1 = model.submitReviewedDispatch({
      session: 's1',
      authenticated_sender_instance: 'u1',
      nonce: 'n1',
      seq: 10
    });
    assert.equal(sub1.ok, true);
    if (!sub1.ok) return;

    // Slot lock is now held by sub1.requestId
    assert.equal(model.getState().activeSlotLocks['slot-1@1'], sub1.requestId);

    // Exact replay of same nonce/seq is refused under G2 envelope law
    assert.equal(model.beginReview().ok, true);
    const dupNonce = model.submitReviewedDispatch({
      session: 's1',
      authenticated_sender_instance: 'u1',
      nonce: 'n1',
      seq: 10
    });
    assert.equal(dupNonce.ok, false);
    if (!dupNonce.ok) {
      assert.equal(dupNonce.code, 'G2_DUPLICATE_NONCE_SEQ');
    }

    // Fresh envelope reconciling the exact same request_id + same body/targets returns existing record without second effect
    const reconcileSame = model.submitReviewedDispatch({
      session: 's1',
      authenticated_sender_instance: 'u1',
      nonce: 'n2',
      seq: 11,
      request_id: sub1.requestId
    });
    assert.equal(reconcileSame.ok, true);
    if (reconcileSame.ok) {
      assert.equal(reconcileSame.reconciledExisting, true);
    }

    // Reusing the same request_id with a changed prompt body refuses with G2_REQUEST_ID_COLLISION
    model.setPromptText('Different prompt body');
    model.selectOneTarget('sid-2');
    assert.equal(model.beginReview().ok, true);
    const collision = model.submitReviewedDispatch({
      session: 's1',
      authenticated_sender_instance: 'u1',
      nonce: 'n3',
      seq: 12,
      request_id: sub1.requestId
    });
    assert.equal(collision.ok, false);
    if (!collision.ok) {
      assert.equal(collision.code, 'G2_REQUEST_ID_COLLISION');
    }

    // Second dispatch to the still-locked slot-1@1 under a new request_id is refused by G3_SLOT_LOCK_HELD
    model.selectOneTarget('sid-1');
    assert.equal(model.beginReview().ok, true);
    const slotLocked = model.submitReviewedDispatch({
      session: 's1',
      authenticated_sender_instance: 'u1',
      nonce: 'n4',
      seq: 13
    });
    assert.equal(slotLocked.ok, false);
    if (!slotLocked.ok) {
      assert.equal(slotLocked.code, 'G3_SLOT_LOCK_HELD');
    }
  });
});

describe('Drawer model — Lifecycle Outcomes, Witness Verification, Uncertainty & Guarded Retry (§7)', () => {
  it('keeps acceptance distinct from adapter completion and requires state/tick witness for verified outcome', () => {
    const model = createDrawerModel({ workspaceId: 'ws-main' });
    model.syncProjectedSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1' }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2' })
    ]);
    model.setPromptText('Advance tick and verify');
    model.selectManyTargets(['sid-1', 'sid-2']);
    assert.equal(model.beginReview().ok, true);

    const sub = model.submitReviewedDispatch({
      session: 's1',
      authenticated_sender_instance: 'u1',
      nonce: 'n100',
      seq: 1
    });
    assert.equal(sub.ok, true);
    if (!sub.ok) return;

    // Core accepts -> status is 'accepted', NOT completed or verified
    const acc = model.recordCoreAccepted(sub.requestId);
    assert.equal(acc.ok, true);
    if (acc.ok) {
      assert.equal(acc.dispatch.targets['sid-1'].status, 'accepted');
      assert.equal(acc.dispatch.targets['sid-1'].verifiedReceiptId, null);
    }

    // Stream output -> 'executing'
    const stream = model.appendTargetStreamResult(sub.requestId, 'sid-1', 'Partial response line 1\n');
    assert.equal(stream.ok, true);
    if (stream.ok) {
      assert.equal(stream.target.status, 'executing');
    }

    // Adapter completion -> 'completed-unverified', slot lock still held until verified receipt
    const comp = model.recordAdapterCompletion(sub.requestId, 'sid-1');
    assert.equal(comp.ok, true);
    if (comp.ok) {
      assert.equal(comp.target.status, 'completed-unverified');
      assert.equal(comp.target.adapterCompleted, true);
    }
    assert.equal(model.getState().activeSlotLocks['slot-1@1'], sub.requestId);

    // Receipt without witness stateSha256 or tick is rejected
    const badReceipt = model.recordVerifiedReceipt(sub.requestId, 'sid-1', {
      receiptId: 'rcpt-1',
      verified: true,
      stateSha256: '',
      tick: 10
    });
    assert.equal(badReceipt.ok, false);

    // Valid receipt with witness marks sid-1 verified-success and releases slot-1@1 lock
    const goodReceipt = model.recordVerifiedReceipt(sub.requestId, 'sid-1', {
      receiptId: 'rcpt-1',
      verified: true,
      stateSha256: 'a'.repeat(64),
      tick: 15
    });
    assert.equal(goodReceipt.ok, true);
    if (goodReceipt.ok) {
      assert.equal(goodReceipt.target.status, 'verified-success');
    }
    assert.equal(model.getState().activeSlotLocks['slot-1@1'], undefined);

    // Disconnect marks remaining in-flight target (sid-2) as uncertain and retains its slot lock
    const unc = model.markDispatchUncertain(sub.requestId);
    assert.equal(unc.ok, true);
    if (unc.ok) {
      assert.equal(unc.dispatch.targets['sid-1'].status, 'verified-success');
      assert.equal(unc.dispatch.targets['sid-2'].status, 'uncertain');
    }
    assert.equal(model.getState().activeSlotLocks['slot-2@1'], sub.requestId);

    // Guarded retry: cannot retry an uncertain target or a verified-success target
    const retryUncertain = model.stageRetryForFailedTargets(sub.requestId, ['sid-2']);
    assert.equal(retryUncertain.ok, false);
    if (!retryUncertain.ok) {
      assert.equal(retryUncertain.code, 'RETRY_UNCERTAIN_FORBIDDEN');
    }

    const retrySuccess = model.stageRetryForFailedTargets(sub.requestId, ['sid-1']);
    assert.equal(retrySuccess.ok, false);
    if (!retrySuccess.ok) {
      assert.equal(retrySuccess.code, 'RETRY_SUCCESSFUL_FORBIDDEN');
    }

    // Reconcile sid-2 as verified-failure -> now retry is allowed for sid-2 only
    model.recordVerifiedReceipt(sub.requestId, 'sid-2', {
      receiptId: 'rcpt-2',
      verified: false,
      stateSha256: 'b'.repeat(64),
      tick: 15,
      failureReason: 'State witness mismatch'
    });
    const retryFailed = model.stageRetryForFailedTargets(sub.requestId, ['sid-2']);
    assert.equal(retryFailed.ok, true);
    if (retryFailed.ok) {
      assert.deepEqual(retryFailed.targetIds, ['sid-2']);
    }
  });

  it('stages untrusted paste without auto-execution and handles keyboard/IME/Escape rules without cancelling runs', () => {
    const model = createDrawerModel({ workspaceId: 'ws-main' });
    model.syncProjectedSessions([makeSession({ sessionId: 'sid-1', slotId: 'slot-1' })]);

    const staged = model.stagePaste('echo pwned\n\x07');
    assert.equal(staged.autoExecuted, false);
    assert.equal(staged.hasNewlines, true);
    assert.equal(staged.hasControlChars, true);
    assert.equal(model.getState().promptText, '');

    model.applyStagedPasteToDraft();
    assert.equal(model.getState().promptText, 'echo pwned\n\x07');

    // Terminal keystrokes never bubble into drawer commands
    assert.deepEqual(model.handleKeyCommand({ key: 'Enter', ctrlKey: true, fromTerminal: true }), {
      action: 'ignore-terminal-key',
      cancelRun: false
    });

    // IME composition blocks Ctrl+Enter submission
    model.setImeComposing(true);
    assert.deepEqual(model.handleKeyCommand({ key: 'Enter', ctrlKey: true }), {
      action: 'ignore-ime',
      cancelRun: false
    });
    assert.equal(model.beginReview().ok, false);
    model.setImeComposing(false);

    // Plain Enter inserts newline; Ctrl+Enter triggers review/send
    assert.deepEqual(model.handleKeyCommand({ key: 'Enter' }), {
      action: 'insert-newline',
      cancelRun: false
    });
    assert.deepEqual(model.handleKeyCommand({ key: 'Enter', ctrlKey: true }), {
      action: 'trigger-review-or-send',
      cancelRun: false
    });

    // Escape closes picker first, then cancels active review, then collapses drawer, and never cancels a run
    model.toggleDrawer();
    model.selectOneTarget('sid-1');
    assert.equal(model.beginReview().ok, true);

    assert.deepEqual(model.handleKeyCommand({ key: 'Escape', pickerOpen: true }), {
      action: 'close-picker',
      cancelRun: false
    });
    assert.equal(model.getState().reviewing, true);

    assert.deepEqual(model.handleKeyCommand({ key: 'Escape', pickerOpen: false }), {
      action: 'cancel-review',
      cancelRun: false
    });
    assert.equal(model.getState().reviewing, false);

    assert.deepEqual(model.handleKeyCommand({ key: 'Escape', pickerOpen: false }), {
      action: 'collapse-drawer',
      cancelRun: false
    });
    assert.equal(model.getState().presentation, 'collapsed');
  });
});
