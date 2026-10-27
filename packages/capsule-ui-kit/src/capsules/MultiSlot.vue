<script>
/**
 * @file MultiSlot capsule AI session projection controller, G5 fold/restore focus & activation veil
 * protocol, and §9 AI-operability semantic control inventory helpers.
 * Grounded in UI_ARCHITECTURE.md §§ 3, 6, 7, 8, 9, 10, 12, and 13 (unit: Multislot).
 * Plain JavaScript with JSDoc annotations; no authored TypeScript, no consumer imports.
 */

/**
 * Closed backend capsule lifecycle vocabulary (ARCH:110, UI_ARCHITECTURE.md §6:181).
 * @type {readonly string[]}
 */
export const ALLOWED_BACKEND_LIFECYCLES = Object.freeze([
  'active',
  'standby',
  'ceded',
  'destroyed',
  'lost'
]);

/**
 * Axis 1: AI-region presentation states (UI_ARCHITECTURE.md §6:189).
 * @type {readonly string[]}
 */
export const AI_REGION_PRESENTATION_STATES = Object.freeze([
  'expanded',
  'folded'
]);

/**
 * Axis 2: Session view selection states (UI_ARCHITECTURE.md §6:190).
 * @type {readonly string[]}
 */
export const SESSION_VIEW_SELECTION_STATES = Object.freeze([
  'selected',
  'unselected'
]);

/**
 * Axis 3: Session attachment states (UI_ARCHITECTURE.md §6:191).
 * @type {readonly string[]}
 */
export const ATTACHMENT_STATES = Object.freeze([
  'detached',
  'attaching',
  'restoring',
  'live',
  'disconnected'
]);

/**
 * Axis 4: Projected session activity states (UI_ARCHITECTURE.md §6:192).
 * @type {readonly string[]}
 */
export const PROJECTED_SESSION_ACTIVITIES = Object.freeze([
  'unknown',
  'ready',
  'busy',
  'waiting-input',
  'waiting-permission',
  'exited',
  'failed'
]);

/**
 * Axis 5: View retention states (UI_ARCHITECTURE.md §6:193).
 * @type {readonly string[]}
 */
export const VIEW_RETENTION_STATES = Object.freeze([
  'live-view',
  'replay-view',
  'disposed'
]);

/**
 * Permitted capsule-to-session roles (UI_ARCHITECTURE.md §6:185).
 * @type {readonly string[]}
 */
export const ALLOWED_SESSION_ROLES = Object.freeze([
  'controller',
  'reviewer'
]);

/**
 * Permitted projected dispatch outcomes per session (UI_ARCHITECTURE.md §6:162, §7:223).
 * @type {readonly string[]}
 */
export const ALLOWED_DISPATCH_OUTCOMES = Object.freeze([
  'idle',
  'admitting',
  'accepted',
  'executing',
  'completed',
  'verified',
  'refused',
  'uncertain',
  'cancelled'
]);

/**
 * Closed keys allowed on a session projection descriptor.
 * @type {readonly string[]}
 */
const ALLOWED_SESSION_KEYS = Object.freeze([
  'sessionId',
  'title',
  'disambiguator',
  'role',
  'hasControlLease',
  'activity',
  'attachment',
  'viewRetention',
  'attention',
  'dispatchOutcome',
  'accessibleText'
]);

/**
 * Closed keys allowed on a capsule session projection envelope.
 * @type {readonly string[]}
 */
const ALLOWED_PROJECTION_KEYS = Object.freeze([
  'capsuleId',
  'capsuleTitle',
  'backendLifecycle',
  'epoch',
  'generation',
  'sessions'
]);

/**
 * Creates a coded error for deterministic gate assertions.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function multislotError(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${message}`));
  err.code = code;
  return err;
}

/**
 * Checks whether a value is a plain object.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks whether a value is a non-negative exact safe integer.
 * @param {unknown} value
 * @returns {value is number}
 */
function isNonNegativeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Validates an immutable core-issued identity token (`capsuleId` or `sessionId`).
 * Rejects empty strings, whitespace, bare numeric list-length/index IDs (`"0"`), and
 * display-number credentials (`":99"` or `"DISPLAY=:0"`).
 * @param {unknown} value
 * @param {string} label
 * @returns {{ ok: true, id: string } | { ok: false, error: { code: string, message: string } }}
 */
export function validateImmutableEntityId(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_IDENTITY',
        message: `${label} must be a non-empty string`
      }
    };
  }
  if (value !== value.trim() || /\s/.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_IDENTITY',
        message: `${label} must not contain whitespace: "${value}"`
      }
    };
  }
  if (/^\d+$/.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_NUMERIC_INDEX_ID',
        message: `${label} must not use a numeric list-length or index ID: "${value}"`
      }
    };
  }
  if (value.startsWith(':') || /^display=/i.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_DISPLAY_CREDENTIAL_ID',
        message: `${label} must not use a display-number credential: "${value}"`
      }
    };
  }
  return { ok: true, id: value };
}

/**
 * Validates and deeply freezes a capsule-to-session projection batch (`UI_ARCHITECTURE.md` §6, §13).
 * Enforces the 5 orthogonal axes, closed schema keys, immutable IDs, and the single-active-controller
 * per capsule rule.
 * @param {unknown} raw
 * @returns {{ ok: true, value: Record<string, any> } | { ok: false, error: { code: string, message: string } }}
 */
export function validateCapsuleSessionProjection(raw) {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_PROJECTION',
        message: 'Capsule session projection must be a plain object'
      }
    };
  }

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_PROJECTION_KEYS.includes(key)) {
      return {
        ok: false,
        error: {
          code: 'ERR_UNKNOWN_PROJECTION_KEY',
          message: `Unknown projection key "${key}" rejected`
        }
      };
    }
  }

  const capIdCheck = validateImmutableEntityId(raw.capsuleId, 'capsuleId');
  if (!capIdCheck.ok) {
    return capIdCheck;
  }

  if (typeof raw.capsuleTitle !== 'string' || raw.capsuleTitle.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_CAPSULE_TITLE',
        message: 'capsuleTitle must be a non-empty string'
      }
    };
  }

  if (
    typeof raw.backendLifecycle !== 'string' ||
    !ALLOWED_BACKEND_LIFECYCLES.includes(raw.backendLifecycle)
  ) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_BACKEND_LIFECYCLE',
        message: `Unsupported backendLifecycle "${String(raw.backendLifecycle)}"`
      }
    };
  }

  if (!isNonNegativeSafeInteger(raw.epoch)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INEXACT_INTEGER',
        message: 'epoch must be a non-negative safe integer'
      }
    };
  }

  if (!isNonNegativeSafeInteger(raw.generation) || raw.generation < 1) {
    return {
      ok: false,
      error: {
        code: 'ERR_INEXACT_INTEGER',
        message: 'generation must be a positive safe integer'
      }
    };
  }

  if (!Array.isArray(raw.sessions)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_SESSIONS',
        message: 'sessions must be an array'
      }
    };
  }

  /** @type {Set<string>} */
  const seenIds = new Set();
  let controllerCount = 0;
  /** @type {Array<Record<string, any>>} */
  const normalizedSessions = [];

  for (let i = 0; i < raw.sessions.length; i += 1) {
    const item = raw.sessions[i];
    if (!isPlainObject(item)) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_SESSION_ENTRY',
          message: `Session at index ${i} must be a plain object`
        }
      };
    }

    for (const k of Object.keys(item)) {
      if (!ALLOWED_SESSION_KEYS.includes(k)) {
        return {
          ok: false,
          error: {
            code: 'ERR_UNKNOWN_SESSION_KEY',
            message: `Unknown session key "${k}" at index ${i}`
          }
        };
      }
    }

    const sidCheck = validateImmutableEntityId(item.sessionId, `sessions[${i}].sessionId`);
    if (!sidCheck.ok) {
      return sidCheck;
    }
    if (seenIds.has(sidCheck.id)) {
      return {
        ok: false,
        error: {
          code: 'ERR_DUPLICATE_SESSION_ID',
          message: `Duplicate sessionId "${sidCheck.id}" in capsule projection`
        }
      };
    }
    seenIds.add(sidCheck.id);

    if (typeof item.title !== 'string' || item.title.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_SESSION_TITLE',
          message: `Session "${sidCheck.id}" requires a non-empty title`
        }
      };
    }

    const disambiguator =
      typeof item.disambiguator === 'string' && item.disambiguator.trim().length > 0
        ? item.disambiguator.trim()
        : sidCheck.id;

    const role = item.role ?? 'reviewer';
    if (typeof role !== 'string' || !ALLOWED_SESSION_ROLES.includes(role)) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_SESSION_ROLE',
          message: `Session "${sidCheck.id}" has invalid role "${String(role)}"`
        }
      };
    }

    const hasControlLease = item.hasControlLease === true;
    if (role === 'reviewer' && hasControlLease) {
      return {
        ok: false,
        error: {
          code: 'ERR_REVIEWER_CONTROL_LEASE_FORBIDDEN',
          message: `Passive reviewer session "${sidCheck.id}" cannot hold a control lease`
        }
      };
    }
    if (role === 'controller' || hasControlLease) {
      controllerCount += 1;
      if (controllerCount > 1) {
        return {
          ok: false,
          error: {
            code: 'ERR_MULTIPLE_CONTROLLERS',
            message: 'Multiple session tabs cannot hold simultaneous active controller rights in one capsule'
          }
        };
      }
    }

    if (
      typeof item.activity !== 'string' ||
      !PROJECTED_SESSION_ACTIVITIES.includes(item.activity)
    ) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_SESSION_ACTIVITY',
          message: `Session "${sidCheck.id}" has unsupported activity "${String(item.activity)}"`
        }
      };
    }

    const attachment = item.attachment ?? 'detached';
    if (typeof attachment !== 'string' || !ATTACHMENT_STATES.includes(attachment)) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_ATTACHMENT_STATE',
          message: `Session "${sidCheck.id}" has unsupported attachment "${String(attachment)}"`
        }
      };
    }

    let viewRetention = item.viewRetention ?? 'live-view';
    if (typeof viewRetention !== 'string' || !VIEW_RETENTION_STATES.includes(viewRetention)) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_VIEW_RETENTION',
          message: `Session "${sidCheck.id}" has unsupported viewRetention "${String(viewRetention)}"`
        }
      };
    }
    if ((item.activity === 'exited' || item.activity === 'failed') && viewRetention === 'live-view') {
      viewRetention = 'replay-view';
    }

    const dispatchOutcome = item.dispatchOutcome ?? 'idle';
    if (
      typeof dispatchOutcome !== 'string' ||
      !ALLOWED_DISPATCH_OUTCOMES.includes(dispatchOutcome)
    ) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_DISPATCH_OUTCOME',
          message: `Session "${sidCheck.id}" has unsupported dispatchOutcome "${String(dispatchOutcome)}"`
        }
      };
    }

    normalizedSessions.push(
      Object.freeze({
        sessionId: sidCheck.id,
        title: item.title.trim(),
        disambiguator,
        role,
        hasControlLease,
        activity: item.activity,
        attachment,
        viewRetention,
        attention: item.attention === true,
        dispatchOutcome,
        accessibleText: typeof item.accessibleText === 'string' ? item.accessibleText : ''
      })
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      capsuleId: capIdCheck.id,
      capsuleTitle: raw.capsuleTitle.trim(),
      backendLifecycle: raw.backendLifecycle,
      epoch: raw.epoch,
      generation: raw.generation,
      sessions: Object.freeze(normalizedSessions)
    })
  };
}

