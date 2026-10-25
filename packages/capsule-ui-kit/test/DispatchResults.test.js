import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VUE_SFC_PATH = path.resolve(__dirname, '../src/orchestrator/DispatchResults.vue');
const BOOK_PATH = path.resolve(__dirname, '../books/dispatch-results.md');


const requireFromShell = createRequire(import.meta.url);
const compilerSfc = requireFromShell('@vue/compiler-sfc');

/** @type {any} */
let sfcDescriptor = null;
/** @type {any} */
let dispatchResultsModule = null;
/** @type {any} */
let controlRegistryModule = null;

/**
 * Helper to create a valid correlated dispatch registration payload.
 *
 * @param {Record<string, unknown>} [overrides]
 */
function makeDispatchRegistration(overrides = {}) {
  return {
    requestId: 'req-corr-001',
    workspaceId: 'ws-main',
    epoch: 10,
    promptText: 'Verify turbine thermal balance across active capsules',
    promptSha256: 'a'.repeat(64),
    targetIds: ['sid-alpha', 'sid-beta'],
    targets: {
      'sid-alpha': {
        sessionId: 'sid-alpha',
        capsuleId: 'cap-1',
        slotId: 'slot-1',
        generation: 1,
        runId: 'run-alpha-1'
      },
      'sid-beta': {
        sessionId: 'sid-beta',
        capsuleId: 'cap-2',
        slotId: 'slot-2',
        generation: 1,
        runId: 'run-beta-1'
      }
    },
    ...overrides
  };
}

before(async () => {
  const sfcSource = fs.readFileSync(VUE_SFC_PATH, 'utf8');
  const parsed = compilerSfc.parse(sfcSource, { filename: 'DispatchResults.vue' });
  assert.equal(parsed.errors.length, 0, `SFC parse errors: ${JSON.stringify(parsed.errors)}`);
  sfcDescriptor = parsed.descriptor;

  const localRegistryPath = path.resolve(__dirname, '../src/agent/controlRegistry.js');
  const resolvedRegistryPath = localRegistryPath;

  controlRegistryModule = await import(pathToFileURL(resolvedRegistryPath).href);

  assert.ok(
    sfcDescriptor.script,
    'DispatchResults.vue must contain a <script> block exporting pure correlation and verification helpers'
  );
  dispatchResultsModule = await import('data:text/javascript;base64,' +
    Buffer.from(sfcDescriptor.script.content, 'utf8').toString('base64'));
});


describe('DispatchResults.vue — SFC Compilation, JS/JSDoc Rules & Semantic Template Contract (§3, §7, §8, §9, §13)', () => {
  it('compiles <script setup>, <template>, and <style scoped> with @vue/compiler-sfc without lang="ts", v-html, or consumer imports', () => {
    assert.ok(sfcDescriptor.scriptSetup, '<script setup> block must exist');
    assert.equal(sfcDescriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');
    assert.equal(sfcDescriptor.script?.lang, undefined, '<script> must not use lang="ts"');

    const fullSource = sfcDescriptor.source;
    assert.doesNotMatch(
      fullSource,
      /\u0068oldings/i,
      'DispatchResults.vue must contain zero consumer imports or references'
    );
    assert.doesNotMatch(
      fullSource,
      /v-html/,
      'DispatchResults.vue must never render arbitrary HTML via v-html (§3, §7)'
    );

    const compiledScript = compilerSfc.compileScript(sfcDescriptor, {
      id: 'data-v-dispatchresults'
    });
    assert.ok(compiledScript.content.length > 0);

    assert.ok(sfcDescriptor.template, '<template> block must exist');
    const compiledTemplate = compilerSfc.compileTemplate({
      source: sfcDescriptor.template.content,
      filename: 'DispatchResults.vue',
      id: 'data-v-dispatchresults'
    });
    assert.equal(
      compiledTemplate.errors.length,
      0,
      `Template compile errors: ${JSON.stringify(compiledTemplate.errors)}`
    );

    assert.ok(sfcDescriptor.styles.length > 0, '<style scoped> block must exist');
    for (const styleBlock of sfcDescriptor.styles) {
      assert.equal(styleBlock.scoped, true, 'Component styles must be scoped');
      const compiledStyle = compilerSfc.compileStyle({
        source: styleBlock.content,
        filename: 'DispatchResults.vue',
        id: 'data-v-dispatchresults',
        scoped: true
      });
      assert.equal(compiledStyle.errors.length, 0);
    }
  });

  it('declares required §9 semantic anchors, roles, accessible names, and plain-text output regions', () => {
    const tpl = sfcDescriptor.template.content;

    // Row 9: dispatch/{did}/target/{sid}/{result,retry,cancel}
    assert.match(
      tpl,
      /dispatch\/\$\{[^}]+\}\/target\/\$\{[^}]+\}\/result/,
      'Template must bind dispatch/{did}/target/{sid}/result'
    );
    assert.match(
      tpl,
      /dispatch\/\$\{[^}]+\}\/target\/\$\{[^}]+\}\/retry/,
      'Template must bind dispatch/{did}/target/{sid}/retry'
    );
    assert.match(
      tpl,
      /dispatch\/\$\{[^}]+\}\/target\/\$\{[^}]+\}\/cancel/,
      'Template must bind dispatch/{did}/target/{sid}/cancel'
    );

    // Row 11: alerts/{aid} for named refusal alerts
    assert.match(
      tpl,
      /alerts\/dispatch-\$\{[^}]+\}/,
      'Template must bind alerts/dispatch-{did} for refusal alerts'
    );

    // Row 13: output/{sid}/text for browsable plain-text output
    assert.match(
      tpl,
      /output\/\$\{[^}]+\}\/text/,
      'Template must bind output/{sid}/text accessible output region'
    );

    // Verification state attributes so acceptance never appears verified in DOM
    assert.match(
      tpl,
      /data-appears-verified/,
      'Template must bind explicit data-appears-verified attribute'
    );
    assert.match(
      tpl,
      /data-verification-state/,
      'Template must bind explicit data-verification-state attribute'
    );
  });

  it('is accompanied by routable book books/dispatch-results.md', () => {
    assert.equal(fs.existsSync(BOOK_PATH), true, 'books/dispatch-results.md must exist');
    const bookText = fs.readFileSync(BOOK_PATH, 'utf8');
    assert.match(bookText, /DispatchResults\.vue/);
    assert.match(bookText, /AUSENTE/);
  });
});

