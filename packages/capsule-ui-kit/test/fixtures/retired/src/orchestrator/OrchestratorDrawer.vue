<script>
/**
 * @fileoverview OrchestratorDrawer view controller, keyboard/IME/focus guards, separator handler,
 * and semantic control registry synchronizer.
 * Grounded in architecture contract §§3, 6 (G5), 7 (G2, G3, G4), 8, 9, 10, 12, and 13.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product-specific simulation imports.
 */

import { createDrawerModel } from './drawerModel.js';

export const FOCUS_RETRY_DELAYS_MS = Object.freeze([120, 400]);
export const SEPARATOR_MIN_HEIGHT_PX = 140;
export const SEPARATOR_MAX_HEIGHT_PX = 960;
export const SEPARATOR_STEP_PX = 20;
export const SEPARATOR_LARGE_STEP_PX = 60;

/**
 * Preserves live-surface DOM focus when clicking adjacent chrome controls (§6 G5).
 * Calls `preventDefault()` on `pointerdown` / `mousedown` while leaving click and keyboard activation intact.
 *
 * @param {{ preventDefault?: () => void } | null | undefined} event
 * @returns {{ preservedLiveFocus: boolean }}
 */
export function preserveLiveSurfaceFocusOnPointerDown(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
    return { preservedLiveFocus: true };
  }
  return { preservedLiveFocus: false };
}

/**
 * Handles keyboard resize commands on `workspace/separator/drawer-height` (§7, §8, §9).
 *
 * @param {ReturnType<typeof createOrchestratorDrawerController>} controller
 * @param {{ key: string, shiftKey?: boolean, preventDefault?: () => void }} event
 * @returns {{ handled: boolean, heightPx: number }}
 */
export function handleSeparatorKeydown(controller, event) {
  const current = controller.getState().expandedHeightPx;
  const step = event.shiftKey ? SEPARATOR_LARGE_STEP_PX : SEPARATOR_STEP_PX;
  let next = current;
  let handled = false;

  if (event.key === 'ArrowUp') {
    next = current + step;
    handled = true;
  } else if (event.key === 'ArrowDown') {
    next = current - step;
    handled = true;
  } else if (event.key === 'PageUp') {
    next = current + SEPARATOR_LARGE_STEP_PX;
    handled = true;
  } else if (event.key === 'PageDown') {
    next = current - SEPARATOR_LARGE_STEP_PX;
    handled = true;
  } else if (event.key === 'Home') {
    next = SEPARATOR_MIN_HEIGHT_PX;
    handled = true;
  } else if (event.key === 'End') {
    next = SEPARATOR_MAX_HEIGHT_PX;
    handled = true;
  }

  if (handled) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    const clamped = controller.resizeExpandedHeight(next);
    return { handled: true, heightPx: clamped };
  }

  return { handled: false, heightPx: current };
}

/**
 * Maps a semantic anchor to a collision-free `{ entityId, controlSlot }` tuple for `controlRegistry.register`.
 *
 * @param {string} anchor
 * @returns {{ entityId: string, controlSlot: string }}
 */
function mapAnchorToEntitySlot(anchor) {
  const clean = anchor.replace(/[^A-Za-z0-9._-]/g, '-');
  if (anchor.startsWith('drawer/targets/')) {
    const suffix = anchor.slice('drawer/targets/'.length);
    return {
      entityId: `drawer-target-${suffix}`,
      controlSlot: `target-${suffix}`
    };
  }
  if (anchor.startsWith('dispatch/')) {
    const parts = anchor.split('/');
    const did = parts[1] || 'disp';
    const sid = parts[3] || 'sess';
    const verb = parts[4] || 'slot';
    return {
      entityId: `dispatch-${did}-${sid}`,
      controlSlot: `dispatch-${verb}`
    };
  }
  if (anchor === 'workspace/separator/drawer-height') {
    return {
      entityId: 'workspace-drawer-separator',
      controlSlot: 'separator-drawer-height'
    };
  }
  return {
    entityId: 'orchestrator-drawer',
    controlSlot: `slot-${clean}`
  };
}

/**
 * Synchronizes the drawer's semantic control inventory into a window-scoped `controlRegistry` (§9).
 * Enforces the rule that hidden controls while collapsed have `visible: false` and `box: null`
 * (never fabricating a geometry box while hidden).
 *
 * @param {ReturnType<typeof createOrchestratorDrawerController>} controller
 * @param {{ register: (input: any) => any }} registry
 * @param {{
 *   windowId?: string,
 *   presentationInstance?: string,
 *   epoch: number,
 *   generation?: number,
 *   measureBox?: (anchor: string) => { x: number, y: number, width: number, height: number } | null
 * }} options
 * @returns {Array<any>}
 */
export function syncDrawerControlsToRegistry(controller, registry, options) {
  const state = controller.getState();
  const isExpandedOrMaximized = state.presentation !== 'collapsed';
  const presentationInstance = options.presentationInstance || 'drawer-bottom';
  const epoch = options.epoch;
  const generation = options.generation ?? 1;
  const measureBox = typeof options.measureBox === 'function' ? options.measureBox : () => null;

  const inventory = controller.getSemanticControlInventory();
  const registeredRecords = [];

  for (const item of inventory) {
    const isVisible = item.anchor === 'drawer/toggle' ? true : isExpandedOrMaximized;
    const { entityId, controlSlot } = mapAnchorToEntitySlot(item.anchor);
    const box = isVisible ? measureBox(item.anchor) : null;

    const record = registry.register({
      semanticAnchor: item.anchor,
      entityId,
      presentationInstance,
      controlSlot,
      role: item.role,
      accessibleName: item.accessibleName,
      state: {
        disabled: Boolean(item.disabled),
        ...(item.expanded !== undefined ? { expanded: item.expanded } : {}),
        ...(item.checked !== undefined ? { checked: item.checked } : {}),
        ...(item.reason ? { unavailableReason: item.reason } : {})
      },
      visible: isVisible,
      materialized: isVisible,
      inDom: true,
      box,
      epoch,
      generation
    });
    registeredRecords.push(record);
  }

  // Register the resize separator (`workspace/separator/drawer-height`)
  const sepVisible = state.presentation === 'expanded';
  const sepBox = sepVisible ? measureBox('workspace/separator/drawer-height') : null;
  const sepTuple = mapAnchorToEntitySlot('workspace/separator/drawer-height');
  registeredRecords.push(
    registry.register({
      semanticAnchor: 'workspace/separator/drawer-height',
      entityId: sepTuple.entityId,
      presentationInstance,
      controlSlot: sepTuple.controlSlot,
      role: 'separator',
      accessibleName: 'Resize Orchestrator Drawer',
      state: {
        orientation: 'horizontal',
        valueNow: state.expandedHeightPx,
        valueMin: SEPARATOR_MIN_HEIGHT_PX,
        valueMax: SEPARATOR_MAX_HEIGHT_PX
      },
      visible: sepVisible,
      materialized: sepVisible,
      inDom: true,
      box: sepBox,
      epoch,
      generation
    })
  );

  return registeredRecords;
}