/**
 * Evaluates the G5 activation veil truth table (`UI_ARCHITECTURE.md` §6:211; `SLOT §5`).
 * Veil shows ONLY when more than one live surface exists (`liveSurfaceCount > 1`),
 * this surface lacks keyboard ownership (`!hasKeyboardOwnership`), and it is not under
 * AI command (`!underAiCommand`).
 * @param {{
 *   liveSurfaceCount: number,
 *   hasKeyboardOwnership: boolean,
 *   underAiCommand: boolean
 * }} input
 * @returns {{ veilVisible: boolean, reason: string }}
 */
export function computeActivationVeilState(input) {
  const count = typeof input?.liveSurfaceCount === 'number' ? input.liveSurfaceCount : 0;
  const ownsKeys = input?.hasKeyboardOwnership === true;
  const aiCommand = input?.underAiCommand === true;

  if (aiCommand) {
    return Object.freeze({
      veilVisible: false,
      reason: 'agent-owned-target-never-veiled'
    });
  }
  if (count <= 1) {
    return Object.freeze({
      veilVisible: false,
      reason: 'single-or-zero-live-surface'
    });
  }
  if (ownsKeys) {
    return Object.freeze({
      veilVisible: false,
      reason: 'surface-owns-keyboard'
    });
  }
  return Object.freeze({
    veilVisible: true,
    reason: 'multi-surface-unfocused-human-target'
  });
}

/**
 * Preserves live-host focus when interacting with controls beside live surfaces (`UI_ARCHITECTURE.md` §6:212).
 * `pointerdown` and `mousedown` call `preventDefault()` while button `click` and keyboard events
 * submit the explicit intent without global close-button exceptions.
 * @param {{ type?: string, preventDefault?: () => void }} event
 * @param {{ packagedCloseButtonRegression?: boolean, isCloseButton?: boolean }} [options]
 * @returns {{ preservedFocus: boolean }}
 */
export function preserveLiveSurfaceFocusGuard(event, options = {}) {
  if (!event || typeof event !== 'object') {
    return Object.freeze({ preservedFocus: false });
  }
  if (options.isCloseButton === true && options.packagedCloseButtonRegression === true) {
    return Object.freeze({ preservedFocus: false });
  }
  if (
    (event.type === 'pointerdown' || event.type === 'mousedown') &&
    typeof event.preventDefault === 'function'
  ) {
    event.preventDefault();
    return Object.freeze({ preservedFocus: true });
  }
  return Object.freeze({ preservedFocus: false });
}

/**
 * Formats the computed accessible name for a session tab per `UI_ARCHITECTURE.md` §9:
 * includes session title, disambiguator, and current projected activity/attention state.
 * @param {{ sessionId: string, title: string, disambiguator?: string, activity: string, attention?: boolean }} session
 * @returns {string}
 */
export function formatSessionTabAccessibleName(session) {
  const disamb = session.disambiguator || session.sessionId;
  const attentionSuffix = session.attention ? ', needs attention' : '';
  return `${session.title} (${disamb}) — ${session.activity}${attentionSuffix}`;
}

/**
 * Builds the §9 AI-operability semantic control registration descriptors for `MultiSlot`.
 * Enforces the rule that hidden/folded controls never supply a fabricated box (`UI_ARCHITECTURE.md` §9:290,302).
 * @param {Record<string, any>} state - Snapshot from `controller.getState()`.
 * @param {{
 *   presentationInstance?: string,
 *   boxesByAnchor?: Record<string, { x: number, y: number, width: number, height: number } | null>,
 *   rejectFabricatedHiddenBoxes?: boolean
 * }} [options]
 * @returns {ReadonlyArray<Record<string, any>>}
 */
