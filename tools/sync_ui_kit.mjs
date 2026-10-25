import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const metadata = 'KIT_SOURCE.json';
const excluded = new Set([metadata, 'node_modules', '.git']);

// A length-framed, path-sorted tree digest includes names and file bytes.
export async function kitDigest(root) {
  const hash = createHash('sha256');
  async function walk(relative) {
    const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(path.join(root, name));
        const key = Buffer.from(name);
        hash.update(`${key.length}:`).update(key).update(`${bytes.length}:`).update(bytes);
      } else throw new Error(`Unsupported entry: ${name}`);
    }
  }
  await walk('');
  return hash.digest('hex');
}

export async function verifyKit(root) {
  const record = JSON.parse(await fs.readFile(path.join(root, metadata), 'utf8'));
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const contentHash = await kitDigest(root);
  if (record.schema !== 'capsule-ui-kit-source/v1' || record.version !== pkg.version ||
      record.contentHash !== contentHash) throw new Error('Kit metadata/hash mismatch');
  return record;
}

export async function syncKit({ holdingsRoot, kitRepo, mode }) {
  if (!['--export', '--import'].includes(mode)) throw new Error('Expected --export or --import');
  const holdings = path.join(await fs.realpath(holdingsRoot), 'packages/capsule-ui-kit');
  const independent = path.join(await fs.realpath(kitRepo), 'packages/capsule-ui-kit');
  const source = mode === '--export' ? holdings : independent;
  const destination = mode === '--export' ? independent : holdings;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (await fs.realpath(path.dirname(destination)) !== path.dirname(destination)) {
    throw new Error('Destination ancestors must not be symlinks');
  }
  const destinationStat = await fs.lstat(destination).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (destinationStat?.isSymbolicLink()) throw new Error('Destination must not be a symlink');
  // Resolve ancestors before checking overlap, including paths reached through symlinks.
  const sourceReal = await fs.realpath(source);
  const destinationReal = await fs.realpath(destination).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return path.join(path.dirname(destination), path.basename(destination));
  });
  const ancestor = (a, b) => b === a || b.startsWith(`${a}${path.sep}`);
  if (ancestor(sourceReal, destinationReal) || ancestor(destinationReal, sourceReal)) {
    throw new Error('Source and destination overlap');
  }
  if (mode === '--import') await verifyKit(source);
  const contentHash = await kitDigest(source);
  const pkg = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || !pkg.version) throw new Error('Missing kit version');
  const record = { schema: 'capsule-ui-kit-source/v1', version: pkg.version,
    contentHash, algorithm: 'sha256-length-framed-tree', direction: mode.slice(2) };
  const staging = await fs.mkdtemp(path.join(path.dirname(destination), '.kit-sync-'));
  let backup;
  try {
    await fs.cp(source, staging, { recursive: true,
      filter: filename => !excluded.has(path.basename(filename)) });
    if (await kitDigest(staging) !== contentHash || await kitDigest(source) !== contentHash) {
      throw new Error('Source changed during sync');
    }
    await fs.writeFile(path.join(staging, metadata), `${JSON.stringify(record, null, 2)}\n`);
    await verifyKit(staging);
    try {
      backup = `${staging}.previous`;
      await fs.rename(destination, backup);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      backup = undefined;
    }
    try { await fs.rename(staging, destination); }
    catch (error) {
      if (backup) await fs.rename(backup, destination);
      throw error;
    }
    if (backup) await fs.rm(backup, { recursive: true });
    return record;
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, kitRepo, ...extra] = process.argv.slice(2);
  if (!kitRepo || extra.length) {
    console.error('Usage: node tools/sync_ui_kit.mjs --export|--import <kit-repo>');
    process.exitCode = 1;
  } else {
    try {
      const holdingsRoot = fileURLToPath(new URL('../', import.meta.url));
      console.log(JSON.stringify(await syncKit({ holdingsRoot, kitRepo, mode })));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
