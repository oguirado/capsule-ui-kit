/**
 * @file Frame tile tests for room MV1 lane C: port-protocol model, registry
 * rows, component contract, token-only styles, sink tripwires and lane-local
 * publication hygiene. No Electron, no DOM mounting: the SFC is verified by
 * compilation plus source-contract assertions, and every pure helper is
 * unit-tested directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
import {
  FRAME_ACK_STATUSES,
  FRAME_FORMATS,
  FRAME_MAX_PIXELS,
  FRAME_TILE_EMITS,
  FRAME_TILE_SCHEMA,
  TILE_STATES,
  buildFrameAck,
  buildFrameDroppedPayload,
  buildFramePresentedPayload,
  buildStaleChangePayload,
  canvasAccessibleName,
  deriveTileState,
  formatFrameDims,
  frameTileAnchors,
  frameTileDomIds,
  frameTileFixture,
  isDownscaled,
  isFrameTileEntityId,
  isPixelDimension,
  isTileStale,
  normalizeTileState,
  tileAccessibleName,
  validateFrameEnvelope,
} from '../src/surfaces/frameTileModel.js';
import {
  SURFACES_AGENT_LANE_IDS,
  SURFACES_FIXTURE_IDS,
  SURFACES_REGISTRY_ROWS,
  surfacesAnchorFor,
} from '../src/surfaces/surfacesRegistryRows.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const surfacesDir = path.join(kitRoot, 'src', 'surfaces');
const tileSource = readFileSync(path.join(surfacesDir, 'FrameCanvasTile.vue'), 'utf8');
const modelSource = readFileSync(path.join(surfacesDir, 'frameTileModel.js'), 'utf8');
const rowsSource = readFileSync(path.join(surfacesDir, 'surfacesRegistryRows.js'), 'utf8');
const indexSource = readFileSync(path.join(surfacesDir, 'index.js'), 'utf8');
const laneSources = [tileSource, modelSource, rowsSource, indexSource];

/** Additive-family check needs the shared registry, present after the merge. */
const agentRegistryFile = path.join(kitRoot, 'src', 'agent', 'controlRegistry.js');
let matchControlFamily = null;
if (existsSync(agentRegistryFile)) {
  ({ matchControlFamily } = await import('../src/agent/controlRegistry.js'));
}

function makeBitmap(width, height) {
  let closed = false;
  return {
    bitmap: {
      width,
      height,
      close() {
        closed = true;
      },
    },
    isClosed: () => closed,
  };
}

test('model exports the frozen protocol vocabulary', () => {
  assert.equal(FRAME_TILE_SCHEMA, 'capsule-ui-kit.frame-tile/v1');
  assert.deepEqual([...FRAME_FORMATS], ['rgba', 'rgb24', 'bitmap']);
  assert.deepEqual([...TILE_STATES], ['live', 'stale', 'empty', 'no-source', 'folded', 'hidden']);
  assert.deepEqual([...FRAME_ACK_STATUSES], ['presented', 'dropped']);
  assert.deepEqual([...FRAME_TILE_EMITS], ['frame-presented', 'frame-dropped', 'stale-change']);
  assert.equal(FRAME_MAX_PIXELS, 33177600);
  assert.ok(Object.isFrozen(FRAME_FORMATS));
  assert.ok(Object.isFrozen(TILE_STATES));
});