describe('DispatchResults — Correlation Contract & Non-Authoritative IntentStatus (§4, §7, §12, §13)', () => {
  it('enforces strict (requestId, sessionId, runId, epoch) correlation and rejects unknown dispatches, un-frozen targets, numeric index IDs, or stale epochs', () => {
    const { createDispatchResultsController } = dispatchResultsModule;
    const controller = createDispatchResultsController();

    // Reject numeric index IDs or empty targetIds on registration
    const badNumericId = controller.registerDispatch(
      makeDispatchRegistration({
        requestId: '12345',
        targetIds: ['sid-alpha']
      })
    );
    assert.equal(badNumericId.ok, false);
    assert.equal(badNumericId.code, 'SCHEMA_NUMERIC_INDEX_ID');

    const badEmptyTargets = controller.registerDispatch(
      makeDispatchRegistration({
        targetIds: [],
        targets: {}
      })
    );
    assert.equal(badEmptyTargets.ok, false);
    assert.equal(badEmptyTargets.code, 'SCHEMA_EMPTY_TARGETS');

    // Valid registration
    const reg = controller.registerDispatch(makeDispatchRegistration());
    assert.equal(reg.ok, true);

    // Reject events with missing or unknown requestId
    const unknownAccept = controller.correlateCoreAcceptance({
      requestId: 'req-nonexistent',
      epoch: 10
    });
    assert.equal(unknownAccept.ok, false);
    assert.equal(unknownAccept.code, 'CORRELATION_UNKNOWN_DISPATCH');

    // Reject events with stale or mismatched epoch
    const staleAccept = controller.correlateCoreAcceptance({
      requestId: 'req-corr-001',
      epoch: 9
    });
    assert.equal(staleAccept.ok, false);
    assert.equal(staleAccept.code, 'CORRELATION_EPOCH_MISMATCH');

    // Reject streamed chunk for a sessionId that was NOT part of the frozen targetIds
    const unattributedTarget = controller.correlateStreamChunk({
      requestId: 'req-corr-001',
      sessionId: 'sid-rogue',
      epoch: 10,
      chunkText: 'unsolicited output'
    });
    assert.equal(unattributedTarget.ok, false);
    assert.equal(unattributedTarget.code, 'CORRELATION_UNKNOWN_TARGET');

    // Reject streamed chunk with mismatched runId
    const wrongRun = controller.correlateStreamChunk({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      runId: 'run-alpha-stale',
      epoch: 10,
      chunkText: 'wrong run output'
    });
    assert.equal(wrongRun.ok, false);
    assert.equal(wrongRun.code, 'CORRELATION_RUN_MISMATCH');

    // Valid correlated stream chunk succeeds and attributes strictly to (req-corr-001, sid-alpha, run-alpha-1)
    const validStream = controller.correlateStreamChunk({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      runId: 'run-alpha-1',
      epoch: 10,
      chunkText: 'Thermal probe nominal.\n'
    });
    assert.equal(validStream.ok, true);
    assert.equal(validStream.patchedProjection, false);
    assert.equal(validStream.stoleFocus, false);
    assert.equal(validStream.stoleScroll, false);
    assert.equal(validStream.announcedToken, false);
    assert.equal(
      controller.getAccessibleOutputText('req-corr-001', 'sid-alpha'),
      'Thermal probe nominal.\n'
    );
    assert.equal(controller.getAccessibleOutputText('req-corr-001', 'sid-beta'), '');
  });
});