/**
 * Creates an OrchestratorDrawer view controller wrapping `createDrawerModel` with
 * keyboard/IME/focus retry timers, terminal event isolation, and no-collapse-kill guarantees.
 *
 * @param {Object} [config]
 * @param {string} [config.workspaceId]
 * @param {string} [config.instanceId]
 * @param {number} [config.initialHeightPx]
 * @param {number} [config.maxPromptBytes]
 * @param {number} [config.maxStreamBytes]
 * @param {(sessionId: string) => void} [config.onStopSession]
 * @param {(requestId: string, sessionId: string) => void} [config.onCancelRun]
 * @param {(anchor: string) => void} [config.onFocusAnchor]
 * @param {(fn: () => void, delayMs: number) => any} [config.scheduleTimer]
 * @param {(timerId: any) => void} [config.clearTimer]
 */
export function createOrchestratorDrawerController(config = {}) {
  const instanceId =
    typeof config.instanceId === 'string' && config.instanceId.trim().length > 0
      ? config.instanceId
      : 'orchestrator-drawer-singleton';

  const model = createDrawerModel({
    workspaceId: config.workspaceId,
    initialHeightPx: config.initialHeightPx,
    maxPromptBytes: config.maxPromptBytes,
    maxStreamBytes: config.maxStreamBytes
  });

  const scheduleTimer =
    typeof config.scheduleTimer === 'function'
      ? config.scheduleTimer
      : (fn, delay) => setTimeout(fn, delay);
  const clearTimer =
    typeof config.clearTimer === 'function' ? config.clearTimer : (id) => clearTimeout(id);
  const onFocusAnchor =
    typeof config.onFocusAnchor === 'function' ? config.onFocusAnchor : () => {};
  const onStopSession =
    typeof config.onStopSession === 'function' ? config.onStopSession : null;
  const onCancelRun =
    typeof config.onCancelRun === 'function' ? config.onCancelRun : null;

  /** @type {Array<import('./drawerModel.js').SessionTargetDescriptor>} */
  let projectedSessionsList = [];
  /** @type {'bottom-track' | 'docked-panel' | 'tabbed-panel' | 'popout-pending'} */
  let presentationHost = 'bottom-track';
  let targetPickerOpen = false;
  let lastFocusAnchor = 'drawer/toggle';
  let focusIntentToken = 0;
  /** @type {Array<any>} */
  let pendingFocusTimers = [];

  /**
   * Cancels any pending 120ms / 400ms focus retry timers (§6 G5).
   */
  function cancelPendingFocusRetries() {
    focusIntentToken += 1;
    for (const timerId of pendingFocusTimers) {
      clearTimer(timerId);
    }
    pendingFocusTimers = [];
  }

  /**
   * Requests focus on a semantic anchor now, with bounded retries at 120ms and 400ms when expanding (§6 G5).
   * Every retry revalidates presentation state and focus intent generation so a stale timer never steals focus.
   *
   * @param {string} anchor
   * @param {{ withBoundedRetries?: boolean }} [opts]
   */
  function requestFocusWithGuard(anchor, opts = {}) {
    cancelPendingFocusRetries();
    const tokenAtRequest = focusIntentToken;
    lastFocusAnchor = anchor;
    onFocusAnchor(anchor);

    if (opts.withBoundedRetries) {
      for (const delayMs of FOCUS_RETRY_DELAYS_MS) {
        const timerId = scheduleTimer(() => {
          const currentPresentation = model.getState().presentation;
          if (focusIntentToken !== tokenAtRequest) {
            return;
          }
          if (anchor !== 'drawer/toggle' && currentPresentation === 'collapsed') {
            return;
          }
          lastFocusAnchor = anchor;
          onFocusAnchor(anchor);
        }, delayMs);
        pendingFocusTimers.push(timerId);
      }
    }
  }

  return Object.freeze({
    /**
     * Synchronizes core-projected sessions into the drawer model.
     *
     * @param {readonly unknown[]} rawDescriptors
     */
    syncSessions(rawDescriptors) {
      const res = model.syncProjectedSessions(rawDescriptors);
      if (res.ok && Array.isArray(rawDescriptors)) {
        projectedSessionsList = rawDescriptors.map((d) => Object.freeze({ .../** @type {object} */ (d) }));
      }
      return res;
    },

    /**
     * Returns current validated session descriptors.
     */
    getSessions() {
      return Object.freeze([...projectedSessionsList]);
    },

    /**
     * Toggles drawer presentation between collapsed and expanded/maximized.
     * Collapse never stops sessions or cancels runs; expand schedules bounded focus retries on `drawer/composer`.
     */
    toggleDrawer() {
      const res = model.toggleDrawer();
      if (res.presentation === 'collapsed') {
        requestFocusWithGuard('drawer/toggle', { withBoundedRetries: false });
      } else {
        requestFocusWithGuard(res.focusTarget, { withBoundedRetries: true });
      }
      return Object.freeze({
        ...res,
        sessionsKilled: 0,
        runsCancelled: 0
      });
    },

    /**
     * Collapses the drawer while preserving all running sessions, in-flight dispatches, prompt draft, targets, and scroll position.
     * Returns focus immediately to `drawer/toggle` and cancels pending focus retry timers.
     */
    collapseDrawer() {
      const res = model.collapse();
      requestFocusWithGuard('drawer/toggle', { withBoundedRetries: false });
      return Object.freeze({
        ...res,
        sessionsKilled: 0,
        runsCancelled: 0
      });
    },

    /**
     * Toggles between `expanded` and `maximized`.
     */
    toggleMaximize() {
      return model.toggleMaximize();
    },

    /**
     * Resizes the expanded drawer height within min/max bounds.
     *
     * @param {number} heightPx
     */
    resizeExpandedHeight(heightPx) {
      return model.resizeExpandedHeight(heightPx);
    },

    /**
     * Moves the expanded orchestrator presentation across bottom-track, docked-panel, or tabbed-panel
     * using the exact same singleton instance identity (§3: "Moving it must not create another composer or another dispatch owner").
     *
     * @param {'bottom-track' | 'docked-panel' | 'tabbed-panel' | 'popout-pending'} nextHost
     */
    movePresentationHost(nextHost) {
      presentationHost = nextHost;
      return Object.freeze({
        instanceId,
        presentationHost,
        createdSecondComposer: false
      });
    },

    /**
     * Updates composer prompt text.
     *
     * @param {string} text
     */
    setPromptText(text) {
      model.setPromptText(text);
    },

    /**
     * Saves scroll offset of composer/results so collapse/restore preserves read position.
     *
     * @param {number} scrollTop
     */
    setScrollPosition(scrollTop) {
      model.setScrollPosition(scrollTop);
    },

    /**
     * Sets viewed session tab without changing dispatch targets or control lease (§6, §7).
     *
     * @param {string | null} sessionId
     */
    setViewedSession(sessionId) {
      model.setViewedSession(sessionId);
    },

    /**
     * Records which terminal currently holds DOM focus without changing recipient checkboxes.
     *
     * @param {string | null} sessionId
     */
    setFocusedTerminalSession(sessionId) {
      model.setFocusedTerminalSession(sessionId);
    },

    /**
     * Records which session holds human control lease without changing recipient checkboxes.
     *
     * @param {string | null} sessionId
     */
    setControllingSession(sessionId) {
      model.setControllingSession(sessionId);
    },

    /**
     * Selects a single explicit target session ("One" mode).
     *
     * @param {string} sessionId
     */
    selectOneTarget(sessionId) {
      return model.selectOneTarget(sessionId);
    },

    /**
     * Selects an explicit list of target sessions ("Many" mode).
     *
     * @param {readonly string[]} sessionIds
     */
    selectManyTargets(sessionIds) {
      return model.selectManyTargets(sessionIds);
    },

    /**
     * Toggles a single session checkbox in "Many" mode.
     *
     * @param {string} sessionId
     */
    toggleTarget(sessionId) {
      return model.toggleTarget(sessionId);
    },

    /**
     * Expands "All" into the explicit visible workspace session set prior to review.
     */
    selectAllVisibleInWorkspace() {
      return model.selectAllVisibleInWorkspace();
    },

    /**
     * Clears selected targets (disables Send; empty never means all).
     */
    clearTargets() {
      model.clearTargets();
    },

    /**
     * Sets IME composition active when `compositionstart` fires.
     */
    onCompositionStart() {
      model.setImeComposing(true);
    },

    /**
     * Clears IME composition active when `compositionend` fires.
     */
    onCompositionEnd() {
      model.setImeComposing(false);
    },

    /**
     * Sets whether the target picker popover/section is open (for Escape key hierarchy).
     *
     * @param {boolean} open
     */
    setTargetPickerOpen(open) {
      targetPickerOpen = Boolean(open);
    },

    /**
     * Returns whether the target picker is currently open.
     */
    isTargetPickerOpen() {
      return targetPickerOpen;
    },

    /**
     * Stages untrusted pasted text without automatic execution or Send (§7).
     *
     * @param {string} pastedText
     */
    stageClipboardPaste(pastedText) {
      return model.stagePaste(pastedText);
    },

    /**
     * Applies staged paste to the prompt draft without submitting.
     */
    applyStagedPaste() {
      model.applyStagedPasteToDraft();
    },

    /**
     * Clears staged paste buffer without modifying the prompt draft.
     */
    clearStagedPaste() {
      model.stagePaste('');
    },

    /**
     * Freezes review snapshot (`capsule-ui-kit.drawer-review/v1`).
     */
    beginReview() {
      return model.beginReview();
    },

    /**
     * Submits the currently reviewed dispatch.
     *
     * @param {import('./drawerModel.js'). DispatchRecord extends any ? any : never} envelopeMeta
     */
    submitReviewedDispatch(envelopeMeta) {
      return model.submitReviewedDispatch(envelopeMeta);
    },

    /**
     * Records core refusal of an admitted dispatch.
     *
     * @param {string} requestId
     * @param {{ code: string, message: string }} refusal
     */
    recordCoreRefusal(requestId, refusal) {
      return model.recordCoreRefusal(requestId, refusal);
    },

    /**
     * Records core acceptance of an admitted dispatch.
     *
     * @param {string} requestId
     */
    recordCoreAccepted(requestId) {
      return model.recordCoreAccepted(requestId);
    },

    /**
     * Appends bounded streamed output to a target run.
     * Enforces §7 rule: new output never steals scroll or focus (`stoleFocus: false`, `stoleScroll: false`).
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @param {string} chunkText
     */
    appendTargetStreamResult(requestId, sessionId, chunkText) {
      const res = model.appendTargetStreamResult(requestId, sessionId, chunkText);
      if (!res.ok) {
        return res;
      }
      return Object.freeze({
        ...res,
        stoleFocus: false,
        stoleScroll: false
      });
    },

    /**
     * Returns concatenated plain-text output for `output/{sid}/text` (§9).
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @returns {string}
     */
    getAccessibleOutputText(requestId, sessionId) {
      const disp = model.getState().dispatches[requestId];
      if (!disp || !disp.targets[sessionId]) {
        return '';
      }
      return disp.targets[sessionId].streamedChunks.join('');
    },

    /**
     * Records adapter completion (`completed-unverified`).
     *
     * @param {string} requestId
     * @param {string} sessionId
     */
    recordAdapterCompletion(requestId, sessionId) {
      return model.recordAdapterCompletion(requestId, sessionId);
    },

    /**
     * Records a core-verified receipt with mandatory state/tick witness.
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @param {{ receiptId: string, verified: boolean, stateSha256: string, tick: number, failureReason?: string }} receipt
     */
    recordVerifiedReceipt(requestId, sessionId, receipt) {
      return model.recordVerifiedReceipt(requestId, sessionId, receipt);
    },

    /**
     * Marks in-flight targets uncertain on disconnect or lost reply.
     *
     * @param {string} requestId
     */
    markDispatchUncertain(requestId) {
      return model.markDispatchUncertain(requestId);
    },

    /**
     * Explicitly requests cancellation of a single dispatch target run (`Stop-this-run`).
     * Never stops the underlying session (`Stop-session` is distinct per §7).
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @param {{ confirmedByCore?: boolean }} [options]
     */
    requestCancelTargetRun(requestId, sessionId, options = {}) {
      const res = model.cancelTargetRun(requestId, sessionId, options);
      if (res.ok && onCancelRun) {
        onCancelRun(requestId, sessionId);
      }
      return res;
    },

    /**
     * Explicitly requests stopping a session (`session/{sid}/stop`), distinct from cancelling a dispatch run.
     *
     * @param {string} sessionId
     */
    requestStopSession(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        return { ok: false, code: 'INVALID_SESSION_ID', message: 'Session ID must be a non-empty string.' };
      }
      if (onStopSession) {
        onStopSession(sessionId);
      }
      return { ok: true, sessionId };
    },

    /**
     * Stages retry for failed/refused/cancelled targets only (refuses uncertain or successful targets).
     *
     * @param {string} parentRequestId
     * @param {readonly string[]} retrySessionIds
     */
    stageRetryForFailedTargets(parentRequestId, retrySessionIds) {
      return model.stageRetryForFailedTargets(parentRequestId, retrySessionIds);
    },

    /**
     * Evaluates keyboard events on the drawer/composer according to §7 rules:
     * - Terminal keystrokes (`fromTerminal`) never bubble into drawer shortcuts; terminal Ctrl+C is retained.
     * - IME composition (`isComposing` or `imeComposing`) blocks submission.
     * - Plain `Enter` inserts a newline; `Ctrl+Enter` / `Cmd+Enter` starts review or triggers submit.
     * - `Escape` closes target picker first, then cancels active review, then collapses drawer, and NEVER cancels a run.
     *
     * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, isComposing?: boolean, fromTerminal?: boolean, preventDefault?: () => void }} event
     */
    handleKeydown(event) {
      if (event.fromTerminal) {
        return Object.freeze({
          action: 'ignore-terminal-key',
          preventDefault: false,
          cancelRun: false
        });
      }

      const currentState = model.getState();
      if (event.isComposing || currentState.imeComposing) {
        return Object.freeze({
          action: 'ignore-ime',
          preventDefault: false,
          cancelRun: false
        });
      }

      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        if (currentState.reviewing) {
          return Object.freeze({
            action: 'trigger-submit',
            preventDefault: true,
            cancelRun: false
          });
        }
        const rev = model.beginReview();
        return Object.freeze({
          action: rev.ok ? 'review-started' : 'review-refused',
          reviewResult: rev,
          preventDefault: true,
          cancelRun: false
        });
      }

      if (event.key === 'Escape' && targetPickerOpen) {
        targetPickerOpen = false;
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        return Object.freeze({
          action: 'close-picker',
          preventDefault: true,
          cancelRun: false
        });
      }

      const res = model.handleKeyCommand({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isComposing: event.isComposing,
        fromTerminal: false,
        pickerOpen: false
      });

      if (res.action === 'collapse-drawer') {
        requestFocusWithGuard('drawer/toggle', { withBoundedRetries: false });
      }

      const shouldPrevent =
        res.action === 'cancel-review' || res.action === 'collapse-drawer';
      if (shouldPrevent && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      return Object.freeze({
        action: res.action,
        preventDefault: shouldPrevent,
        cancelRun: false
      });
    },

    /**
     * Cancels all pending focus retry timers (e.g. on component unmount).
     */
    cancelPendingFocusRetries,

    /**
     * Returns the last semantic anchor targeted for focus.
     */
    getLastFocusAnchor() {
      return lastFocusAnchor;
    },

    /**
     * Returns the declarative §9 semantic control inventory from the underlying drawer model.
     */
    getSemanticControlInventory() {
      return model.getSemanticControlInventory();
    },

    /**
     * Returns an immutable snapshot of the drawer view and model state.
     */
    getState() {
      const baseState = model.getState();
      return Object.freeze({
        ...baseState,
        instanceId,
        presentationHost,
        targetPickerOpen,
        lastFocusAnchor
      });
    }
  });
}
</script>