export function buildMultiSlotSemanticControls(state, options = {}) {
  const presentationInstance = options.presentationInstance || 'wall-main';
  const boxesByAnchor = options.boxesByAnchor || {};
  const rejectHiddenBox = options.rejectFabricatedHiddenBoxes !== false;
  const isExpanded = state.presentation === 'expanded';
  /** @type {Array<Record<string, any>>} */
  const controls = [];

  /**
   * Resolves a control box, enforcing `null` when hidden and optionally throwing on fabricated boxes.
   * @param {string} anchor
   * @param {boolean} visible
   */
  function resolveBox(anchor, visible) {
    const candidate = boxesByAnchor[anchor] ?? null;
    if (!visible) {
      if (rejectHiddenBox && candidate !== null && candidate !== undefined) {
        throw multislotError(
          'ERR_FABRICATED_HIDDEN_BOX',
          `Control "${anchor}" is hidden while folded/unselected and must not supply a fabricated box`
        );
      }
      return null;
    }
    if (!candidate) {
      return null;
    }
    return Object.freeze({
      x: Math.round(candidate.x),
      y: Math.round(candidate.y),
      width: Math.round(candidate.width),
      height: Math.round(candidate.height)
    });
  }

  const foldAnchor = `capsule/${state.capsuleId}/session-slot/fold`;
  controls.push(
    Object.freeze({
      semanticAnchor: foldAnchor,
      entityId: state.capsuleId,
      presentationInstance,
      controlSlot: 'fold',
      role: 'button',
      accessibleName: `${isExpanded ? 'Fold' : 'Unfold'} ${state.capsuleTitle}`,
      state: Object.freeze({
        expanded: isExpanded,
        disabled: false
      }),
      visible: true,
      materialized: true,
      inDom: true,
      box: resolveBox(foldAnchor, true),
      epoch: state.epoch,
      generation: state.generation
    })
  );

  const slotAnchor = `capsule/${state.capsuleId}/slot`;
  controls.push(
    Object.freeze({
      semanticAnchor: slotAnchor,
      entityId: state.capsuleId,
      presentationInstance,
      controlSlot: 'slot',
      role: 'region',
      accessibleName: `AI sessions for ${state.capsuleTitle}`,
      state: Object.freeze({
        presentation: state.presentation,
        viewedSessionId: state.viewedSessionId,
        activeControllerSessionId: state.activeControllerSessionId
      }),
      visible: isExpanded,
      materialized: true,
      inDom: true,
      box: resolveBox(slotAnchor, isExpanded),
      epoch: state.epoch,
      generation: state.generation
    })
  );

  for (const session of state.sessions) {
    if (session.viewRetention === 'disposed') {
      continue;
    }
    const sid = session.sessionId;
    const isSelected = sid === state.viewedSessionId;
    const tabVisible = isExpanded;
    const tabAnchor = `capsule/${state.capsuleId}/session/${sid}/tab`;

    controls.push(
      Object.freeze({
        semanticAnchor: tabAnchor,
        entityId: sid,
        presentationInstance,
        controlSlot: 'tab',
        role: 'tab',
        accessibleName: formatSessionTabAccessibleName(session),
        state: Object.freeze({
          selected: isSelected,
          attention: session.attention,
          activity: session.activity,
          attachment: session.attachment,
          viewRetention: session.viewRetention
        }),
        visible: tabVisible,
        materialized: true,
        inDom: true,
        box: resolveBox(tabAnchor, tabVisible),
        epoch: state.epoch,
        generation: state.generation
      })
    );

    const sessionControlsVisible = isExpanded && isSelected;
    const actionDefs = [
      {
        verb: 'attach',
        label: `Attach session ${session.title} (${sid})`,
        disabled: session.attachment === 'live' || session.attachment === 'attaching'
      },
      {
        verb: 'stop',
        label: `Stop session ${session.title} (${sid})`,
        disabled: session.activity === 'exited' || session.activity === 'failed'
      },
      {
        verb: 'replay',
        label: `Replay session ${session.title} (${sid})`,
        disabled: session.viewRetention === 'disposed'
      },
      {
        verb: 'target',
        label: `Select target session ${session.title} (${sid})`,
        disabled: !(session.activity === 'ready' || session.activity === 'waiting-input')
      }
    ];

    for (const act of actionDefs) {
      const actAnchor = `session/${sid}/${act.verb}`;
      controls.push(
        Object.freeze({
          semanticAnchor: actAnchor,
          entityId: sid,
          presentationInstance,
          controlSlot: act.verb,
          role: 'button',
          accessibleName: act.label,
          state: Object.freeze({
            disabled: act.disabled,
            activity: session.activity,
            attachment: session.attachment
          }),
          visible: sessionControlsVisible,
          materialized: true,
          inDom: true,
          box: resolveBox(actAnchor, sessionControlsVisible),
          epoch: state.epoch,
          generation: state.generation
        })
      );
    }

    const outputAnchor = `output/${sid}/text`;
    controls.push(
      Object.freeze({
        semanticAnchor: outputAnchor,
        entityId: sid,
        presentationInstance,
        controlSlot: 'output-text',
        role: 'region',
        accessibleName: `Accessible output for ${session.title} (${sid})`,
        state: Object.freeze({
          viewRetention: session.viewRetention,
          PoliteAnnouncement: true
        }),
        visible: sessionControlsVisible,
        materialized: true,
        inDom: true,
        box: resolveBox(outputAnchor, sessionControlsVisible),
        epoch: state.epoch,
        generation: state.generation
      })
    );
  }

  return Object.freeze(controls);
}

/**
 * Creates a deterministic, pure-JS MultiSlot controller enforcing `UI_ARCHITECTURE.md` §§ 3, 6, 7, 9, 10, 12, 13:
 * - Mount, tab selection, fold/unfold, and Dockview remount NEVER spawn or kill a capsule/session.
 * - Attach installs handlers first, requests snapshot/cursor, buffers bounded later chunks, applies snapshot
 *   and contiguous tail to a per-session non-reactive writer, and acknowledges only the contiguous prefix.
 * - Gap or stale epoch refuses to skip VT bytes and restarts reconciliation.
 * - Quiet output never implies ready/done.
 * - G5 fold moves focus to the fold invoker before hiding, keeps DOM mounted (`mounted hidden classes`), disables scheduling,
 *   and cancels pending focus retries (`0 ms`, `120 ms`, `400 ms`).
 *
 * @param {{
 *   capsuleId: string,
 *   capsuleTitle: string,
 *   epoch?: number,
 *   generation?: number,
 *   consoleMode?: 'player' | 'developer-pty',
 *   maxBufferedChunks?: number,
 *   onIntent?: (intent: Record<string, any>) => void
 * }} config
 */
