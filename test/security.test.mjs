import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,mkdirSync,symlinkSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWindowOptions,createLayoutStore,resolveBundleFile,decideNavigation,bootStarterMain,CHANNELS,CONTENT_SECURITY_POLICY } from '../starter/electron/main.js';
test('window and protocol preserve sandbox and reject traversal, foreign URLs and symlinks',()=>{
 const options=createWindowOptions('/bundle/preload.cjs');
 assert.equal(options.webPreferences.sandbox,true);assert.equal(options.webPreferences.contextIsolation,true);assert.equal(options.webPreferences.nodeIntegration,false);
 assert.match(CONTENT_SECURITY_POLICY,/script-src 'self'/);assert.doesNotMatch(CONTENT_SECURITY_POLICY,/unsafe-eval|unsafe-inline/);
 const root=mkdtempSync(join(tmpdir(),'kit-protocol-'));
 try {writeFileSync(join(root,'index.html'),'ok');
 assert.equal(resolveBundleFile(root,'app://starter/index.html').ok,true);
 for(const url of ['https://foreign/index.html','app://starter/%2e%2e/private','app://starter/a%2fb','app://starter/%00']) assert.equal(resolveBundleFile(root,url).ok,false,url);
 symlinkSync(join(root,'index.html'),join(root,'link'));assert.equal(resolveBundleFile(root,'app://starter/link').ok,false);
 assert.equal(decideNavigation('https://foreign'),'deny');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('layout store rejects cross-scope, invalid and oversized input before writing',()=>{
 const root=mkdtempSync(join(tmpdir(),'kit-layout-'));
 try {const store=createLayoutStore({userData:root,profileId:'default'});assert.equal(store.load(),null);
 const raw=JSON.stringify({scope:store.scope});store.save(raw);assert.equal(store.load(),raw);
 for(const value of ['{', '{}', ' '.repeat(262145),JSON.stringify({scope:{...store.scope,product:'foreign'}})]) assert.throws(()=>store.save(value));
 assert.equal(store.load(),raw);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('IPC refuses foreign contents and child frames, admits the main frame',async()=>{
 const handlers=new Map(); const contents={mainFrame:{url:'app://starter/index.html'},setWindowOpenHandler(){},on(){},async loadURL(){}};
 const app={getAppPath:()=>new URL('../starter',import.meta.url).pathname,getPath:()=>tmpdir()};
 await bootStarterMain({app,BrowserWindow:class{constructor(){this.webContents=contents;} once(){}},ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)},protocol:{handle(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}}});
 const load=handlers.get(CHANNELS.load); assert.throws(()=>load({sender:{},senderFrame:contents.mainFrame}),/SENDER/);
 assert.throws(()=>load({sender:contents,senderFrame:{url:'app://starter/index.html'}}),/SENDER/);
 assert.doesNotThrow(()=>load({sender:contents,senderFrame:contents.mainFrame}));
});
