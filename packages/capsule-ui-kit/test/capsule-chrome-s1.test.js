/**
 * @file S1 capsule chrome suite for CapsulePanel.vue (kit).
 * Grounded in S1_COMPONENT_SPECS.md §3 (capsule header) and §8 (tabs): 36px header, 15px
 * glyph + headline-sm title, Live/Active/Waiting/Refused status chips, 4 ghost window controls
 * with 13px glyphs, 8px shell radius — token-only CSS, OpenVue only through kit wrappers.
 * Window behavior (hide/float/maximize/dock/close ids, anchors, aria) is preserved verbatim.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const PANEL_PATH = path.resolve(__dirname, '../src/capsules/CapsulePanel.vue');
const CAPSULES_DIR = path.resolve(__dirname, '../src/capsules');

function loadCompilerSfc() {
  const candidates = [
    '@vue/compiler-sfc',
    '@vue/compiler-sfc',
  ];
  for (const spec of candidates) {
    try {
      return require(spec);
    } catch {
      // try next candidate
    }
  }
  throw new Error('Unable to resolve @vue/compiler-sfc');
}

const compilerSfc = loadCompilerSfc();
const panelSource = fs.readFileSync(PANEL_PATH, 'utf8');
const parsedPanel = compilerSfc.parse(panelSource, { filename: 'CapsulePanel.vue' });
if (parsedPanel.errors.length > 0) throw new Error(`CapsulePanel.vue parse: ${parsedPanel.errors[0].message}`);
const panelScriptUrl =
  'data:text/javascript;base64,' + Buffer.from(parsedPanel.descriptor.script.content, 'utf8').toString('base64');
const panelModule = await import(panelScriptUrl);
const { CAPSULE_CHIP_VARIANTS, resolveCapsuleChipVariant, chipStatusForVariant } = panelModule;
const panelTemplate = parsedPanel.descriptor.template.content;

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('chip variant mapping: S1 Live/Active/Waiting/Refused set with an idle fallback', () => {
  assert.deepEqual([...CAPSULE_CHIP_VARIANTS], ['live', 'active', 'waiting', 'refused', 'idle']);
  assert.ok(Object.isFrozen(CAPSULE_CHIP_VARIANTS));
  assert.equal(resolveCapsuleChipVariant('Live'), 'live');
  assert.equal(resolveCapsuleChipVariant('Active'), 'active');
  assert.equal(resolveCapsuleChipVariant('Waiting Decision'), 'waiting');
  assert.equal(resolveCapsuleChipVariant('Waiting for game'), 'waiting');
  assert.equal(resolveCapsuleChipVariant('Refused: OP_LIMIT'), 'refused');
  assert.equal(resolveCapsuleChipVariant('Error'), 'refused');
  assert.equal(resolveCapsuleChipVariant('  Live  '), 'live');
  assert.equal(resolveCapsuleChipVariant('Live now'), 'idle');
  assert.equal(resolveCapsuleChipVariant(''), 'idle');
  assert.equal(resolveCapsuleChipVariant(null), 'idle');
  assert.equal(resolveCapsuleChipVariant(undefined), 'idle');
  assert.equal(resolveCapsuleChipVariant(42), 'idle');
  assert.equal(chipStatusForVariant('live'), 'success');
  assert.equal(chipStatusForVariant('refused'), 'error');
  assert.equal(chipStatusForVariant('active'), 'info');
  assert.equal(chipStatusForVariant('waiting'), 'info');
  assert.equal(chipStatusForVariant('idle'), 'info');
});

test('S1 header chrome: UiToolbar wrapper, glyph, title and chip bindings', () => {
  assert.ok(panelSource.includes("import UiToolbar from '../ui/UiToolbar.vue'"));
  assert.ok(panelTemplate.includes('<UiToolbar'));
  assert.ok(panelTemplate.includes(':label="`Capsule chrome for ${titleText}`"'));
  assert.equal(/<Toolbar[\s>]/.test(panelTemplate), false);
  assert.equal(panelTemplate.includes('</Toolbar>'), false);
  assert.ok(panelTemplate.includes('cuk-capsule-panel__title-cluster'));
  assert.ok(panelTemplate.includes('cuk-capsule-panel__glyph'));
  assert.ok(panelTemplate.includes(':data-chip-variant="chipVariant"'));
  assert.ok(panelTemplate.includes(`v-if="chipVariant === 'live'"`));
  assert.ok(panelTemplate.includes('cuk-capsule-panel__chip-dot'));
  assert.ok(panelTemplate.includes(':status="chipStatus"'));
  const compiled = compilerSfc.compileTemplate({
    source: panelTemplate,
    filename: 'CapsulePanel.vue',
    id: 'capsule-chrome-s1',
  });
  assert.equal(compiled.errors.length, 0);
});

test('window controls: stable ids, anchors and aria preserved; S1 order; icon glyphs', () => {
  for (const action of ['hide', 'float', 'maximize']) {
    assert.ok(panelTemplate.includes(`window-${action}-\${resolvedInstanceId}\``), `window ${action} id`);
    assert.ok(panelTemplate.includes(`capsule/\${capsuleId}/${action}\``), `window ${action} anchor`);
    assert.ok(panelTemplate.includes(`windowAction('${action}')`), `window ${action} binding`);
  }
  const order = ['window-hide-', 'window-float-', 'window-maximize-'].map((id) => panelTemplate.indexOf(id));
  assert.ok(order.every((index) => index >= 0));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'S1 order: minimize, pop-out, maximize');
  assert.ok(panelTemplate.includes('cuk-capsule-panel__icon-btn'));
  assert.ok(panelTemplate.includes('<svg viewBox="0 0 16 16"'));
  assert.ok((panelTemplate.match(/<svg viewBox="0 0 16 16"/g) || []).length >= 8);
  for (const label of ['Hide ${titleText}', 'Float ${titleText}']) {
    assert.ok(panelTemplate.includes(label), `aria label ${label}`);
  }
  assert.ok(
    panelTemplate.includes("'Restore' : 'Maximize'} ${titleText}"),
    'maximize/restore toggle aria label'
  );
  assert.ok(panelTemplate.includes(':id="domIds.dockBack"'));
  assert.ok(panelTemplate.includes(':id="domIds.close"'));
});

test('capsule styles: token-only, scoped, S1 geometry, no vendor leaks', () => {
  assert.ok(parsedPanel.descriptor.styles.length >= 1);
  for (const styleBlock of parsedPanel.descriptor.styles) {
    assert.equal(styleBlock.scoped, true);
    const result = compilerSfc.compileStyle({
      source: styleBlock.content,
      filename: 'CapsulePanel.vue',
      id: 'data-v-capsulechromes1',
      scoped: true,
    });
    assert.equal(result.errors.length, 0);
    assert.ok(styleBlock.content.includes('--cuk-'));
    assert.equal(rawStyle(styleBlock.content), false, 'no literal colors or px/rem sizes');
    assert.equal(/--(dv|p|px|vscode)-/.test(styleBlock.content), false, 'no vendor CSS variables');
  }
  const css = parsedPanel.descriptor.styles.map((block) => block.content).join('\n');
  assert.ok(css.includes('--cuk-component-s1-capsule-header-height'), '36px header token');
  assert.ok(css.includes('--cuk-semantic-border-subtle'), 'S1 border token');
  assert.ok(css.includes('--cuk-semantic-radius-lg'), '8px shell radius token');
  assert.ok(css.includes('--cuk-semantic-typography-roles-headline-sm-font-size'), 'headline-sm title');
  assert.ok(css.includes('--cuk-semantic-typography-font-size-md'), '13px control glyphs');
  for (const variant of ['live', 'active', 'waiting', 'refused', 'idle']) {
    assert.ok(css.includes(`[data-chip-variant="${variant}"]`), `chip variant ${variant}`);
  }
  assert.ok(css.includes('--cuk-semantic-status-success-surface'), 'live tint');
  assert.ok(css.includes('--cuk-semantic-status-warning-surface'), 'waiting tint');
  assert.ok(css.includes('--cuk-semantic-status-error-surface'), 'refused tint');
  assert.ok(css.includes('--cuk-semantic-accent-tertiary'), 'active tint');
  assert.ok(css.includes('--cuk-semantic-surface-interactive'), 'ghost hover');
});

test('import boundary: no direct openvue imports inside src/capsules', () => {
  const files = fs.readdirSync(CAPSULES_DIR).filter((file) => file.endsWith('.vue'));
  assert.ok(files.length >= 1);
  for (const file of files) {
    const source = fs.readFileSync(path.join(CAPSULES_DIR, file), 'utf8');
    assert.equal(/from\s+['"]openvue\//.test(source), false, `${file} must use kit wrappers`);
  }
});