export function createMultiSlotController(config) {
  const capIdCheck = validateImmutableEntityId(config?.capsuleId, 'capsuleId');
  if (!capIdCheck.ok) {
    throw multislotError(capIdCheck.error.code, capIdCheck.error.message);
  }

  let capsuleId = capIdCheck.id;
  let capsuleTitle =
    typeof config?.capsuleTitle === 'string' && config.capsuleTitle.trim().length > 0
      ? config.capsuleTitle.trim()
      : capsuleId;
  let backendLifecycle = 'active';
  let currentEpoch = isNonNegativeSafeInteger(config?.epoch) ? config.epoch : 1;
  let currentGeneration =
    isNonNegativeSafeInteger(config?.generation) && config.generation >= 1 ? config.generation : 1;
  const consoleMode = config?.consoleMode === 'developer-pty' ? 'developer-pty' : 'player';
  const maxBufferedChunks =
    isNonNegativeSafeInteger(config?.maxBufferedChunks) && config.maxBufferedChunks > 0
      ? config.maxBufferedChunks
      : 64;
  const onIntent = typeof config?.onIntent === 'function' ? config.onIntent : null;

  let mounted = false;
  /** @type {'expanded' | 'folded'} */
  let presentation = 'expanded';
  let keepBodyMounted = true;
  let schedulingEnabled = true;
  let focusedAnchor = `capsule/${capsuleId}/slot`;
  let focusMovedBeforeHide = false;
  let spawnCount = 0;
  let killCount = 0;

  /** @type {string | null} */
  let viewedSessionId = null;
  /** @type {string | null} */
  let activeControllerSessionId = null;
  /** @type {string[]} */
  let recipientSessionIds = [];

  /** @type {Map<string, Record<string, any>>} */
  const sessionsById = new Map();
  /** @type {Map<string, (chunk: string, done: () => void) => void>} */
  const writersBySessionId = new Map();

  let focusIntentCounter = 0;
  /** @type {Record<string, any> | null} */
  let activeFocusIntent = null;

  /**
   * Computes whether terminal input is permitted for a session record.
   * Input is permitted ONLY in `developer-pty` mode when `attachment === 'live'`,
   * `viewRetention === 'live-view'`, and `hasControlLease === true` (`UI_ARCHITECTURE.md` §6:191, §7:260).
   * @param {Record<string, any>} session
   * @returns {boolean}
   */
  function isInputPermitted(session) {
    return (
      consoleMode === 'developer-pty' &&
      session.attachment === 'live' &&
      session.viewRetention === 'live-view' &&
      session.hasControlLease === true &&
      backendLifecycle === 'active'
    );
  }

  /**
   * Builds an immutable snapshot of a session record.
   * @param {Record<string, any>} rec
   */
  function snapshotSession(rec) {
    return Object.freeze({
      sessionId: rec.sessionId,
      title: rec.title,
      disambiguator: rec.disambiguator,
      role: rec.role,
      hasControlLease: rec.hasControlLease,
      selection: rec.sessionId === viewedSessionId ? 'selected' : 'unselected',
      activity: rec.activity,
      attachment: rec.attachment,
      viewRetention: rec.viewRetention,
      attention: rec.attention,
      dispatchOutcome: rec.dispatchOutcome,
      accessibleText: rec.accessibleText,
      handlersInstalled: rec.handlersInstalled,
      snapshotRequested: rec.snapshotRequested,
      reconciling: rec.reconciling,
      inputEnabled: isInputPermitted(rec),
      acknowledgedOffset: rec.acknowledgedOffset,
      capabilityToken: rec.capabilityToken
    });
  }

  /**
   * Returns a deeply frozen snapshot of the current MultiSlot state.
   */
  function getState() {
    const list = Array.from(sessionsById.values()).map(snapshotSession);
    return Object.freeze({
      capsuleId,
      capsuleTitle,
      backendLifecycle,
      epoch: currentEpoch,
      generation: currentGeneration,
      consoleMode,
      mounted,
      presentation,
      keepBodyMounted,
      schedulingEnabled,
      focusedAnchor,
      focusMovedBeforeHide,
      viewedSessionId,
      activeControllerSessionId,
      recipientSessionIds: Object.freeze(recipientSessionIds.slice()),
      spawnCount,
      killCount,
      activeFocusIntent: activeFocusIntent ? Object.freeze({ ...activeFocusIntent }) : null,
      sessions: Object.freeze(list)
    });
  }

  /**
   * Mounts the MultiSlot presentation component without spawning any backend capsule or session (`§3, §6:170`).
   */
  function mountSlot() {
    mounted = true;
    keepBodyMounted = true;
    schedulingEnabled = presentation === 'expanded';
    return getState();
  }

  /**
   * Applies an admitted core session projection to this MultiSlot (`§6, §13`).
   * @param {unknown} rawProjection
   */
  function applySessionProjection(rawProjection) {
    const validated = validateCapsuleSessionProjection(rawProjection);
    if (!validated.ok) {
      return Object.freeze({
        ok: false,
        error: validated.error,
        state: getState()
      });
    }

    const proj = validated.value;
    if (proj.capsuleId !== capsuleId) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_CAPSULE_ID_MISMATCH',
          message: `Projection capsuleId "${proj.capsuleId}" does not match MultiSlot capsuleId "${capsuleId}"`
        },
        state: getState()
      });
    }
    if (proj.epoch < currentEpoch) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_STALE_EPOCH',
          message: `Projection epoch ${proj.epoch} is older than active epoch ${currentEpoch}`
        },
        state: getState()
      });
    }

    capsuleTitle = proj.capsuleTitle;
    backendLifecycle = proj.backendLifecycle;
    currentEpoch = proj.epoch;
    currentGeneration = proj.generation;
    activeControllerSessionId = null;

    /** @type {Set<string>} */
    const incomingIds = new Set();
    for (const s of proj.sessions) {
      incomingIds.add(s.sessionId);
      const existing = sessionsById.get(s.sessionId);
      const rec = {
        sessionId: s.sessionId,
        title: s.title,
        disambiguator: s.disambiguator,
        role: s.role,
        hasControlLease: s.hasControlLease,
        activity: s.activity,
        attachment: s.attachment,
        viewRetention: s.viewRetention,
        attention: s.attention,
        dispatchOutcome: s.dispatchOutcome,
        accessibleText: s.accessibleText || (existing ? existing.accessibleText : ''),
        handlersInstalled: existing ? existing.handlersInstalled : s.attachment === 'live',
        snapshotRequested: existing ? existing.snapshotRequested : s.attachment === 'live',
        reconciling: false,
        acknowledgedOffset: existing ? existing.acknowledgedOffset : 0,
        capabilityToken: existing ? existing.capabilityToken : null,
        pendingChunks: existing ? existing.pendingChunks : []
      };
      if (rec.role === 'controller' || rec.hasControlLease) {
        activeControllerSessionId = rec.sessionId;
      }
      sessionsById.set(rec.sessionId, rec);
    }

    for (const oldId of Array.from(sessionsById.keys())) {
      if (!incomingIds.has(oldId)) {
        sessionsById.delete(oldId);
      }
    }

    if (!viewedSessionId || !sessionsById.has(viewedSessionId)) {
      const firstActive = proj.sessions.find((/** @type {{viewRetention:string}} */ s) => s.viewRetention !== 'disposed');
      viewedSessionId = firstActive ? firstActive.sessionId : null;
    }

    recipientSessionIds = recipientSessionIds.filter((id) => sessionsById.has(id));

    return Object.freeze({
      ok: true,
      state: getState()
    });
  }

  /**
   * Selects a session tab for viewing (`UI_ARCHITECTURE.md` §6:190, §13).
   * Changes `viewedSessionId` ONLY; never mutates `recipientSessionIds`, `activeControllerSessionId`,
   * or process lifecycle (`spawnCount === 0`, `killCount === 0`).
   * @param {string} sessionId
   * @param {Record<string, unknown>} [forbiddenOptions]
   */
  function selectSessionTab(sessionId, forbiddenOptions) {
    if (
      forbiddenOptions &&
      typeof forbiddenOptions === 'object' &&
      ('spawnIfMissing' in forbiddenOptions ||
        'killPrevious' in forbiddenOptions ||
        'spawn' in forbiddenOptions ||
        'kill' in forbiddenOptions)
    ) {
      throw multislotError(
        'ERR_TAB_CANNOT_SPAWN_OR_KILL',
        'Tab selection is a view-only operation and must never spawn or kill a session'
      );
    }

    const rec = sessionsById.get(sessionId);
    if (!rec || rec.viewRetention === 'disposed') {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_UNKNOWN_SESSION_TAB',
          message: `Session tab "${String(sessionId)}" does not exist or is disposed`
        },
        state: getState()
      });
    }

    viewedSessionId = sessionId;
    rec.attention = false;
    return Object.freeze({
      ok: true,
      state: getState()
    });
  }

  /**
   * Folds the MultiSlot AI area (`UI_ARCHITECTURE.md` §6:189, 197, 207, §13).
   * Moves focus to the valid fold invoker (`capsule/{id}/session-slot/fold`) BEFORE hiding, keeps the DOM host
   * mounted via `mounted hidden classes`, disables display scheduling, cancels pending focus retries, and NEVER kills sessions.
   * @param {Record<string, unknown>} [forbiddenOptions]
   */
  function foldSlot(forbiddenOptions) {
    if (
      forbiddenOptions &&
      typeof forbiddenOptions === 'object' &&
      ('killSessions' in forbiddenOptions ||
        'stopSessions' in forbiddenOptions ||
        'destroyCapsule' in forbiddenOptions ||
        'unsubscribeCapture' in forbiddenOptions)
    ) {
      throw multislotError(
        'ERR_FOLD_CANNOT_SPAWN_OR_KILL',
        'Folding hides presentation only and must never kill sessions or stop capture'
      );
    }

    // Move focus to the fold invoker BEFORE hiding the body
    focusedAnchor = `capsule/${capsuleId}/session-slot/fold`;
    focusMovedBeforeHide = true;

    // Cancel any pending focus retry timers so no late timer steals focus into hidden content
    if (activeFocusIntent) {
      activeFocusIntent = {
        ...activeFocusIntent,
        cancelled: true,
        cancelReason: 'slot-folded'
      };
    }

    presentation = 'folded';
    keepBodyMounted = true;
    schedulingEnabled = false;

    if (onIntent) {
      onIntent(
        Object.freeze({
          type: 'capsule_visibility_intent',
          capsuleId,
          desiredPresentation: 'folded',
          epoch: currentEpoch
        })
      );
    }

    return Object.freeze({
      ok: true,
      state: getState()
    });
  }

  /**
   * Unfolds / restores the MultiSlot AI area (`UI_ARCHITECTURE.md` §6:189, 208).
   * Re-enables scheduling while waiting for positive geometry to schedule `rAF` + `120 ms` terminal refit.
   */
  function unfoldSlot() {
    presentation = 'expanded';
    keepBodyMounted = true;
    schedulingEnabled = true;

    if (onIntent) {
      onIntent(
        Object.freeze({
          type: 'capsule_visibility_intent',
          capsuleId,
          desiredPresentation: 'expanded',
          epoch: currentEpoch
        })
      );
    }

    return Object.freeze({
      ok: true,
      state: getState()
    });
  }

  /**
   * Verifies positive container geometry after restore/unfold and schedules `rAF` (`0 ms`) plus
   * `+120 ms` refit retries (`UI_ARCHITECTURE.md` §6:208; `FOLD §2.7`).
   * Rejects empty-box frames (`width <= 0` or `height <= 0`).
   * @param {{ width: number, height: number } | null | undefined} box
   */
  function notifyRestoreGeometry(box) {
    if (
      !box ||
      typeof box.width !== 'number' ||
      typeof box.height !== 'number' ||
      !Number.isFinite(box.width) ||
      !Number.isFinite(box.height) ||
      Math.round(box.width) <= 0 ||
      Math.round(box.height) <= 0
    ) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_EMPTY_BOX_GEOMETRY',
          message: 'First empty-box frame must never supply fake geometry for terminal refit'
        }
      });
    }

    return Object.freeze({
      ok: true,
      geometry: Object.freeze({
        width: Math.round(box.width),
        height: Math.round(box.height)
      }),
      scheduledRefitDelaysMs: Object.freeze([0, 120])
    });
  }

  /**
   * Handles Dockview panel move / host remount without destroying or spawning sessions (`§6:175, 197`).
   */
  function remountPresentation() {
    mounted = true;
    keepBodyMounted = true;
    return Object.freeze({
      ok: true,
      state: getState()
    });
  }

  /**
   * Rejects any prior-art `onTermReady(send)` or `sendStdin` injection callback hook (`§6:199`).
   * @param {string} sessionId
   * @param {Record<string, unknown>} bridge
   */
  function registerTerminalBridge(sessionId, bridge) {
    if (
      bridge &&
      typeof bridge === 'object' &&
      ('onTermReady' in bridge ||
        'sendStdin' in bridge ||
        'SendStdin' in bridge ||
        'appendCrBroadcast' in bridge)
    ) {
      throw multislotError(
        'ERR_FORBIDDEN_INJECTION_HOOK',
        'MultiSlot forbids onTermReady(send), raw SendStdin, and append-CR broadcast hooks'
      );
    }
    return Object.freeze({ ok: true, sessionId });
  }

  /**
   * Registers a per-session non-reactive writer callback (`UI_ARCHITECTURE.md` §6:195, §10:311).
   * @param {string} sessionId
   * @param {(chunk: string, done: () => void) => void} writerFn
   */
  function registerTerminalWriter(sessionId, writerFn) {
    if (typeof writerFn !== 'function') {
      throw multislotError('ERR_INVALID_WRITER', 'Terminal writer must be a function');
    }
    writersBySessionId.set(sessionId, writerFn);
  }

  /**
   * Begins session attachment (`UI_ARCHITECTURE.md` §6:191, 195):
   * 1. Installs stream handlers first (`handlersInstalled = true`)
   * 2. Requests authorized snapshot/cursor (`snapshotRequested = true`)
   * 3. Keeps input disabled while in `attaching` / `restoring`
   * @param {string} sessionId
   * @param {{ epoch: number, capabilityToken: string }} params
   */
  function beginAttach(sessionId, params) {
    const rec = sessionsById.get(sessionId);
    if (!rec) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_UNKNOWN_SESSION', message: `Unknown session "${sessionId}"` }
      });
    }
    if (!params || params.epoch !== currentEpoch || typeof params.capabilityToken !== 'string') {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_STALE_ATTACH_CAPABILITY',
          message: 'Attach requires fresh epoch-matching capability token'
        }
      });
    }

    rec.handlersInstalled = true;
    rec.snapshotRequested = true;
    rec.attachment = 'attaching';
    rec.capabilityToken = params.capabilityToken;
    rec.pendingChunks = [];
    rec.reconciling = false;

    return Object.freeze({
      ok: true,
      session: snapshotSession(rec)
    });
  }

  /**
   * Buffers bounded live chunks arriving after handler installation while snapshot restore is in flight.
   * @param {string} sessionId
   * @param {{ epoch: number, startOffset: number, endOffset: number, data: string }} chunk
   */
  function bufferIncomingChunk(sessionId, chunk) {
    const rec = sessionsById.get(sessionId);
    if (!rec) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_UNKNOWN_SESSION', message: `Unknown session "${sessionId}"` }
      });
    }
    if (chunk.epoch !== currentEpoch) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_STALE_EPOCH', message: 'Chunk epoch mismatch' }
      });
    }
    if (rec.pendingChunks.length >= maxBufferedChunks) {
      rec.attachment = 'attaching';
      rec.reconciling = true;
      rec.pendingChunks = [];
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_BUFFER_WATERMARK_EXCEEDED',
          message: 'Bounded attach buffer overflowed; restarting reconciliation'
        }
      });
    }
    rec. attachment = 'restoring';
    rec.pendingChunks.push({
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      data: chunk.data
    });
    return Object.freeze({
      ok: true,
      session: snapshotSession(rec)
    });
  }

  /**
   * Applies the authorized snapshot through `cursorOffset` plus any contiguous buffered tail,
   * writing directly to the per-session non-reactive writer and acknowledging only the contiguous
   * parser-consumed prefix (`UI_ARCHITECTURE.md` §6:195).
   * @param {string} sessionId
   * @param {{
   *   epoch: number,
   *   cursorOffset: number,
   *   snapshotData: string,
   *   onAck?: (offset: number) => void
   * }} restorePayload
   */
  function applyRestoreSnapshot(sessionId, restorePayload) {
    const rec = sessionsById.get(sessionId);
    if (!rec || !rec.handlersInstalled) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_HANDLERS_NOT_INSTALLED',
          message: 'Attach must install handlers before applying restore snapshot'
        }
      });
    }
    if (restorePayload.epoch !== currentEpoch) {
      rec.attachment = 'attaching';
      rec.reconciling = true;
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_STALE_EPOCH',
          message: 'Restore snapshot epoch does not match active epoch'
        }
      });
    }

    const writer = writersBySessionId.get(sessionId);
    const ackFn = typeof restorePayload.onAck === 'function' ? restorePayload.onAck : null;

    // Sort buffered chunks by startOffset and verify contiguous cut from cursorOffset
    const sorted = rec.pendingChunks
      .slice()
      .sort((/** @type {{startOffset:number}} */ a, /** @type {{startOffset:number}} */ b) => a.startOffset - b.startOffset);

    let expected = restorePayload.cursorOffset;
    /** @type {Array<{ startOffset: number, endOffset: number, data: string }>} */
    const tailToApply = [];

    for (const item of sorted) {
      if (item.endOffset <= expected) {
        continue;
      }
      if (item.startOffset !== expected) {
        rec.attachment = 'attaching';
        rec.reconciling = true;
        rec.pendingChunks = [];
        return Object.freeze({
          ok: false,
          error: {
            code: 'ERR_STREAM_GAP_OR_STALE_EPOCH',
            message: `Gap between snapshot cursor (${expected}) and buffered chunk (${item.startOffset})`
          },
          session: snapshotSession(rec)
        });
      }
      tailToApply.push(item);
      expected = item.endOffset;
    }

    if (writer) {
      writer(restorePayload.snapshotData, () => {
        rec.acknowledgedOffset = restorePayload.cursorOffset;
        if (ackFn) {
          ackFn(rec.acknowledgedOffset);
        }
      });
    } else {
      rec.acknowledgedOffset = restorePayload.cursorOffset;
      if (ackFn) {
        ackFn(rec.acknowledgedOffset);
      }
    }

    for (const chunk of tailToApply) {
      if (writer) {
        writer(chunk.data, () => {
          rec.acknowledgedOffset = chunk.endOffset;
          if (ackFn) {
            ackFn(rec.acknowledgedOffset);
          }
        });
      } else {
        rec.acknowledgedOffset = chunk.endOffset;
        if (ackFn) {
          ackFn(rec.acknowledgedOffset);
        }
      }
    }

    rec.pendingChunks = [];
    rec.reconciling = false;
    rec.attachment = 'live';
    rec.accessibleText = `${restorePayload.snapshotData}${tailToApply.map((t) => t.data).join('')}`;

    return Object.freeze({
      ok: true,
      session: snapshotSession(rec)
    });
  }

  /**
   * Writes a live contiguous stream chunk through the non-reactive writer (`UI_ARCHITECTURE.md` §6:195).
   * If a sequence gap or stale epoch is detected, refuses to skip VT bytes and restarts reconciliation.
   * @param {string} sessionId
   * @param {{
   *   epoch: number,
   *   startOffset: number,
   *   endOffset: number,
   *   data: string,
   *   onAck?: (offset: number) => void
   * }} chunk
   */
  function writeLiveChunk(sessionId, chunk) {
    const rec = sessionsById.get(sessionId);
    if (!rec) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_UNKNOWN_SESSION', message: `Unknown session "${sessionId}"` }
      });
    }

    if (
      chunk.epoch !== currentEpoch ||
      rec.attachment !== 'live' ||
      chunk.startOffset !== rec.acknowledgedOffset
    ) {
      rec.attachment = 'attaching';
      rec.reconciling = true;
      rec.pendingChunks = [];
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_STREAM_GAP_OR_STALE_EPOCH',
          message: `Refusing to skip VT bytes: expected offset ${rec.acknowledgedOffset}@epoch ${currentEpoch}, got ${chunk.startOffset}@epoch ${chunk.epoch}`
        },
        session: snapshotSession(rec)
      });
    }

    const writer = writersBySessionId.get(sessionId);
    const ackFn = typeof chunk.onAck === 'function' ? chunk.onAck : null;
    if (writer) {
      writer(chunk.data, () => {
        rec.acknowledgedOffset = chunk.endOffset;
        if (ackFn) {
          ackFn(rec.acknowledgedOffset);
        }
      });
    } else {
      rec.acknowledgedOffset = chunk.endOffset;
      if (ackFn) {
        ackFn(rec.acknowledgedOffset);
      }
    }
    rec.accessibleText += chunk.data;

    return Object.freeze({
      ok: true,
      session: snapshotSession(rec)
    });
  }

  /**
   * Negative contrast guard (`UI_ARCHITECTURE.md` §6:192, §12:367):
   * Quiet output NEVER implies `ready` or `done`. Only authenticated core/adapter events change activity.
   * @param {string} sessionId
   * @param {number} _quietDurationMs
   */
  function recordOutputSilence(sessionId, _quietDurationMs) {
    const rec = sessionsById.get(sessionId);
    return Object.freeze({
      ok: false,
      error: {
        code: 'ERR_QUIET_OUTPUT_NOT_READY',
        message: 'Quiet terminal output never implies session ready or completion'
      },
      session: rec ? snapshotSession(rec) : null
    });
  }

  /**
   * Detaches all sessions on renderer reload without killing backend processes (`§6:195`).
   */
  function detachOnReload() {
    for (const rec of sessionsById.values()) {
      rec.attachment = 'detached';
      rec.handlersInstalled = false;
      rec.snapshotRequested = false;
      rec.pendingChunks = [];
    }
    return getState();
  }

  /**
   * Handles transport/broker loss (`§6:195`): invalidates capabilities and marks sessions
   * `disconnected` + `unknown` without manufacturing resurrected sessions.
   */
  function handleBrokerLoss() {
    for (const rec of sessionsById.values()) {
      rec.attachment = 'disconnected';
      rec.activity = 'unknown';
      rec.capabilityToken = null;
      rec.pendingChunks = [];
    }
    return getState();
  }

  /**
   * Updates the projected backend capsule lifecycle (`active`, `standby`, `ceded`, `destroyed`, `lost`).
   * @param {string} nextLifecycle
   */
  function recordBackendLifecycle(nextLifecycle) {
    if (!ALLOWED_BACKEND_LIFECYCLES.includes(nextLifecycle)) {
      throw multislotError(
        'ERR_INVALID_BACKEND_LIFECYCLE',
        `Unsupported backendLifecycle "${String(nextLifecycle)}"`
      );
    }
    backendLifecycle = nextLifecycle;
    if (nextLifecycle === 'destroyed' || nextLifecycle === 'lost') {
      for (const rec of sessionsById.values()) {
        if (rec.viewRetention === 'live-view') {
          rec.viewRetention = 'replay-view';
        }
        rec.attachment = 'disconnected';
      }
    }
    return getState();
  }

  /**
   * Negative contrast (`ARCH:226`, `UI_ARCHITECTURE.md` §6:180):
   * Prohibits reviving a destroyed or lost capsule/session under its old identifier.
   * @param {string} attemptedId
   */
  function reviveUnderSameIdentity(attemptedId) {
    if (attemptedId === capsuleId || sessionsById.has(attemptedId)) {
      throw multislotError(
        'ERR_REVIVE_OLD_IDENTITY_FORBIDDEN',
        `ARCH:226 prohibits reviving destroyed/lost identity "${attemptedId}"; replacement requires a new core-issued identity`
      );
    }
  }

  /**
   * Explicitly disposes a session replay/live view without killing any independently owned backend process (`§6:193`).
   * @param {string} sessionId
   */
  function disposeSessionView(sessionId) {
    const rec = sessionsById.get(sessionId);
    if (!rec) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_UNKNOWN_SESSION', message: `Unknown session "${sessionId}"` }
      });
    }
    rec.viewRetention = 'disposed';
    rec.attachment = 'detached';
    rec.capabilityToken = null;
    writersBySessionId.delete(sessionId);
    if (viewedSessionId === sessionId) {
      const next = Array.from(sessionsById.values()).find((s) => s.viewRetention !== 'disposed');
      viewedSessionId = next ? next.sessionId : null;
    }
    return Object.freeze({
      ok: true,
      state: getState()
    });
  }

  /**
   * Emits an explicit structured stop intent to core (`session/{sid}/stop`) without killing directly in UI.
   * @param {string} sessionId
   */
  function requestStopSession(sessionId) {
    const rec = sessionsById.get(sessionId);
    if (!rec) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_UNKNOWN_SESSION', message: `Unknown session "${sessionId}"` }
      });
    }
    const intent = Object.freeze({
      type: 'session_stop_intent',
      capsuleId,
      sessionId,
      epoch: currentEpoch
    });
    if (onIntent) {
      onIntent(intent);
    }
    return Object.freeze({ ok: true, intent });
  }

  /**
   * Toggles explicit orchestrator target inclusion via `session/{sid}/target` (separate from tab selection, `§6:190, §7:250`).
   * @param {string} sessionId
   */
  function toggleRecipientTarget(sessionId) {
    const rec = sessionsById.get(sessionId);
    if (!rec) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_UNKNOWN_SESSION', message: `Unknown session "${sessionId}"` }
      });
    }
    if (rec.activity !== 'ready' && rec.activity !== 'waiting-input') {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_TARGET_INELIGIBLE',
          message: `Session "${sessionId}" with activity "${rec.activity}" is not eligible for target selection`
        }
      });
    }
    const idx = recipientSessionIds.indexOf(sessionId);
    if (idx >= 0) {
      recipientSessionIds.splice(idx, 1);
    } else {
      recipientSessionIds.push(sessionId);
    }
    return Object.freeze({
      ok: true,
      recipientSessionIds: Object.freeze(recipientSessionIds.slice())
    });
  }

  /**
   * Begins the G5 three-layer focus protocol (`0 ms`, `120 ms`, `400 ms`) after admitted human ownership (`§6:209-210`).
   * Electron performs DOM focus only and submits native surface focus through core/adapter; never calls an X11 injector.
   * @param {{
   *   sessionId: string,
   *   admittedOwner: 'human' | 'agent' | 'none',
   *   hasControlLease: boolean
   * }} params
   */
  function beginTakeControlFocus(params) {
    if (
      !params ||
      params.admittedOwner !== 'human' ||
      params.hasControlLease !== true ||
      presentation !== 'expanded' ||
      backendLifecycle !== 'active'
    ) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_CONTROL_FOCUS_NOT_ADMITTED',
          message: 'Three-layer focus requires expanded active slot and admitted human control lease'
        }
      });
    }

    focusIntentCounter += 1;
    const intentId = `focus-${capsuleId}-${currentGeneration}-${focusIntentCounter}`;
    activeFocusIntent = {
      intentId,
      slotId: capsuleId,
      sessionId: params.sessionId,
      generation: currentGeneration,
      owner: 'human',
      retryScheduleMs: Object.freeze([0, 120, 400]),
      attemptedDelaysMs: [],
      cancelled: false,
      cancelReason: null,
      completed: false
    };

    return Object.freeze({
      ok: true,
      intentId,
      retryScheduleMs: activeFocusIntent.retryScheduleMs,
      layers: Object.freeze([
        'slot-census-witness',
        'dom-host-focus',
        'core-native-focus-intent'
      ])
    });
  }

  /**
   * Executes and revalidates a single bounded focus retry step (`0 ms`, `120 ms`, or `400 ms`) (`§6:210`).
   * Cancels immediately if folded, destroyed, generation/slot/owner changed, or superseded by a newer focus intent.
   * @param {{
   *   intentId: string,
   *   delayMs: 0 | 120 | 400,
   *   slotId: string,
   *   generation: number,
   *   visible: boolean,
   *   owner: string,
   *   domFocusSucceeded: boolean
   * }} step
   */
  function runFocusRetryStep(step) {
    if (
      !activeFocusIntent ||
      activeFocusIntent.cancelled ||
      activeFocusIntent.intentId !== step.intentId ||
      presentation !== 'expanded' ||
      backendLifecycle !== 'active' ||
      step.slotId !== capsuleId ||
      step.generation !== currentGeneration ||
      step.visible !== true ||
      step.owner !== 'human'
    ) {
      if (activeFocusIntent && activeFocusIntent.intentId === step.intentId) {
        activeFocusIntent.cancelled = true;
        activeFocusIntent.cancelReason =
          activeFocusIntent.cancelReason || 'revalidation-failed';
      }
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_FOCUS_RETRY_CANCELLED',
          message: 'Focus retry cancelled on fold, destroy, ownership change, or stale intent'
        }
      });
    }

    activeFocusIntent.attemptedDelaysMs.push(step.delayMs);
    if (step.domFocusSucceeded) {
      activeFocusIntent.completed = true;
      focusedAnchor = `capsule/${capsuleId}/session/${activeFocusIntent.sessionId}/tab`;
      return Object.freeze({
        ok: true,
        completed: true,
        attemptedDelaysMs: Object.freeze(activeFocusIntent.attemptedDelaysMs.slice())
      });
    }

    if (step.delayMs >= 400) {
      activeFocusIntent.cancelled = true;
      activeFocusIntent.cancelReason = 'retries-exhausted';
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_FOCUS_RETRIES_EXHAUSTED',
          message: 'Bounded focus retry schedule (0ms, 120ms, 400ms) exhausted without focus confirmation'
        }
      });
    }

    return Object.freeze({
      ok: true,
      completed: false,
      attemptedDelaysMs: Object.freeze(activeFocusIntent.attemptedDelaysMs.slice())
    });
  }

  /**
   * Returns a single session snapshot by ID or `null`.
   * @param {string} sessionId
   */
  function getSession(sessionId) {
    const rec = sessionsById.get(sessionId);
    return rec ? snapshotSession(rec) : null;
  }

  return Object.freeze({
    mountSlot,
    applySessionProjection,
    selectSessionTab,
    foldSlot,
    unfoldSlot,
    notifyRestoreGeometry,
    remountPresentation,
    registerTerminalBridge,
    registerTerminalWriter,
    beginAttach,
    bufferIncomingChunk,
    applyRestoreSnapshot,
    writeLiveChunk,
    recordOutputSilence,
    detachOnReload,
    handleBrokerLoss,
    recordBackendLifecycle,
    reviveUnderSameIdentity,
    disposeSessionView,
    requestStopSession,
    toggleRecipientTarget,
    beginTakeControlFocus,
    runFocusRetryStep,
    getSession,
    getState
  });
}
</script>

