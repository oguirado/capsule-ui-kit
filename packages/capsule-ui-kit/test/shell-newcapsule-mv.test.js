import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import {
  capsuleCategories,
  filterCapsuleTypes,
  filterCapsuleTypesByCategory,
  normalizeCapsuleCatalog,
} from '../src/shell/NewCapsuleModel.js';

// The launcher accepts the host catalog entry shape (id, label,
// category, description, opensAs, footprint, icon, keywords) with kinds
// as pure host data and icons resolved through the type-icon slot with
// a token-backed fallback glyph.

const here = path.dirname(fileURLToPath(import.meta.url));
const dialogSource = readFileSync(path.resolve(here, '../src/shell/NewCapsuleDialog.vue'), 'utf8');
const iconSource = readFileSync(path.resolve(here, '../src/shell/SidebarIcon.vue'), 'utf8');

/** Five host entries in the documented catalog shape. */
const hostCatalog = [
  { id: 'web-viewer', label: 'Web Viewer', category: 'Browse', description: 'Open an isolated browsing surface', opensAs: 'tab', footprint: '~6 MB heap', icon: 'dashboard', keywords: ['web', 'browse'] },
  { id: 'native-program', label: 'Native Program', category: 'Work', description: 'Run an installed program', opensAs: 'tab', footprint: '~9 MB heap', icon: 'box' },
  { id: 'remote-desktop', label: 'Remote Desktop', category: 'Work', description: 'Attach a remote desktop', opensAs: 'split', footprint: '~14 MB heap', keywords: ['remote'] },
  { id: 'host-app', label: 'Host App', category: '', description: 'Embed a host application', opensAs: 'floating', footprint: '~11 MB heap', icon: 'grid' },
  { id: 'nested-viewer', label: 'Nested Viewer', category: 'Work', description: '', opensAs: 'split', footprint: '~7 MB heap' },
];

test('launcher accepts the host catalog entry shape in host order', () => {
  const types = normalizeCapsuleCatalog(hostCatalog);
  assert.deepEqual(types.map((t) => t.id), ['web-viewer', 'native-program', 'remote-desktop', 'host-app', 'nested-viewer']);
  assert.deepEqual(types[0], {
    id: 'web-viewer',
    label: 'Web Viewer',
    category: 'Browse',
    description: 'Open an isolated browsing surface',
    opensAs: 'tab',
    footprint: '~6 MB heap',
    keywords: ['web', 'browse'],
    icon: 'dashboard',
  });
  assert.deepEqual(types[2], {
    id: 'remote-desktop',
    label: 'Remote Desktop',
    category: 'Work',
    description: 'Attach a remote desktop',
    opensAs: 'split',
    footprint: '~14 MB heap',
    keywords: ['remote'],
  });
  assert.equal('icon' in types[2], false);
  assert.equal(types[4].description, '');
});

test('launcher tolerates host entries that omit optional fields', () => {
  // Host-side defaults map in the tolerant-builder shape: the kit takes
  // the mapped entries as-is.
  const DESCRIPTIONS = { 'plain-1': 'Mapped summary' };
  const ICONS = { 'plain-1': 'cog' };
  const FOOTPRINTS = { 'plain-1': '~2 MB heap' };
  const mapped = [
    { id: 'plain-1', label: 'Plain One', description: DESCRIPTIONS['plain-1'], icon: ICONS['plain-1'], footprint: FOOTPRINTS['plain-1'] },
    { id: 'plain-2', label: 'Plain Two', opensAs: 'popout', icon: '  ', keywords: ['ok', 7, ''] },
    { label: 'Missing id' },
    null,
  ];
  assert.deepEqual(normalizeCapsuleCatalog(mapped), [
    {
      id: 'plain-1', label: 'Plain One', category: '', description: 'Mapped summary', opensAs: 'tab', footprint: '~2 MB heap', keywords: [], icon: 'cog',
    },
    {
      id: 'plain-2', label: 'Plain Two', category: '', description: '', opensAs: 'tab', footprint: '', keywords: ['ok'],
    },
  ]);
});

test('catalog kinds stay host data: cards derive ids and anchors from type ids', () => {
  assert.ok(dialogSource.includes('`shell/new-capsule/card-${type.id}`'), 'dynamic card id');
  assert.ok(dialogSource.includes('typeAnchor(type.id)'), 'dynamic anchor');
  assert.ok(dialogSource.includes('typeAnchorAlias(type.id)'), 'dynamic anchor alias');
  assert.ok(dialogSource.includes('shell/navigation/new-capsule-type-'), 'kind anchor prefix');
  assert.ok(dialogSource.includes('normalizeCapsuleCatalog(props.types)'), 'catalog from host prop');
  for (const entry of hostCatalog) {
    assert.ok(matchControlFamily(`shell/navigation/new-capsule-type-${entry.id}`), `family ${entry.id}`);
    assert.ok(matchControlFamily(`dialog/new-capsule/type-${entry.id}`), `dialog family ${entry.id}`);
  }
});

test('card icons resolve through the type-icon slot with a token-backed fallback', () => {
  assert.ok(dialogSource.includes('name="type-icon"'), 'slot type-icon');
  assert.ok(dialogSource.includes(`:name="type.icon ?? 'marker'"`), 'host glyph with fallback');
  assert.ok(iconSource.includes('aria-hidden="true"'), 'decorative icon');
  assert.ok(iconSource.includes('stroke="currentColor"'), 'token context color');
  assert.ok(iconSource.includes('fill="currentColor"'), 'token fill glyph');
  assert.ok(iconSource.includes('var(--cuk-'), 'token size');
  assert.ok(iconSource.includes("'marker'"), 'neutral fallback glyph');
});

test('cards expose accessible names, placement and footprint with keywords kept out of view', () => {
  assert.ok(dialogSource.includes('selectName(type)'), 'card accessible name builder');
  assert.ok(dialogSource.includes('`Select ${type.label}`'), 'card name text');
  assert.ok(dialogSource.includes('aria-pressed'), 'card pressed state');
  assert.ok(dialogSource.includes('{{ type.label }}'), 'card label');
  assert.ok(dialogSource.includes('{{ type.description }}'), 'card description');
  assert.ok(dialogSource.includes('{{ type.footprint }}'), 'card footprint');
  assert.ok(dialogSource.includes('Opens as: '), 'placement chip');
  assert.ok(!dialogSource.includes('type.keywords'), 'keywords never rendered');
});

test('host catalog filters and groups through the kit model', () => {
  const types = normalizeCapsuleCatalog(hostCatalog);
  assert.deepEqual(filterCapsuleTypes(types, 'remote').map((t) => t.id), ['remote-desktop']);
  assert.deepEqual(filterCapsuleTypes(types, 'browse').map((t) => t.id), ['web-viewer']);
  assert.deepEqual(filterCapsuleTypesByCategory(types, 'work').map((t) => t.id), ['native-program', 'remote-desktop', 'nested-viewer']);
  assert.deepEqual(capsuleCategories(types), [
    { id: 'browse', label: 'Browse', count: 1 },
    { id: 'work', label: 'Work', count: 3 },
    { id: 'uncategorised', label: 'Uncategorised', count: 1 },
  ]);
});
