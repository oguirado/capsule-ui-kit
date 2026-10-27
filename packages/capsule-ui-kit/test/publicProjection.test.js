/**
 * @file Behavioral oracle and negative-contrast test suite for PublicProjection.
 * Covers architecture contract §4, §12 (C-OWN, C-PUBLIC, C-DECODE, C-INTEGER, C-FLOW, C-REV) and §13.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_PROJECTION_SCHEMA_ID,
  DEFAULT_ALLOWED_SCHEMAS,
  createPublicProjectionCoordinator,
  validateProjectionEnvelope,
  cloneAndFreeze
} from '../src/state/publicProjection.js';

test('Closed schema catalog is available and frozen', () => {
  assert.equal(typeof PUBLIC_PROJECTION_SCHEMA_ID, 'string');
  assert.ok(PUBLIC_PROJECTION_SCHEMA_ID.length > 0);
  assert.ok(Array.isArray(DEFAULT_ALLOWED_SCHEMAS));
  assert.ok(Object.isFrozen(DEFAULT_ALLOWED_SCHEMAS));
  assert.ok(DEFAULT_ALLOWED_SCHEMAS.includes(PUBLIC_PROJECTION_SCHEMA_ID));
  assert.throws(() => {
    /** @type {string[]} */ (DEFAULT_ALLOWED_SCHEMAS).push('invented/v99');
  }, TypeError);
});

test('Initial state is unavailable with distinct RAM and durable revisions', () => {
  const coordinator = createPublicProjectionCoordinator();
  const snap = coordinator.getView().getSnapshot();

  assert.equal(snap.status, 'unavailable');
  assert.equal(snap.stale, false);
  assert.equal(snap.envelope, null);
  assert.equal(snap.ramRevision, null);
  assert.equal(snap.durableRevision, null);
  assert.equal(snap.error, null);
  assert.ok(Object.isFrozen(snap));
});

test('Subscription readiness gate blocks snapshot request and admission before ready', () => {
  const coordinator = createPublicProjectionCoordinator();
  const session = coordinator.beginSession({
    query: 'owner/people',
    epoch: 1
  });

  assert.equal(session.subscriptionReady, false);
  assert.equal(coordinator.canRequestSnapshot(session.generation), false);

  const preReadyAttempt = coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 1,
      query: 'owner/people',
      projection: { rows: [{ id: 'ent-1', name: 'Alice', balance: 500 }] }
    },
    { generation: session.generation }
  );

  assert.equal(preReadyAttempt.ok, false);
  assert.equal(preReadyAttempt.error.code, 'ERR_SUBSCRIPTION_NOT_READY');
  assert.equal(coordinator.getView().getSnapshot().status, 'unavailable');

  const readyRes = coordinator.markSubscriptionReady(session.generation);
  assert.equal(readyRes.ok, true);
  assert.equal(coordinator.canRequestSnapshot(session.generation), true);
});

test('Admits valid closed-schema envelope, tracks RAM vs durable revision, and exposes read-only view', () => {
  const coordinator = createPublicProjectionCoordinator();
  const session = coordinator.beginSession({ query: 'owner/summary', epoch: 3 });
  coordinator.markSubscriptionReady(session.generation);

  const res = coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 3,
      revision: 10,
      durableRevision: 8,
      query: 'owner/summary',
      projection: {
        rows: [
          { id: 'c-1', title: 'Alpha', balance: 12000, cost: null }
        ],
        summary: { activeCount: 1, cash: undefined }
      }
    },
    { generation: session.generation }
  );

  assert.equal(res.ok, true);
  const view = coordinator.getView();
  const snap = view.getSnapshot();

  assert.equal(snap.status, 'live');
  assert.equal(snap.stale, false);
  assert.equal(snap.ramRevision, 10);
  assert.equal(snap.durableRevision, 8);
  assert.equal(snap.envelope.schema, PUBLIC_PROJECTION_SCHEMA_ID);
  assert.equal(snap.envelope.epoch, 3);
  assert.equal(snap.envelope.revision, 10);
  assert.equal(snap.envelope.query, 'owner/summary');

  // Missing money remains 'unavailable', never coerced to 0
  assert.equal(snap.envelope.projection.rows[0].balance, 12000);
  assert.equal(snap.envelope.projection.rows[0].cost, 'unavailable');
  assert.equal(snap.envelope.projection.summary.cash, 'unavailable');

  // Read-only view does not expose admission/mutation functions
  assert.equal('admit' in view, false);
  assert.equal('admitPush' in view, false);
  assert.equal('admitInitialResponse' in view, false);
  assert.equal('beginSession' in view, false);
});

