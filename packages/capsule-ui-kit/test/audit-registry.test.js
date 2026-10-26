/**
 * @file Audit registry rows, anchor conformance and component-index contract for lane A.
 * Audit anchors are integrated `audit/*` families. Pin their exact templates
 * and roles while retaining rejection of invented siblings and numeric ids.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import {
  AUDIT_REGISTRY_ROWS,
  AUDIT_AGENT_LANE_IDS,
  AUDIT_FIXTURE_IDS,
  auditAnchorFor,
} from '../src/audit/auditRegistryRows.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const auditDir = path.join(kitRoot, 'src', 'audit');
const indexSource = readFileSync(path.join(auditDir, 'index.js'), 'utf8');

test('audit registry rows cover the full lane A control surface exactly once', () => {
  assert.equal(AUDIT_REGISTRY_ROWS.length, 8);
  assert.equal(AUDIT_AGENT_LANE_IDS.length, 8);
  assert.equal(new Set(AUDIT_AGENT_LANE_IDS).size, 8);
  for (const row of AUDIT_REGISTRY_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, 'row shape ' + row.agentLaneId);
    assert.equal(row.lane, 'A', 'lane ' + row.agentLaneId);
    assert.equal(row.anchorStatus, 'new', 'status ' + row.agentLaneId);
    assert.ok(row.component && !/\s/.test(row.component), 'component ' + row.agentLaneId);
    assert.ok(row.agentLaneId.startsWith('audit.'), 'plan id ' + row.agentLaneId);
    assert.ok(row.anchorExample.startsWith('audit/'), 'anchor family ' + row.agentLaneId);
  }
  assert.deepEqual(AUDIT_FIXTURE_IDS, { streamId: 'session-records', recordId: 'rec-0001', capsuleId: 'cap-01' });
});

test('audit rows map the SAAS-9 plan control ids', () => {
  const ids = new Set(AUDIT_AGENT_LANE_IDS);
  for (const planId of [
    'audit.stream.tab',
    'audit.filter.capsule',
    'audit.filter.verdict',
    'audit.row.select',
    'audit.receipt.counts',
    'audit.receipt.gate',
  ]) {
    assert.ok(ids.has(planId), 'plan control ' + planId);
  }
});

test('every audit row is carried by an existing lane A component', () => {
  const files = new Set(readdirSync(auditDir));
  for (const row of AUDIT_REGISTRY_ROWS) {
    assert.ok(files.has(`${row.component}.vue`), `component file for ${row.agentLaneId}`);
  }
});

test('audit anchors resolve to the integrated families and reject invented siblings', () => {
  for (const row of AUDIT_REGISTRY_ROWS) {
    const rule = matchControlFamily(row.anchorExample);
    assert.ok(rule, row.agentLaneId);
    assert.equal(rule.template, row.anchorTemplate);
    assert.deepEqual(rule.allowedRoles, [row.role]);
  }
  for (const anchor of [
    'audit/invented/control',
    'audit/record/1/select',
    'audit/stream/session-records/jump',
  ]) {
    assert.equal(matchControlFamily(anchor), null, anchor);
  }
});

test('auditAnchorFor builds concrete anchors from fixture defaults and params', () => {
  assert.equal(auditAnchorFor('audit.stream.tab'), 'audit/stream/session-records/tab');
  assert.equal(
    auditAnchorFor('audit.stream.tab', { stream: 'custody-journal' }),
    'audit/stream/custody-journal/tab',
  );
  assert.equal(auditAnchorFor('audit.row.select'), 'audit/record/rec-0001/select');
  assert.equal(
    auditAnchorFor('audit.row.select', { rid: 'rec-0042' }),
    'audit/record/rec-0042/select',
  );
  assert.equal(auditAnchorFor('audit.receipt.gate'), 'audit/receipt/rec-0001/gate');
  assert.equal(auditAnchorFor('audit.filter.clear'), 'audit/filter/clear');
  assert.throws(() => auditAnchorFor('audit.invented'), /Unknown audit agent_lane id/);
});

test('audit index re-exports every lane A binding exactly once', () => {
  for (const name of ['AuditTimeline', 'AuditStreamTabs', 'AuditRow', 'AuditReceipt']) {
    assert.ok(indexSource.includes(`from './${name}.vue'`), `index exports ${name}`);
    assert.ok(existsSync(path.join(auditDir, `${name}.vue`)), `${name}.vue on disk`);
  }
  assert.ok(indexSource.includes("from './auditRefusals.js'"), 'index exports auditRefusals');
  assert.ok(indexSource.includes("from './auditRegistryRows.js'"), 'index exports auditRegistryRows');
  assert.ok(existsSync(path.join(auditDir, 'auditRefusals.js')), 'auditRefusals.js on disk');
  assert.ok(existsSync(path.join(auditDir, 'auditRegistryRows.js')), 'auditRegistryRows.js on disk');
});