test('validateFrameEnvelope accepts a valid rgba buffer frame', () => {
  const result = validateFrameEnvelope({
    seq: 7,
    width: 2,
    height: 2,
    format: 'rgba',
    payload: new ArrayBuffer(2 * 2 * 4),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    { seq: result.frame.seq, width: result.frame.width, height: result.frame.height, format: result.frame.format },
    { seq: 7, width: 2, height: 2, format: 'rgba' },
  );
  assert.ok(result.frame.payload instanceof ArrayBuffer);
});

test('validateFrameEnvelope accepts a valid rgb24 buffer frame', () => {
  const result = validateFrameEnvelope({
    seq: 8,
    width: 3,
    height: 1,
    format: 'rgb24',
    payload: new ArrayBuffer(3 * 1 * 3),
  });
  assert.equal(result.ok, true);
  assert.equal(result.frame.format, 'rgb24');
});

test('validateFrameEnvelope accepts a valid bitmap frame', () => {
  const { bitmap } = makeBitmap(1280, 900);
  const result = validateFrameEnvelope({ seq: 9, width: 1280, height: 900, format: 'bitmap', payload: bitmap });
  assert.equal(result.ok, true);
  assert.equal(result.frame.payload, bitmap);
});

test('validateFrameEnvelope refuses malformed envelopes with machine reasons', () => {
  const cases = [
    [null, 'NOT_OBJECT', -1],
    [[], 'NOT_OBJECT', -1],
    ['frame', 'NOT_OBJECT', -1],
    [{ seq: -1, width: 2, height: 2, format: 'rgba', payload: new ArrayBuffer(16) }, 'BAD_SEQ', -1],
    [{ width: 2, height: 2, format: 'rgba', payload: new ArrayBuffer(16) }, 'BAD_SEQ', -1],
    [{ seq: 1, width: 0, height: 2, format: 'rgba', payload: new ArrayBuffer(16) }, 'BAD_GEOMETRY', 1],
    [{ seq: 2, width: 2.5, height: 2, format: 'rgba', payload: new ArrayBuffer(16) }, 'BAD_GEOMETRY', 2],
    [{ seq: 3, width: 100000, height: 100000, format: 'rgba', payload: new ArrayBuffer(8) }, 'PIXELS_EXCEEDED', 3],
    [{ seq: 4, width: 2, height: 2, format: 'yuv420', payload: new ArrayBuffer(16) }, 'UNKNOWN_FORMAT', 4],
    [{ seq: 5, width: 2, height: 2, format: 'rgba' }, 'MISSING_PAYLOAD', 5],
    [{ seq: 6, width: 2, height: 2, format: 'rgba', payload: new ArrayBuffer(15) }, 'PAYLOAD_MISMATCH', 6],
    [{ seq: 7, width: 2, height: 2, format: 'rgb24', payload: new ArrayBuffer(16) }, 'PAYLOAD_MISMATCH', 7],
    [{ seq: 8, width: 2, height: 2, format: 'rgba', payload: {} }, 'PAYLOAD_MISMATCH', 8],
  ];
  for (const [message, reason, seq] of cases) {
    const result = validateFrameEnvelope(message);
    assert.equal(result.ok, false, JSON.stringify(message));
    assert.equal(result.reason, reason, JSON.stringify(message));
    assert.equal(result.seq, seq, JSON.stringify(message));
  }
});

test('validateFrameEnvelope refuses bitmaps whose declared size or shape mismatches', () => {
  const { bitmap } = makeBitmap(640, 480);
  const wrongDims = validateFrameEnvelope({ seq: 1, width: 320, height: 240, format: 'bitmap', payload: bitmap });
  assert.equal(wrongDims.ok, false);
  assert.equal(wrongDims.reason, 'BITMAP_MISMATCH');
  const noClose = validateFrameEnvelope({ seq: 2, width: 640, height: 480, format: 'bitmap', payload: { width: 640, height: 480 } });
  assert.equal(noClose.ok, false);
  assert.equal(noClose.reason, 'BITMAP_MISMATCH');
});

test('buildFrameAck shapes presented and dropped acks, freezing unreadable seqs to -1', () => {
  const presented = buildFrameAck(12, 'presented');
  assert.deepEqual(presented, { kind: 'ack', seq: 12, status: 'presented', reason: null });
  assert.ok(Object.isFrozen(presented));
  const dropped = buildFrameAck(13, 'dropped', 'FOLDED');
  assert.deepEqual(dropped, { kind: 'ack', seq: 13, status: 'dropped', reason: 'FOLDED' });
  assert.deepEqual(buildFrameAck('nope', 'presented'), { kind: 'ack', seq: -1, status: 'presented', reason: null });
  assert.deepEqual(buildFrameAck(3, 'bogus', 'X').status, 'dropped');
  assert.equal(buildFrameAck(3, 'dropped').reason, null);
});

test('deriveTileState prioritises folded, hidden, source, frame and staleness', () => {
  const base = { hasPort: true, folded: false, hidden: false, hasFrame: true, stale: false };
  assert.equal(deriveTileState(base), 'live');
  assert.equal(deriveTileState({ ...base, stale: true }), 'stale');
  assert.equal(deriveTileState({ ...base, hasFrame: false }), 'empty');
  assert.equal(deriveTileState({ ...base, hasPort: false }), 'no-source');
  assert.equal(deriveTileState({ ...base, hidden: true, stale: true }), 'hidden');
  assert.equal(deriveTileState({ ...base, folded: true, hidden: true }), 'folded');
  assert.equal(normalizeTileState('live'), 'live');
  assert.equal(normalizeTileState('invented'), 'empty');
  assert.equal(normalizeTileState(null), 'empty');
});

test('accessible names cover every tile state and fall back to the capsule id', () => {
  assert.equal(tileAccessibleName({ capsuleId: 'cap-01', capsuleLabel: 'One', state: 'live' }), 'Live frame tile for One');
  assert.equal(tileAccessibleName({ capsuleId: 'cap-01', state: 'stale' }), 'Stale frame tile for cap-01');
  assert.equal(tileAccessibleName({ capsuleId: 'cap-01', state: 'empty' }), 'Frame tile without frame for cap-01');
  assert.equal(tileAccessibleName({ capsuleId: 'cap-01', state: 'no-source' }), 'Frame tile without source for cap-01');
  assert.equal(tileAccessibleName({ capsuleId: 'cap-01', state: 'folded' }), 'Folded frame tile for cap-01');
  assert.equal(tileAccessibleName({ capsuleId: 'cap-01', state: 'hidden' }), 'Hidden frame tile for cap-01');
  assert.equal(tileAccessibleName({ capsuleId: 'cap-01', capsuleLabel: '  ', state: 'live' }), 'Live frame tile for cap-01');
  assert.equal(canvasAccessibleName({ capsuleId: 'cap-01', capsuleLabel: 'One' }), 'Frame image for One');
  assert.equal(canvasAccessibleName({ capsuleId: 'cap-01' }), 'Frame image for cap-01');
});

test('dom ids and anchors are stable and qualified by presentation instance', () => {
  assert.deepEqual(frameTileDomIds('cap-01', 'wall-main'), {
    host: 'cuk-frame-tile-cap-01-wall-main',
    canvas: 'cuk-frame-canvas-cap-01',
    scaled: 'cuk-frame-scaled-cap-01',
    stale: 'cuk-frame-stale-cap-01',
    state: 'cuk-frame-state-cap-01',
  });
  assert.equal(frameTileDomIds('cap-01').host, 'cuk-frame-tile-cap-01');
  assert.deepEqual(frameTileAnchors('cap-07'), {
    tile: 'surface/cap-07/tile',
    canvas: 'surface/cap-07/canvas',
    scaled: 'surface/cap-07/scaled-badge',
    stale: 'surface/cap-07/stale',
  });
});

test('isDownscaled raises only on larger frame axes and never on unknown sizes', () => {
  assert.equal(isDownscaled(1280, 900, 640, 450), true);
  assert.equal(isDownscaled(1280, 900, 1280, 900), false);
  assert.equal(isDownscaled(640, 450, 1280, 900), false);
  assert.equal(isDownscaled(1280, 100, 640, 450), true);
  assert.equal(isDownscaled(0, 900, 640, 450), false);
  assert.equal(isDownscaled(1280, 900, 0, 450), false);
  assert.equal(isDownscaled('1280', 900, 640, 450), false);
  assert.equal(isDownscaled(1280, 900, Number.NaN, 450), false);
});

test('isTileStale follows the host-declared timeout and never fires without a frame', () => {
  assert.equal(isTileStale(1000, 4000, 2000), true);
  assert.equal(isTileStale(1000, 2500, 2000), false);
  assert.equal(isTileStale(1000, 3000, 2000), false);
  assert.equal(isTileStale(null, 9999, 2000), false);
  assert.equal(isTileStale(-1, 9999, 2000), false);
  assert.equal(isTileStale(1000, 9999, 'late'), false);
  assert.equal(isTileStale(1000, 9999, -5), false);
  assert.equal(isTileStale(1000, Number.NaN, 2000), false);
});

test('formatters, payload builders, validators and fixture stay unknown-honest', () => {
  assert.equal(formatFrameDims(1280, 900), '1280x900');
  assert.equal(formatFrameDims(0, 900), 'unknown');
  assert.equal(formatFrameDims('1280', 900), 'unknown');
  assert.deepEqual(buildFramePresentedPayload({ seq: 1, width: 2, height: 2, format: 'rgba' }),
    { seq: 1, width: 2, height: 2, format: 'rgba' });
  assert.deepEqual(buildFrameDroppedPayload(2, 'FOLDED'), { seq: 2, reason: 'FOLDED' });
  assert.deepEqual(buildStaleChangePayload(true), { stale: true });
  assert.deepEqual(buildStaleChangePayload('yes'), { stale: false });
  assert.ok(Object.isFrozen(buildFramePresentedPayload({ seq: 1, width: 2, height: 2, format: 'rgba' })));
  assert.equal(isFrameTileEntityId('cap-01'), true);
  assert.equal(isFrameTileEntityId('7'), false);
  assert.equal(isFrameTileEntityId('  '), false);
  assert.equal(isPixelDimension(900), true);
  assert.equal(isPixelDimension(0), false);
  const fixture = frameTileFixture();
  assert.equal(fixture.capsuleId, 'capsule-01');
  assert.equal(fixture.port, null);
  assert.equal(fixture.staleAfterMs, 2000);
  assert.equal(frameTileFixture({ staleAfterMs: 500 }).staleAfterMs, 500);
});

test('surfaces registry rows cover the full lane C control surface exactly once', () => {
  assert.equal(SURFACES_REGISTRY_ROWS.length, 4);
  assert.equal(SURFACES_AGENT_LANE_IDS.length, 4);
  assert.equal(new Set(SURFACES_AGENT_LANE_IDS).size, 4);
  for (const row of SURFACES_REGISTRY_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, 'row shape ' + row.agentLaneId);
    assert.equal(row.lane, 'C', 'lane ' + row.agentLaneId);
    assert.equal(row.anchorStatus, 'new', 'status ' + row.agentLaneId);
    assert.equal(row.component, 'FrameCanvasTile', 'component ' + row.agentLaneId);
    assert.ok(row.agentLaneId.startsWith('surface.'), 'plan id ' + row.agentLaneId);
    assert.ok(row.anchorExample.startsWith('surface/'), 'anchor family ' + row.agentLaneId);
  }
  assert.deepEqual(SURFACES_FIXTURE_IDS, { capsuleId: 'cap-01' });
  assert.deepEqual([...SURFACES_AGENT_LANE_IDS],
    ['surface.tile', 'surface.canvas', 'surface.scaled-badge', 'surface.stale']);
});