<script setup>
import { shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  attachmentAvailable: { type: Boolean, default: true },
  capsuleId: {
    type: String,
    required: true
  },
  capsuleTitle: {
    type: String,
    required: true
  },
  projection: {
    type: Object,
    default: null
  },
  epoch: {
    type: Number,
    default: 1
  },
  generation: {
    type: Number,
    default: 1
  },
  consoleMode: {
    type: String,
    default: 'player'
  },
  liveSurfaceCount: {
    type: Number,
    default: 1
  },
  hasKeyboardOwnership: {
    type: Boolean,
    default: false
  },
  underAiCommand: {
    type: Boolean,
    default: false
  },
  presentationInstance: {
    type: String,
    default: 'wall-main'
  }
});

const emit = defineEmits([
  'intent',
  'select-session',
  'fold-change',
  'attach-session',
  'stop-session',
  'replay-session',
  'toggle-target',
  'activate-veil'
]);

const foldButtonRef = shallowRef(/** @type {HTMLButtonElement|null} */ (null));

const controller = createMultiSlotController({
  capsuleId: props.capsuleId,
  capsuleTitle: props.capsuleTitle,
  epoch: props.epoch,
  generation: props.generation,
  consoleMode: props.consoleMode === 'developer-pty' ? 'developer-pty' : 'player',
  onIntent(intent) {
    emit('intent', intent);
  }
});