<script setup>
import { shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { resolveSessionTabStatus } from './drawerModel.js';

const props = defineProps({
  workspaceId: {
    type: String,
    default: 'workspace-default'
  },
  instanceId: {
    type: String,
    default: 'orchestrator-drawer-singleton'
  },
  initialHeightPx: {
    type: Number,
    default: 280
  },
  sessions: {
    type: Array,
    default: () => []
  },
  envelopeSession: {
    type: String,
    default: 'ui-session-default'
  },
  senderInstance: {
    type: String,
    default: 'renderer-drawer-1'
  }
});

const emit = defineEmits([
  'presentation-change',
  'review-frozen',
  'dispatch-submitted',
  'cancel-target-run',
  'stop-session',
  'attach-session',
  'replay-session'
]);

/** @type {import('vue').ShallowRef<HTMLElement | null>} */
const toggleButtonRef = shallowRef(null);
/** @type {import('vue').ShallowRef<HTMLTextAreaElement | null>} */
const composerInputRef = shallowRef(null);

let nextSeq = 1;

const controller = createOrchestratorDrawerController({
  workspaceId: props.workspaceId,
  instanceId: props.instanceId,
  initialHeightPx: props.initialHeightPx,
  onStopSession: (sid) => emit('stop-session', { sessionId: sid }),
  onCancelRun: (requestId, sessionId) => emit('cancel-target-run', { requestId, sessionId }),
  onFocusAnchor: (anchor) => {
    if (anchor === 'drawer/toggle' && toggleButtonRef.value && typeof toggleButtonRef.value.focus === 'function') {
      toggleButtonRef.value.focus();
    } else if (
      anchor === 'drawer/composer' &&
      composerInputRef.value &&
      typeof composerInputRef.value.focus === 'function'
    ) {
      composerInputRef.value.focus();
    }
  }
});

const viewState = shallowRef(controller.getState());
const sessionList = shallowRef(controller.getSessions());
const lastPasteWarning = shallowRef(null);

function refreshState() {
  viewState.value = controller.getState();
  sessionList.value = controller.getSessions();
}

watch(
  () => props.workspaceId,
  (nextWs) => {
    if (typeof nextWs === 'string' && nextWs.trim().length > 0) {
      refreshState();
    }
  }
);

watch(
  () => props.sessions,
  (nextSessions) => {
    if (Array.isArray(nextSessions)) {
      controller.syncSessions(nextSessions);
      refreshState();
    }
  },
  { immediate: true }
);

const isExpanded = computed(() => viewState.value.presentation !== 'collapsed');
const isMaximized = computed(() => viewState.value.presentation === 'maximized');

const unreadOutputCount = computed(() => viewState.value.unreadOutputCount ?? 0);
const unreadOutputs = computed(() =>
  Array.isArray(viewState.value.unreadOutputs) ? viewState.value.unreadOutputs : []
);
const latestUnreadOutput = computed(() =>
  unreadOutputs.value.length > 0 ? unreadOutputs.value[unreadOutputs.value.length - 1] : null
);

const activitySummary = computed(() => {
  let active = 0;
  let idle = 0;
  let ended = 0;
  for (const sess of sessionList.value) {
    const status = resolveSessionTabStatus(sess?.activity);
    if (status === 'busy') active += 1;
    else if (status === 'exited') ended += 1;
    else idle += 1;
  }
  if (active + idle + ended === 0) return 'No sessions';
  const parts = [`${active} active`, `${idle} idle`];
  if (ended > 0) parts.push(`${ended} ended`);
  return parts.join(', ');
});

/**
 * @param {{ activity?: string } | null | undefined} sess
 * @returns {'idle' | 'busy' | 'exited'}
 */
function tabStatus(sess) {
  return resolveSessionTabStatus(sess?.activity);
}

const sendButtonAccessibleName = computed(() => {
  if (viewState.value.reviewing && viewState.value.frozenReview) {
    return `Send to ${viewState.value.frozenReview.targetIds.join(', ')}`;
  }
  return `Review (${viewState.value.selectedTargetIds.length} targets)`;
});

const sendUnavailableReason = computed(() => {
  if (viewState.value.selectedTargetIds.length === 0) {
    return 'Empty targets disable Send';
  }
  if (viewState.value.imeComposing) {
    return 'IME composition active';
  }
  if (!viewState.value.sendEnabled) {
    return 'Prompt draft is empty or invalid';
  }
  return '';
});

const dispatchList = computed(() => Object.values(viewState.value.dispatches));

function onToggleDrawer() {
  const res = controller.toggleDrawer();
  refreshState();
  emit('presentation-change', res);
}

function onToggleMaximize() {
  const res = controller.toggleMaximize();
  refreshState();
  emit('presentation-change', res);
}

function onSeparatorKey(event) {
  handleSeparatorKeydown(controller, event);
  refreshState();
}

function onPromptInput(event) {
  const target = /** @type {HTMLTextAreaElement | null} */ (event?.target ?? null);
  if (target && typeof target.value === 'string') {
    controller.setPromptText(target.value);
    refreshState();
  }
}

function onComposerPaste(event) {
  const pasted = event?.clipboardData?.getData?.('text/plain');
  if (typeof pasted === 'string' && (/\r|\n/.test(pasted) || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(pasted))) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    lastPasteWarning.value = controller.stageClipboardPaste(pasted);
    refreshState();
  }
}

