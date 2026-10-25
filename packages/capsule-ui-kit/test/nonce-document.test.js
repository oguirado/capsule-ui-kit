import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerminalDocument } from '../src/terminal/nonceDocument.js';

test('terminal accepts a consuming product style nonce without a product name', () => {
  const attributes = new Map();
  const document = {
    querySelector(selector) {
      assert.equal(selector, 'meta[name$="-style-nonce"]');
      return { getAttribute: name => name === 'content' ? 'document-nonce' : null };
    },
    createElement() {
      return { setAttribute: (name, value) => attributes.set(name, value) };
    },
  };
  createTerminalDocument(document).createElement('style');
  assert.equal(attributes.get('nonce'), 'document-nonce');
});

test('terminal refuses a missing style nonce', () => {
  assert.throws(() => createTerminalDocument({ querySelector: () => null }),
    /Terminal style nonce unavailable/);
});