const uiState = shallowRef(controller.getState());

function syncSnapshot() {
  uiState.value = controller.getState();
}

if (props.projection) {
  controller.applySessionProjection(props.projection);
  syncSnapshot();
}

watch(
  () => props.projection,
  (nextProj) => {
    if (nextProj) {
      controller.applySessionProjection(nextProj);
      syncSnapshot();
    }
  }
);

const isFolded = computed(() => uiState.value.presentation === 'folded');

const visibleSessions = computed(() =>
  uiState.value.sessions.filter((s) => s.viewRetention !== 'disposed')
);

const veilState = computed(() =>
  computeActivationVeilState({
    liveSurfaceCount: props.liveSurfaceCount,
    hasKeyboardOwnership: props.hasKeyboardOwnership,
    underAiCommand: props.underAiCommand
  })
);

const semanticControls = computed(() =>
  buildMultiSlotSemanticControls(uiState.value, {
    presentationInstance: props.presentationInstance,
    rejectFabricatedHiddenBoxes: false
  })
);

/**
 * Preserves live-surface DOM focus on pointerdown/mousedown (`UI_ARCHITECTURE.md` §6:212).
 * @param {Event} event
 */
function onSurfaceAdjacentPointer(event) {
  preserveLiveSurfaceFocusGuard(event);
}