function onApplyStagedPaste() {
  controller.applyStagedPaste();
  lastPasteWarning.value = null;
  refreshState();
}

function onDiscardStagedPaste() {
  controller.clearStagedPaste();
  lastPasteWarning.value = null;
  refreshState();
}

function onCompositionStart() {
  controller.onCompositionStart();
  refreshState();
}

function onCompositionEnd() {
  controller.onCompositionEnd();
  refreshState();
}

function onDrawerKeydown(event) {
  const targetEl = /** @type {HTMLElement | null} */ (event?.target ?? null);
  const fromTerminal = Boolean(
    targetEl && typeof targetEl.closest === 'function' && targetEl.closest('[data-terminal-surface="true"]')
  );
  const res = controller.handleKeydown({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    isComposing: event.isComposing,
    fromTerminal,
    preventDefault: () => event.preventDefault()
  });
  if (res.action === 'trigger-submit') {
    onReviewOrSendClick();
  } else {
    refreshState();
  }
}

function onToggleTarget(sessionId) {
  controller.toggleTarget(sessionId);
  refreshState();
}

function onSelectAllTargets() {
  controller.selectAllVisibleInWorkspace();
  refreshState();
}

function onClearTargets() {
  controller.clearTargets();
  refreshState();
}

function onSelectSessionTab(sessionId) {
  controller.setViewedSession(sessionId);
  refreshState();
}

