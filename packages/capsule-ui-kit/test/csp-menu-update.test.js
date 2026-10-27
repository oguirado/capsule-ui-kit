import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, openBlock, createElementBlock, createVNode, h } from 'vue';
import { cleanMenuVNode } from '../src/workspace/cspMenu.js';

test('CSP menu adapter updates a compiled block component and removes it cleanly', () => {
  const renderer = createRenderer({
    createElement: tag => ({ tag, children: [], attrs: {} }),
    createText: text => ({ text }), createComment: text => ({ text }),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.text = text; },
    insert: (node, parent) => { parent.children.push(node); node.parent = parent; },
    remove: node => { node.parent.children.splice(node.parent.children.indexOf(node), 1); },
    parentNode: node => node.parent, nextSibling: () => null,
    patchProp: (node, key, old, value) => { node.attrs[key] = value; },
  });
  const Item = { props: ['label'], render() { return h('li', {}, this.label); } };
  const block = label => {
    openBlock();
    return createElementBlock('ul', { style: {} }, [createVNode(Item, { label }, null, 8, ['label'])]);
  };
  const root = { children: [] };
  renderer.render(cleanMenuVNode(block('First')), root);
  assert.equal(root.children[0].children[0].text, 'First');
  renderer.render(cleanMenuVNode(block('Second')), root);
  assert.equal(root.children[0].children[0].text, 'Second');
  assert.ok(!('style' in root.children[0].attrs));
  renderer.render(null, root);
  assert.equal(root.children.length, 0);
});