/**
 * Toggles fold state; when folding, moves DOM focus to the fold button before hiding (`§6:207`).
 */
function onToggleFold() {
  if (!isFolded.value) {
    if (foldButtonRef.value && typeof foldButtonRef.value.focus === 'function') {
      foldButtonRef.value.focus();
    }
    controller.foldSlot();
  } else {
    controller.unfoldSlot();
  }
  syncSnapshot();
  emit('fold-change', {
    capsuleId: props.capsuleId,
    presentation: uiState.value.presentation
  });
}

/**
 * Switches the viewed session tab without changing recipients, controller owner, or process state (`§6:190`).
 * @param {string} sessionId
 */
function onSelectTab(sessionId) {
  const res = controller.selectSessionTab(sessionId);
  syncSnapshot();
  if (res.ok) {
    emit('select-session', {
      capsuleId: props.capsuleId,
      viewedSessionId: sessionId
    });
  }
}

/**
 * Requests session attach (`session/{sid}/attach`).
 * @param {string} sessionId
 */
function onAttachSession(sessionId) {
  emit('attach-session', {
    capsuleId: props.capsuleId,
    sessionId,
    epoch: uiState.value.epoch
  });
}

/**
 * Submits explicit stop session intent (`session/{sid}/stop`).
 * @param {string} sessionId
 */
function onStopSession(sessionId) {
  const res = controller.requestStopSession(sessionId);
  syncSnapshot();
  if (res.ok) {
    emit('stop-session', res.intent);
  }
}

/**
 * Switches or focuses replay inspection (`session/{sid}/replay`).
 * @param {string} sessionId
 */
function onReplaySession(sessionId) {
  controller.selectSessionTab(sessionId);
  syncSnapshot();
  emit('replay-session', {
    capsuleId: props.capsuleId,
    sessionId,
    epoch: uiState.value.epoch
  });
}

/**
 * Toggles explicit orchestrator target inclusion (`session/{sid}/target`).
 * @param {string} sessionId
 */
function onToggleTarget(sessionId) {
  const res = controller.toggleRecipientTarget(sessionId);
  syncSnapshot();
  if (res.ok) {
    emit('toggle-target', {
      capsuleId: props.capsuleId,
      sessionId,
      recipientSessionIds: res.recipientSessionIds
    });
  }
}

/**
 * Requests authoritative keyboard ownership arbitration via activation veil (`§6:211`).
 */
function onActivateVeil() {
  emit('activate-veil', {
    capsuleId: props.capsuleId,
    epoch: uiState.value.epoch,
    generation: uiState.value.generation
  });
}

onMounted(() => {
  controller.mountSlot();
  syncSnapshot();
});

onBeforeUnmount(() => {
  // Presentation unmount detaches view state without killing backend capsules or sessions (§6:175, 195)
  controller.detachOnReload();
});

defineExpose({
  selectSession: onSelectTab,
  controller,
  uiState,
  semanticControls
});
</script>

