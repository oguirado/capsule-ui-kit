/**
 * @fileoverview Lane A audit tests: SFC structure, helper units, refusal
 * codes, virtualised-window math, anchor conformance, and negative
 * contrasts for the four `src/audit/Audit*` components (SAAS-9) plus the
 * `auditRefusals.js` module. Follows the kit SFC test contract: plain
 * `<script>` helpers load through a data URL, templates must compile with
 * zero errors, styles are tokens-only, and every control carries a stable
 * id, a role, an accessible name and a semantic anchor.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse, compileTemplate } from '@vue/compiler-sfc';
import {
  AUDIT_REFUSAL_CODES,
  AUDIT_REFUSAL_TEXT,
  isKnownRefusalCode,
  normalizeRefusalCode,
  refusalText,
  refusalChip,
  refusalAccessibleName,
} from '../src/audit/auditRefusals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMPONENTS = Object.freeze([
  Object.freeze({
    name: 'AuditStreamTabs',
    path: '../src/audit/AuditStreamTabs.vue',
    emits: Object.freeze(['select-stream']),
    hasMotion: false,
    hasButtons: true,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'AuditRow',
    path: '../src/audit/AuditRow.vue',
    emits: Object.freeze(['select-record']),
    hasMotion: false,
    hasButtons: true,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'AuditReceipt',
    path: '../src/audit/AuditReceipt.vue',
    emits: Object.freeze([]),
    hasMotion: false,
    hasButtons: false,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'AuditTimeline',
    path: '../src/audit/AuditTimeline.vue',
    emits: Object.freeze(['select-stream', 'select-record', 'filter-change']),
    hasMotion: false,
    hasButtons: true,
    needsAnchor: true,
  }),
]);

const EMIT_INVENTORY = Object.freeze({
  AuditStreamTabs: 'AUDIT_STREAM_TABS_EMITS',
  AuditRow: 'AUDIT_ROW_EMITS',
  AuditReceipt: 'AUDIT_RECEIPT_EMITS',
  AuditTimeline: 'AUDIT_TIMELINE_EMITS',
});

// Hashed deny-list: sha256 hex of lowercased private terms; public tokens stay literal.
const BANNED_HASHES = new Set([
  'f3e0f62e477c2a77c0e0030333940766ebf08b2bccac871646ac86aea5672e01',
  'b8412a7082b42c4b616e8349ad13462a8650ff4706388191ab3b530013eed281',
  '4d0f43f3e81b83426c793bc8b321d5c1930c909ac3f27a83821fcac0718c2343',
  '3a7a45ec9c91cfab9b56ba3c34cc1e0086a739987b5f547514d8561f5623c745',
  '94819eaebc292ccdf747102ba9dc6f452e0b7fbbb7b80bdd17e3e7fcb36e2833',
  'd991c4c68194f98169fd570b4061e2abff26f46f461fb34aa23cdf29f3cae165',
]);
const BANNED_LENS = [8, 10, 11, 12, 21];
const BANNED_PUBLIC = [
  'opensuperficies',
  'claude',
  'gpt',
  'openai',
  'anthropic',
  'gemini',
  'vance',
  'sec-ops',
  '127.0.0.1',
];

function sha256hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function findBannedHash(lower) {
  const runs = lower.split(/[^a-z0-9_./-]+/);
  for (const run of runs) {
    for (const len of BANNED_LENS) {
      if (run.length < len) continue;
      for (let i = 0; i + len <= run.length; i += 1) {
        const digest = sha256hex(run.slice(i, i + len));
        if (BANNED_HASHES.has(digest)) return digest;
      }
    }
  }
  return null;
}

function assertNoBanned(source, label) {
  const normalized = source.toLowerCase();
  for (const banned of BANNED_PUBLIC) {
    assert.equal(normalized.includes(banned), false, `${label}: must not contain ${banned}`);
  }
  const hit = findBannedHash(normalized);
  assert.equal(hit, null, `${label}: must not contain private term (hash ${hit})`);
}

// Rebuilt samples without spelling terms: char codes of lowercased private terms.
const BANNED_CODES = [
  [109, 101, 116, 97, 118, 105, 101, 119, 101, 114],
  [104, 111, 108, 100, 105, 110, 103, 115],
  [116, 101, 97, 109, 119, 111, 114, 107, 95, 97, 110, 116, 105, 103, 114, 97, 118, 105, 116, 121, 50],
  [118, 105, 115, 117, 97, 108, 45, 113, 97, 45, 48],
  [112, 97, 112, 101, 114, 115, 109, 97, 116, 104, 45, 48],
  [111, 114, 113, 117, 101, 115, 116, 97, 100, 111, 114],
];

async function loadComponent(component) {
  const filePath = path.resolve(__dirname, component.path);
  const source = fs.readFileSync(filePath, 'utf8');
  const parsed = parse(source, { filename: `${component.name}.vue` });
  assert.equal(parsed.errors.length, 0, `${component.name}: SFC parse must produce zero errors`);
  const { descriptor } = parsed;
  assert.ok(descriptor.template, `${component.name}: must have a <template> block`);
  assert.ok(descriptor.script, `${component.name}: must have a plain <script> helper block`);
  assert.ok(descriptor.scriptSetup, `${component.name}: must have a <script setup> block`);
  const compiled = compileTemplate({
    source: descriptor.template.content,
    filename: `${component.name}.vue`,
    id: `cuk-audit-${component.name}`,
  });
  assert.equal(
    (compiled.errors || []).length,
    0,
    `${component.name}: template compile must produce zero errors`,
  );
  const scriptDataUrl =
    'data:text/javascript;base64,' + Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  const helpers = await import(scriptDataUrl);
  return { source, descriptor, helpers };
}

const loaded = {};
for (const component of COMPONENTS) {
  loaded[component.name] = await loadComponent(component);
}

function styleContent(name) {
  return loaded[name].descriptor.styles.map((style) => style.content).join('\n');
}

function templateContent(name) {
  return loaded[name].descriptor.template.content;
}

function setupContent(name) {
  return loaded[name].descriptor.scriptSetup.content;
}

test('Audit SFCs are plain JS with no vendor imports', () => {
  for (const component of COMPONENTS) {
    const { source } = loaded[component.name];
    assert.ok(!source.includes('lang="ts"'), `${component.name}: no lang="ts"`);
    assert.ok(!source.includes("lang='ts'"), `${component.name}: no lang='ts'`);
    assert.doesNotMatch(source, /from\s+['"]openvue\//, `${component.name}: no direct openvue imports`);
    assert.doesNotMatch(source, /from\s+['"]@openvue\//, `${component.name}: no direct @openvue imports`);
  }
});

test('Audit styles are tokens-only with fallbacks on saas delta vars', () => {
  for (const component of COMPONENTS) {
    const css = styleContent(component.name);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${component.name}: no hardcoded hex colors`);
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
      assert.ok(match[1].startsWith('--cuk-'), `${component.name}: token var ${match[1]}`);
    }
    const bareSaas = css.match(/var\(--cuk-[\w-]*saas[\w-]*\s*\)/g) || [];
    assert.equal(bareSaas.length, 0, `${component.name}: every saas delta var needs a token fallback`);
  }
});

test('Audit SFCs carry no placeholder or product names', () => {
  for (const component of COMPONENTS) {
    const { source } = loaded[component.name];
    assertNoBanned(source, component.name);
    assert.doesNotMatch(
      source,
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
      `${component.name}: no e-mail-shaped strings`,
    );
  }
});

test('Audit hashed guard rejects each private sample (must-FAIL)', () => {
  assert.equal(BANNED_CODES.length, BANNED_HASHES.size);
  for (const codes of BANNED_CODES) {
    const term = String.fromCharCode(...codes);
    assert.ok(BANNED_HASHES.has(sha256hex(term)));
    for (const sample of [term, term.toUpperCase()]) {
      assert.throws(() => assertNoBanned(`prefix ${sample} suffix`, 'sample'), { code: 'ERR_ASSERTION' });
    }
  }
  assert.doesNotThrow(() => assertNoBanned('See docs/UI_ARCHITECTURE.md in the consuming product.', 'clean'));
});

test('Audit controls expose stable ids, roles, and accessible names', () => {
  for (const component of COMPONENTS) {
    const template = templateContent(component.name);
    assert.ok(template.includes(':id="') || template.includes('id="'), `${component.name}: has ids`);
    assert.ok(template.includes('role="'), `${component.name}: has roles`);
    assert.ok(
      template.includes('aria-label="') || template.includes(':aria-label="'),
      `${component.name}: has accessible names`,
    );
    if (component.needsAnchor) {
      assert.ok(
        template.includes('data-semantic-anchor'),
        `${component.name}: exposes semantic anchors`,
      );
    }
    if (component.hasButtons) {
      assert.ok(
        styleContent(component.name).includes(':focus-visible'),
        `${component.name}: focus ring on controls`,
      );
    }
    if (component.hasMotion) {
      assert.ok(
        styleContent(component.name).includes('prefers-reduced-motion'),
        `${component.name}: honors reduced motion`,
      );
    } else {
      assert.equal(
        (styleContent(component.name).match(/@keyframes/g) || []).length,
        0,
        `${component.name}: no animation without a reduced-motion path`,
      );
    }
  }
});

test('Audit emits match the kit intent vocabulary', () => {
  for (const component of COMPONENTS) {
    const setup = setupContent(component.name);
    const match = setup.match(/defineEmits\(\[([^\]]*)\]\)/);
    const declared = match
      ? [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort()
      : [];
    assert.deepEqual(declared, [...component.emits].sort(), `${component.name}: emits contract`);
    const inventory = loaded[component.name].helpers[EMIT_INVENTORY[component.name]];
    assert.deepEqual([...inventory].sort(), [...component.emits].sort(), `${component.name}: exported emit inventory`);
  }
});

test('Audit timeline exposes a receipt viewer slot and a virtualised list', () => {
  const template = templateContent('AuditTimeline');
  assert.ok(template.includes('<slot name="receipt"'), 'receipt viewer slot');
  assert.ok(template.includes(':record="selectedRecord"'), 'receipt slot record prop');
  assert.ok(template.includes('visibleRecords'), 'windowed record slice');
  assert.ok(template.includes(':data-cuk-geometry-id="cspGeometry1"'), 'top spacer');
  assert.ok(template.includes(':data-cuk-geometry-id="cspGeometry3"'), 'bottom spacer');
  assert.ok(template.includes('No records in range.'), 'empty state');
  assert.ok(template.includes('Loading records'), 'loading state');
  assert.ok(template.includes('role="alert"'), 'chain-break alert');
});

test('Audit row keeps the exact refusal code visible', () => {
  const template = templateContent('AuditRow');
  assert.ok(template.includes('refusal.code'), 'code binding');
  assert.ok(template.includes('refusal.text'), 'human text binding');
  assert.ok(template.includes('audit-row-code'), 'code chip');
});

test('AuditStreamTabs helpers: streams, counts, and intents', () => {
  const helpers = loaded.AuditStreamTabs.helpers;
  assert.deepEqual([...helpers.AUDIT_STREAM_TABS_EMITS], ['select-stream']);
  assert.deepEqual(helpers.normalizeStreams(null), []);
  assert.deepEqual(helpers.normalizeStreams('nope'), []);
  assert.deepEqual(
    helpers.normalizeStreams([
      { id: 'a', label: '  A  ', count: 2 },
      { id: 'b' },
      { label: 'no id' },
      null,
      'junk',
    ]),
    [
      { id: 'a', label: 'A', count: 2 },
      { id: 'b', label: 'b', count: undefined },
    ],
  );
  assert.equal(helpers.formatStreamCount(12), '12');
  assert.equal(helpers.formatStreamCount(0), '0');
  for (const unknown of [null, undefined, Number.NaN, -1, '12', Number.POSITIVE_INFINITY]) {
    assert.equal(helpers.formatStreamCount(unknown), null, `count ${String(unknown)} omitted`);
  }
  assert.equal(helpers.streamTabDomId('session-records'), 'cuk-audit-stream-tab-session-records');
  assert.equal(helpers.streamTabsDomId(), 'cuk-audit-stream-tabs');
  assert.equal(helpers.streamTabAnchor('session-records'), 'audit/stream/session-records/tab');
  assert.equal(
    helpers.streamTabAccessibleName({ label: 'Session Records', count: 12 }),
    'Session Records, 12 records',
  );
  assert.equal(helpers.streamTabAccessibleName({ label: 'Egress Proxy', count: null }), 'Egress Proxy');
  assert.deepEqual(
    helpers.buildSelectStreamPayload({ streamId: 'custody-journal' }),
    { type: 'select-stream', streamId: 'custody-journal' },
  );
  assert.ok(Object.isFrozen(helpers.buildSelectStreamPayload({ streamId: 'a' })));
  const fixture = helpers.auditStreamTabsFixture();
  assert.equal(fixture.streams.length, 4);
  assert.equal(fixture.activeStream, 'session-records');
  assert.equal(fixture.streams[3].count, null);
  assert.equal(helpers.auditStreamTabsFixture({ activeStream: 'b' }).activeStream, 'b');
});

test('AuditRow helpers: actors, results, and names', () => {
  const helpers = loaded.AuditRow.helpers;
  assert.deepEqual([...helpers.AUDIT_ROW_EMITS], ['select-record']);
  assert.deepEqual([...helpers.AUDIT_ACTORS], ['operator', 'ai']);
  assert.equal(helpers.normalizeActor('operator'), 'operator');
  assert.equal(helpers.normalizeActor('ai'), 'ai');
  assert.equal(helpers.normalizeActor('bogus'), 'unknown');
  assert.equal(helpers.normalizeActor(null), 'unknown');
  assert.deepEqual(helpers.actorChip('operator'), { label: 'Operator', tone: 'info' });
  assert.deepEqual(helpers.actorChip('ai'), { label: 'Agent', tone: 'accent' });
  assert.deepEqual(helpers.actorChip('bogus'), { label: 'Unknown', tone: 'neutral' });
  assert.equal(helpers.normalizeResult('refused'), 'refused');
  assert.equal(helpers.normalizeResult('bogus'), 'unknown');
  assert.deepEqual(helpers.resultChip('refused'), { label: 'REFUSED', tone: 'error' });
  assert.deepEqual(helpers.resultChip('denied'), { label: 'DENIED', tone: 'error' });
  assert.deepEqual(helpers.resultChip('verified'), { label: 'VERIFIED', tone: 'success' });
  assert.deepEqual(helpers.resultChip('admitted'), { label: 'ADMITTED', tone: 'success' });
  assert.deepEqual(helpers.resultChip('approved'), { label: 'APPROVED', tone: 'success' });
  assert.deepEqual(helpers.resultChip('executed'), { label: 'EXECUTED', tone: 'info' });
  assert.deepEqual(helpers.resultChip('acquire'), { label: 'ACQUIRE', tone: 'info' });
  assert.deepEqual(helpers.resultChip('reclaim'), { label: 'RECLAIM', tone: 'info' });
  assert.deepEqual(helpers.resultChip('uncertain'), { label: 'UNCERTAIN', tone: 'warning' });
  assert.deepEqual(helpers.resultChip('private'), { label: 'PRIVATE', tone: 'warning' });
  assert.deepEqual(helpers.resultChip('bogus'), { label: 'UNKNOWN', tone: 'neutral' });
  assert.equal(helpers.refusalExpected('refused'), true);
  assert.equal(helpers.refusalExpected('denied'), true);
  assert.equal(helpers.refusalExpected('verified'), false);
  assert.equal(helpers.refusalExpected('unknown'), false);
  assert.equal(helpers.formatSeq(12), '#12');
  for (const unknown of [0, -1, 1.5, '12', null, undefined, Number.NaN]) {
    assert.equal(helpers.formatSeq(unknown), null, `seq ${String(unknown)} omitted`);
  }
  assert.equal(helpers.formatRecordText('  move pointer  '), 'move pointer');
  assert.equal(helpers.formatRecordText('   '), null);
  assert.equal(helpers.formatRecordText(null), null);
  const normalized = helpers.normalizeAuditRecord({
    id: 'rec-0001',
    seq: 12,
    stamp: '12:04:31',
    actor: 'operator',
    action: 'move pointer',
    capsuleId: 'cap-01',
    result: 'refused',
    refusalCode: 'STALE_FRAME',
    summary: 'Refused on frame 881.',
  });
  assert.equal(normalized.id, 'rec-0001');
  assert.equal(normalized.seqText, '#12');
  assert.equal(normalized.actor, 'operator');
  assert.equal(normalized.refusalCode, 'STALE_FRAME');
  assert.ok(Object.isFrozen(normalized));
  const empty = helpers.normalizeAuditRecord(null);
  assert.equal(empty.id, '');
  assert.equal(empty.seqText, null);
  assert.equal(empty.actor, 'unknown');
  assert.equal(empty.result, 'unknown');
  assert.equal(helpers.rowDomId('rec-0001'), 'cuk-audit-row-rec-0001');
  assert.equal(helpers.rowDomId(''), 'cuk-audit-row-unidentified');
  assert.equal(helpers.rowAnchor('rec-0001'), 'audit/record/rec-0001/select');
  assert.equal(helpers.rowAnchor(''), '');
  assert.equal(
    helpers.rowAccessibleName({
      seqText: '#12',
      resultLabel: 'REFUSED',
      capsuleText: 'cap-01',
      actorLabel: 'Operator',
      refusalCode: 'STALE_FRAME',
    }),
    'Record #12, REFUSED, capsule cap-01, Operator, STALE_FRAME',
  );
  assert.equal(
    helpers.rowAccessibleName({
      seqText: null,
      resultLabel: 'UNKNOWN',
      capsuleText: null,
      actorLabel: 'Unknown',
      refusalCode: '',
    }),
    'Record unknown, UNKNOWN, capsule unknown, Unknown',
  );
  assert.deepEqual(
    helpers.buildSelectRecordPayload({ recordId: 'rec-0001' }),
    { type: 'select-record', recordId: 'rec-0001' },
  );
  assert.ok(Object.isFrozen(helpers.buildSelectRecordPayload({ recordId: 'rec-0001' })));
  const fixture = helpers.auditRowFixture();
  assert.equal(fixture.record.id, 'rec-0001');
  assert.equal(fixture.selected, false);
});

test('AuditReceipt helpers: counts, gate, and anchors', () => {
  const helpers = loaded.AuditReceipt.helpers;
  assert.deepEqual([...helpers.AUDIT_RECEIPT_EMITS], []);
  assert.equal(helpers.formatReceiptCount(41), '41');
  assert.equal(helpers.formatReceiptCount(0), '0');
  for (const unknown of [null, undefined, Number.NaN, -1, '41', Number.POSITIVE_INFINITY]) {
    assert.equal(helpers.formatReceiptCount(unknown), null, `receipt count ${String(unknown)} omitted`);
  }
  assert.equal(helpers.normalizeGateVerdict('verified'), 'verified');
  assert.equal(helpers.normalizeGateVerdict('unverified'), 'unverified');
  assert.equal(helpers.normalizeGateVerdict('bogus'), 'unknown');
  assert.deepEqual(helpers.gateChip('verified'), { label: 'VERIFIED', tone: 'success' });
  assert.deepEqual(helpers.gateChip('unverified'), { label: 'UNVERIFIED', tone: 'error' });
  assert.deepEqual(helpers.gateChip('bogus'), { label: 'UNKNOWN', tone: 'neutral' });
  assert.equal(helpers.formatReceiptText(' 9f2c41ab '), '9f2c41ab');
  assert.equal(helpers.formatReceiptText('  '), null);
  const ids = helpers.receiptDomIds('rec-0001');
  assert.equal(ids.root, 'cuk-audit-receipt-rec-0001');
  assert.equal(ids.counts, 'cuk-audit-receipt-counts-rec-0001');
  assert.equal(ids.gate, 'cuk-audit-receipt-gate-rec-0001');
  assert.equal(helpers.receiptDomIds('').root, 'cuk-audit-receipt-unknown');
  const anchors = helpers.receiptAnchors('rec-0001');
  assert.equal(anchors.counts, 'audit/receipt/rec-0001/counts');
  assert.equal(anchors.gate, 'audit/receipt/rec-0001/gate');
  assert.equal(helpers.receiptAccessibleName('rec-0001'), 'Receipt for rec-0001');
  assert.equal(helpers.receiptAccessibleName(''), 'Receipt for unknown record');
  const fixture = helpers.auditReceiptFixture();
  assert.equal(fixture.recordId, 'rec-0001');
  assert.equal(fixture.verdict, 'verified');
  assert.equal(helpers.auditReceiptFixture({ verdict: 'unknown' }).verdict, 'unknown');
});

test('AuditTimeline helpers: virtualised window and filters', () => {
  const helpers = loaded.AuditTimeline.helpers;
  assert.deepEqual([...helpers.AUDIT_TIMELINE_EMITS], ['select-stream', 'select-record', 'filter-change']);
  assert.equal(helpers.AUDIT_TIMELINE_ROW_HEIGHT, 44);
  assert.equal(helpers.AUDIT_TIMELINE_OVERSCAN, 4);
  assert.equal(helpers.normalizeRowHeight(60), 60);
  assert.equal(helpers.normalizeRowHeight(0), 44);
  assert.equal(helpers.normalizeRowHeight(null), 44);
  assert.equal(helpers.normalizeOverscan(2), 2);
  assert.equal(helpers.normalizeOverscan(-1), 4);
  assert.equal(helpers.normalizeOverscan(1.5), 4);
  assert.deepEqual(
    helpers.visibleWindow({ count: 100, rowHeight: 44, viewportHeight: 360, scrollTop: 0, overscan: 4 }),
    { start: 0, end: 17, top: 0, bottom: 3652 },
  );
  assert.deepEqual(
    helpers.visibleWindow({ count: 100, rowHeight: 44, viewportHeight: 360, scrollTop: 440, overscan: 4 }),
    { start: 6, end: 23, top: 264, bottom: 3388 },
  );
  assert.deepEqual(
    helpers.visibleWindow({ count: 5, rowHeight: 44, viewportHeight: 360, scrollTop: 99999, overscan: 4 }),
    { start: 5, end: 5, top: 220, bottom: 0 },
  );
  assert.deepEqual(helpers.visibleWindow({ count: 0 }), { start: 0, end: 0, top: 0, bottom: 0 });
  assert.deepEqual(helpers.visibleWindow(null), { start: 0, end: 0, top: 0, bottom: 0 });
  assert.ok(Object.isFrozen(helpers.visibleWindow({ count: 3 })));
  assert.deepEqual(
    helpers.normalizeVerdictOptions([
      { value: 'refused', label: 'Refused' },
      { value: 'verified' },
      { label: 'no value' },
    ]),
    [
      { value: 'refused', label: 'Refused' },
      { value: 'verified', label: 'verified' },
    ],
  );
  assert.deepEqual(helpers.timelineDomIds(), {
    root: 'cuk-audit-timeline',
    filters: 'cuk-audit-filters',
    capsule: 'cuk-audit-filter-capsule',
    verdict: 'cuk-audit-filter-verdict',
    clear: 'cuk-audit-filter-clear',
    list: 'cuk-audit-list',
    status: 'cuk-audit-status',
    receipt: 'cuk-audit-receipt-wrap',
  });
  assert.equal(helpers.filterCapsuleAnchor(), 'audit/filter/capsule');
  assert.equal(helpers.filterVerdictAnchor(), 'audit/filter/verdict');
  assert.equal(helpers.filterClearAnchor(), 'audit/filter/clear');
  assert.equal(helpers.timelineListAnchor(), 'audit/timeline/list');
  assert.deepEqual(
    helpers.buildFilterChangePayload({ capsule: '  cap-01 ', verdict: 'refused' }),
    { type: 'filter-change', capsule: 'cap-01', verdict: 'refused' },
  );
  assert.deepEqual(
    helpers.buildFilterChangePayload({}),
    { type: 'filter-change', capsule: '', verdict: '' },
  );
  assert.ok(Object.isFrozen(helpers.buildFilterChangePayload({})));
  assert.equal(helpers.timelineListName({ count: 2 }), 'Audit timeline, 2 records');
  assert.equal(helpers.timelineListName({}), 'Audit timeline');
  const fixture = helpers.auditTimelineFixture();
  assert.equal(fixture.records.length, 2);
  assert.equal(fixture.selectedId, 'rec-0001');
});

test('Audit refusal codes are exact with human text and visible codes', () => {
  assert.deepEqual([...AUDIT_REFUSAL_CODES], [
    'STALE_FRAME',
    'SURFACE_NOT_AGENT_CONTROLLED',
    'LOCKED_BY_OTHER',
    'BUDGET_EXCEEDED',
    'OUT_OF_BOUNDS',
    'POLICY',
  ]);
  for (const code of AUDIT_REFUSAL_CODES) {
    assert.equal(typeof AUDIT_REFUSAL_TEXT[code], 'string', `text for ${code}`);
    assert.ok(AUDIT_REFUSAL_TEXT[code].length > 0, `non-empty text for ${code}`);
    assert.equal(isKnownRefusalCode(code), true, code);
    assert.equal(normalizeRefusalCode(code), code, code);
    assert.equal(refusalText(code), AUDIT_REFUSAL_TEXT[code], code);
    const chip = refusalChip(code);
    assert.equal(chip.code, code, `chip keeps ${code} visible`);
    assert.equal(chip.text, AUDIT_REFUSAL_TEXT[code], code);
    assert.equal(chip.tone, 'error', code);
    assert.ok(Object.isFrozen(chip), code);
    assert.ok(refusalAccessibleName(code).startsWith(`${code}:`), code);
  }
  assert.equal(isKnownRefusalCode('BOGUS'), false);
  assert.equal(isKnownRefusalCode(null), false);
  assert.equal(normalizeRefusalCode('BOGUS'), '');
  assert.equal(refusalText('BOGUS'), '');
  assert.deepEqual(refusalChip('BOGUS'), { code: '', text: 'Unknown reason', tone: 'neutral' });
  assert.equal(refusalAccessibleName('BOGUS'), 'Refusal reason unknown');
});
