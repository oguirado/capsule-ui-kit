import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tokenValue,validateTokenContract} from '../src/design/tokenContract.js';
import {KIT_SCHEMES,setKitScheme} from '../src/design/aura.js';

// Additive saas-dark / saas-light schemes: new bindings resolve exactly while
// every S1 dark and S7 light computed value stays byte-identical.

const root=new URL('../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
const tokens=JSON.parse(text('src/design/tokens.json'));
const mappings=JSON.parse(text('src/design/tokenMappings.json'));
const css=text('src/design/theme.css');
const snapshot=JSON.parse(text('test/design-saas-legacy-snapshot.json'));
// Exact additive inventory: legacy values remain pinned by the original snapshot.
const multislotPaths=JSON.parse(text('test/design-multislot-paths.json'));
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

test('saas contract validates and pins the new primitives',()=>{
  assert.equal(validateTokenContract(tokens).leaves,723);
  const saas={canvas:'#0b0f19',well:'#070a11',indigo500:'#6366f1',indigo600:'#4f46e5',indigo700:'#4338ca',indigo50:'#eef2ff',sky500:'#0ea5e9',sky600:'#0284c7',sky50:'#f0f9ff',errorWash1:'#2d1217',errorWash2:'#1f1318',errorWash3:'#140b0f',errorWash4:'#0c0608'};
  for(const [key,hex] of Object.entries(saas)){
    assert.equal(tokenValue('primitive.color.saas.'+key,'saas-dark.normal'),hex,key);
    assert.equal(tokenValue('primitive.color.saas.'+key,'saas-light.normal'),hex,key);
  }
  assert.equal(tokenValue('primitive.radius.xxs','saas-dark.normal'),'3px');
  assert.equal(tokenValue('semantic.radius.xxs','saas-light.normal'),'3px');
  assert.deepEqual(leaf('semantic.typography.fontSize.saas_9').scale,{'0.875':'8px','1':'9px','1.125':'10px','1.25':'11px'});
  // Legacy schemes keep muted-equivalent secondary; saas schemes carry slate/Daylight.
  assert.equal(tokenValue('semantic.text.secondary','dark.normal'),tokenValue('semantic.text.muted','dark.normal'));
  assert.equal(tokenValue('semantic.text.secondary','light.normal'),tokenValue('semantic.text.muted','light.normal'));
  assert.equal(tokenValue('semantic.text.secondary','saas-dark.normal'),'#94a3b8');
  assert.equal(tokenValue('semantic.text.secondary','saas-light.normal'),'#334155');
});

test('saas-dark bindings resolve the slate/indigo scheme exactly',()=>{
  const dark={'semantic.surface.canvas':'#0b0f19','semantic.surface.panel':'#0f172a','semantic.surface.elevated':'#1e293b','semantic.surface.sunken':'#060e20','semantic.text.primary':'#f8fafc','semantic.text.muted':'#c7c4d7','semantic.text.disabled':'#64748b','semantic.accent.primary':'#6366f1','semantic.accent.primaryHover':'#4f46e5','semantic.accent.primaryActive':'#4338ca','semantic.border.default':'#334155','semantic.border.subtle':'#1e293b','semantic.focus.ringColor':'#6366f1','semantic.terminal.background':'#070a11','semantic.status.info.text':'#0ea5e9','semantic.status.info.surface':'rgba(14, 165, 233, 0.10)','semantic.status.info.border':'#0ea5e9','semantic.status.info.icon':'#0ea5e9','semantic.status.success.text':'#6ee7b7','semantic.status.error.text':'#ffb4ab'};
  for(const [path,hex] of Object.entries(dark))assert.equal(tokenValue(path,'saas-dark.normal'),hex,path);
  assert.equal(tokenValue('semantic.surface.canvas','saas-dark.high'),'#000000');
  assert.equal(tokenValue('semantic.text.primary','saas-dark.high'),'#ffffff');
  assert.equal(tokenValue('semantic.accent.primary','saas-dark.high'),'#93c5fd');
  assert.equal(tokenValue('semantic.text.secondary','saas-dark.high'),'#e2e8f0');
});

test('saas-light bindings resolve the Daylight scheme exactly',()=>{
  const light={'semantic.surface.canvas':'#f8fafc','semantic.surface.panel':'#ffffff','semantic.text.secondary':'#334155','semantic.text.muted':'#64748b','semantic.text.disabled':'#94a3b8','semantic.accent.primary':'#4f46e5','semantic.accent.primaryHover':'#4338ca','semantic.accent.primaryActive':'#4338ca','semantic.focus.ringColor':'#4f46e5','semantic.terminal.background':'#f8fafc','semantic.border.subtle':'#e2e8f0','semantic.status.success.text':'#059669','semantic.status.success.surface':'#ecfdf5','semantic.status.warning.text':'#d97706','semantic.status.error.text':'#e11d48','semantic.status.info.text':'#0284c7','semantic.status.info.surface':'#f0f9ff','semantic.status.info.border':'#0284c7','semantic.status.info.icon':'#0284c7'};
  for(const [path,hex] of Object.entries(light))assert.equal(tokenValue(path,'saas-light.normal'),hex,path);
  assert.equal(tokenValue('semantic.text.secondary','saas-light.high'),'#1e293b');
  assert.equal(tokenValue('semantic.surface.canvas','saas-light.high'),'#ffffff');
});

test('component.saas chrome, chips and motion resolve exactly',()=>{
  const flat={'component.saas.wallTile.headerHeight':'32px','component.saas.wallTile.drawerHeight':'96px','component.saas.wallTile.statusDotSize':'8px','component.saas.wallTile.addressBarHeight':'28px','component.saas.foldedRail.railWidth':'260px','component.saas.foldedRail.railHeaderHeight':'38px','component.saas.detail.geometryBarHeight':'32px','component.saas.detail.splitterWidth':'6px','component.saas.detail.splitterGripWidth':'2px','component.saas.detail.terminalPaneWidth':'450px','component.saas.detail.edgeStripWidth':'40px','component.saas.detail.shellToggleWidth':'28px','component.saas.detail.shellToggleHeight':'16px','component.saas.detail.shellToggleKnobSize':'12px','component.saas.detail.siblingChipDotSize':'4px','component.saas.detail.restoringSpinnerSize':'12px','component.saas.dispatch.expandedHeight':'705px','component.saas.dispatch.drawerHeaderHeight':'28px','component.saas.dispatch.targetCheckboxSize':'14px','component.saas.dispatch.targetCheckboxRadius':'3px','component.saas.dispatch.resultRowHeight':'32px','component.saas.dispatch.resultStateChipHeight':'20px','component.saas.dispatch.composerPaneHeight':'240px','component.saas.rec.recButtonDotSize':'6px','component.saas.veil.switchingSpinnerSize':'32px','component.saas.veil.aiHeldCardMaxWidth':'24rem','component.saas.veil.errorStatusStripHeight':'40px','component.saas.chip.fontSize':'10px','component.saas.motion.recPulseDuration':'1.4s','component.saas.motion.recPulseEasing':'ease-in-out','component.saas.motion.shimmerDuration':'2s','component.saas.motion.spinDuration':'1s'};
  for(const [path,value] of Object.entries(flat)){
    assert.equal(resolveToken(path,'saas-dark.normal'),value,path);
    assert.equal(resolveToken(path,'saas-light.normal'),value,path);
  }
  assert.equal(resolveToken('component.saas.dispatch.ineligibleRowOpacity','saas-dark.normal'),'0.6');
  assert.equal(tokenValue('component.saas.dispatch.dispatchShadow','saas-dark.normal'),'0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(51, 65, 85, 0.4)');
  assert.equal(resolveToken('component.saas.detail.splitterHintFontSize','saas-dark.normal'),'9px');
  assert.equal(tokenValue('component.saas.dispatch.resultRowHoverBackground','saas-dark.normal'),'#182234');
  const chips={
    success:['#10b981','rgba(16, 185, 129, 0.08)','rgba(16, 185, 129, 0.20)','#059669','#ecfdf5','rgba(5, 150, 105, 0.20)'],
    warning:['#f59e0b','rgba(245, 158, 11, 0.08)','rgba(245, 158, 11, 0.20)','#d97706','#fffbeb','rgba(217, 119, 6, 0.20)'],
    danger:['#f43f5e','rgba(244, 63, 94, 0.08)','rgba(244, 63, 94, 0.20)','#e11d48','#fff1f2','rgba(225, 29, 72, 0.20)'],
    info:['#0ea5e9','rgba(14, 165, 233, 0.08)','rgba(14, 165, 233, 0.20)','#0284c7','#f0f9ff','rgba(2, 132, 199, 0.20)'],
    neutral:['#94a3b8','#1e293b','#334155','#475569','#f1f5f9','#e2e8f0'],
    accent:['#6366f1','rgba(99, 102, 241, 0.08)','rgba(99, 102, 241, 0.20)','#4f46e5','#eef2ff','rgba(79, 70, 229, 0.20)']};
  for(const [name,[dText,dFill,dBorder,lText,lFill,lBorder]] of Object.entries(chips)){
    assert.equal(tokenValue(`component.saas.chip.${name}.text`,'saas-dark.normal'),dText,name);
    assert.equal(tokenValue(`component.saas.chip.${name}.fill`,'saas-dark.normal'),dFill,name);
    assert.equal(tokenValue(`component.saas.chip.${name}.border`,'saas-dark.normal'),dBorder,name);
    assert.equal(tokenValue(`component.saas.chip.${name}.text`,'saas-light.normal'),lText,name);
    assert.equal(tokenValue(`component.saas.chip.${name}.fill`,'saas-light.normal'),lFill,name);
    assert.equal(tokenValue(`component.saas.chip.${name}.border`,'saas-light.normal'),lBorder,name);
  }
});

test('S1 dark and S7 light computed values are identical before and after',()=>{
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
  const allowed=['primitive.color.saas.','primitive.radius.xxs','semantic.text.secondary','semantic.radius.xxs','semantic.typography.fontSize.saas_9','component.saas.'];
  const multislot=new Set(multislotPaths);
  assert.deepEqual(added.filter(path=>path.startsWith('component.aiMultiSlot.')).sort(),multislotPaths);
  for(const path of added)assert.ok(multislot.has(path)||allowed.some(prefix=>path===prefix||path.startsWith(prefix)),'unexpected new path '+path);
  assert.equal(added.length,265);
});

test('setKitScheme selects the scheme pair next to S1 dark and S7 light',()=>{
  assert.deepEqual([...KIT_SCHEMES],['light','dark','saas-dark','saas-light']);
  assert.ok(Object.isFrozen(KIT_SCHEMES));
  for(const scheme of KIT_SCHEMES){
    const root={dataset:{}};
    setKitScheme(scheme,root);
    assert.equal(root.dataset.themeScheme,scheme);
    assert.equal(root.dataset.themeContrast,'normal');
    assert.equal(root.dataset.themeDensity,'compact');
  }
  const keep={dataset:{density:'regular'}};
  setKitScheme('saas-dark',keep);
  assert.equal(keep.dataset.themeDensity,'regular');
  assert.throws(()=>setKitScheme('saas',{dataset:{}}),/Unknown scheme/);
});

test('generated theme.css carries the saas schemes next to S1/S7 output',()=>{
  assert.ok(css.includes(':root[data-theme-scheme="saas-dark"] { color-scheme: dark; }'));
  assert.ok(css.includes(':root[data-theme-scheme="saas-light"] { color-scheme: light; }'));
  assert.ok(css.includes('--cuk-primitive-color-saas-canvas: #0b0f19;'));
  assert.ok(css.includes('--cuk-primitive-color-saas-well: #070a11;'));
  assert.ok(css.includes('--cuk-semantic-surface-canvas: var(--cuk-primitive-color-saas-canvas);'));
  assert.ok(css.includes('--cuk-semantic-text-secondary: var(--cuk-primitive-color-neutral-400);'));
  assert.ok(css.includes('--mv-text-secondary: var(--cuk-semantic-text-secondary);'));
  assert.ok(css.includes('--cuk-component-saas-dispatch-expanded-height: 705px;'));
  assert.ok(css.includes('--cuk-semantic-typography-font-size-saas_9: 9px;'));
  assert.ok(css.includes('--cuk-component-saas-motion-rec-pulse-duration: 1.4s;'));
  assert.ok(css.includes('--cuk-component-saas-motion-rec-pulse-duration: var(--cuk-primitive-duration-0);'));
  assert.ok(css.includes('--cuk-semantic-surface-canvas: var(--cuk-primitive-color-s1-background);'));
  assert.ok(css.includes('--cuk-component-s1-table-row-height: 32px;'));
  assert.ok(!css.includes('undefined'));
});

test('vendor passthrough resolves in both saas schemes',()=>{
  for(const [surface,block] of Object.entries(mappings.vendorSurfaces)){
    for(const entry of block.tokens){
      if(entry.status!=='mapped')continue;
      resolveToken(entry.sourceToken,'saas-dark.normal');
      resolveToken(entry.sourceToken,'saas-light.normal');
      assert.equal(leaf(entry.sourceToken).$type,entry.$type,'type '+surface+'/'+entry.vendorToken);
    }
  }
});

test('saas schemes satisfy text, badge and focus contrast',()=>{
  for(const mode of ['saas-dark.normal','saas-light.normal']){
    for(const fg of ['primary','secondary'])for(const bg of ['canvas','panel','chrome','elevated','sunken','interactive']){
      assert.ok(contrast(tokenValue('semantic.text.'+fg,mode),tokenValue('semantic.surface.'+bg,mode))>=4.5,mode+'/'+fg+'/'+bg);
    }
    for(const bg of ['canvas','panel','chrome','elevated']){
      assert.ok(contrast(tokenValue('semantic.text.muted',mode),tokenValue('semantic.surface.'+bg,mode))>=4.5,mode+'/muted/'+bg);
    }
    for(const bg of ['sunken','interactive']){
      assert.ok(contrast(tokenValue('semantic.text.muted',mode),tokenValue('semantic.surface.'+bg,mode))>=3.5,mode+'/muted/'+bg);
    }
    assert.ok(contrast(tokenValue('semantic.accent.primary',mode),tokenValue('semantic.surface.canvas',mode))>=3,mode+'/accent-on-canvas');
    assert.ok(contrast(tokenValue('semantic.focus.ringColor',mode),tokenValue('semantic.surface.canvas',mode))>=3,mode+'/ring-on-canvas');
    assert.ok(contrast(tokenValue('semantic.terminal.foreground',mode),tokenValue('semantic.terminal.background',mode))>=4.5,mode+'/terminal');
  }
  assert.ok(contrast(tokenValue('semantic.accent.primaryContrast','saas-dark.normal'),tokenValue('semantic.accent.primary','saas-dark.normal'))>=4,'saas-dark/badge');
  assert.ok(contrast(tokenValue('semantic.accent.primaryContrast','saas-light.normal'),tokenValue('semantic.accent.primary','saas-light.normal'))>=4.5,'saas-light/badge');
  for(const status of ['success','warning','error']){
    assert.ok(contrast(tokenValue(`semantic.status.${status}.text`,'saas-dark.normal'),tokenValue(`semantic.status.${status}.surface`,'saas-dark.normal'))>=4.5,'saas-dark/'+status);
  }
  for(const status of ['success','warning','error','info']){
    assert.ok(contrast(tokenValue(`semantic.status.${status}.text`,'saas-light.normal'),tokenValue(`semantic.status.${status}.surface`,'saas-light.normal'))>=3,'saas-light/'+status);
  }
  assert.ok(contrast(tokenValue('semantic.status.info.text','saas-dark.normal'),tokenValue('semantic.surface.canvas','saas-dark.normal'))>=3,'saas-dark/info-on-canvas');
});
