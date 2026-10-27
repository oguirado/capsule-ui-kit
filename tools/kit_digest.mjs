// Verify-only check of the kit package digest (algorithm "sha256-length-framed-tree").
// Recomputes the digest of packages/capsule-ui-kit and compares it with KIT_SOURCE.json contentHash.
// Usage: node tools/kit_digest.mjs [--root <dir>] [--print]
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = new Set(['KIT_SOURCE.json', 'node_modules', '.git']);

export function kitDigest(root) {
  const hash = createHash('sha256');
  const walk = (dir, rel) => {
    const names = readdirSync(dir).filter((n) => !SKIP.has(n))
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    for (const name of names) {
      const abs = join(dir, name);
      const relName = rel ? `${rel}/${name}` : name;
      const st = lstatSync(abs);
      if (st.isDirectory()) walk(abs, relName);
      else if (st.isFile()) {
        const nameBytes = Buffer.from(relName, 'utf8');
        const bytes = readFileSync(abs);
        hash.update(`${nameBytes.length}:`);
        hash.update(nameBytes);
        hash.update(`${bytes.length}:`);
        hash.update(bytes);
      } else throw new Error(`kit_digest: refusing non-regular entry ${relName}`);
    }
  };
  walk(root, '');
  return hash.digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let root = fileURLToPath(new URL('../packages/capsule-ui-kit/', import.meta.url));
  let print = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && i + 1 < args.length) root = args[++i];
    else if (args[i] === '--print') print = true;
    else { console.error(`kit_digest: unknown option ${args[i]}`); process.exit(2); }
  }
  const actual = kitDigest(root);
  if (print) { console.log(actual); process.exit(0); }
  const expected = JSON.parse(readFileSync(join(root, 'KIT_SOURCE.json'), 'utf8')).contentHash;
  if (actual !== expected) {
    console.error(`kit_digest: contentHash mismatch: KIT_SOURCE.json ${expected}, tree ${actual}`);
    process.exit(1);
  }
  console.log(`KIT_DIGEST_OK ${actual}`);
}