test('surfacesAnchorFor builds concrete anchors from fixture defaults and params', () => {
  assert.equal(surfacesAnchorFor('surface.tile'), 'surface/cap-01/tile');
  assert.equal(surfacesAnchorFor('surface.canvas', { id: 'cap-07' }), 'surface/cap-07/canvas');
  assert.equal(surfacesAnchorFor('surface.scaled-badge', { id: 'cap-07' }), 'surface/cap-07/scaled-badge');
  assert.equal(surfacesAnchorFor('surface.stale'), 'surface/cap-01/stale');
  assert.throws(() => surfacesAnchorFor('surface.invented'), /Unknown surfaces agent_lane id/);
});

test('every surfaces row is carried by the lane C component file', () => {
  const files = new Set(readdirSync(surfacesDir));
  assert.ok(files.has('FrameCanvasTile.vue'), 'component file');
  assert.ok(files.has('frameTileModel.js'), 'model file');
  assert.ok(files.has('surfacesRegistryRows.js'), 'registry file');
  assert.ok(files.has('index.js'), 'index file');
  for (const row of SURFACES_REGISTRY_ROWS) {
    assert.ok(files.has(`${row.component}.vue`), `component file for ${row.agentLaneId}`);
  }
});

test('surfaces anchors resolve to integrated families and reject invented siblings', () => {
  assert.equal(typeof matchControlFamily, 'function', 'integrated registry is required');
  for (const row of SURFACES_REGISTRY_ROWS) {
    const rule = matchControlFamily(row.anchorExample);
    assert.ok(rule, row.agentLaneId);
    const template = ['surface.scaled-badge', 'surface.stale'].includes(row.agentLaneId)
      ? 'surface/{id}/{scaled-badge,stale}' : row.anchorTemplate;
    assert.equal(rule.template, template);
    assert.deepEqual(rule.allowedRoles, [row.role]);
  }
  for (const anchor of ['surface/invented/control', 'surface/1/tile', 'surface/cap-01/jump']) {
    assert.equal(matchControlFamily(anchor), null, anchor);
  }
});