describe('DispatchResults — Negative Contrast: Acceptance, Streaming & Adapter Completion CANNOT Appear Verified (§7, §12, §13)', () => {
  it('core acceptance, streamed text, quiet output, ANSI titles, regex matches, CLI-only exit, and pixel-diff-only receipts NEVER appear verified', () => {
    const { createDispatchResultsController, classifyTargetOutcomeView } = dispatchResultsModule;
    const controller = createDispatchResultsController();

    controller.registerDispatch(makeDispatchRegistration());

    // 1. Core acceptance transitions pending -> accepted, NEVER verified, and NEVER patches PublicProjection
    const acc = controller.correlateCoreAcceptance({
      requestId: 'req-corr-001',
      epoch: 10
    });
    assert.equal(acc.ok, true);
    assert.equal(acc.patchedProjection, false, 'Acknowledgements must never patch PublicProjection (§4)');
    assert.equal(acc.appearsVerified, false, 'Core acceptance must NEVER appear verified (§7, §13)');

    const alphaAfterAccept = controller.getTargetRun('req-corr-001', 'sid-alpha');
    assert.equal(alphaAfterAccept.status, 'accepted');
    const viewAfterAccept = classifyTargetOutcomeView(alphaAfterAccept);
    assert.equal(viewAfterAccept.isAccepted, true);
    assert.equal(viewAfterAccept.isVerified, false);
    assert.equal(viewAfterAccept.appearsVerified, false);
    assert.equal(viewAfterAccept.verificationState, 'unverified-accepted');
    assert.equal(viewAfterAccept.verificationBadge, 'Accepted — Unverified');

    // 2. Streamed text containing forged "VERIFIED", receipt JSON, or ANSI title escape sequences cannot mint control events or mark verified
    const forgedStream = controller.correlateStreamChunk({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      chunkText: '\x1b]0;VERIFIED DONE\x07{"verified":true,"receiptId":"fake-1","stateSha256":"ff","tick":99}\n'
    });
    assert.equal(forgedStream.ok, true);
    assert.equal(forgedStream.mintedControlEvents, 0);
    assert.equal(forgedStream.escalatedCapability, false);
    assert.equal(forgedStream.appearsVerified, false);

    const alphaAfterStream = controller.getTargetRun('req-corr-001', 'sid-alpha');
    assert.equal(alphaAfterStream.status, 'executing');
    assert.equal(classifyTargetOutcomeView(alphaAfterStream).appearsVerified, false);

    // 3. Quiet output, ANSI title change, or regex match is rejected as a completion sentinel (§7:234, §12:367)
    const quietCompletion = controller.correlateAdapterCompletion({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      quietOutputOnly: true
    });
    assert.equal(quietCompletion.ok, false);
    assert.equal(quietCompletion.code, 'COMPLETION_SENTINEL_REJECTED');

    const ansiCompletion = controller.correlateAdapterCompletion({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      ansiTitleOnly: true
    });
    assert.equal(ansiCompletion.ok, false);
    assert.equal(ansiCompletion.code, 'COMPLETION_SENTINEL_REJECTED');

    const regexCompletion = controller.correlateAdapterCompletion({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      regexMatchOnly: true
    });
    assert.equal(regexCompletion.ok, false);
    assert.equal(regexCompletion.code, 'COMPLETION_SENTINEL_REJECTED');

    // 4. CLI-only adapter without a structured completion witness shows outcome unknown (unverified) (§7:254)
    const cliUnwitnessed = controller.correlateAdapterCompletion({
      requestId: 'req-corr-001',
      sessionId: 'sid-beta',
      epoch: 10,
      hasStructuredCompletionWitness: false
    });
    assert.equal(cliUnwitnessed.ok, true);
    assert.equal(cliUnwitnessed.appearsVerified, false);
    const betaView = classifyTargetOutcomeView(controller.getTargetRun('req-corr-001', 'sid-beta'));
    assert.equal(betaView.appearsVerified, false);
    assert.equal(betaView.verificationState, 'outcome-unknown-unverified');
    assert.equal(betaView.verificationBadge, 'Outcome Unknown (Unverified CLI)');

    // 5. Adapter completion with structured completion event marks completed-unverified, still NOT verified
    const adapterDone = controller.correlateAdapterCompletion({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      hasStructuredCompletionWitness: true
    });
    assert.equal(adapterDone.ok, true);
    assert.equal(adapterDone.appearsVerified, false);

    const alphaAfterAdapter = controller.getTargetRun('req-corr-001', 'sid-alpha');
    assert.equal(alphaAfterAdapter.status, 'completed-unverified');
    assert.equal(alphaAfterAdapter.adapterCompleted, true);
    const viewAfterAdapter = classifyTargetOutcomeView(alphaAfterAdapter);
    assert.equal(viewAfterAdapter.isAdapterCompleted, true);
    assert.equal(viewAfterAdapter.isVerified, false);
    assert.equal(viewAfterAdapter.appearsVerified, false);
    assert.equal(viewAfterAdapter.verificationState, 'adapter-completed-unverified');
    assert.equal(viewAfterAdapter.verificationBadge, 'Adapter Completed — Unverified');

    // 6. Attempting to verify via transportAckOnly or pixelDiffOnly or missing state/tick witness is REFUSED (§7:230, 235)
    const transportAckAttempt = controller.correlateVerifiedReceipt({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      receiptId: 'rcpt-ack',
      verified: true,
      stateSha256: 'b'.repeat(64),
      tick: 42,
      transportAckOnly: true
    });
    assert.equal(transportAckAttempt.ok, false);
    assert.equal(transportAckAttempt.code, 'ACCEPTANCE_NOT_VERIFIED');

    const pixelDiffAttempt = controller.correlateVerifiedReceipt({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      receiptId: 'rcpt-pixel',
      verified: true,
      stateSha256: 'b'.repeat(64),
      tick: 42,
      pixelDiffOnly: true
    });
    assert.equal(pixelDiffAttempt.ok, false);
    assert.equal(pixelDiffAttempt.code, 'RECEIPT_PIXEL_DIFF_INSUFFICIENT');

    const missingStateWitness = controller.correlateVerifiedReceipt({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      receiptId: 'rcpt-no-sha',
      verified: true,
      stateSha256: '',
      tick: 42
    });
    assert.equal(missingStateWitness.ok, false);
    assert.equal(missingStateWitness.code, 'RECEIPT_MISSING_WITNESS');

    const missingTickWitness = controller.correlateVerifiedReceipt({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      receiptId: 'rcpt-no-tick',
      verified: true,
      stateSha256: 'b'.repeat(64),
      tick: -1
    });
    assert.equal(missingTickWitness.ok, false);
    assert.equal(missingTickWitness.code, 'RECEIPT_MISSING_WITNESS');

    // Confirm sid-alpha STILL does not appear verified after all rejected attempts
    assert.equal(
      classifyTargetOutcomeView(controller.getTargetRun('req-corr-001', 'sid-alpha')).appearsVerified,
      false
    );

    // 7. Only a valid core receipt with receiptId + stateSha256 + non-negative integer tick transitions to verified
    const validReceipt = controller.correlateVerifiedReceipt({
      requestId: 'req-corr-001',
      sessionId: 'sid-alpha',
      epoch: 10,
      receiptId: 'rcpt-core-001',
      verified: true,
      stateSha256: 'c'.repeat(64),
      tick: 108
    });
    assert.equal(validReceipt.ok, true);
    assert.equal(validReceipt.appearsVerified, true);

    const alphaVerified = controller.getTargetRun('req-corr-001', 'sid-alpha');
    assert.equal(alphaVerified.status, 'verified-success');
    const viewVerified = classifyTargetOutcomeView(alphaVerified);
    assert.equal(viewVerified.isVerified, true);
    assert.equal(viewVerified.appearsVerified, true);
    assert.equal(viewVerified.verificationState, 'verified-success');
    assert.equal(viewVerified.verificationBadge, 'Verified Success');
  });
});

