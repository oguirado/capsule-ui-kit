import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,cpSync,rmSync,unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
test('router rejects a removed kit file instead of retaining stale full coverage',()=>{
 const source=fileURLToPath(new URL('../',import.meta.url));const scratch=mkdtempSync(join(tmpdir(),'kit-router-negative-'));
 try {
  for(const entry of ['packages','router','tools']) cpSync(join(source,entry),join(scratch,entry),{recursive:true,filter:p=>!relative(source,p).split('/').some(x=>['node_modules','__pycache__'].includes(x))});
  unlinkSync(join(scratch,'packages/capsule-ui-kit/index.js'));
  const result=spawnSync('python3',['tools/router_index.py','--check'],{cwd:scratch,encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Stale or incomplete router/);
 } finally {rmSync(scratch,{recursive:true,force:true});}
});