function onReviewOrSendClick() {
  if (!viewState.value.reviewing) {
    const rev = controller.beginReview();
    refreshState();
    if (rev.ok) {
      emit('review-frozen', rev.review);
    }
    return;
  }
  const currentSeq = nextSeq++;
  const sub = controller.submitReviewedDispatch({
    session: props.envelopeSession,
    authenticated_sender_instance: props.senderInstance,
    nonce: `nonce-${props.instanceId}-${currentSeq}`,
    seq: currentSeq
  });
  refreshState();
  if (sub.ok) {
    emit('dispatch-submitted', sub);
  }
}

function onCancelTargetRun(requestId, sessionId) {
  controller.requestCancelTargetRun(requestId, sessionId);
  refreshState();
}

function onRetryTargetRun(requestId, sessionId) {
  controller.stageRetryForFailedTargets(requestId, [sessionId]);
  refreshState();
}

function onStopSession(sessionId) {
  controller.requestStopSession(sessionId);
  refreshState();
}

onMounted(() => {
  refreshState();
});

onBeforeUnmount(() => {
  controller.cancelPendingFocusRetries();
});

defineExpose({
  controller,
  refreshState
});
</script>

<template>
  <section
    id="cuk-orchestrator-drawer-region"
    class="cuk-orchestrator-drawer"
    role="region"
    aria-label="Orchestrator Drawer"
    :data-presentation="viewState.presentation"
    :data-instance-id="viewState.instanceId"
    :data-host-mode="viewState.presentationHost"
    @keydown="onDrawerKeydown"
  >
    <!-- Bottom Launcher & Header Chrome (§3, §7, §9) -->
    <header class="cuk-orchestrator-drawer__bar">
      <button
        id="drawer/toggle"
        ref="toggleButtonRef"
        type="button"
        class="cuk-orchestrator-drawer__btn cuk-orchestrator-drawer__btn--toggle"
        role="button"
        data-semantic-anchor="drawer/toggle"
        aria-label="Orchestrator"
        :aria-expanded="isExpanded ? 'true' : 'false'"
        aria-controls="cuk-orchestrator-drawer-body"
        @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
        @mousedown="preserveLiveSurfaceFocusOnPointerDown"
        @click="onToggleDrawer"
      >
        Orchestrator ({{ sessionList.length }})
      </button>

      <span
        id="cuk-drawer-activity-summary"
        class="cuk-orchestrator-drawer__activity"
        role="status"
        :aria-label="`Session activity: ${activitySummary}`"
      >
        {{ activitySummary }}
      </span>

      <span
        v-if="unreadOutputCount > 0"
        id="cuk-drawer-unread"
        class="cuk-orchestrator-drawer__unread"
        role="status"
        :aria-label="`${unreadOutputCount} unread outputs`"
      >
        {{ unreadOutputCount }} unread
      </span>

      <span
        v-if="latestUnreadOutput"
        id="cuk-drawer-latest-preview"
        class="cuk-orchestrator-drawer__latest"
        role="status"
        :aria-label="`Latest unread output from ${latestUnreadOutput.sessionId}`"
      >
        {{ latestUnreadOutput.sessionId }}: {{ latestUnreadOutput.preview }}
      </span>

      <button
        id="cuk-drawer-maximize"
        type="button"
        class="cuk-orchestrator-drawer__btn cuk-orchestrator-drawer__btn--right"
        role="button"
        data-semantic-anchor="drawer/maximize"
        :aria-label="isMaximized ? 'Restore' : 'Maximize'"
        :disabled="!isExpanded"
        :aria-disabled="!isExpanded ? 'true' : 'false'"
        @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
        @mousedown="preserveLiveSurfaceFocusOnPointerDown"
        @click="onToggleMaximize"
      >
        {{ isMaximized ? 'Restore' : 'Maximize' }}
      </button>
    </header>

    <!-- Keyboard Resize Separator (§7, §8, §9) -->
    <div
      v-show="viewState.presentation === 'expanded'"
      id="cuk-workspace-separator-drawer-height"
      class="cuk-orchestrator-drawer__separator"
      role="separator"
      tabindex="0"
      data-semantic-anchor="workspace/separator/drawer-height"
      aria-label="Resize Orchestrator Drawer"
      aria-orientation="horizontal"
      :aria-valuenow="viewState.expandedHeightPx"
      :aria-valuemin="SEPARATOR_MIN_HEIGHT_PX"
      :aria-valuemax="SEPARATOR_MAX_HEIGHT_PX"
      @keydown="onSeparatorKey"
    />

    <!-- Permanent Drawer Body: kept mounted via v-show so collapse never destroys sessions or state (§6, §7) -->
    <div
      v-show="isExpanded"
      id="cuk-orchestrator-drawer-body"
      class="cuk-orchestrator-drawer__body"
      :style="
        viewState.presentation === 'expanded'
          ? { height: `${viewState.expandedHeightPx}px` }
          : undefined
      "
    >
      <slot name="terminal">
      <!-- Session Tabs & Per-Session Controls (§6, §7, §9) -->
      <div
        class="cuk-orchestrator-drawer__sessions"
        role="tablist"
        aria-label="AI sessions"
      >
        <div
          v-for="sess in sessionList"
          :key="sess.sessionId"
          class="cuk-orchestrator-drawer__session-item"
        >
          <button
            :id="`cuk-capsule-${sess.capsuleId}-session-${sess.sessionId}-tab`"
            type="button"
            role="tab"
            class="cuk-orchestrator-drawer__tab"
            :data-semantic-anchor="`capsule/${sess.capsuleId}/session/${sess.sessionId}/tab`"
            :aria-label="`Session ${sess.sessionId} (${sess.activity})`"
            :aria-selected="viewState.viewedSessionId === sess.sessionId ? 'true' : 'false'"
            @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
            @mousedown="preserveLiveSurfaceFocusOnPointerDown"
            @click="onSelectSessionTab(sess.sessionId)"
          >
            {{ sess.sessionId }} · {{ sess.activity }}
            <span :class="`cuk-orchestrator-drawer__chip cuk-orchestrator-drawer__chip--${tabStatus(sess)}`" aria-hidden="true">{{ tabStatus(sess) }}</span>
          </button>

          <button
            :id="`cuk-session-${sess.sessionId}-attach`"
            type="button"
            role="button"
            class="cuk-orchestrator-drawer__session-btn"
            :data-semantic-anchor="`session/${sess.sessionId}/attach`"
            :aria-label="`Attach session ${sess.sessionId}`"
            @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
            @mousedown="preserveLiveSurfaceFocusOnPointerDown"
            @click="emit('attach-session', { sessionId: sess.sessionId })"
          >
            Attach
          </button>

          <button
            :id="`cuk-session-${sess.sessionId}-replay`"
            type="button"
            role="button"
            class="cuk-orchestrator-drawer__session-btn"
            :data-semantic-anchor="`session/${sess.sessionId}/replay`"
            :aria-label="`Replay session ${sess.sessionId}`"
            @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
            @mousedown="preserveLiveSurfaceFocusOnPointerDown"
            @click="emit('replay-session', { sessionId: sess.sessionId })"
          >
            Replay
          </button>

          <button
            :id="`cuk-session-${sess.sessionId}-target`"
            type="button"
            role="button"
            class="cuk-orchestrator-drawer__session-btn"
            :data-semantic-anchor="`session/${sess.sessionId}/target`"
            :aria-label="`Target session ${sess.sessionId}`"
            @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
            @mousedown="preserveLiveSurfaceFocusOnPointerDown"
            @click="onToggleTarget(sess.sessionId)"
          >
            Target
          </button>

          <button
            :id="`cuk-session-${sess.sessionId}-stop`"
            type="button"
            role="button"
            class="cuk-orchestrator-drawer__session-btn cuk-orchestrator-drawer__session-btn--danger"
            :data-semantic-anchor="`session/${sess.sessionId}/stop`"
            :aria-label="`Stop session ${sess.sessionId}`"
            @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
            @mousedown="preserveLiveSurfaceFocusOnPointerDown"
            @click="onStopSession(sess.sessionId)"
          >
            Stop Session
          </button>
        </div>
      </div>

      <!-- Explicit Target Picker ("One", "Many", "All", "Clear"; empty NEVER means all) (§7, §9) -->
      <div
        class="cuk-orchestrator-drawer__targets"
        role="group"
        aria-label="Dispatch target selection"
      >
        <button
          id="cuk-drawer-targets-all"
          type="button"
          role="button"
          class="cuk-orchestrator-drawer__btn"
          data-semantic-anchor="drawer/targets/all"
          aria-label="Select all in workspace"
          :disabled="sessionList.length === 0"
          @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
          @mousedown="preserveLiveSurfaceFocusOnPointerDown"
          @click="onSelectAllTargets"
        >
          Select all in workspace
        </button>

        <button
          id="cuk-drawer-targets-clear"
          type="button"
          role="button"
          class="cuk-orchestrator-drawer__btn"
          data-semantic-anchor="drawer/targets/clear"
          aria-label="Clear targets"
          :disabled="viewState.selectedTargetIds.length === 0"
          @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
          @mousedown="preserveLiveSurfaceFocusOnPointerDown"
          @click="onClearTargets"
        >
          Clear targets
        </button>

        <label
          v-for="sess in sessionList"
          :key="`target-${sess.sessionId}`"
          class="cuk-orchestrator-drawer__target-chip"
        >
          <input
            :id="`cuk-drawer-targets-${sess.sessionId}`"
            type="checkbox"
            role="checkbox"
            :data-semantic-anchor="`drawer/targets/${sess.sessionId}`"
            :aria-label="`Session ${sess.sessionId} (${sess.activity})`"
            :checked="viewState.selectedTargetIds.includes(sess.sessionId)"
            :aria-checked="viewState.selectedTargetIds.includes(sess.sessionId) ? 'true' : 'false'"
            @change="onToggleTarget(sess.sessionId)"
          />
          <span>{{ sess.sessionId }} ({{ sess.activity }})</span>
        </label>
      </div>

      <!-- Untrusted Paste Staging Guard (§7 Terminal security) -->
      <div
        v-if="viewState.stagedPasteText"
        id="cuk-alert-paste-staging"
        class="cuk-orchestrator-drawer__paste-staging"
        role="alert"
        data-semantic-anchor="alerts/paste-staging"
        aria-label="Staged multiline or control-character paste requires confirmation"
      >
        <span>
          Staged paste ({{ viewState.stagedPasteText.length }} chars;
          newlines={{ Boolean(lastPasteWarning?.hasNewlines) }},
          controlChars={{ Boolean(lastPasteWarning?.hasControlChars) }}).
          Paste never auto-executes.
        </span>
        <button type="button" class="cuk-orchestrator-drawer__btn" @click="onApplyStagedPaste">
          Append to Draft
        </button>
        <button type="button" class="cuk-orchestrator-drawer__btn" @click="onDiscardStagedPaste">
          Discard
        </button>
      </div>

      <!-- Review Invalidation Alert (§7) -->
      <div
        v-if="viewState.lastInvalidation"
        id="cuk-alert-review-invalidation"
        class="cuk-orchestrator-drawer__alert"
        role="alert"
        data-semantic-anchor="alerts/review-invalidation"
        :aria-label="`Review invalidated: ${viewState.lastInvalidation.code} ${viewState.lastInvalidation.reason}`"
      >
        {{ viewState.lastInvalidation.code }}: {{ viewState.lastInvalidation.reason }}
      </div>

      <!-- Frozen Review Snapshot Summary (§7) -->
      <div
        v-if="viewState.reviewing && viewState.frozenReview"
        class="cuk-orchestrator-drawer__review-banner"
        role="status"
        aria-live="polite"
      >
        Frozen review ({{ viewState.frozenReview.promptByteLength }} UTF-8 bytes) →
        Targets: {{ viewState.frozenReview.targetIds.join(', ') }} ·
        Basis digest: {{ viewState.frozenReview.basisDigest.slice(0, 16) }}
      </div>

      <!-- Plain Multiline Composer & Review/Send Trigger (§7, §9) -->
      <div class="cuk-orchestrator-drawer__composer-row">
        <textarea
          id="cuk-drawer-composer"
          ref="composerInputRef"
          class="cuk-orchestrator-drawer__composer"
          role="textbox"
          aria-multiline="true"
          aria-label="Prompt"
          data-semantic-anchor="drawer/composer"
          :value="viewState.promptText"
          placeholder="Compose prompt (Enter for newline, Ctrl/Cmd+Enter to Review or Send)..."
          @input="onPromptInput"
          @paste="onComposerPaste"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
        />

        <button
          id="cuk-drawer-send"
          type="button"
          role="button"
          class="cuk-orchestrator-drawer__btn cuk-orchestrator-drawer__btn--primary"
          data-semantic-anchor="drawer/send"
          :aria-label="sendButtonAccessibleName"
          :disabled="!viewState.sendEnabled"
          :aria-disabled="!viewState.sendEnabled ? 'true' : 'false'"
          :data-unavailable-reason="sendUnavailableReason || undefined"
          :title="sendUnavailableReason || sendButtonAccessibleName"
          @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
          @mousedown="preserveLiveSurfaceFocusOnPointerDown"
          @click="onReviewOrSendClick"
        >
          {{ sendButtonAccessibleName }}
        </button>
      </div>

      <!-- Per-Target Dispatch Receipts & Accessible Output Regions (§7, §9) -->
      <div
        class="cuk-orchestrator-drawer__dispatches"
        aria-live="polite"
      >
        <div
          v-for="disp in dispatchList"
          :key="disp.requestId"
          class="cuk-orchestrator-drawer__dispatch-group"
        >
          <div
            v-if="disp.refusalAlert"
            :id="`cuk-alert-dispatch-${disp.requestId}`"
            class="cuk-orchestrator-drawer__alert"
            role="alert"
            :data-semantic-anchor="`alerts/dispatch-${disp.requestId}`"
            :aria-label="disp.refusalAlert"
          >
            {{ disp.refusalAlert }}
          </div>

          <div
            v-for="sid in disp.targetIds"
            :key="`${disp.requestId}-${sid}`"
            :id="`cuk-dispatch-${disp.requestId}-target-${sid}-result`"
            class="cuk-orchestrator-drawer__target-result"
            role="region"
            :data-semantic-anchor="`dispatch/${disp.requestId}/target/${sid}/result`"
            :aria-label="`Result for ${sid}: ${disp.targets[sid].status}`"
          >
            <div class="cuk-orchestrator-drawer__target-header">
              <strong>{{ sid }}</strong>
              <span class="cuk-orchestrator-drawer__status-badge">
                {{ disp.targets[sid].status }}
              </span>
              <span v-if="disp.targets[sid].verifiedReceiptId">
                Receipt: {{ disp.targets[sid].verifiedReceiptId }} (tick {{ disp.targets[sid].witnessTick }})
              </span>

              <!-- Guarded Retry Target Button (§7, §9) -->
              <button
                :id="`cuk-dispatch-${disp.requestId}-target-${sid}-retry`"
                type="button"
                role="button"
                class="cuk-orchestrator-drawer__btn"
                :data-semantic-anchor="`dispatch/${disp.requestId}/target/${sid}/retry`"
                :aria-label="`Retry target ${sid}`"
                :disabled="
                  disp.targets[sid].status !== 'verified-failure' &&
                  disp.targets[sid].status !== 'refused' &&
                  disp.targets[sid].status !== 'cancelled'
                "
                @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
                @mousedown="preserveLiveSurfaceFocusOnPointerDown"
                @click="onRetryTargetRun(disp.requestId, sid)"
              >
                Retry target
              </button>

              <!-- Stop-this-run Button (distinct from Stop-session) (§7, §9) -->
              <button
                :id="`cuk-dispatch-${disp.requestId}-target-${sid}-cancel`"
                type="button"
                role="button"
                class="cuk-orchestrator-drawer__btn"
                :data-semantic-anchor="`dispatch/${disp.requestId}/target/${sid}/cancel`"
                :aria-label="`Cancel run on ${sid}`"
                :disabled="
                  disp.targets[sid].status !== 'pending' &&
                  disp.targets[sid].status !== 'accepted' &&
                  disp.targets[sid].status !== 'queued' &&
                  disp.targets[sid].status !== 'executing'
                "
                @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
                @mousedown="preserveLiveSurfaceFocusOnPointerDown"
                @click="onCancelTargetRun(disp.requestId, sid)"
              >
                Cancel run
              </button>
            </div>

            <!-- Accessible Output Region (`output/{sid}/text`, §9) -->
            <div
              :id="`cuk-output-${sid}-text-${disp.requestId}`"
              class="cuk-orchestrator-drawer__output-text"
              role="region"
              :data-semantic-anchor="`output/${sid}/text`"
              :aria-label="`Accessible output for ${sid}`"
            >
              <pre class="cuk-orchestrator-drawer__output-pre">{{ disp.targets[sid].streamedChunks.join('') }}</pre>
            </div>
          </div>
        </div>
      </div>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.cuk-orchestrator-drawer {
  display: flex;
  flex-direction: column;
  background-color: var(--cuk-semantic-surface-chrome);
  color: var(--cuk-semantic-text-primary);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
}