describe('DispatchResults — Uncertainty, Cancel Run vs Stop Session & Guarded Retry (§7, §9, §12)', () => {
  it('marks in-flight targets uncertain on disconnect without auto-resend, enforces guarded retry rules, and keeps Cancel Run distinct from Stop Session', () => {
    const { createDispatchResultsController, preserveLiveSurfaceFocusOnPointerDown } = dispatchResultsModule;

    /** @type {Array<{ requestId: string, sessionId: string }>} */
    const cancelledRuns = [];
    const controller = createDispatchResultsController({
      onCancelRun: (requestId, sessionId) => cancelledRuns.push({ requestId, sessionId })
    });

    controller.registerDispatch(
      makeDispatchRegistration({
        requestId: 'req-corr-002',
        targetIds: ['sid-alpha', 'sid-beta', 'sid-gamma'],
        targets: {
          'sid-alpha': {
            sessionId: 'sid-alpha',
            capsuleId: 'cap-1',
            slotId: 'slot-1',
            generation: 1,
            runId: 'run-a'
          },
          'sid-beta': {
            sessionId: 'sid-beta',
            capsuleId: 'cap-2',
            slotId: 'slot-2',
            generation: 1,
            runId: 'run-b'
          },
          'sid-gamma': {
            sessionId: 'sid-gamma',
            capsuleId: 'cap-3',
            slotId: 'slot-3',
            generation: 1,
            runId: 'run-c'
          }
        }
      })
    );

    controller.correlateCoreAcceptance({ requestId: 'req-corr-002', epoch: 10 });

    // Verify sid-alpha succeeds
    controller.correlateVerifiedReceipt({
      requestId: 'req-corr-002',
      sessionId: 'sid-alpha',
      epoch: 10,
      receiptId: 'rcpt-alpha-ok',
      verified: true,
      stateSha256: '1'.repeat(64),
      tick: 50
    });

    // Request cancel on sid-beta (Stop-this-run): marks cancelRequested=true, does not rollback committed effects or stop session
    const cancelPending = controller.requestCancelRun({
      requestId: 'req-corr-002',
      sessionId: 'sid-beta',
      confirmedByCore: false
    });
    assert.equal(cancelPending.ok, true);
    assert.equal(cancelPending.rolledBackCommittedEffects, false);
    assert.equal(cancelPending.stoppedSession, false);
    assert.equal(controller.getTargetRun('req-corr-002', 'sid-beta').cancelRequested, true);
    assert.equal(controller.getTargetRun('req-corr-002', 'sid-beta').status, 'accepted');
    assert.equal(cancelledRuns.length, 1);

    // Disconnect occurs while sid-beta and sid-gamma are still non-terminal: marks them uncertain, never auto-resends
    const disc = controller.correlateDisconnectOrLostReply({
      requestId: 'req-corr-002',
      epoch: 10
    });
    assert.equal(disc.ok, true);
    assert.equal(disc.autoResentUnderNewId, false);
    assert.equal(disc.reconcileByRequestId, 'req-corr-002');
    assert.equal(
      controller.getTargetRun('req-corr-002', 'sid-alpha').status,
      'verified-success',
      'Already terminal verified-success target remains verified-success'
    );
    assert.equal(controller.getTargetRun('req-corr-002', 'sid-beta').status, 'uncertain');
    assert.equal(controller.getTargetRun('req-corr-002', 'sid-gamma').status, 'uncertain');

    // Negative contrast: Retrying an uncertain target is strictly refused (§7:238, §12:367)
    const retryUncertain = controller.requestRetryFailedTargets({
      parentRequestId: 'req-corr-002',
      retrySessionIds: ['sid-gamma']
    });
    assert.equal(retryUncertain.ok, false);
    assert.equal(retryUncertain.code, 'RETRY_UNCERTAIN_FORBIDDEN');

    // Negative contrast: Retrying a verified-success target is strictly refused ("Successful children are not rerun")
    const retrySuccess = controller.requestRetryFailedTargets({
      parentRequestId: 'req-corr-002',
      retrySessionIds: ['sid-alpha']
    });
    assert.equal(retrySuccess.ok, false);
    assert.equal(retrySuccess.code, 'RETRY_SUCCESSFUL_FORBIDDEN');

    // Reconcile sid-beta as cancelled and sid-gamma as verified-failure from journal by original requestId
    const recBeta = controller.reconcileUncertainTarget({
      requestId: 'req-corr-002',
      sessionId: 'sid-beta',
      epoch: 10,
      journalOutcome: 'cancelled'
    });
    assert.equal(recBeta.ok, true);
    assert.equal(controller.getTargetRun('req-corr-002', 'sid-beta').status, 'cancelled');

    const recGamma = controller.reconcileUncertainTarget({
      requestId: 'req-corr-002',
      sessionId: 'sid-gamma',
      epoch: 10,
      journalOutcome: 'verified-failure',
      receiptId: 'rcpt-gamma-fail',
      stateSha256: '2'.repeat(64),
      tick: 52,
      failureReason: 'Thermal valve limit exceeded'
    });
    assert.equal(recGamma.ok, true);
    assert.equal(controller.getTargetRun('req-corr-002', 'sid-gamma').status, 'verified-failure');

    // Now staging retry for the reconciled failed/cancelled children succeeds and links to parentRequestId
    const retryValid = controller.requestRetryFailedTargets({
      parentRequestId: 'req-corr-002',
      retrySessionIds: ['sid-beta', 'sid-gamma']
    });
    assert.equal(retryValid.ok, true);
    assert.equal(retryValid.stagedRetry.parentRequestId, 'req-corr-002');
    assert.deepEqual(retryValid.stagedRetry.targetIds, ['sid-beta', 'sid-gamma']);
    assert.equal(retryValid.stagedRetry.requiresExplicitReview, true);
    assert.equal(retryValid.stagedRetry.autoSubmitted, false);

    // Pointer-down focus guard preserves live surface focus
    let defaultPrevented = false;
    const focusRes = preserveLiveSurfaceFocusOnPointerDown({
      preventDefault: () => {
        defaultPrevented = true;
      }
    });
    assert.equal(defaultPrevented, true);
    assert.equal(focusRes.preservedLiveFocus, true);
  });
});

