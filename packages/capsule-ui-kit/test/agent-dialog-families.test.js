/**
 * @file pl3 R9/R11 lane-family tests: dialog/popover anchor families admit
 * their roles (textbox, listbox, option, dialog, button), and disabled
 * controls stay registered with a disabled state so the lane can list them
 * as non-actionable (disabled is never confused with absent).
 *
 * R9: the New Capsule dialog search field used to crash the whole lane
 * snapshot with ERR_INVALID_ROLE (role "textbox" vs family
 * "shell/navigation/{id}"). The dialog controls now live in the shared
 * dialog family `dialog/{id}/{action}`; `shell/navigation/{id}` still
 * admits only button/tab (the fix is the family, not the role).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CONTROL_FAMILY_INVENTORY,
  createControlRegistry,
  matchControlFamily,
} from '../src/agent/controlRegistry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIALOG = path.resolve(here, '../src/shell/NewCapsuleDialog.vue');
const dialogSource = readFileSync(DIALOG, 'utf8');

/** Minimal reviewed producer so export paths are covered. */
function reviewedProducer() {
  return {
    contractId: 'test/dialog-families/v1',
    peer: 'test-harness',
    reviewed: true,
    mapStableId: (input) =>
      `${input.windowId}:${input.presentationInstance}:${input.semanticAnchor}@e${input.epoch}.g${input.generation}`,
  };
}

/**
 * Register one control the way the v2 DOM producer does (anchor-keyed
 * entity, node slot, epoch 0).
 */
function registerNode(registry, { anchor, role, name, disabled = false, box = null }) {
  return registry.register({
    semanticAnchor: anchor,
    entityId: anchor,
    presentationInstance: 'main',
    controlSlot: 'node',
    role,
    accessibleName: name,
    epoch: 0,
    generation: 1,
    visible: true,
    materialized: true,
    inDom: true,
    state: disabled ? { disabled: true, unavailableReason: name } : { disabled: false },
    box: box ?? { x: 8, y: 8, width: 120, height: 28 },
  });
}

test('R9: the shared dialog family admits dialog control roles', () => {
  const rule = matchControlFamily('dialog/new-capsule/search');
  assert.ok(rule, 'dialog anchor matches a family');
  assert.equal(rule.template, 'dialog/{id}/{action}');
  for (const role of ['button', 'dialog', 'textbox', 'listbox', 'option']) {
    assert.ok(rule.allowedRoles.includes(role), `dialog family admits ${role}`);
  }
  assert.equal(rule.allowedRoles.includes('application'), false);
  const row12 = CONTROL_FAMILY_INVENTORY.find((row) => row.row === 12);
  assert.ok(row12.templates.includes('dialog/{id}/{action}'));
  for (const role of ['button', 'dialog', 'textbox', 'listbox', 'option']) {
    assert.ok(row12.roles.includes(role), `row 12 lists ${role}`);
  }
});

test('R9: shell/navigation still rejects textbox (family fix, not role fix)', () => {
  const registry = createControlRegistry({ windowId: 'win-main', epoch: 0, generation: 1 });
  assert.throws(
    () =>
      registerNode(registry, {
        anchor: 'shell/navigation/other-control',
        role: 'textbox',
        name: 'Other control',
      }),
    (error) =>
      error.code === 'ERR_INVALID_ROLE' &&
      String(error.message).includes('shell/navigation/{id}'),
  );
});

test('R9: lane registers the full New Capsule dialog control set while open', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 0,
    generation: 1,
    reviewedProducer: reviewedProducer(),
  });
  const dialogControls = [
    ['dialog/new-capsule/search', 'textbox', 'Search capsule types'],
    ['dialog/new-capsule/close', 'button', 'Close (Esc)'],
    ['dialog/new-capsule/category-all', 'button', 'All capsules, 3 types'],
    ['dialog/new-capsule/category-group-a', 'button', 'Group A, 2 types'],
    ['dialog/new-capsule/type-alpha-1', 'button', 'Select Alpha One'],
    ['dialog/new-capsule/mode-split', 'button', 'Open as Split'],
    ['dialog/new-capsule/cancel', 'button', 'Cancel'],
    ['dialog/new-capsule/create', 'button', 'Create Capsule'],
  ];
  for (const [anchor, role, name] of dialogControls) {
    const record = registerNode(registry, { anchor, role, name });
    assert.equal(record.familyTemplate, 'dialog/{id}/{action}');
    assert.ok(record.stableId.includes(anchor));
  }
  registerNode(registry, {
    anchor: 'shell/navigation/toggle',
    role: 'button',
    name: 'Toggle navigation',
  });
  registry.enterModalScope('new-capsule', 'shell/navigation/new');
  const target = registry.resolveActionableTarget('dialog/new-capsule/create');
  assert.equal(target.accessibleName, 'Create Capsule');
  assert.throws(
    () => registry.resolveActionableTarget('shell/navigation/toggle'),
    (error) => error.code === 'ERR_MODAL_BACKGROUND_INERT',
  );
  const state = registry.exportCanonicalState();
  assert.equal(state.activeModalId, 'new-capsule');
  assert.equal(state.nodes.length, dialogControls.length + 1);
  assert.equal(registry.exitModalScope('new-capsule'), 'shell/navigation/new');
});

