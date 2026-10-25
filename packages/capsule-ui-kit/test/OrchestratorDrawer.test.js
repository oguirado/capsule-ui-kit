import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VUE_SFC_PATH = path.resolve(__dirname, '../src/orchestrator/OrchestratorDrawer.vue');
const BOOK_PATH = path.resolve(__dirname, '../books/orchestrator-drawer.md');


const requireFromShell = createRequire(import.meta.url);
const compilerSfc = requireFromShell('@vue/compiler-sfc');

/** @type {any} */
let sfcDescriptor = null;
/** @type {any} */
let drawerViewModule = null;
/** @type {any} */
let drawerModelModule = null;
/** @type {any} */
let controlRegistryModule = null;

/**
 * Helper to create a valid projected session descriptor.
 *
 * @param {Record<string, unknown>} [overrides]
 */
function makeSession(overrides = {}) {
  return {
    sessionId: 'sid-alpha',
    capsuleId: 'cap-main',
    workspaceId: 'ws-main',
    slotId: 'slot-alpha',
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

before(async () => {
  const sfcSource = fs.readFileSync(VUE_SFC_PATH, 'utf8');
  const parsed = compilerSfc.parse(sfcSource, { filename: 'OrchestratorDrawer.vue' });
  assert.equal(parsed.errors.length, 0, `SFC parse errors: ${JSON.stringify(parsed.errors)}`);
  sfcDescriptor = parsed.descriptor;

  const localDrawerModelPath = path.resolve(__dirname, '../src/orchestrator/drawerModel.js');
  const resolvedDrawerModelPath = localDrawerModelPath;

  const localRegistryPath = path.resolve(__dirname, '../src/agent/controlRegistry.js');
  const resolvedRegistryPath = localRegistryPath;

  drawerModelModule = await import(pathToFileURL(resolvedDrawerModelPath).href);
  controlRegistryModule = await import(pathToFileURL(resolvedRegistryPath).href);

  assert.ok(sfcDescriptor.script, 'OrchestratorDrawer.vue must contain a <script> block exporting pure view helpers');
  const rawScript = sfcDescriptor.script.content.replace(
    /from\s+['"]\.\/drawerModel\.js['"]/g,
    `from ${JSON.stringify(pathToFileURL(resolvedDrawerModelPath).href)}`
  );

  drawerViewModule = await import('data:text/javascript;base64,' +
    Buffer.from(rawScript, 'utf8').toString('base64'));
});


describe('OrchestratorDrawer.vue — SFC Compilation, JS/JSDoc Rules & Semantic Template Contract (§3, §8, §9, §13)', () => {
  it('compiles <script setup>, <template>, and <style scoped> with @vue/compiler-sfc without lang="ts" or consumer imports', () => {
    assert.ok(sfcDescriptor.scriptSetup, '<script setup> block must exist');
    assert.equal(sfcDescriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');
    assert.equal(sfcDescriptor.script?.lang, undefined, '<script> must not use lang="ts"');

    const fullSource = sfcDescriptor.source;
    assert.doesNotMatch(fullSource, /\u0068oldings/i, 'OrchestratorDrawer.vue must contain zero consumer imports or references');

    const compiledScript = compilerSfc.compileScript(sfcDescriptor, {
      id: 'data-v-orchdrawer'
    });
    assert.ok(compiledScript.content.length > 0);

    assert.ok(sfcDescriptor.template, '<template> block must exist');
    const compiledTemplate = compilerSfc.compileTemplate({
      source: sfcDescriptor.template.content,
      filename: 'OrchestratorDrawer.vue',
      id: 'data-v-orchdrawer'
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
        filename: 'OrchestratorDrawer.vue',
        id: 'data-v-orchdrawer',
        scoped: true
      });
      assert.equal(compiledStyle.errors.length, 0);
    }
  });

  it('declares required §9 semantic anchors, roles, accessible names, non-modal region, and v-show persistence in template', () => {
    const tpl = sfcDescriptor.template.content;

    // Required §9 semantic anchors for drawer, separator, session tabs/actions, dispatches, and output
    const requiredAnchors = [
      'drawer/toggle',
      'drawer/maximize',
      'drawer/composer',
      'drawer/send',
      'drawer/targets/all',
      'drawer/targets/clear',
      'workspace/separator/drawer-height'
    ];
    for (const anchor of requiredAnchors) {
      assert.ok(
        tpl.includes(anchor),
        `Template must include semantic anchor "${anchor}"`
      );
    }

    // Dynamic §9 anchor patterns
    assert.match(tpl, /drawer\/targets\/\$\{/, 'Template must bind drawer/targets/{sid}');
    assert.match(tpl, /dispatch\/\$\{[^}]+\}\/target\/\$\{[^}]+\}\/result/, 'Template must bind dispatch/{did}/target/{sid}/result');
    assert.match(tpl, /dispatch\/\$\{[^}]+\}\/target\/\$\{[^}]+\}\/retry/, 'Template must bind dispatch/{did}/target/{sid}/retry');
    assert.match(tpl, /dispatch\/\$\{[^}]+\}\/target\/\$\{[^}]+\}\/cancel/, 'Template must bind dispatch/{did}/target/{sid}/cancel');
    assert.match(tpl, /output\/\$\{[^}]+\}\/text/, 'Template must bind output/{sid}/text accessible output region');

    // Non-modal region and v-show persistence on collapse (§7)
    assert.match(tpl, /role="region"/, 'Drawer must be a labelled non-modal region');
    assert.doesNotMatch(tpl, /aria-modal="true"/, 'Drawer must never mark background inert as a modal');
    assert.match(tpl, /v-show=/, 'Drawer body must stay mounted via v-show so collapse preserves state');
  });

  it('accompanied by routable book books/orchestrator-drawer.md', () => {
    assert.equal(fs.existsSync(BOOK_PATH), true, 'books/orchestrator-drawer.md must exist');
    const bookText = fs.readFileSync(BOOK_PATH, 'utf8');
    assert.match(bookText, /OrchestratorDrawer\.vue/);
    assert.match(bookText, /AUSENTE/);
  });
});

