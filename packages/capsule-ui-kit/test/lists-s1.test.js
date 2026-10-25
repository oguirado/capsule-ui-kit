import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['S1FilterTabs.vue', 'S1InboxItem.vue', 'S1TimelineControls.vue', 'S1MilestoneCard.vue', 'S1TimelineLegend.vue'];
const sources = new Map(FILES.map((file) => [file, readFileSync(path.resolve(here, '../src/lists/' + file), 'utf8')]));
const indexSource = readFileSync(path.resolve(here, '../src/lists/index.js'), 'utf8');

function loadCompilerSfc() {
  for (const spec of ['@vue/compiler-sfc', '@vue/compiler-sfc']) {
    try {
      return require(spec);
    } catch {
      // try next candidate
    }
  }
  throw new Error('Unable to resolve @vue/compiler-sfc');
}

test('lists compile against the installed Vue compiler as plain JS (no lang="ts")', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  for (const [file, source] of sources) {
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: 'lists-s1-' + file });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: file,
      id: 'lists-s1-' + file,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
  }
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('lists styles use tokens only (no literal colors or px/rem sizes)', () => {
  const { parse } = loadCompilerSfc();
  for (const [file, source] of sources) {
    const { descriptor } = parse(source, { filename: file });
    assert.ok(descriptor.styles.length > 0, file);
    for (const style of descriptor.styles) {
      assert.equal(rawStyle(style.content), false, file);
    }
  }
});

test('filter tabs expose the tab strip contract with roving ids and roles', () => {
  const source = sources.get('S1FilterTabs.vue') ?? '';
  for (const prop of ['tabs', 'activeId', 'idPrefix', 'controlsId', 'label']) {
    assert.ok(source.includes(prop), 'prop ' + prop);
  }
  assert.ok(source.includes("'select'"), 'event select');
  assert.ok(source.includes('role="tablist"'), 'role tablist');
  assert.ok(source.includes('role="tab"'), 'role tab');
  assert.ok(source.includes('aria-selected'), 'aria-selected');
  assert.ok(source.includes('aria-controls'), 'aria-controls');
  assert.ok(source.includes(':tabindex="tabIndex(index)"'), 'roving tabindex');
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter']) {
    assert.ok(source.includes(key), 'key ' + key);
  }
  assert.ok(source.includes(':tab:'), 'stable tab id prefix');
});

test('inbox item exposes the feed row contract with tags and an actions slot', () => {
  const source = sources.get('S1InboxItem.vue') ?? '';
  for (const prop of ['title', 'excerpt', 'meta', 'unread', 'tags']) {
    assert.ok(source.includes(prop), 'prop ' + prop);
  }
  assert.ok(source.includes('name="actions"'), 'slot actions');
  assert.ok(source.includes('s1-inbox-item-dot'), 'read dot');
  assert.ok(source.includes('s1-inbox-item-read'), 'read state');
  for (const tone of ['critical', 'info', 'neutral', 'warning']) {
    assert.ok(source.includes('s1-inbox-item-tag-' + tone), 'tone ' + tone);
  }
  assert.ok(source.includes('s1-inbox-item-meta'), 'meta');
  assert.ok(source.includes('s1-inbox-item-excerpt'), 'excerpt');
});

test('timeline controls expose the ribbon contract with stable button ids', () => {
  const source = sources.get('S1TimelineControls.vue') ?? '';
  for (const prop of ['buttons', 'cycleKey', 'cycleValue', 'flagLabel', 'label', 'speedLabel']) {
    assert.ok(source.includes(prop), 'prop ' + prop);
  }
  assert.ok(source.includes("'activate'"), 'event activate');
  assert.ok(source.includes('role="group"'), 'role group');
  assert.ok(source.includes('data-intent'), 'data-intent');
  assert.ok(source.includes(':id="button.id"'), 'verbatim button id');
  assert.ok(source.includes('aria-pressed'), 'aria-pressed');
  assert.ok(source.includes('s1-timeline-segment'), 'speed segment');
  assert.ok(source.includes('s1-timeline-advance'), 'advance button');
  assert.ok(source.includes('s1-timeline-cycle'), 'cycle readout');
  assert.ok(source.includes('s1-timeline-flag'), 'flag chip');
});

test('milestone card exposes the card contract with a clamped progressbar', () => {
  const source = sources.get('S1MilestoneCard.vue') ?? '';
  for (const prop of ['title', 'meta', 'metaTone', 'percent', 'tone', 'cardId']) {
    assert.ok(source.includes(prop), 'prop ' + prop);
  }
  assert.ok(source.includes('role="progressbar"'), 'role progressbar');
  for (const attr of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) {
    assert.ok(source.includes(attr), attr);
  }
  assert.ok(source.includes('Math.min(100, Math.max(0,'), 'percent clamp');
  for (const tone of ['success', 'primary', 'warning']) {
    assert.ok(source.includes('s1-milestone-card-fill-' + tone), 'tone ' + tone);
  }
});

test('timeline legend exposes the legend contract with tone dots', () => {
  const source = sources.get('S1TimelineLegend.vue') ?? '';
  for (const prop of ['entries', 'tickLabel', 'label']) {
    assert.ok(source.includes(prop), 'prop ' + prop);
  }
  assert.ok(source.includes('role="list"'), 'role list');
  assert.ok(source.includes('role="listitem"'), 'role listitem');
  for (const tone of ['success', 'primary', 'warning', 'muted']) {
    assert.ok(source.includes('s1-timeline-legend-dot-' + tone), 'tone ' + tone);
  }
});

test('lists index re-exports every list component', () => {
  for (const name of ['S1FilterTabs', 'S1InboxItem', 'S1TimelineControls', 'S1MilestoneCard', 'S1TimelineLegend']) {
    assert.ok(indexSource.includes(name), name);
    assert.ok(indexSource.includes(`./${name}.vue`), name + ' path');
  }
});

test('lists carry no consumer names and import nothing', () => {
  for (const [file, source] of sources) {
    assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(source), file);
    const imports = Array.from(source.matchAll(/from '([^']+)'/g)).map((m) => m[1]);
    assert.deepEqual(imports, [], file);
  }
  assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(indexSource), 'index.js');
  const indexImports = Array.from(indexSource.matchAll(/from '([^']+)'/g)).map((m) => m[1]);
  assert.equal(indexImports.length, 5, 'index.js');
  for (const spec of indexImports) {
    assert.ok(spec.endsWith('.vue'), 'index.js: import ' + spec);
  }
});