.cuk-orchestrator-drawer__bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-lg);
  min-height: var(--cuk-semantic-size-drawer-launcher-height);
  overflow: hidden;
}

.cuk-orchestrator-drawer__activity {
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  white-space: nowrap;
}

.cuk-orchestrator-drawer__unread {
  padding: var(--cuk-semantic-border-width) var(--cuk-semantic-spacing-sm);
  border-radius: var(--cuk-semantic-radius-xs);
  background-color: var(--cuk-semantic-accent-secondary-container);
  color: var(--cuk-semantic-accent-on-secondary-container);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  white-space: nowrap;
}

.cuk-orchestrator-drawer__latest {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-roles-code-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
}

.cuk-orchestrator-drawer__separator {
  height: var(--cuk-semantic-size-separator-hit-area);
  cursor: ns-resize;
  background-color: var(--cuk-semantic-border-subtle);
}

.cuk-orchestrator-drawer__separator:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}

.cuk-orchestrator-drawer__body {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-md) var(--cuk-semantic-spacing-lg);
  background-color: var(--cuk-semantic-surface-panel);
  overflow-y: auto;
  /* Exact 140px floor (matches the drawer min-height clamp) from tokens only. */
  min-height: calc(var(--cuk-semantic-size-control-height-md) * 4 + var(--cuk-semantic-size-control-padding-xmd));
}

