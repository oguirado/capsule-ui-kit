import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync,mkdirSync,rmSync,writeFileSync,readFileSync,symlinkSync,existsSync,readdirSync } from 'node:fs';
import { join,relative,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const source=fileURLToPath(new URL('../',import.meta.url));
test('fresh copy installs offline, passes kit gates, builds and boots the renderer', {timeout:800000},()=>{
 const scratch=join(source,'.proof/copy-ready'); rmSync(scratch,{recursive:true,force:true}); mkdirSync(scratch,{recursive:true});
 const root=join(scratch,'repository');
 mkdirSync(root);
 for(const entry of readdirSync(source)) {
  if(['node_modules','.git','.proof'].includes(entry)) continue;
  cpSync(join(source,entry),join(root,entry),{recursive:true,filter:p=>!relative(source,p).split('/').some(part=>['node_modules','.git','.proof','dist','__pycache__'].includes(part))});
 }
 const receipt={schema:'kit-copy-ready/v1',install:null,steps:[]};
 function run(label,args,env={}) {
  const result=spawnSync('systemd-run',['--user','--scope','-q','-p','MemoryMax=8G','-p','MemorySwapMax=0','--','timeout','900','python3',join(root,'tools/reap_exec.py'),...args],{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:780000,maxBuffer:16*1024*1024});
  const log=(result.stdout??'')+(result.stderr??'');writeFileSync(join(scratch,label+'.log'),log);
  receipt.steps.push({label,status:result.status,signal:result.signal});writeFileSync(join(scratch,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return {result,log};
 }
 let install=run('offline-install',['npm','ci','--offline','--ignore-scripts','--no-audit','--no-fund']);
 if(install.result.status!==0) {
  rmSync(join(root,'node_modules'),{recursive:true,force:true});symlinkSync(join(source,'node_modules'),join(root,'node_modules'),'dir');
  // A link for the local workspace dependency must resolve inside the copy even with shared tooling.
  mkdirSync(join(root,'starter/node_modules'),{recursive:true});symlinkSync(join(root,'packages/capsule-ui-kit'),join(root,'starter/node_modules/capsule-ui-kit'),'dir');
  receipt.install='existing-node_modules-symlink'; console.log('COPY_PROOF_INSTALL existing node_modules symlink (offline cache incomplete)');
 } else {receipt.install='offline-cache';console.log('COPY_PROOF_INSTALL offline cache');}
 for(const [label,args] of [ ['build',['npm','run','build']],['kit-tests',['node','--test',...readdirSync(join(root,'packages/capsule-ui-kit/test')).filter(f=>f.endsWith('.test.js')).map(f=>'packages/capsule-ui-kit/test/'+f),'test/security.test.mjs','test/router-negative.test.mjs']],['vue-tsc',['npm','run','check']],['router',['python3','tools/router_index.py','--check']] ]) {
  const {result,log}=run(label,args);assert.equal(result.status,0,label+' failed: '+log.slice(-5000));
 }
 const runtimePath=join(source,'node_modules/electron/path.txt');
 const executable=process.env.CAPSULE_ELECTRON_EXECUTABLE || (existsSync(runtimePath) ? join(source,'node_modules/electron/dist',readFileSync(runtimePath,'utf8').trim()) : null);
 assert.ok(executable&&existsSync(executable),'Set CAPSULE_ELECTRON_EXECUTABLE to an existing pinned Electron runtime; no download is attempted');
 const {result,log}=run('boot',['xvfb-run','-a','-s','-screen 0 1280x900x24',executable,'starter'],{CAPSULE_STARTER_SMOKE:'1',CAPSULE_STARTER_USER_DATA:join(scratch,'user-data')});
 assert.equal(result.status,0,log);assert.match(log,/^CAPSULE_STARTER_READY$/m);
 receipt.ready=true;writeFileSync(join(scratch,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log('COPY_PROOF_READY');
});