test('Negative contrast: refuses unapproved schema, unknown envelope keys, and inexact integers', () => {
  const coordinator = createPublicProjectionCoordinator();
  const s = coordinator.beginSession({ query: 'owner/equity', epoch: 1 });
  coordinator.markSubscriptionReady(s.generation);

  // Unknown schema
  const badSchema = coordinator.admitPush({
    schema: 'unregistered.schema/v1',
    epoch: 1,
    revision: 1,
    query: 'owner/equity',
    projection: { rows: [] }
  });
  assert.equal(badSchema.ok, false);
  assert.equal(badSchema.error.code, 'ERR_UNKNOWN_SCHEMA');

  // Unknown top-level key
  const unknownKey = coordinator.admitPush({
    schema: PUBLIC_PROJECTION_SCHEMA_ID,
    epoch: 1,
    revision: 1,
    query: 'owner/equity',
    projection: { rows: [] },
    extraField: true
  });
  assert.equal(unknownKey.ok, false);
  assert.equal(unknownKey.error.code, 'ERR_UNKNOWN_ENVELOPE_KEY');

  // Floating-point / inexact integer in revision or payload
  const floatRev = coordinator.admitPush({
    schema: PUBLIC_PROJECTION_SCHEMA_ID,
    epoch: 1,
    revision: 1.5,
    query: 'owner/equity',
    projection: { rows: [] }
  });
  assert.equal(floatRev.ok, false);
  assert.equal(floatRev.error.code, 'ERR_INEXACT_INTEGER');

  const floatAmount = coordinator.admitPush({
    schema: PUBLIC_PROJECTION_SCHEMA_ID,
    epoch: 1,
    revision: 1,
    query: 'owner/equity',
    projection: { rows: [{ id: 'r1', amount: 19.99 }] }
  });
  assert.equal(floatAmount.ok, false);
  assert.equal(floatAmount.error.code, 'ERR_INEXACT_INTEGER');
});

test('Negative contrast: stale query, stale epoch, stale generation, and push-before-initial rollback refused', () => {
  const coordinator = createPublicProjectionCoordinator();
  const s1 = coordinator.beginSession({ query: 'owner/production', epoch: 2 });
  coordinator.markSubscriptionReady(s1.generation);

  // Push arrives at revision 15 BEFORE initial response at revision 12
  const pushRes = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 2,
      revision: 15,
      durableRevision: 14,
      query: 'owner/production',
      projection: { rows: [{ id: 'u-1', output: 150 }] }
    },
    { generation: s1.generation }
  );
  assert.equal(pushRes.ok, true);

  // Late initial response with revision 12 must NOT roll back revision 15
  const lateInitial = coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 2,
      revision: 12,
      durableRevision: 12,
      query: 'owner/production',
      projection: { rows: [{ id: 'u-1', output: 120 }] }
    },
    { generation: s1.generation }
  );
  assert.equal(lateInitial.ok, false);
  assert.equal(lateInitial.error.code, 'ERR_STALE_REVISION');
  assert.equal(coordinator.getView().getSnapshot().ramRevision, 15);
  assert.equal(
    coordinator.getView().getSnapshot().envelope.projection.rows[0].output,
    150
  );

  // Stale query mismatch
  const wrongQuery = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 2,
      revision: 16,
      query: 'owner/inbox',
      projection: { rows: [] }
    },
    { generation: s1.generation }
  );
  assert.equal(wrongQuery.ok, false);
  assert.equal(wrongQuery.error.code, 'ERR_STALE_QUERY');
  assert.equal(coordinator.getView().getSnapshot().stale, true);
  assert.equal(coordinator.getView().getSnapshot().ramRevision, 15);

  // Stale epoch mismatch
  const wrongEpoch = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 20,
      query: 'owner/production',
      projection: { rows: [] }
    },
    { generation: s1.generation }
  );
  assert.equal(wrongEpoch.ok, false);
  assert.equal(wrongEpoch.error.code, 'ERR_STALE_EPOCH');

  // Route change invalidates old generation BEFORE unsubscribe callback runs
  let snapshotRequestAllowedDuringUnsubscribe = true;
  let oldGenAdmissionDuringUnsubscribe = null;

  const s2 = coordinator.beginSession({
    query: 'owner/people',
    epoch: 2,
    onUnsubscribePrevious: () => {
      snapshotRequestAllowedDuringUnsubscribe = coordinator.canRequestSnapshot(
        s1.generation
      );
      oldGenAdmissionDuringUnsubscribe = coordinator.admitPush(
        {
          schema: PUBLIC_PROJECTION_SCHEMA_ID,
          epoch: 2,
          revision: 99,
          query: 'owner/production',
          projection: { rows: [] }
        },
        { generation: s1.generation }
      );
    }
  });

  assert.equal(snapshotRequestAllowedDuringUnsubscribe, false);
  assert.equal(oldGenAdmissionDuringUnsubscribe.ok, false);
  assert.equal(
    oldGenAdmissionDuringUnsubscribe.error.code,
    'ERR_STALE_GENERATION'
  );
  assert.ok(s2.generation > s1.generation);
});