test('lane index re-exports the component, model and registry rows', () => {
  assert.ok(indexSource.includes("export { default as FrameCanvasTile } from './FrameCanvasTile.vue'"));
  assert.ok(indexSource.includes("export * from './frameTileModel.js'"));
  assert.ok(indexSource.includes("export * from './surfacesRegistryRows.js'"));
  assert.ok(!indexSource.includes('presentationScheduler'), 'lane index claims no sibling file');
});

test('FrameCanvasTile compiles against the installed Vue compiler', () => {
  const { descriptor, errors } = parse(tileSource, { filename: 'FrameCanvasTile.vue' });
  assert.deepEqual(errors, []);
  assert.ok(descriptor.script, 'module script block');
  assert.ok(descriptor.scriptSetup, 'setup script block');
  assert.ok(descriptor.template, 'template block');
  const script = compileScript(descriptor, { id: 'surfaces-frame-canvas-tile' });
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: 'FrameCanvasTile.vue',
    id: 'surfaces-frame-canvas-tile',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, []);
});

test('FrameCanvasTile declares the host-port props and the frame event channel', () => {
  for (const prop of ['capsuleId', 'capsuleLabel', 'presentationInstance', 'port', 'folded', 'hidden', 'staleAfterMs']) {
    assert.ok(tileSource.includes(prop), 'prop ' + prop);
  }
  assert.ok(tileSource.includes("defineEmits(['frame-presented', 'frame-dropped', 'stale-change'])"), 'emits literal');
  for (const event of [...FRAME_TILE_EMITS]) {
    assert.ok(tileSource.includes(`'${event}'`), 'event ' + event);
  }
  assert.ok(tileSource.includes('data-semantic-anchor="anchors.tile"'), 'tile anchor binding');
  assert.ok(tileSource.includes('data-semantic-anchor="anchors.canvas"'), 'canvas anchor binding');
  assert.ok(tileSource.includes('data-semantic-anchor="anchors.scaled"'), 'scaled anchor binding');
  assert.ok(tileSource.includes('data-semantic-anchor="anchors.stale"'), 'stale anchor binding');
  assert.ok(tileSource.includes('role="region"'), 'tile role');
  assert.ok(tileSource.includes('role="img"'), 'canvas role');
  assert.ok(tileSource.includes('role="status"'), 'badge roles');
});

