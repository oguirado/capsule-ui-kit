import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('public kit loads unchanged outside the consumer tree and imports no consumer or node runtime', async () => {
  const scratch=mkdtempSync(join(tmpdir(),'capsule-kit-portable-'));
  try {
    cpSync(root,join(scratch,'kit'),{recursive:true,filter:path=>!relative(root,path).split('/').includes('node_modules')});
    const kit=await import(pathToFileURL(join(scratch,'kit/index.js')).href);
    assert.equal(typeof kit.projection.createPublicProjectionCoordinator,'function');
    assert.equal(typeof kit.layout.createLayoutProfileController,'function');
    assert.equal(typeof kit.registry.createControlRegistry,'function');
    const manifest=JSON.parse(readFileSync(join(scratch,'kit/package.json'),'utf8'));
    for(const value of Object.values(manifest.exports)) {
      const path=typeof value==='string'?value:value.default;
      assert.ok(readFileSync(join(scratch,'kit',path)).byteLength>0);
    }
    const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
      const path=join(dir,entry.name);
      if(entry.isDirectory())walk(path);
      else if(/\.(js|vue)$/.test(path)) {
        const code=readFileSync(path,'utf8');
        assert.doesNotMatch(code,/from\s+['"][^'"]*(?:app\/shell|src\/renderer|\u0068oldings\.owner|node:)/i);
      }
    }};
    walk(join(scratch,'kit/src'));
  } finally {rmSync(scratch,{recursive:true,force:true});}
});