test('Negative contrast: alias mutation refused on both ingress caller object and egress view snapshot', () => {
  const coordinator = createPublicProjectionCoordinator();
  const s = coordinator.beginSession({ query: 'owner/fleet', epoch: 1 });
  coordinator.markSubscriptionReady(s.generation);

  const mutableInput = {
    schema: PUBLIC_PROJECTION_SCHEMA_ID,
    epoch: 1,
    revision: 1,
    query: 'owner/fleet',
    projection: {
      rows: [{ id: 'cap-1', status: 'active', meta: { tags: ['a', 'b'] } }]
    }
  };

  const res = coordinator.admitInitialResponse(mutableInput, {
    generation: s.generation
  });
  assert.equal(res.ok, true);

  // Mutate the caller's input after admission (ingress alias attack)
  mutableInput.revision = 999;
  mutableInput.projection.rows[0].status = 'destroyed';
  mutableInput.projection.rows[0].meta.tags.push('injected');

  const snap = coordinator.getView().getSnapshot();
  assert.equal(snap.ramRevision, 1);
  assert.equal(snap.envelope.projection.rows[0].status, 'active');
  assert.deepEqual(snap.envelope.projection.rows[0].meta.tags, ['a', 'b']);

  // Attempt nested mutation on the returned view snapshot (egress alias attack)
  assert.throws(() => {
    snap.envelope.projection.rows[0].status = 'hacked';
  }, TypeError);
  assert.throws(() => {
    snap.envelope.projection.rows[0].meta.tags.push('hacked');
  }, TypeError);
  assert.throws(() => {
    snap.envelope.projection.rows.push({ id: 'cap-2' });
  }, TypeError);

  assert.equal(
    coordinator.getView().getSnapshot().envelope.projection.rows[0].status,
    'active'
  );
});

test('Negative contrast: last malformed row, duplicate identity, or hidden fact rejects whole batch leaving last-good intact', () => {
  const coordinator = createPublicProjectionCoordinator();
  const s = coordinator.beginSession({ query: 'owner/people', epoch: 1 });
  coordinator.markSubscriptionReady(s.generation);

  const good = coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 5,
      durableRevision: 5,
      query: 'owner/people',
      projection: {
        rows: [
          { id: 'p-1', name: 'One', salary: 100 },
          { id: 'p-2', name: 'Two', salary: 200 }
        ]
      }
    },
    { generation: s.generation }
  );
  assert.equal(good.ok, true);

  // Last row malformed (missing id) -> rejects entire batch
  const malformedLast = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 6,
      query: 'owner/people',
      projection: {
        rows: [
          { id: 'p-1', name: 'OneUpdated', salary: 150 },
          { id: 'p-2', name: 'TwoUpdated', salary: 250 },
          { id: '', name: 'MalformedLastRow', salary: 300 }
        ]
      }
    },
    { generation: s.generation }
  );
  assert.equal(malformedLast.ok, false);
  assert.equal(malformedLast.error.code, 'ERR_MALFORMED_ROW');

  // Resident last-good projection is preserved untouched with stale/error markers
  const snapAfterMalformed = coordinator.getView().getSnapshot();
  assert.equal(snapAfterMalformed.ramRevision, 5);
  assert.equal(snapAfterMalformed.stale, true);
  assert.equal(snapAfterMalformed.error.code, 'ERR_MALFORMED_ROW');
  assert.equal(snapAfterMalformed.envelope.projection.rows.length, 2);
  assert.equal(snapAfterMalformed.envelope.projection.rows[0].name, 'One');

  // Duplicate identity in batch
  const dupId = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 7,
      query: 'owner/people',
      projection: {
        rows: [
          { id: 'p-1', name: 'First' },
          { id: 'p-1', name: 'Duplicate' }
        ]
      }
    },
    { generation: s.generation }
  );
  assert.equal(dupId.ok, false);
  assert.equal(dupId.error.code, 'ERR_DUPLICATE_IDENTITY');

  // Hidden fact present in transport payload
  const hiddenFact = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 8,
      query: 'owner/people',
      projection: {
        rows: [{ id: 'p-1', name: 'First', hidden: { rivalReserve: 9000 } }]
      }
    },
    { generation: s.generation }
  );
  assert.equal(hiddenFact.ok, false);
  assert.equal(hiddenFact.error.code, 'ERR_HIDDEN_FACT');
});