describe('OrchestratorDrawer — No-Collapse-Kill & Single Instance Continuity (§3, §6, §7, §12, §13)', () => {
  it('collapsing or toggling the drawer preserves running sessions, in-flight dispatches, draft, targets, and scroll position (collapse NEVER kills)', () => {
    const { createOrchestratorDrawerController } = drawerViewModule;

    /** @type {string[]} */
    const stoppedSessions = [];
    /** @type {string[]} */
    const cancelledRuns = [];

    const controller = createOrchestratorDrawerController({
      workspaceId: 'ws-main',
      initialHeightPx: 280,
      onStopSession: (sid) => stoppedSessions.push(sid),
      onCancelRun: (did, sid) => cancelledRuns.push(`${did}:${sid}`)
    });

    controller.syncSessions([
      makeSession({ sessionId: 'sid-1', slotId: 'slot-1', activity: 'ready' }),
      makeSession({ sessionId: 'sid-2', slotId: 'slot-2', activity: 'waiting-input' })
    ]);

    // Expand drawer, compose draft, select targets, review, and submit an in-flight dispatch
    const openRes = controller.toggleDrawer();
    assert.equal(openRes.presentation, 'expanded');
    assert.equal(openRes.focusTarget, 'drawer/composer');

    controller.setPromptText('Audit energy throughput across capsules');
    controller.selectManyTargets(['sid-1', 'sid-2']);
    controller.setScrollPosition(164);

    const rev = controller.beginReview();
    assert.equal(rev.ok, true);

    const sub = controller.submitReviewedDispatch({
      session: 'core-session-1',
      authenticated_sender_instance: 'ui-renderer-1',
      nonce: 'nonce-101',
      seq: 1
    });
    assert.equal(sub.ok, true);
    if (!sub.ok) return;

    controller.recordCoreAccepted(sub.requestId);
    controller.appendTargetStreamResult(sub.requestId, 'sid-1', 'Step 1 running...\n');

    // Now collapse the drawer via toggle and explicit collapse()
    const collapseRes = controller.collapseDrawer();
    assert.equal(collapseRes.presentation, 'collapsed');
    assert.equal(collapseRes.focusTarget, 'drawer/toggle');
    assert.equal(collapseRes.sessionsKilled, 0);
    assert.equal(collapseRes.runsCancelled, 0);

    // Negative contrast: collapse->kill is strictly forbidden
    assert.deepEqual(stoppedSessions, [], 'Collapsing the drawer must NEVER stop any session');
    assert.deepEqual(cancelledRuns, [], 'Collapsing the drawer must NEVER cancel any in-flight dispatch run');

    const stateAfterCollapse = controller.getState();
    assert.equal(stateAfterCollapse.promptText, 'Audit energy throughput across capsules');
    assert.deepEqual(stateAfterCollapse.selectedTargetIds, ['sid-1', 'sid-2']);
    assert.equal(stateAfterCollapse.draftScrollTop, 164);
    assert.equal(
      stateAfterCollapse.dispatches[sub.requestId].targets['sid-1'].status,
      'executing',
      'In-flight target run must remain executing while drawer is collapsed'
    );

    // Streamed output continues arriving while collapsed without losing data or stealing focus
    const streamWhileCollapsed = controller.appendTargetStreamResult(
      sub.requestId,
      'sid-1',
      'Step 2 completed while collapsed.\n'
    );
    assert.equal(streamWhileCollapsed.ok, true);
    assert.equal(streamWhileCollapsed.stoleFocus, false);
    assert.equal(streamWhileCollapsed.stoleScroll, false);

    // Reopening restores prior open presentation and preserves all sessions and output
    const reopenRes = controller.toggleDrawer();
    assert.equal(reopenRes.presentation, 'expanded');
    assert.equal(reopenRes.activeSessionsPreserved, 2);
    assert.equal(
      controller.getAccessibleOutputText(sub.requestId, 'sid-1'),
      'Step 1 running...\nStep 2 completed while collapsed.\n'
    );
  });

  it('keeps Stop-this-run and Stop-session distinct and preserves single composer identity across dock/tab/popout moves (§3, §7)', () => {
    const { createOrchestratorDrawerController } = drawerViewModule;

    /** @type {string[]} */
    const stoppedSessions = [];
    /** @type {Array<{ requestId: string, sessionId: string }>} */
    const cancelledRuns = [];

    const controller = createOrchestratorDrawerController({
      workspaceId: 'ws-main',
      instanceId: 'orch-singleton-1',
      onStopSession: (sid) => stoppedSessions.push(sid),
      onCancelRun: (requestId, sessionId) => cancelledRuns.push({ requestId, sessionId })
    });

    controller.syncSessions([makeSession({ sessionId: 'sid-1', slotId: 'slot-1' })]);
    controller.setPromptText('Check telemetry');
    controller.selectOneTarget('sid-1');
    assert.equal(controller.beginReview().ok, true);
    const sub = controller.submitReviewedDispatch({
      session: 's1',
      authenticated_sender_instance: 'u1',
      nonce: 'n1',
      seq: 1
    });
    assert.equal(sub.ok, true);
    if (!sub.ok) return;

    // Cancelling a dispatch run does NOT stop the underlying session
    const cancelRunRes = controller.requestCancelTargetRun(sub.requestId, 'sid-1');
    assert.equal(cancelRunRes.ok, true);
    assert.equal(cancelledRuns.length, 1);
    assert.equal(stoppedSessions.length, 0);

    // Moving presentation host (bottom-track -> docked-panel -> tabbed-panel) preserves the exact same instanceId, draft, and dispatches
    const moveDock = controller.movePresentationHost('docked-panel');
    assert.equal(moveDock.instanceId, 'orch-singleton-1');
    assert.equal(moveDock.createdSecondComposer, false);
    assert.equal(controller.getState().promptText, 'Check telemetry');
    assert.ok(controller.getState().dispatches[sub.requestId]);

    // Explicit session stop invokes onStopSession without destroying other state
    const stopSessRes = controller.requestStopSession('sid-1');
    assert.equal(stopSessRes.ok, true);
    assert.deepEqual(stoppedSessions, ['sid-1']);
  });
});