test('frames live outside reactivity: plain holder, no wrapped payload, real release paths', () => {
  assert.ok(tileSource.includes('let liveFrame = null'), 'plain non-reactive holder');
  assert.ok(!tileSource.includes('liveFrame.value'), 'holder never wrapped');
  assert.ok(!tileSource.includes('reactive('), 'no reactive() in the tile');
  assert.ok(!/ref\(\s*[^)]*liveFrame/.test(tileSource), 'holder never passed to ref()');
  const releases = tileSource.match(/releaseLiveFrame\(\)/g) || [];
  assert.ok(releases.length >= 4, `release paths (${releases.length})`);
  assert.ok(tileSource.includes('liveFrame.close()'), 'bitmap close path');
  assert.ok(tileSource.includes('payload.close()'), 'dropped-payload close path');
  for (const flag of ['hasFrame.value = true', 'frameWidth.value = frame.width', 'lastPresentAtMs = Date.now()']) {
    assert.ok(tileSource.includes(flag), 'numbers-only reactive update: ' + flag);
  }
});

test('every received frame is acked exactly once on the supplied port', () => {
  const acks = tileSource.match(/postAck\(buildFrameAck\(/g) || [];
  assert.equal(acks.length, 4, `ack sites (${acks.length})`);
  assert.ok(tileSource.includes("buildFrameAck(frame.seq, 'presented')"), 'presented ack');
  assert.ok(tileSource.includes("buildFrameAck(validation.seq, 'dropped', validation.reason)"), 'invalid ack');
  assert.ok(tileSource.includes("buildFrameAck(frame.seq, 'dropped', reason)"), 'folded/hidden ack');
  assert.ok(tileSource.includes("buildFrameAck(frame.seq, 'dropped', 'DRAW_FAILED')"), 'draw-failure ack');
  assert.ok(tileSource.includes('attachedPort.postMessage(ack)'), 'ack sent on the attached port only');
});

test('folded and hidden tiles stop the display branch and release bitmaps', () => {
  assert.ok(tileSource.includes("'cuk-csp-hidden': !(!hidden)"), 'hidden keeps the tile mounted but unseen');
  assert.ok(tileSource.includes('if (props.folded || props.hidden) stopDisplayBranch()'), 'branch stop on fold/hide');
  assert.ok(tileSource.includes('function stopDisplayBranch()'), 'stop routine');
  assert.ok(tileSource.includes('releaseLiveFrame()'), 'bitmap release');
  assert.ok(tileSource.includes('clearCanvas()'), 'canvas cleared without drawing a frame');
  assert.ok(tileSource.includes("const reason = props.folded ? 'FOLDED' : 'HIDDEN'"), 'drop reason');
});

test('scaled badge and stale indicator render from host-declared facts only', () => {
  assert.ok(tileSource.includes('isDownscaled(frameWidth.value, frameHeight.value, displayWidth.value, displayHeight.value)'), 'downscale predicate');
  assert.ok(tileSource.includes('v-if="scaled"'), 'scaled badge gate');
  assert.ok(tileSource.includes('>SCALED<') || tileSource.includes('SCALED'), 'scaled copy');
  assert.ok(tileSource.includes('isTileStale(lastPresentAtMs, Date.now(), props.staleAfterMs)'), 'stale predicate');
  assert.ok(tileSource.includes('v-if="stale"'), 'stale indicator gate');
  assert.ok(tileSource.includes('STALE'), 'stale copy');
  assert.ok(tileSource.includes('setInterval(checkStale, 250)'), 'stale timer');
  assert.ok(tileSource.includes('clearInterval(staleTimerId)'), 'timer teardown');
  assert.ok(tileSource.includes('ResizeObserver'), 'display-size observer');
});

test('tile styles use tokens only: no literal colors or dimensions', () => {
  const styles = [...tileSource.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n');
  assert.ok(styles.length > 0, 'style block present');
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i, 'no literal colors');
  assert.doesNotMatch(styles, /\b\d*\.?\d+(?:px|rem)\b/i, 'no literal dimensions');
  assert.ok(styles.includes('var(--cuk-'), 'token references present');
  assert.ok(styles.includes('--cuk-component-surface-view-backdrop'), 'shared surface backdrop');
  assert.ok(styles.includes('--cuk-component-saas-viewer-scaled-badge-background'), 'shared scaled badge fill');
  assert.ok(styles.includes('--cuk-semantic-status-warning-surface'), 'warning fill for the stale badge');
});

test('lane files carry no sink APIs: acks leave on the host port only', () => {
  const sinks = [
    'fetch(', 'XMLHttpRequest', 'WebSocket(', 'EventSource(',
    'localStorage', 'sessionStorage', 'indexedDB', 'navigator.clipboard',
    'clipboard.writeText', 'document.cookie', 'child_process',
    "from 'fs'", 'from "fs"', "from 'node:fs'", "from 'node:child_process'",
  ];
  for (const [index, source] of laneSources.entries()) {
    for (const sink of sinks) {
      assert.ok(!source.includes(sink), `sink ${sink} in lane file ${index}`);
    }
  }
  const posts = tileSource.match(/\.postMessage\(/g) || [];
  assert.equal(posts.length, 1, `postMessage sites (${posts.length})`);
});

test('lane files keep publication hygiene: no addresses, home paths or internal names', () => {
  const homeRoot = String.fromCharCode(47, 104, 111, 109, 101, 47);
  const usersRoot = String.fromCharCode(47, 85, 115, 101, 114, 115, 47);
  const internalA = String.fromCharCode(109, 101, 116, 97, 118, 105, 101, 119, 101, 114);
  const internalB = String.fromCharCode(104, 111, 108, 100, 105, 110, 103, 115);
  for (const [index, source] of laneSources.entries()) {
    const label = `lane file ${index}`;
    assert.doesNotMatch(source, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/, `${label}: address-shaped string`);
    assert.ok(!source.includes(homeRoot), `${label}: home path`);
    assert.ok(!source.includes(usersRoot), `${label}: users path`);
    assert.ok(!source.toLowerCase().includes(internalA), `${label}: internal name A`);
    assert.ok(!source.toLowerCase().includes(internalB), `${label}: internal name B`);
  }
});

test('tile integrates with the shared surface hosts through their default slot', () => {
  const hosts = [
    path.join(kitRoot, 'src', 'saas', 'SaasSurfaceView.vue'),
    path.join(kitRoot, 'src', 'multislot', 'AiSurfacePane.vue'),
  ];
  if (!hosts.every((file) => existsSync(file))) {
    assert.ok(true, 'skipped in the lane mirror: hosts merge after the room closes');
    return;
  }
  for (const file of hosts) {
    assert.ok(readFileSync(file, 'utf8').includes('<slot />'), `default slot in ${path.basename(file)}`);
  }
  assert.ok(!tileSource.includes('SaasSurfaceView'), 'tile imports no host (slot composition)');
  assert.ok(!tileSource.includes('AiSurfacePane'), 'tile imports no host (slot composition)');
  assert.ok(tileSource.includes('class="frame-tile"'), 'single slot-filling root');
});