test('R9: every dialog/popover anchor shape admits its roles', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 0,
    generation: 1,
    reviewedProducer: reviewedProducer(),
  });
  // Command palette search (legacy anchor kept working until CommandPalette.vue re-anchors).
  const paletteRule = matchControlFamily('shell/navigation/palette-search');
  assert.ok(paletteRule, 'palette search matches a family');
  assert.ok(paletteRule.allowedRoles.includes('textbox'));
  registerNode(registry, {
    anchor: 'shell/navigation/palette-search',
    role: 'textbox',
    name: 'Find a command',
  });
  // Terminal custom-command dialog/popover family.
  registerNode(registry, {
    anchor: 'terminal/side/custom-dialog',
    role: 'dialog',
    name: 'Custom command',
  });
  registerNode(registry, {
    anchor: 'terminal/side/custom-executable',
    role: 'textbox',
    name: 'Executable',
  });
  registerNode(registry, {
    anchor: 'terminal/side/custom-args',
    role: 'textbox',
    name: 'Arguments',
  });
  // Confirm overlay + shortcuts dialog in the shared dialog family.
  registerNode(registry, {
    anchor: 'dialog/loan-confirm/accept',
    role: 'button',
    name: 'Accept',
  });
  registerNode(registry, {
    anchor: 'dialog/loan-confirm/panel',
    role: 'dialog',
    name: 'Confirm loan',
  });
  registerNode(registry, {
    anchor: 'dialog/shortcuts/close',
    role: 'button',
    name: 'Close shortcuts',
  });
  const state = registry.exportCanonicalState();
  assert.equal(state.nodes.length, 7);
});

test('R9: New Capsule dialog source anchors every control in the dialog family', () => {
  for (const anchor of [
    'dialog/new-capsule/search',
    'dialog/new-capsule/close',
    'dialog/new-capsule/cancel',
    'dialog/new-capsule/create',
    'dialog/new-capsule/category-all',
  ]) {
    assert.ok(dialogSource.includes(anchor), anchor);
    assert.ok(matchControlFamily(anchor), `undeclared anchor ${anchor}`);
  }
  for (const prefix of [
    'dialog/new-capsule/category-',
    'dialog/new-capsule/type-',
    'dialog/new-capsule/mode-',
  ]) {
    assert.ok(dialogSource.includes(prefix), 'dynamic anchor prefix ' + prefix);
  }
  assert.ok(matchControlFamily('dialog/new-capsule/category-group-a'), 'category family probe');
  assert.ok(matchControlFamily('dialog/new-capsule/type-alpha-1'), 'type family probe');
  assert.ok(matchControlFamily('dialog/new-capsule/mode-split'), 'mode family probe');
  // Stable ids, roles and accessible names are untouched by the re-anchor.
  for (const id of [
    'shell/new-capsule/dialog',
    'shell/new-capsule/search',
    'shell/new-capsule/category-all',
    'shell/new-capsule/cancel',
    'shell/new-capsule/create',
    'shell/new-capsule/close',
  ]) {
    assert.ok(dialogSource.includes(id), 'stable id ' + id);
  }
  // Legacy anchors survive one release in data-anchor-alias (CockpitTab precedent).
  for (const alias of [
    'shell/navigation/new-capsule-search',
    'shell/navigation/new-capsule-close',
    'shell/navigation/new-capsule-cancel',
    'shell/navigation/new-capsule-create',
    'shell/navigation/new-capsule-category-all',
  ]) {
    assert.ok(dialogSource.includes(alias), 'legacy alias ' + alias);
  }
});

test('R11: disabled controls stay registered with a disabled state', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 0,
    generation: 1,
    reviewedProducer: reviewedProducer(),
  });
  registerNode(registry, {
    anchor: 'capsule/hq/dock-back',
    role: 'button',
    name: 'Dock back HQ',
    disabled: true,
  });
  registerNode(registry, {
    anchor: 'shell/navigation/popout',
    role: 'button',
    name: 'Pop out active capsule (Unavailable: R2 security policy blocks window.open)',
    disabled: true,
  });
  registerNode(registry, {
    anchor: 'shell/navigation/hidden-show-all',
    role: 'button',
    name: 'Show all',
    disabled: true,
  });
  const state = registry.exportCanonicalState();
  assert.equal(state.nodes.length, 3);
  for (const node of state.nodes) {
    assert.equal(node.state.disabled, true, `${node.semanticAnchor} carries disabled state`);
    assert.ok(node.box !== null, `${node.semanticAnchor} keeps its visible box`);
  }
  // Disabled refuses with its own code; unknown stays unknown: an agent can
  // tell "disabled" from "absent".
  for (const anchor of [
    'capsule/hq/dock-back',
    'shell/navigation/popout',
    'shell/navigation/hidden-show-all',
  ]) {
    assert.throws(
      () => registry.resolveActionableTarget(anchor),
      (error) => error.code === 'ERR_TARGET_DISABLED',
      anchor,
    );
  }
  assert.throws(
    () => registry.resolveActionableTarget('capsule/hq/destroy'),
    (error) => error.code === 'ERR_UNKNOWN_TARGET',
  );
});