describe('DispatchResults — Semantic Control Registry Integration & No Fabricated Hidden Boxes (§9)', () => {
  it('registers dispatch/{did}/target/{sid}/{result,retry,cancel}, alerts/dispatch-{did}, and output/{sid}/text into controlRegistry', () => {
    const { createDispatchResultsController, syncDispatchResultsToRegistry } = dispatchResultsModule;
    const { createControlRegistry } = controlRegistryModule;

    const controller = createDispatchResultsController();
    controller.registerDispatch(makeDispatchRegistration({ requestId: 'req-reg-1' }));
    controller.correlateCoreRefusal({
      requestId: 'req-reg-1',
      epoch: 10,
      code: 'G3_SLOT_BUSY',
      message: 'Target slot busy during admission'
    });

    // 1. When hidden (visible=false), all controls register with box: null (no fabricated boxes)
    const regHidden = createControlRegistry({
      windowId: 'win-main',
      epoch: 10,
      generation: 1
    });
    const syncedHidden = syncDispatchResultsToRegistry(controller, regHidden, {
      presentationInstance: 'drawer-results',
      epoch: 10,
      generation: 1,
      visible: false,
      measureBox: () => ({ x: 10, y: 20, width: 300, height: 40 })
    });

    assert.ok(syncedHidden.length > 0);
    for (const rec of syncedHidden) {
      assert.equal(rec.visible, false);
      assert.equal(rec.box, null, `Hidden control ${rec.semanticAnchor} must have null box`);
    }

    // 2. When visible (visible=true), controls register with rounded content-window CSS pixel boxes
    const regVisible = createControlRegistry({
      windowId: 'win-main',
      epoch: 10,
      generation: 1
    });
    const syncedVisible = syncDispatchResultsToRegistry(controller, regVisible, {
      presentationInstance: 'drawer-results',
      epoch: 10,
      generation: 1,
      visible: true,
      measureBox: () => ({ x: 16.2, y: 420.8, width: 540.4, height: 48.1 })
    });

    const anchors = syncedVisible.map((r) => r.semanticAnchor);
    assert.ok(anchors.includes('alerts/dispatch-req-reg-1'));
    assert.ok(anchors.includes('dispatch/req-reg-1/target/sid-alpha/result'));
    assert.ok(anchors.includes('dispatch/req-reg-1/target/sid-alpha/retry'));
    assert.ok(anchors.includes('dispatch/req-reg-1/target/sid-alpha/cancel'));
    assert.ok(anchors.includes('output/sid-alpha/text'));

    const resultRec = syncedVisible.find(
      (r) => r.semanticAnchor === 'dispatch/req-reg-1/target/sid-alpha/result'
    );
    assert.deepEqual(resultRec.box, { x: 16, y: 421, width: 540, height: 48 });
  });
});
