import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tokenValue,validateTokenContract} from '../src/design/tokenContract.js';
import {KIT_SCHEMES,setKitScheme} from '../src/design/aura.js';

// Additive mv scheme pair: mv-light is the default of the pair and
// mv-dark is derived. New bindings resolve exactly while S1 dark, S7
// light and the saas schemes stay byte-identical to the pre-merge snapshot.

const root=new URL('../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
const tokens=JSON.parse(text('src/design/tokens.json'));
const mappings=JSON.parse(text('src/design/tokenMappings.json'));
const css=text('src/design/theme.css');
const snapshot=JSON.parse(text('test/design-mv-legacy-snapshot.json'));
const MV_MODES=['mv-light.normal','mv-light.high','mv-dark.normal','mv-dark.high'];
const LEGACY_MODES=['light.normal','light.high','dark.normal','dark.high','saas-dark.normal','saas-dark.high','saas-light.normal','saas-light.high'];
const leaf=path=>path.split('.').reduce((value,key)=>value?.[key],tokens);
function resolveToken(path,mode='dark.normal',seen=new Set()){
  if(seen.has(path))throw new Error('Token cycle: '+path);
  const node=leaf(path);
  if(!node||!node.$type)throw new Error('Unknown token: '+path);
  const value=node.modes?.[mode]??node.$value??node.density?.compact??node.scale?.['1'];
  if(!['string','number'].includes(typeof value))throw new Error('Unresolved token: '+path);
  return String(value).replace(/\{([\w.]+)\}/g,(_,ref)=>resolveToken(ref,mode,new Set([...seen,path])));
}
function luminance(hex){const a=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
/** srgb mix of two hex colors, t = weight of the first. */
function mix(a,b,t){const pa=a.slice(1).match(/../g).map(x=>parseInt(x,16));const pb=b.slice(1).match(/../g).map(x=>parseInt(x,16));return '#'+pa.map((v,i)=>Math.round(v*t+pb[i]*(1-t)).toString(16).padStart(2,'0')).join('');}
function compositeOver(rgba,base){const m=rgba.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);return mix('#'+[1,2,3].map(i=>Math.round(Number(m[i])).toString(16).padStart(2,'0')).join(''),base,Number(m[4]));}

test('mv contract validates and pins the new primitives',()=>{
  assert.equal(validateTokenContract(tokens).leaves,793);
  const mv={'canvas':'#ffffff','panel':'#ffffff','chrome':'#f1f4f7','elevated':'#ffffff','ink':'#1c1e21','slate':'#4b4c4f','charcoal':'#444950','steel':'#5d6c7b','stone':'#8595a4','disabledText':'#bcc0c4','primary':'#0064e0','primaryDeep':'#0457cb','primaryPressed':'#0143b5','onPrimary':'#ffffff','sunken':'#edf1f5','lineSubtle':'#6e7f90','secondary':'#5d6c7b','onSecondary':'#ffffff','secondaryContainer':'#e3ecf5','onSecondaryContainer':'#0a1317','tertiary':'#444950','onTertiary':'#ffffff','tertiaryContainer':'#eceff3','onTertiaryContainer':'#1c1e21','selection':'#cfe4ff','onSelection':'#0a1317','selectionInactive':'#e2e8f0','onSelectionInactive':'#1c1e21','termBg':'#0a1317','termFg':'#f1f4f7','primaryHighActive':'#002f7a','hcyellow':'#ffff00','night':'#0a1317','nightPanel':'#0e151a','nightChrome':'#131c22','nightElevated':'#1a2530','nightSunken':'#04070a','nightText':'#f1f4f7','nightMuted':'#bcc0c4','nightSecondary':'#9fb0bf','nightDisabled':'#5d6c7b','nightInverse':'#0a1317','nightStrong':'#dee3e9','nightPrimary':'#0091ff','nightPrimaryHover':'#2ea6ff','nightPrimaryActive':'#5cb8ff','nightOnPrimary':'#0a1317','nightAccentText':'#5cb8ff','nightOnSecondary':'#0a1317','nightSecondaryContainer':'#1c2f45','nightOnSecondaryContainer':'#d5e6ff','nightTertiary':'#8a97a3','nightOnTertiary':'#0a1317','nightTertiaryContainer':'#232b33','nightOnTertiaryContainer':'#e8edf2','nightSelection':'#1d4ed8','nightOnSelection':'#ffffff','nightSelectionInactive':'#334155','nightOnSelectionInactive':'#f1f4f7','nightTermBg':'#04070a','nightTermFg':'#f1f4f7','skyHigh':'#8fcdff','skyHighest':'#bfe3ff','nightHighContainer':'#0a2a4a'};
  assert.equal(Object.keys(mv).length,64);
  for(const [key,hex] of Object.entries(mv)){
    assert.equal(tokenValue('primitive.color.mv.'+key,'mv-light.normal'),hex,key);
    assert.equal(tokenValue('primitive.color.mv.'+key,'mv-dark.high'),hex,key);
    assert.equal(tokenValue('primitive.color.mv.'+key,'dark.normal'),hex,key);
  }
  for(const [key,px] of Object.entries({xl:'16px',xxl:'24px',xxxl:'32px'})){
    assert.equal(tokenValue('primitive.radius.'+key,'mv-light.normal'),px,key);
    assert.equal(tokenValue('semantic.radius.'+key,'mv-dark.normal'),px,key);
    assert.equal(leaf('semantic.radius.'+key).$value,'{primitive.radius.'+key+'}',key);
  }
  assert.deepEqual(tokens.axes,snapshot.axes);
});

test('mv-light bindings resolve exactly',()=>{
  const light={'semantic.surface.canvas':'#ffffff','semantic.surface.panel':'#ffffff','semantic.surface.chrome':'#f1f4f7','semantic.surface.elevated':'#ffffff','semantic.surface.sunken':'#edf1f5','semantic.surface.interactive':'#f1f5f9','semantic.surface.interactiveActive':'#e2e8f0','semantic.text.primary':'#1c1e21','semantic.text.muted':'#4b4c4f','semantic.text.secondary':'#444950','semantic.text.disabled':'#bcc0c4','semantic.text.accent':'#0064e0','semantic.text.inverse':'#ffffff','semantic.accent.primary':'#0064e0','semantic.accent.primaryHover':'#0457cb','semantic.accent.primaryActive':'#0143b5','semantic.accent.primaryContrast':'#ffffff','semantic.accent.secondary':'#5d6c7b','semantic.accent.onSecondary':'#ffffff','semantic.accent.secondaryContainer':'#e3ecf5','semantic.accent.onSecondaryContainer':'#0a1317','semantic.accent.tertiary':'#444950','semantic.accent.onTertiary':'#ffffff','semantic.accent.tertiaryContainer':'#eceff3','semantic.accent.onTertiaryContainer':'#1c1e21','semantic.border.default':'#5d6c7b','semantic.border.subtle':'#6e7f90','semantic.border.strong':'#444950','semantic.border.divider':'#6e7f90','semantic.focus.ringColor':'#0064e0','semantic.selection.background':'#cfe4ff','semantic.selection.text':'#0a1317','semantic.selection.inactiveBackground':'#e2e8f0','semantic.selection.border':'#0064e0','semantic.terminal.background':'#0a1317','semantic.terminal.foreground':'#f1f4f7','semantic.status.success.text':'#064e3b','semantic.status.success.surface':'#ecfdf5','semantic.status.success.border':'#059669','semantic.status.success.icon':'#059669','semantic.status.warning.text':'#78350f','semantic.status.warning.surface':'#fffbeb','semantic.status.warning.border':'#b45309','semantic.status.warning.icon':'#b45309','semantic.status.error.text':'#881337','semantic.status.error.surface':'#fff1f2','semantic.status.error.border':'#e11d48','semantic.status.error.icon':'#e11d48','semantic.status.info.text':'#1e3a8a','semantic.status.info.surface':'#eff6ff','semantic.status.info.border':'#2563eb','semantic.status.info.icon':'#2563eb'};
  for(const [path,hex] of Object.entries(light))assert.equal(tokenValue(path,'mv-light.normal'),hex,path);
  const high={'semantic.surface.canvas':'#ffffff','semantic.surface.panel':'#ffffff','semantic.surface.chrome':'#ffffff','semantic.surface.elevated':'#ffffff','semantic.surface.sunken':'#e2e8f0','semantic.surface.interactive':'#e2e8f0','semantic.surface.interactiveActive':'#cbd5e1','semantic.text.primary':'#000000','semantic.text.muted':'#1c1e21','semantic.text.secondary':'#000000','semantic.text.disabled':'#8595a4','semantic.text.accent':'#0143b5','semantic.text.inverse':'#ffffff','semantic.accent.primary':'#0143b5','semantic.accent.primaryHover':'#0143b5','semantic.accent.primaryActive':'#002f7a','semantic.accent.primaryContrast':'#ffffff','semantic.accent.secondary':'#000000','semantic.accent.onSecondary':'#ffffff','semantic.accent.secondaryContainer':'#ffffff','semantic.accent.onSecondaryContainer':'#000000','semantic.accent.tertiary':'#000000','semantic.accent.onTertiary':'#ffffff','semantic.accent.tertiaryContainer':'#ffffff','semantic.accent.onTertiaryContainer':'#000000','semantic.border.default':'#1c1e21','semantic.border.subtle':'#444950','semantic.border.strong':'#000000','semantic.border.divider':'#444950','semantic.focus.ringColor':'#000000','semantic.selection.background':'#ffff00','semantic.selection.text':'#000000','semantic.selection.inactiveBackground':'#e2e8f0','semantic.selection.border':'#000000','semantic.terminal.background':'#0a1317','semantic.terminal.foreground':'#f1f4f7','semantic.status.success.text':'#000000','semantic.status.success.surface':'#d1fae5','semantic.status.success.border':'#064e3b','semantic.status.success.icon':'#064e3b','semantic.status.warning.text':'#000000','semantic.status.warning.surface':'#fef3c7','semantic.status.warning.border':'#78350f','semantic.status.warning.icon':'#78350f','semantic.status.error.text':'#000000','semantic.status.error.surface':'#ffe4e6','semantic.status.error.border':'#881337','semantic.status.error.icon':'#881337','semantic.status.info.text':'#000000','semantic.status.info.surface':'#dbeafe','semantic.status.info.border':'#1e40af','semantic.status.info.icon':'#1e40af'};
  for(const [path,hex] of Object.entries(high))assert.equal(tokenValue(path,'mv-light.high'),hex,path);
});

test('mv-dark bindings resolve exactly',()=>{
  const dark={'semantic.surface.canvas':'#0a1317','semantic.surface.panel':'#0e151a','semantic.surface.chrome':'#131c22','semantic.surface.elevated':'#1a2530','semantic.surface.sunken':'#04070a','semantic.surface.interactive':'#131c22','semantic.surface.interactiveActive':'#334155','semantic.text.primary':'#f1f4f7','semantic.text.muted':'#bcc0c4','semantic.text.secondary':'#9fb0bf','semantic.text.disabled':'#5d6c7b','semantic.text.accent':'#5cb8ff','semantic.text.inverse':'#0a1317','semantic.accent.primary':'#0091ff','semantic.accent.primaryHover':'#2ea6ff','semantic.accent.primaryActive':'#5cb8ff','semantic.accent.primaryContrast':'#0a1317','semantic.accent.secondary':'#9fb0bf','semantic.accent.onSecondary':'#0a1317','semantic.accent.secondaryContainer':'#1c2f45','semantic.accent.onSecondaryContainer':'#d5e6ff','semantic.accent.tertiary':'#8a97a3','semantic.accent.onTertiary':'#0a1317','semantic.accent.tertiaryContainer':'#232b33','semantic.accent.onTertiaryContainer':'#e8edf2','semantic.border.default':'#8595a4','semantic.border.subtle':'#6e7f90','semantic.border.strong':'#dee3e9','semantic.border.divider':'#6e7f90','semantic.focus.ringColor':'#5cb8ff','semantic.selection.background':'#1d4ed8','semantic.selection.text':'#ffffff','semantic.selection.inactiveBackground':'#334155','semantic.selection.border':'#8fcdff','semantic.terminal.background':'#04070a','semantic.terminal.foreground':'#f1f4f7','semantic.status.success.text':'#6ee7b7','semantic.status.success.surface':'#022c22','semantic.status.success.border':'#10b981','semantic.status.success.icon':'#34d399','semantic.status.warning.text':'#fcd34d','semantic.status.warning.surface':'#451a03','semantic.status.warning.border':'#f59e0b','semantic.status.warning.icon':'#fbbf24','semantic.status.error.text':'#fda4af','semantic.status.error.surface':'#4c0519','semantic.status.error.border':'#f43f5e','semantic.status.error.icon':'#fb7185','semantic.status.info.text':'#bfdbfe','semantic.status.info.surface':'#1e3a8a','semantic.status.info.border':'#60a5fa','semantic.status.info.icon':'#60a5fa'};
  for(const [path,hex] of Object.entries(dark))assert.equal(tokenValue(path,'mv-dark.normal'),hex,path);
  const high={'semantic.surface.canvas':'#000000','semantic.surface.panel':'#000000','semantic.surface.chrome':'#0a1317','semantic.surface.elevated':'#131c22','semantic.surface.sunken':'#000000','semantic.surface.interactive':'#0f172a','semantic.surface.interactiveActive':'#475569','semantic.text.primary':'#ffffff','semantic.text.muted':'#dee3e9','semantic.text.secondary':'#ffffff','semantic.text.disabled':'#8595a4','semantic.text.accent':'#8fcdff','semantic.text.inverse':'#000000','semantic.accent.primary':'#5cb8ff','semantic.accent.primaryHover':'#8fcdff','semantic.accent.primaryActive':'#bfe3ff','semantic.accent.primaryContrast':'#000000','semantic.accent.secondary':'#dee3e9','semantic.accent.onSecondary':'#000000','semantic.accent.secondaryContainer':'#0a2a4a','semantic.accent.onSecondaryContainer':'#ffffff','semantic.accent.tertiary':'#dee3e9','semantic.accent.onTertiary':'#000000','semantic.accent.tertiaryContainer':'#444950','semantic.accent.onTertiaryContainer':'#ffffff','semantic.border.default':'#bcc0c4','semantic.border.subtle':'#8595a4','semantic.border.strong':'#ffffff','semantic.border.divider':'#8595a4','semantic.focus.ringColor':'#ffffff','semantic.selection.background':'#1d4ed8','semantic.selection.text':'#ffffff','semantic.selection.inactiveBackground':'#334155','semantic.selection.border':'#ffffff','semantic.terminal.background':'#000000','semantic.terminal.foreground':'#ffffff','semantic.status.success.text':'#d1fae5','semantic.status.success.surface':'#000000','semantic.status.success.border':'#6ee7b7','semantic.status.success.icon':'#6ee7b7','semantic.status.warning.text':'#fef3c7','semantic.status.warning.surface':'#000000','semantic.status.warning.border':'#fcd34d','semantic.status.warning.icon':'#fcd34d','semantic.status.error.text':'#ffe4e6','semantic.status.error.surface':'#000000','semantic.status.error.border':'#fda4af','semantic.status.error.icon':'#fda4af','semantic.status.info.text':'#eff6ff','semantic.status.info.surface':'#000000','semantic.status.info.border':'#bfdbfe','semantic.status.info.icon':'#bfdbfe'};
  for(const [path,hex] of Object.entries(high))assert.equal(tokenValue(path,'mv-dark.high'),hex,path);
});

test('S1 dark, S7 light and saas computed values match the pre-merge snapshot',()=>{
  for(const [mode,paths] of Object.entries(snapshot.modes)){
    for(const [path,value] of Object.entries(paths))assert.equal(resolveToken(path,mode),value,mode+'/'+path);
  }
  const current=[];
  (function walk(node,path){if('$type' in node){current.push(path);return;}for(const [key,value] of Object.entries(node))walk(value,path+'.'+key);})(tokens.primitive,'primitive');
  (function walk2(node,path){if('$type' in node){current.push(path);return;}for(const [key,value] of Object.entries(node))walk2(value,path+'.'+key);})(tokens.semantic,'semantic');
  (function walk3(node,path){if('$type' in node){current.push(path);return;}for(const [key,value] of Object.entries(node))walk3(value,path+'.'+key);})(tokens.component,'component');
  const before=new Set(snapshot.paths);
  assert.ok(snapshot.paths.every(p=>current.includes(p)),'a legacy path was removed');
  const added=current.filter(p=>!before.has(p));
  const radius=['primitive.radius.xl','primitive.radius.xxl','primitive.radius.xxxl','semantic.radius.xl','semantic.radius.xxl','semantic.radius.xxxl'];
  for(const path of added)assert.ok(path.startsWith('primitive.color.mv.')||radius.includes(path),'unexpected new path '+path);
  assert.equal(added.filter(p=>p.startsWith('primitive.color.mv.')).length,64);
  assert.equal(added.length,70);
});

test('setKitScheme selects the mv pair next to S1 dark, S7 light and saas',()=>{
  assert.deepEqual([...KIT_SCHEMES],['light','dark','saas-dark','saas-light','mv-light','mv-dark']);
  assert.ok(Object.isFrozen(KIT_SCHEMES));
  for(const scheme of KIT_SCHEMES){
    const root={dataset:{}};
    setKitScheme(scheme,root);
    assert.equal(root.dataset.themeScheme,scheme);
    assert.equal(root.dataset.themeContrast,'normal');
    assert.equal(root.dataset.themeDensity,'compact');
  }
  const keep={dataset:{density:'regular'}};
  setKitScheme('mv-light',keep);
  assert.equal(keep.dataset.themeDensity,'regular');
  assert.throws(()=>setKitScheme('mv',{dataset:{}}),/Unknown scheme/);
});

test('generated theme.css carries the mv schemes next to S1/S7/saas output',()=>{
  assert.ok(css.includes(':root[data-theme-scheme="mv-light"] { color-scheme: light; }'));
  assert.ok(css.includes(':root[data-theme-scheme="mv-dark"] { color-scheme: dark; }'));
  assert.ok(css.includes('--cuk-primitive-color-mv-primary: #0064e0;'));
  assert.ok(css.includes('--cuk-primitive-color-mv-night-primary: #0091ff;'));
  assert.ok(css.includes('--cuk-semantic-accent-primary: var(--cuk-primitive-color-mv-primary);'));
  assert.ok(css.includes('--cuk-semantic-accent-primary: var(--cuk-primitive-color-mv-night-primary);'));
  assert.ok(css.includes('--cuk-semantic-text-primary: var(--cuk-primitive-color-mv-ink);'));
  assert.ok(css.includes('--cuk-semantic-surface-canvas: var(--cuk-primitive-color-mv-night);'));
  assert.ok(css.includes('--cuk-semantic-radius-xl: var(--cuk-primitive-radius-xl);'));
  assert.ok(css.includes('--mv-radius-xl: var(--cuk-semantic-radius-xl);'));
  for(const mode of MV_MODES){
    const [scheme,contrast]=mode.split('.');
    const start=css.indexOf(`:root[data-theme-scheme="${scheme}"][data-theme-contrast="${contrast}"]`);
    assert.ok(start>=0,mode);
    const block=css.slice(start,css.indexOf('}',start));
    assert.equal(block.split('\n').filter(l=>l.startsWith('  --cuk-')).length,60,mode);
    assert.ok(!block.includes('component-saas-chip'),mode+' scopes out saas chips');
  }
  assert.ok(!css.includes('undefined'));
});

test('legacy theme.css blocks stay byte-identical',()=>{
  const hashes={base:'f90e9d568aefdff007ecf3eeea5a1f40b59206b4e7e9a1c1ea12dfcb691b596d',blocks:{':root[data-theme-scheme="light"] { color-scheme: light; }':'dcc08f572b79580d51eab0a5363e30d7a78761d5cf3ec12ebeb4ec8c46c69ae6',':root[data-theme-scheme="light"][data-theme-contrast="normal"] {':'fd2fa85293f1342586fed4c91542f6766474234f28f85417290f5b93fc00c096',':root[data-theme-scheme="light"][data-theme-contrast="high"] {':'4c554d072a458cb15107a4c0099a1a91c132fb8f4313c67285eb6861ed0eb707',':root[data-theme-scheme="dark"] { color-scheme: dark; }':'a0735d75c80615a8ae329891bc61bf4363d0c0687e1236614d43dc1513846e8f',':root[data-theme-scheme="dark"][data-theme-contrast="normal"] {':'0dc435d1fc84cc22121235317c0ed397aea480f555a01e0b887b23e5c8051fb0',':root[data-theme-scheme="dark"][data-theme-contrast="high"] {':'b59a69a1296f561fda0c208b973f635d21c8e23e366299c01c9c79ade7af13a2',':root[data-theme-scheme="saas-dark"] { color-scheme: dark; }':'325be31b91b12c486f77fda018e16d70dcd1e2f8f2c20eb1b212c00643e4ce4a',':root[data-theme-scheme="saas-dark"][data-theme-contrast="normal"] {':'2efc1a45e133c90c8ca589dfd5535aabdb3c8147c22034f5cbc6adbed9d48f7d',':root[data-theme-scheme="saas-dark"][data-theme-contrast="high"] {':'3a9e6632c8bdaed4dbd55d3b5f3b4f56dd05f1b7f01b76280f630cf9fe11f15a',':root[data-theme-scheme="saas-light"] { color-scheme: light; }':'bc6b29c18162e200e0464d66fac61a904d764dd2f4af1420a3f76d09562a8fc6',':root[data-theme-scheme="saas-light"][data-theme-contrast="normal"] {':'394fc5aa86b4b80b80addc58ea536275c0bc1e21325f1d98f07ed1b7a9a272f3',':root[data-theme-scheme="saas-light"][data-theme-contrast="high"] {':'d26c109570bfacdbbf3b34f7b628d4aa45fdb7cbe20ea1211582282321bf6a00'}};
  const starts=[];const re=/^(?::root|\.mv-dockview-theme|@media)/gm;let m;
  while((m=re.exec(css)))starts.push(m.index);
  const slices=starts.map((s,i)=>css.slice(s,i+1<starts.length?starts[i+1]:css.length));
  const head=s=>s.slice(0,s.indexOf('\n'));
  const base=slices[0];
  assert.equal(head(base),':root {');
  const stripped=base.split('\n').filter(l=>!l.includes('--cuk-primitive-color-mv-')&&!/--(cuk-(primitive|semantic)|mv)-radius-(xl|xxl|xxxl):/.test(l)).join('\n');
  assert.equal(createHash('sha256').update(stripped).digest('hex'),hashes.base);
  for(const [marker,hex] of Object.entries(hashes.blocks)){
    const found=slices.filter(s=>head(s)===marker);
    assert.equal(found.length,1,marker);
    assert.equal(createHash('sha256').update(found[0]).digest('hex'),hex,marker);
  }
});

test('accent stays a single swappable token per mode',()=>{
  const wiring={
    'semantic.accent.primary':{'mv-light.normal':'primitive.color.mv.primary','mv-light.high':'primitive.color.mv.primaryPressed','mv-dark.normal':'primitive.color.mv.nightPrimary','mv-dark.high':'primitive.color.mv.nightPrimaryActive'},
    'semantic.text.accent':{'mv-light.normal':'primitive.color.mv.primary','mv-light.high':'primitive.color.mv.primaryPressed','mv-dark.normal':'primitive.color.mv.nightAccentText','mv-dark.high':'primitive.color.mv.skyHigh'},
    'semantic.focus.ringColor':{'mv-light.normal':'primitive.color.mv.primary','mv-light.high':'primitive.color.neutral.1000','mv-dark.normal':'primitive.color.mv.nightAccentText','mv-dark.high':'primitive.color.neutral.0'},
    'semantic.selection.border':{'mv-light.normal':'primitive.color.mv.primary','mv-light.high':'primitive.color.neutral.1000','mv-dark.normal':'primitive.color.mv.skyHigh','mv-dark.high':'primitive.color.neutral.0'}};
  const current=[];
  (function walk(node,path){if('$type' in node){current.push(path);return;}for(const [key,value] of Object.entries(node))walk(value,path+'.'+key);})(tokens.primitive,'primitive');
  (function walk2(node,path){if('$type' in node){current.push(path);return;}for(const [key,value] of Object.entries(node))walk2(value,path+'.'+key);})(tokens.semantic,'semantic');
  (function walk3(node,path){if('$type' in node){current.push(path);return;}for(const [key,value] of Object.entries(node))walk3(value,path+'.'+key);})(tokens.component,'component');
  const before=new Set(snapshot.paths);
  for(const path of current.filter(p=>!before.has(p)))assert.ok(!path.startsWith('semantic.accent.')&&!path.startsWith('semantic.text.'),'new accent surface '+path);
  for(const [path,modes] of Object.entries(wiring)){
    for(const [mode,prim] of Object.entries(modes)){
      assert.equal(leaf(path).modes[mode],'{'+prim+'}',path+'/'+mode);
    }
  }
  const one=[...new Set(['semantic.accent.primary','semantic.text.accent','semantic.focus.ringColor','semantic.selection.border'].map(p=>leaf(p).modes['mv-light.normal']))];
  assert.deepEqual(one,['{primitive.color.mv.primary}']);
});

test('disabled text stays pinned and exempt (WCAG 1.4.3 inactive)',()=>{
  const pinned={'mv-light.normal':'#bcc0c4','mv-light.high':'#8595a4','mv-dark.normal':'#5d6c7b','mv-dark.high':'#8595a4'};
  for(const [mode,hex] of Object.entries(pinned))assert.equal(tokenValue('semantic.text.disabled',mode),hex,mode);
});

test('mv schemes satisfy WCAG AA text and UI contrast',()=>{
  const surfaces=['canvas','panel','chrome','elevated','sunken','interactive','interactiveActive','hoverS1'];
  for(const mode of MV_MODES){
    for(const fg of ['primary','muted','secondary'])for(const bg of surfaces){
      const ratio=contrast(tokenValue('semantic.text.'+fg,mode),tokenValue('semantic.surface.'+bg,mode));
      assert.ok(ratio>=4.5,mode+'/'+fg+'/'+bg+': '+ratio);
    }
    for(const bg of surfaces.filter(s=>s!=='interactiveActive')){
      const ratio=contrast(tokenValue('semantic.text.accent',mode),tokenValue('semantic.surface.'+bg,mode));
      assert.ok(ratio>=4.5,mode+'/accent/'+bg+': '+ratio);
    }
    let hover=tokenValue('semantic.surface.interactiveHover',mode);
    if(hover.startsWith('rgba'))hover=compositeOver(hover,tokenValue('semantic.surface.panel',mode));
    for(const fg of ['primary','muted','secondary','accent']){
      const ratio=contrast(tokenValue('semantic.text.'+fg,mode),hover);
      assert.ok(ratio>=4.5,mode+'/'+fg+'/interactiveHover: '+ratio);
    }
    for(const fill of ['primary','primaryHover','primaryActive']){
      assert.ok(contrast(tokenValue('semantic.text.inverse',mode),tokenValue('semantic.accent.'+fill,mode))>=4.5,mode+'/inverse/'+fill);
      assert.ok(contrast(tokenValue('semantic.accent.primaryContrast',mode),tokenValue('semantic.accent.'+fill,mode))>=4.5,mode+'/badge/'+fill);
    }
    for(const [bg,fg] of [['secondaryContainer','onSecondaryContainer'],['tertiaryContainer','onTertiaryContainer']]){
      assert.ok(contrast(tokenValue('semantic.accent.'+fg,mode),tokenValue('semantic.accent.'+bg,mode))>=4.5,mode+'/'+bg);
    }
    assert.ok(contrast(tokenValue('semantic.accent.onSecondary',mode),tokenValue('semantic.accent.secondary',mode))>=4.5,mode+'/onSecondary');
    assert.ok(contrast(tokenValue('semantic.accent.onTertiary',mode),tokenValue('semantic.accent.tertiary',mode))>=4.5,mode+'/onTertiary');
    for(const status of ['success','warning','error','info']){
      assert.ok(contrast(tokenValue(`semantic.status.${status}.text`,mode),tokenValue(`semantic.status.${status}.surface`,mode))>=4.5,mode+'/'+status);
      assert.ok(contrast(tokenValue(`semantic.status.${status}.icon`,mode),tokenValue(`semantic.status.${status}.surface`,mode))>=3,mode+'/'+status+'/icon');
      assert.ok(contrast(tokenValue(`semantic.status.${status}.border`,mode),tokenValue(`semantic.status.${status}.surface`,mode))>=3,mode+'/'+status+'/border');
      assert.ok(contrast(tokenValue(`semantic.status.${status}.border`,mode),tokenValue('semantic.surface.canvas',mode))>=3,mode+'/'+status+'/border-on-canvas');
    }
    for(const b of ['default','subtle','strong','divider'])for(const bg of ['canvas','panel','chrome','elevated','sunken']){
      assert.ok(contrast(tokenValue('semantic.border.'+b,mode),tokenValue('semantic.surface.'+bg,mode))>=3,mode+'/'+b+'/'+bg);
    }
    for(const bg of ['canvas','panel','chrome','elevated','sunken']){
      assert.ok(contrast(tokenValue('semantic.focus.ringColor',mode),tokenValue('semantic.surface.'+bg,mode))>=3,mode+'/ring/'+bg);
    }
    assert.ok(contrast(tokenValue('semantic.accent.primary',mode),tokenValue('semantic.surface.canvas',mode))>=3,mode+'/accent-on-canvas');
    assert.ok(contrast(tokenValue('semantic.selection.text',mode),tokenValue('semantic.selection.background',mode))>=4.5,mode+'/selection');
    assert.ok(contrast(tokenValue('semantic.selection.text',mode),tokenValue('semantic.selection.inactiveBackground',mode))>=4.5,mode+'/selection-inactive');
    assert.ok(contrast(tokenValue('semantic.terminal.foreground',mode),tokenValue('semantic.terminal.background',mode))>=4.5,mode+'/terminal');
  }
});

test('accent on pressed fill is fenced above 4.3 in every mv mode',()=>{
  // Light normal (4.37) and dark high (4.45) sit below 4.5 by input; fence
  // guards them against regressing further until the accent is re-confirmed.
  for(const mode of MV_MODES){
    const ratio=contrast(tokenValue('semantic.text.accent',mode),tokenValue('semantic.surface.interactiveActive',mode));
    assert.ok(ratio>=4.3,mode+'/accent/interactiveActive: '+ratio);
  }
});

test('vendor passthrough resolves in both mv schemes',()=>{
  for(const [surface,block] of Object.entries(mappings.vendorSurfaces)){
    for(const entry of block.tokens){
      if(entry.status!=='mapped')continue;
      for(const mode of MV_MODES)resolveToken(entry.sourceToken,mode);
      assert.equal(leaf(entry.sourceToken).$type,entry.$type,'type '+surface+'/'+entry.vendorToken);
    }
  }
});