describe('OrchestratorDrawer — Keyboard, IME Composition, Terminal Isolation & Focus Management (§6 G5, §7)', () => {
  it('enforces Enter=newline, Ctrl/Cmd+Enter=review/send, blocks submission during IME composition, and isolates terminal keys', () => {
    const { createOrchestratorDrawerController } = drawerViewModule;

    const controller = createOrchestratorDrawerController({ workspaceId: 'ws-main' });
    controller.syncSessions([makeSession({ sessionId: 'sid-1', slotId: 'slot-1' })]);
    controller.toggleDrawer();
    controller.setPromptText('Line 1');
    controller.selectOneTarget('sid-1');

    // 1. Plain Enter in composer inserts newline, does not review or submit
    const plainEnter = controller.handleKeydown({
      key: 'Enter',
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
      fromTerminal: false
    });
    assert.equal(plainEnter.action, 'insert-newline');
    assert.equal(plainEnter.cancelRun, false);
    assert.equal(controller.getState().reviewing, false);

    // 2. IME composition blocks Ctrl+Enter and Cmd+Enter completely (negative contrast)
    controller.onCompositionStart();
    assert.equal(controller.getState().imeComposing, true);

    const imeCtrlEnter = controller.handleKeydown({
      key: 'Enter',
      ctrlKey: true,
      metaKey: false,
      isComposing: true,
      fromTerminal: false
    });
    assert.equal(imeCtrlEnter.action, 'ignore-ime');
    assert.equal(imeCtrlEnter.preventDefault, false);
    assert.equal(controller.getState().reviewing, false);

    controller.onCompositionEnd();
    assert.equal(controller.getState().imeComposing, false);

    // 3. Ctrl+Enter when not reviewing triggers beginReview()
    const ctrlEnterReview = controller.handleKeydown({
      key: 'Enter',
      ctrlKey: true,
      metaKey: false,
      isComposing: false,
      fromTerminal: false
    });
    assert.equal(ctrlEnterReview.action, 'review-started');
    assert.equal(ctrlEnterReview.preventDefault, true);
    assert.equal(controller.getState().reviewing, true);

    // 4. Terminal keystrokes (including Ctrl+Enter, Escape, Ctrl+C, toggle shortcut) NEVER bubble into drawer shortcuts
    const termCtrlC = controller.handleKeydown({
      key: 'c',
      ctrlKey: true,
      fromTerminal: true
    });
    assert.equal(termCtrlC.action, 'ignore-terminal-key');
    assert.equal(termCtrlC.preventDefault, false);

    const termEscape = controller.handleKeydown({
      key: 'Escape',
      fromTerminal: true
    });
    assert.equal(termEscape.action, 'ignore-terminal-key');
    assert.equal(controller.getState().reviewing, true, 'Terminal Escape must not cancel drawer review');

    // 5. Escape hierarchy in drawer: closes target picker first -> cancels active review -> collapses drawer -> never cancels a run
    controller.setTargetPickerOpen(true);
    const esc1 = controller.handleKeydown({ key: 'Escape', fromTerminal: false });
    assert.equal(esc1.action, 'close-picker');
    assert.equal(esc1.cancelRun, false);
    assert.equal(controller.isTargetPickerOpen(), false);
    assert.equal(controller.getState().reviewing, true);

    const esc2 = controller.handleKeydown({ key: 'Escape', fromTerminal: false });
    assert.equal(esc2.action, 'cancel-review');
    assert.equal(esc2.cancelRun, false);
    assert.equal(controller.getState().reviewing, false);
    assert.equal(controller.getState().presentation, 'expanded');

    const esc3 = controller.handleKeydown({ key: 'Escape', fromTerminal: false });
    assert.equal(esc3.action, 'collapse-drawer');
    assert.equal(esc3.cancelRun, false);
    assert.equal(controller.getState().presentation, 'collapsed');
    assert.equal(controller.getLastFocusAnchor(), 'drawer/toggle');
  });

  it('cancels pending focus retry timers (now/120ms/400ms) on collapse or newer focus intent so late timers never steal keys (§6 G5)', () => {
    const { createOrchestratorDrawerController, preserveLiveSurfaceFocusOnPointerDown } = drawerViewModule;

    /** @type {Array<{ id: number, delay: number, fn: () => void, cleared: boolean }>} */
    const scheduledTimers = [];
    let nextTimerId = 1;

    /** @type {string[]} */
    const focusedAnchors = [];

    const controller = createOrchestratorDrawerController({
      workspaceId: 'ws-main',
      scheduleTimer: (fn, delay) => {
        const id = nextTimerId++;
        scheduledTimers.push({ id, delay, fn, cleared: false });
        return id;
      },
      clearTimer: (id) => {
        const found = scheduledTimers.find((t) => t.id === id);
        if (found) found.cleared = true;
      },
      onFocusAnchor: (anchor) => {
        focusedAnchors.push(anchor);
      }
    });

    // Expanding schedules bounded focus retries (immediate + 120ms + 400ms) for drawer/composer
    controller.toggleDrawer();
    assert.deepEqual(focusedAnchors, ['drawer/composer']);
    const activeRetriesAfterExpand = scheduledTimers.filter((t) => !t.cleared);
    assert.equal(activeRetriesAfterExpand.length, 2);
    assert.deepEqual(
      activeRetriesAfterExpand.map((t) => t.delay),
      [120, 400]
    );

    // Collapsing before 120ms/400ms elapse moves focus to drawer/toggle and cancels pending composer retries
    controller.collapseDrawer();
    assert.equal(focusedAnchors[focusedAnchors.length - 1], 'drawer/toggle');

    // Even if the old 120ms or 400ms timer callbacks are invoked late, they are cancelled/no-ops and NEVER steal focus back to hidden composer
    for (const timer of activeRetriesAfterExpand) {
      assert.equal(timer.cleared, true, `Timer ${timer.delay}ms must be cleared on collapse`);
      timer.fn();
    }
    assert.equal(
      focusedAnchors[focusedAnchors.length - 1],
      'drawer/toggle',
      'Late retry timer must never steal focus into collapsed drawer content'
    );

    // Controls beside live surfaces use preventDefault on pointerdown/mousedown to preserve live-host focus
    let prevented = false;
    const guardRes = preserveLiveSurfaceFocusOnPointerDown({
      preventDefault: () => {
        prevented = true;
      }
    });
    assert.equal(prevented, true);
    assert.equal(guardRes.preservedLiveFocus, true);
  });

  it('handles keyboard resize separator (ArrowUp, ArrowDown, Home, End) and untrusted paste staging without auto-execution (§7)', () => {
    const { createOrchestratorDrawerController, handleSeparatorKeydown } = drawerViewModule;

    const controller = createOrchestratorDrawerController({
      workspaceId: 'ws-main',
      initialHeightPx: 280
    });
    controller.toggleDrawer();

    // Keyboard resize via separator
    const upRes = handleSeparatorKeydown(controller, { key: 'ArrowUp', shiftKey: false });
    assert.equal(upRes.handled, true);
    assert.equal(upRes.heightPx, 300);

    const bigDownRes = handleSeparatorKeydown(controller, { key: 'ArrowDown', shiftKey: true });
    assert.equal(bigDownRes.handled, true);
    assert.equal(bigDownRes.heightPx, 240);

    const minRes = handleSeparatorKeydown(controller, { key: 'Home' });
    assert.equal(minRes.heightPx, 140);

    const maxRes = handleSeparatorKeydown(controller, { key: 'End' });
    assert.equal(maxRes.heightPx, 960);

    // Untrusted paste staging: never auto-executes or auto-submits; exposes control/newline warnings
    const pasteRes = controller.stageClipboardPaste('rm -rf /\n\x07');
    assert.equal(pasteRes.autoExecuted, false);
    assert.equal(pasteRes.hasNewlines, true);
    assert.equal(pasteRes.hasControlChars, true);
    assert.equal(controller.getState().promptText, '');

    controller.applyStagedPaste();
    assert.equal(controller.getState().promptText, 'rm -rf /\n\x07');
    assert.equal(controller.getState().reviewing, false);
  });
});