<template>
  <section
    :id="`capsule/${capsuleId}/slot`"
    :data-semantic-anchor="`capsule/${capsuleId}/slot`"
    class="cuk-multislot"
    role="region"
    :aria-label="`AI sessions for ${uiState.capsuleTitle}`"
    :data-presentation="uiState.presentation"
    :data-scheduling-enabled="String(uiState.schedulingEnabled)"
  >
    <header class="cuk-multislot__header">
      <button
        ref="foldButtonRef"
        :id="`capsule/${capsuleId}/session-slot/fold`"
        :data-semantic-anchor="`capsule/${capsuleId}/session-slot/fold`"
        type="button"
        role="button"
        class="cuk-multislot__fold-btn"
        :aria-expanded="!isFolded"
        :aria-controls="`capsule/${capsuleId}/slot-body`"
        :aria-label="`${isFolded ? 'Unfold' : 'Fold'} ${uiState.capsuleTitle}`"
        @pointerdown="onSurfaceAdjacentPointer"
        @mousedown="onSurfaceAdjacentPointer"
        @click="onToggleFold"
      >
        {{ isFolded ? 'Unfold AI Slot' : 'Fold AI Slot' }}
      </button>

      <div
        
        class="cuk-multislot__tablist"
        role="tablist"
        :aria-label="`Session tabs for ${uiState.capsuleTitle}`"
       :class="{ 'cuk-csp-hidden': !(!isFolded) }">
        <button
          v-for="session in visibleSessions"
          :key="session.sessionId"
          :id="`capsule/${capsuleId}/session/${session.sessionId}/tab`"
          :data-semantic-anchor="`capsule/${capsuleId}/session/${session.sessionId}/tab`"
          type="button"
          role="tab"
          class="cuk-multislot__tab"
          :aria-selected="session.sessionId === uiState.viewedSessionId"
          :aria-label="formatSessionTabAccessibleName(session)"
          :data-activity="session.activity"
          :data-attachment="session.attachment"
          :data-attention="String(session.attention)"
          @pointerdown="onSurfaceAdjacentPointer"
          @mousedown="onSurfaceAdjacentPointer"
          @click="onSelectTab(session.sessionId)"
        >
          <span class="cuk-multislot__tab-title">{{ session.title }}</span>
          <span class="cuk-multislot__tab-disamb">({{ session.disambiguator }})</span>
          <span class="cuk-multislot__tab-activity">{{ session.activity }}</span>
        </button>
      </div>
    </header>

    <!-- Folded live hosts stay mounted using mounted hidden classes with scheduling disabled (UI_ARCHITECTURE.md §6:197) -->
    <div
      
      :id="`capsule/${capsuleId}/slot-body`"
      class="cuk-multislot__body"
     :class="{ 'cuk-csp-hidden': !(!isFolded) }">
      <div
        v-if="veilState.veilVisible"
        class="cuk-multislot__veil" :id="`cuk-${capsuleId}-multislot-veil`" :data-semantic-anchor="`settings/activate-slot-${capsuleId}`" role="button" :aria-label="`Activate ${capsuleTitle}`"
        data-testid="multislot-activation-veil"
        @pointerdown="onSurfaceAdjacentPointer"
        @mousedown="onSurfaceAdjacentPointer"
        @click="onActivateVeil"
      >
        <span class="cuk-multislot__veil-label">Activate surface keyboard focus</span>
      </div>

      <div
        v-for="session in visibleSessions"
        :key="session.sessionId"
        
        class="cuk-multislot__session-pane"
        :data-session-id="session.sessionId"
        :data-view-retention="session.viewRetention"
       :class="{ 'cuk-csp-hidden': !(session.sessionId === uiState.viewedSessionId) }">
        <div class="cuk-multislot__actions">
          <button
            :id="`session/${session.sessionId}/attach`"
            :data-semantic-anchor="`session/${session.sessionId}/attach`"
            type="button"
            role="button"
            class="cuk-multislot__action-btn"
            :disabled="!attachmentAvailable || session.activity === 'exited' || session.activity === 'failed' || session.attachment === 'live' || session.attachment === 'attaching'"
            :aria-label="`Attach session ${session.title} (${session.sessionId})`"
            @pointerdown="onSurfaceAdjacentPointer"
            @mousedown="onSurfaceAdjacentPointer"
            @click="onAttachSession(session.sessionId)"
          >
            Attach
          </button>

          <button
            :id="`session/${session.sessionId}/stop`"
            :data-semantic-anchor="`session/${session.sessionId}/stop`"
            type="button"
            role="button"
            class="cuk-multislot__action-btn"
            :disabled="session.activity === 'exited' || session.activity === 'failed'"
            :aria-label="`Stop session ${session.title} (${session.sessionId})`"
            @pointerdown="onSurfaceAdjacentPointer"
            @mousedown="onSurfaceAdjacentPointer"
            @click="onStopSession(session.sessionId)"
          >
            Stop
          </button>

          <button
            :id="`session/${session.sessionId}/replay`"
            :data-semantic-anchor="`session/${session.sessionId}/replay`"
            type="button"
            role="button"
            class="cuk-multislot__action-btn"
            :aria-label="`Replay session ${session.title} (${session.sessionId})`"
            @pointerdown="onSurfaceAdjacentPointer"
            @mousedown="onSurfaceAdjacentPointer"
            @click="onReplaySession(session.sessionId)"
          >
            Replay
          </button>

          <button
            :id="`session/${session.sessionId}/target`"
            :data-semantic-anchor="`session/${session.sessionId}/target`"
            type="button"
            role="button"
            class="cuk-multislot__action-btn"
            :disabled="!(session.activity === 'ready' || session.activity === 'waiting-input')"
            :aria-pressed="uiState.recipientSessionIds.includes(session.sessionId)"
            :aria-label="`Select target session ${session.title} (${session.sessionId})`"
            @pointerdown="onSurfaceAdjacentPointer"
            @mousedown="onSurfaceAdjacentPointer"
            @click="onToggleTarget(session.sessionId)"
          >
            Target
          </button>
        </div>

        <div class="cuk-multislot__terminal-host">
          <slot name="terminal" :session="session" :viewed="session.sessionId === uiState.viewedSessionId" :scheduling-enabled="uiState.schedulingEnabled" />
        </div>

        <div
          :id="`output/${session.sessionId}/text`"
          :data-semantic-anchor="`output/${session.sessionId}/text`"
          role="region"
          aria-live="off"
          :aria-label="`Accessible output for ${session.title} (${session.sessionId})`"
          class="cuk-multislot__accessible-output"
          tabindex="0"
        >
          {{ session.accessibleText }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cuk-multislot {
  display: flex;
  flex-direction: column;
  background-color: var(--cuk-surface-panel, #181a1f);
  color: var(--cuk-text-primary, #f0f2f5);
  border-top: 1px solid var(--cuk-border-default, #2d3139);
  min-height: 0;
}

.cuk-multislot__header {
  display: flex;
  align-items: center;
  gap: var(--cuk-space-2, 8px);
  padding: var(--cuk-space-1, 4px) var(--cuk-space-2, 8px);
  background-color: var(--cuk-surface-chrome, #121417);
  border-bottom: 1px solid var(--cuk-border-default, #2d3139);
}

.cuk-multislot__tablist {
  display: flex;
  align-items: center;
  gap: var(--cuk-space-1, 4px);
  overflow-x: auto;
  flex: 1 1 auto;
}

.cuk-multislot__fold-btn,
.cuk-multislot__tab,
.cuk-multislot__action-btn {
  font: inherit;
  color: var(--cuk-text-primary, #f0f2f5);
  background-color: var(--cuk-surface-panel, #181a1f);
  border: 1px solid var(--cuk-border-default, #2d3139);
  border-radius: var(--cuk-radius-sm, 4px);
  padding: var(--cuk-space-1, 4px) var(--cuk-space-2, 8px);
  cursor: pointer;
}

.cuk-multislot__tab[aria-selected='true'] {
  border-color: var(--cuk-focus-ring, #4da3ff);
  background-color: var(--cuk-selection-bg, #1f334d);
}

.cuk-multislot__body {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.cuk-multislot__veil {
  position: absolute;
  inset: 0;
  z-index: var(--cuk-z-overlay, 10);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.35);
}

.cuk-multislot__session-pane {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-space-2, 8px);
  padding: var(--cuk-space-2, 8px);
  flex: 1 1 auto;
  min-height: 0;
}

.cuk-multislot__actions {
  display: flex;
  align-items: center;
  gap: var(--cuk-space-1, 4px);
}

.cuk-multislot__accessible-output {
  font-family: var(--cuk-font-mono, monospace);
  white-space: pre-wrap;
  overflow-y: auto;
  max-height: 10rem;
  padding: var(--cuk-space-2, 8px);
  border: 1px solid var(--cuk-border-default, #2d3139);
}

.cuk-csp-hidden { display: none !important; }
</style>