test('Delta admission requires exact resident base and merges atomically', () => {
  const coordinator = createPublicProjectionCoordinator();
  const s = coordinator.beginSession({ query: 'owner/products', epoch: 4 });
  coordinator.markSubscriptionReady(s.generation);

  // Delta when resident is unavailable must fail
  const deltaWithoutBase = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 4,
      revision: 2,
      baseRevision: 1,
      mode: 'delta',
      query: 'owner/products',
      projection: {
        upsertRows: [{ id: 'prod-1', price: 50 }]
      }
    },
    { generation: s.generation }
  );
  assert.equal(deltaWithoutBase.ok, false);
  assert.equal(deltaWithoutBase.error.code, 'ERR_WRONG_DELTA_BASE');

  // Establish resident base at revision 10
  assert.equal(
    coordinator.admitInitialResponse(
      {
        schema: PUBLIC_PROJECTION_SCHEMA_ID,
        epoch: 4,
        revision: 10,
        durableRevision: 10,
        query: 'owner/products',
        projection: {
          rows: [
            { id: 'prod-1', price: 40 },
            { id: 'prod-2', price: 80 }
          ]
        }
      },
      { generation: s.generation }
    ).ok,
    true
  );

  // Wrong baseRevision (9 instead of 10) must fail
  const wrongBase = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 4,
      revision: 11,
      baseRevision: 9,
      mode: 'delta',
      query: 'owner/products',
      projection: {
        upsertRows: [{ id: 'prod-1', price: 45 }]
      }
    },
    { generation: s.generation }
  );
  assert.equal(wrongBase.ok, false);
  assert.equal(wrongBase.error.code, 'ERR_WRONG_DELTA_BASE');

  // Exact baseRevision (10) succeeds and updates projection
  const validDelta = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 4,
      revision: 11,
      baseRevision: 10,
      mode: 'delta',
      query: 'owner/products',
      projection: {
        upsertRows: [
          { id: 'prod-1', price: 45 },
          { id: 'prod-3', price: null }
        ],
        removeRowIds: ['prod-2']
      }
    },
    { generation: s.generation }
  );
  assert.equal(validDelta.ok, true);

  const snap = coordinator.getView().getSnapshot();
  assert.equal(snap.ramRevision, 11);
  assert.equal(snap.durableRevision, 10);
  assert.deepEqual(
    snap.envelope.projection.rows.map((r) => ({ id: r.id, price: r.price })),
    [
      { id: 'prod-1', price: 45 },
      { id: 'prod-3', price: 'unavailable' }
    ]
  );
});

test('Selection reconciliation keeps only stable IDs and acknowledgements never patch projection', () => {
  const coordinator = createPublicProjectionCoordinator();
  const s = coordinator.beginSession({ query: 'owner/people', epoch: 1 });
  coordinator.markSubscriptionReady(s.generation);

  coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 1,
      query: 'owner/people',
      projection: {
        rows: [{ id: 'e-10' }, { id: 'e-20' }]
      }
    },
    { generation: s.generation }
  );

  const reconciled = coordinator
    .getView()
    .reconcileSelection(['e-20', 'e-99', 'e-10', 'e-20']);
  assert.deepEqual(reconciled.validIds, ['e-20', 'e-10']);
  assert.deepEqual(reconciled.removedIds, ['e-99']);
  assert.ok(Object.isFrozen(reconciled));

  const ackAttempt = coordinator.applyAcknowledgement({
    requestId: 'req-1',
    patch: { rows: [{ id: 'e-10',acked: true }] }
  });
  assert.equal(ackAttempt.ok, false);
  assert.equal(ackAttempt.error.code, 'ERR_ACK_CANNOT_PATCH_PROJECTION');

  const draft = coordinator.createPreviewDraft(
    { targetId: 'e-10', proposedSalary: 500 },
    'salary-preview'
  );
  assert.equal(draft.isDraft, true);
  assert.equal(draft.label, 'salary-preview');
  assert.ok(Object.isFrozen(draft));
  assert.equal(coordinator.getView().getSnapshot().ramRevision, 1);
});

test('cloneAndFreeze rejects non-plain objects and freezes deeply', () => {
  const nested = { a: [1, { b: 'two' }] };
  const frozen = cloneAndFreeze(nested);
  nested.a[1].b = 'mutated';
  assert.equal(frozen.a[1].b, 'two');
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.a));
  assert.ok(Object.isFrozen(frozen.a[1]));

  assert.throws(() => cloneAndFreeze({ fn: () => {} }), TypeError);
});