.cuk-orchestrator-drawer__sessions,
.cuk-orchestrator-drawer__targets,
.cuk-orchestrator-drawer__composer-row,
.cuk-orchestrator-drawer__target-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cuk-semantic-spacing-md);
}

.cuk-orchestrator-drawer__session-item {
  display: flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
  padding: var(--cuk-semantic-spacing-xxs) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}

.cuk-orchestrator-drawer__composer {
  flex: 1 1 auto;
  min-height: calc(var(--cuk-semantic-size-control-height-md) * 2);
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-canvas);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  resize: vertical;
}

.cuk-orchestrator-drawer__composer:focus-visible,
.cuk-orchestrator-drawer__btn:focus-visible,
.cuk-orchestrator-drawer__tab:focus-visible,
.cuk-orchestrator-drawer__session-btn:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}

.cuk-orchestrator-drawer__btn,
.cuk-orchestrator-drawer__tab,
.cuk-orchestrator-drawer__session-btn {
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-primitive-space-5);
  background-color: var(--cuk-semantic-surface-interactive);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  cursor: pointer;
}

.cuk-orchestrator-drawer__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
}

.cuk-orchestrator-drawer__btn:hover,
.cuk-orchestrator-drawer__tab:hover,
.cuk-orchestrator-drawer__session-btn:hover {
  background-color: var(--cuk-semantic-surface-hover-s1);
}

