import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// PL4 P4: the terminal output stays inside the panel. The live terminal
// view flexes into the room left by the accessible transcript, so the
// fitted terminal plus transcript never extend past the panel edge.
// Kit-local reads only.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');

const PANEL_PATH = path.resolve(__dirname, '../src/side-terminal/SideTerminalPanel.vue');
const source = fs.readFileSync(PANEL_PATH, 'utf8');
const { descriptor, errors } = compilerSfc.parse(source, { filename: 'SideTerminalPanel.vue' });
assert.equal(errors.length, 0, `SideTerminalPanel.vue parse errors: ${errors.map((e) => e.message).join('; ')}`);
const css = descriptor.styles.map((block) => block.content).join('\n');

test('pl4 P4: panel still compiles as plain JS with strict template bindings', () => {
  const compiledScript = compilerSfc.compileScript(descriptor, { id: 'side-terminal-pl4' });
  const compiledTemplate = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename: 'SideTerminalPanel.vue',
    id: 'side-terminal-pl4',
    compilerOptions: { bindingMetadata: compiledScript.bindings },
  });
  assert.equal(compiledTemplate.errors.length, 0, `template errors: ${JSON.stringify(compiledTemplate.errors)}`);
});

test('pl4 P4: live view flexes into the room left by the transcript', () => {
  const tpl = descriptor.template.content;
  assert.ok(
    /<div class="cui-side-terminal__viewport">\s*<TerminalView[\s\S]*?\/>\s*<\/div>/.test(tpl),
    'TerminalView wrapped in the flex viewport'
  );
  const viewport = css.match(/\.cui-side-terminal__viewport\s*\{[^}]*\}/);
  assert.ok(viewport, 'viewport rule required');
  assert.ok(viewport[0].includes('flex: 1 1 auto'), 'viewport takes the remaining room');
  assert.ok(viewport[0].includes('min-height: 0'), 'viewport shrinks inside the session');
  assert.ok(viewport[0].includes('overflow: hidden'), 'viewport clips the refit overshoot');
  const transcript = css.match(/\.cui-side-terminal__transcript\s*\{[^}]*\}/);
  assert.ok(transcript, 'transcript rule required');
  assert.ok(transcript[0].includes('flex: none'), 'transcript keeps its reserved room');
  assert.ok(transcript[0].includes('max-height: 25%'), 'transcript stays capped');
  const session = css.match(/\.cui-side-terminal__session\s*\{[^}]*\}/);
  assert.ok(session, 'session rule required');
  assert.ok(session[0].includes('height: 100%'), 'session still fills the views column');
});