describe('OrchestratorDrawer — Semantic Control Registry Integration & No Fabricated Hidden Boxes (§9)', () => {
  it('registers drawer controls into controlRegistry with null boxes when collapsed and real content-window boxes only when visible', () => {
    const { createOrchestratorDrawerController, syncDrawerControlsToRegistry } = drawerViewModule;
    const { createControlRegistry } = controlRegistryModule;

    const controller = createOrchestratorDrawerController({ workspaceId: 'ws-main' });
    controller.syncSessions([makeSession({ sessionId: 'sid-alpha', slotId: 'slot-alpha' })]);

    // 1. While collapsed, only launcher is visible; inner drawer controls are hidden and MUST have null boxes
    const regCollapsed = createControlRegistry({
      windowId: 'win-main',
      epoch: 10,
      generation: 1
    });

    const syncedCollapsed = syncDrawerControlsToRegistry(controller, regCollapsed, {
      windowId: 'win-main',
      presentationInstance: 'drawer-bottom',
      epoch: 10,
      generation: 1,
      measureBox: (anchor) => ({ x: 10, y: 680, width: 120, height: 32 })
    });

    const toggleRecordCollapsed = syncedCollapsed.find((r) => r.semanticAnchor === 'drawer/toggle');
    const composerRecordCollapsed = syncedCollapsed.find((r) => r.semanticAnchor === 'drawer/composer');
    assert.ok(toggleRecordCollapsed);
    assert.ok(composerRecordCollapsed);
    assert.deepEqual(toggleRecordCollapsed.box, { x: 10, y: 680, width: 120, height: 32 });
    assert.equal(composerRecordCollapsed.visible, false);
    assert.equal(composerRecordCollapsed.box, null, 'Hidden composer while collapsed must never have a fabricated box');

    // 2. When expanded, inner controls are visible and get rounded content-window boxes
    controller.toggleDrawer();
    const regExpanded = createControlRegistry({
      windowId: 'win-main',
      epoch: 10,
      generation: 1
    });
    const syncedExpanded = syncDrawerControlsToRegistry(controller, regExpanded, {
      windowId: 'win-main',
      presentationInstance: 'drawer-bottom',
      epoch: 10,
      generation: 1,
      measureBox: () => ({ x: 20, y: 440, width: 600, height: 80 })
    });
    const composerRecordExpanded = syncedExpanded.find((r) => r.semanticAnchor === 'drawer/composer');
    assert.ok(composerRecordExpanded);
    assert.equal(composerRecordExpanded.visible, true);
    assert.deepEqual(composerRecordExpanded.box, { x: 20, y: 440, width: 600, height: 80 });
  });
});