.cuk-orchestrator-drawer__btn--right {
  margin-left: auto;
}

.cuk-orchestrator-drawer__btn--primary {
  background-color: var(--cuk-semantic-accent-primary);
  border-color: var(--cuk-semantic-accent-primary);
  color: var(--cuk-semantic-accent-primary-contrast);
}

.cuk-orchestrator-drawer__btn--primary:hover {
  background-color: var(--cuk-semantic-accent-primary-hover);
  border-color: var(--cuk-semantic-accent-primary-hover);
}

.cuk-orchestrator-drawer__session-btn--danger {
  background-color: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
  color: var(--cuk-semantic-status-error-text);
}

.cuk-orchestrator-drawer__btn:disabled {
  color: var(--cuk-semantic-text-disabled);
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}

.cuk-orchestrator-drawer__chip {
  padding: var(--cuk-semantic-border-width) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  white-space: nowrap;
}

.cuk-orchestrator-drawer__chip--idle,
.cuk-orchestrator-drawer__chip--exited {
  color: var(--cuk-semantic-text-muted);
  background-color: var(--cuk-semantic-surface-interactive);
  border-color: var(--cuk-semantic-border-subtle);
}

.cuk-orchestrator-drawer__chip--busy {
  color: var(--cuk-semantic-status-warning-text);
  background-color: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}

.cuk-orchestrator-drawer__target-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
  padding: var(--cuk-semantic-border-width) var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  cursor: pointer;
}

.cuk-orchestrator-drawer__target-chip input {
  accent-color: var(--cuk-semantic-accent-primary);
}

.cuk-orchestrator-drawer__status-badge {
  padding: var(--cuk-semantic-border-width) var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
}

.cuk-orchestrator-drawer__alert {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-status-error-surface);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-error-border);
  border-radius: var(--cuk-semantic-radius-xs);
  color: var(--cuk-semantic-status-error-text);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}

.cuk-orchestrator-drawer__paste-staging {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-status-warning-surface);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-warning-border);
  border-radius: var(--cuk-semantic-radius-xs);
  color: var(--cuk-semantic-status-warning-text);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}

.cuk-orchestrator-drawer__review-banner {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-status-info-surface);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-info-border);
  border-radius: var(--cuk-semantic-radius-xs);
  color: var(--cuk-semantic-status-info-text);
  font-family: var(--cuk-semantic-typography-roles-code-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
}

.cuk-orchestrator-drawer__dispatch-group {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xs);
}

.cuk-orchestrator-drawer__target-result {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xs);
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}

.cuk-orchestrator-drawer__output-text {
  min-width: 0;
}

.cuk-orchestrator-drawer__output-pre {
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: calc(var(--cuk-semantic-size-control-height-md) * 5);
  overflow-y: auto;
}
</style>
