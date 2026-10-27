/** Real DockWorkspace / dockview DOM regression; no shallow vendor boundary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

const kit = fileURLToPath(new URL('../', import.meta.url));
const kitRequire = createRequire(import.meta.url);
const vueRuntime = kitRequire.resolve('vue/dist/vue.runtime.esm-bundler.js');

test('MV-2 live: every dock tab has stable registered identity after add, move, restore and float', {timeout:120000}, async () => {
  const {build} = await import(pathToFileURL(kitRequire.resolve('vite')).href);
  const {default: vue} = await import(pathToFileURL(kitRequire.resolve('@vitejs/plugin-vue')).href);
  const base = {
    base:'./', plugins:[vue(), {
      name:'kwd-tab-identity-must-fail',
      transform(code, id) {
        // Explicit negative-control run removes only the identity binding.
        if (process.env.KWD_TEST_MUTATE_TAB_IDENTITY === '1' && id.endsWith('/dockTabIdentity.js')) {
          return 'export function bindDockTabIdentities() {}';
        }
      },
    }],
    resolve:{dedupe:['vue','dockview-vue','dockview-core'],alias:{
      vue:vueRuntime,
      'dockview-vue':dirname(kitRequire.resolve('dockview-vue/package.json')),
      'dockview-core':dirname(kitRequire.resolve('dockview-core/package.json')),
    }},
    define:{__VUE_OPTIONS_API__:true,__VUE_PROD_DEVTOOLS__:false,__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:false},
    build:{modulePreload:false},
  };
  const scratch = mkdtempSync(join(tmpdir(), 'kwd-dock-live-'));
  try {
    writeFileSync(join(scratch, 'index.html'), '<html><body><div id="app"></div><script type="module" src="/entry.js"></script></body></html>');
    writeFileSync(join(scratch, 'entry.js'), `import {createApp} from ${JSON.stringify(vueRuntime)};import App from './App.vue';createApp(App).mount('#app');`);
    writeFileSync(join(scratch, 'App.vue'), `<script setup>
import {ref,defineComponent,h} from 'vue';
import DockWorkspace from ${JSON.stringify(join(kit, 'src/workspace/DockWorkspace.vue'))};
import {matchControlFamily} from ${JSON.stringify(join(kit, 'src/agent/controlRegistry.js'))};
const mounted = ref(true);
const scope = {product:'probe',profileId:'profile-neutral',workspaceId:'workspace-neutral'};
const storage = {readRaw:async()=>null,writeAtomic:async()=>{}};
const Panel = defineComponent({render:()=>h('div','Panel')});
const components = Object.fromEntries(['CapsulePanel','FleetPanel','InspectorPanel','AlertBoard','TimelinePanel','HelpSettingsPanel','MissingPanel'].map(id=>[id,Panel]));
const pause = () => new Promise(r=>setTimeout(r,30));
function check(value,label){if(!value)throw new Error(label);}
async function settle(){await pause();await new Promise(requestAnimationFrame);await pause();}
function inventory(api){
 const tabs=[...document.querySelectorAll('.dv-tab[data-tab-panel-id]')];
 check(tabs.length===api.panels.length,'every panel has tab');
 check(new Set(tabs.map(t=>t.id)).size===tabs.length,'unique tab IDs');
 for(const tab of tabs){
  const panelId=tab.dataset.tabPanelId;
  check(tab.id==='workspace-tab-'+encodeURIComponent(panelId),'stable tab ID '+panelId);
  check(tab.dataset.semanticAnchor==='workspace/tab/'+encodeURIComponent(panelId),'anchor '+panelId);
  check(matchControlFamily(tab.dataset.semanticAnchor)?.allowedRoles.includes('tab'),'registry '+panelId);
  const content=document.getElementById(tab.getAttribute('aria-controls'));
  if(tab.getAttribute('aria-selected')==='true')check(content?.getAttribute('aria-labelledby')===tab.id,'tabpanel reference '+panelId);
 }
 return Object.fromEntries(tabs.map(t=>[t.dataset.tabPanelId,t.id]));
}
async function ready({api}){try{
 api.clear();
 api.addPanel({id:'panel-alpha',component:'CapsulePanel',title:'Alpha'});
 api.addPanel({id:'panel-beta',component:'CapsulePanel',title:'Beta',position:{referencePanel:'panel-alpha',direction:'within'}});
 await settle();const initial=inventory(api);
 // Negative control proves the same inventory rejects original vendor output.
 const tab=document.querySelector('.dv-tab');const saved=tab.id;tab.id='dv-tab-999';tab.removeAttribute('data-semantic-anchor');
 let rejected=false;try{inventory(api);}catch{rejected=true;}check(rejected,'negative control rejected');
 // A layout transition recreates/rebinds the tab and repairs its identity.
 api.getPanel('panel-beta').api.moveTo({group:api.getPanel('panel-alpha').group,position:'right'});
 await settle();inventory(api);
 const json=api.toJSON();api.fromJSON(json);await settle();
 check(JSON.stringify(inventory(api))===JSON.stringify(initial),'restore deterministic identities');
 api.addFloatingGroup(api.getPanel('panel-beta'),{x:40,y:40,width:400,height:300});await settle();inventory(api);
 mounted.value=false;await settle();
 window.kwdResult={ok:true,initial,negativeRejected:rejected};
}catch(e){window.kwdResult={ok:false,error:String(e?.stack??e)};}}
</script><template><DockWorkspace v-if="mounted" :scope="scope" :storage="storage" :panel-components="components" @ready="ready" /></template>
<style>html,body,#app{margin:0;width:100%;height:100%}.mv-dock-workspace{height:100%}</style>`);
    await build({...base, configFile:false, root:scratch, logLevel:'silent', build:{...base.build,outDir:join(scratch,'dist'),emptyOutDir:true}});
    writeFileSync(join(scratch, 'main.cjs'), `const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(scratch,'profile'))});
app.whenReady().then(async()=>{const win=new BrowserWindow({width:1280,height:720,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
await win.loadFile(${JSON.stringify(join(scratch,'dist/index.html'))});
for(let i=0;i<600;i++){const result=await win.webContents.executeJavaScript('window.kwdResult');if(result){console.log(JSON.stringify(result));win.destroy();app.exit(result.ok?0:1);return;}await new Promise(r=>setTimeout(r,50));}
win.destroy();app.exit(2);}).catch(e=>{console.error(e);app.exit(1);});`);
    const run = spawnSync('systemd-run', ['--user','--scope','-q','-p','MemoryMax=8G','-p','MemorySwapMax=0','--','timeout','900','xvfb-run','-a',kitRequire('electron'),'--no-sandbox',join(scratch,'main.cjs')], {cwd:kit,encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
    assert.equal(run.status, 0, run.stdout+'\n'+run.stderr);
    assert.match(run.stdout, /"ok":true/);
    assert.match(run.stdout, /"negativeRejected":true/);
  } finally {rmSync(scratch,{recursive:true,force:true});}
});
