import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256 } from '../src/agent/sha256.js';
test('portable SHA-256 agrees with native implementation across UTF-8 and padding boundaries', () => {
  for (const text of ['', 'abc', 'capsule 雪 🎮', ...[55,56,63,64,65,127,128,129,4096].map(n=>'x'.repeat(n))]) {
    assert.equal(sha256(text),createHash('sha256').update(text).digest('hex'));
  }
});
