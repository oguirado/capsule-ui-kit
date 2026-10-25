import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tokenValue,validateTokenContract} from '../src/design/tokenContract.js';
const root=new URL('../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
const tokens=JSON.parse(text('src/design/tokens.json'));
const mappings=JSON.parse(text('src/design/tokenMappings.json'));
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
test('S1 contract validates and dark mode resolves the S1 scheme exactly',()=>{
  assert.ok(validateTokenContract(tokens).leaves>0);
  const s1={background:'#0b1326',lowest:'#060e20',low:'#131b2e',container:'#171f33',high:'#222a3d',highest:'#2d3449',bright:'#31394d',primary:'#c0c1ff',onPrimary:'#1000a9',primaryContainer:'#8083ff',inversePrimary:'#494bd6',secondary:'#c3c0ff',onSecondary:'#1d00a5',secondaryContainer:'#3626ce',onSecondaryContainer:'#b3b1ff',tertiary:'#89ceff',onTertiary:'#00344d',tertiaryContainer:'#009ada',onTertiaryContainer:'#002d43',error:'#ffb4ab',onError:'#690005',errorContainer:'#93000a',onErrorContainer:'#ffdad6',text:'#dae2fd',textVariant:'#c7c4d7',outline:'#908fa0',outlineVariant:'#464554'};
  for(const [key,hex] of Object.entries(s1))assert.equal(resolveToken('primitive.color.s1.'+key,'dark.normal'),hex,key);
  const dark={'semantic.surface.canvas':'#0b1326','semantic.surface.sunken':'#060e20','semantic.surface.panel':'#131b2e','semantic.surface.chrome':'#171f33','semantic.surface.interactive':'#222a3d','semantic.surface.elevated':'#2d3449','semantic.accent.primary':'#c0c1ff','semantic.text.primary':'#dae2fd','semantic.text.muted':'#c7c4d7','semantic.text.disabled':'#908fa0','semantic.text.accent':'#c0c1ff','semantic.border.default':'#908fa0','semantic.border.subtle':'#464554','semantic.status.error.text':'#ffb4ab','semantic.status.error.surface':'#93000a','semantic.status.error.border':'#ffb4ab','semantic.status.error.icon':'#ffb4ab','semantic.accent.secondary':'#c3c0ff','semantic.accent.tertiary':'#89ceff'};
  for(const [path,hex] of Object.entries(dark))assert.equal(tokenValue(path,'dark.normal'),hex,path);
  const light={'semantic.surface.canvas':'#f1f5f9','semantic.surface.panel':'#ffffff','semantic.text.primary':'#0f172a','semantic.text.muted':'#475569','semantic.accent.primary':'#2563eb'};
  for(const [path,hex] of Object.entries(light))assert.equal(tokenValue(path,'light.normal'),hex,path);
});
test('S1 colour pairs satisfy contrast in both schemes',()=>{
  for(const mode of ['light.normal','dark.normal']){
    for(const fg of ['primary','muted'])for(const bg of ['canvas','panel','chrome','elevated','sunken','interactive']){
      const ratio=contrast(tokenValue('semantic.text.'+fg,mode),tokenValue('semantic.surface.'+bg,mode));
      assert.ok(ratio>=4.5,mode+'/'+fg+'/'+bg+': '+ratio);
    }
    for(const [bg,fg] of [['secondaryContainer','onSecondaryContainer'],['tertiaryContainer','onTertiaryContainer']]){
      const ratio=contrast(tokenValue('semantic.accent.'+fg,mode),tokenValue('semantic.accent.'+bg,mode));
      assert.ok(ratio>=4.5,mode+'/'+bg+': '+ratio);
    }
    const badge=contrast(tokenValue('semantic.accent.primaryContrast',mode),tokenValue('semantic.accent.primary',mode));
    assert.ok(badge>=4.5,mode+'/badge: '+badge);
  }
  const error=contrast(tokenValue('semantic.status.error.text','dark.normal'),tokenValue('semantic.status.error.surface','dark.normal'));
  assert.ok(error>=4.5,'dark/error: '+error);
  const accent=contrast(tokenValue('semantic.accent.primary','dark.normal'),tokenValue('semantic.surface.canvas','dark.normal'));
  assert.ok(accent>=3,'dark/accent-on-canvas: '+accent);
});
test('S1 type sizes, roles and chrome dimensions resolve exactly',()=>{
  const scales={s1_10:['9px','10px','11px','12px'],s1_14:['12px','14px','16px','18px'],s1_16:['14px','16px','18px','20px'],s1_20:['18px','20px','22px','25px']};
  for(const [key,[a,b,c,d]] of Object.entries(scales)){
    const node=leaf('semantic.typography.fontSize.'+key);
    assert.deepEqual(node.scale,{'0.875':a,'1':b,'1.125':c,'1.25':d});
  }
  const roles={headlineLg:['s1_20','sans','28px','medium'],headlineMd:['s1_16','sans','24px','semibold'],headlineSm:['lg','sans','20px','semibold'],bodyMd:['s1_14','sans','20px','regular'],bodySm:['md','sans','18px','regular'],labelMd:['sm','sans','16px','medium'],labelSm:['xs','sans','14px','medium'],codeMd:['md','mono','18px','regular'],codeSm:['sm','mono','16px','regular'],tableHeader:['s1_10','sans','14px','medium']};
  const pxAtScale1={xs:'11px',sm:'12px',md:'13px',lg:'15px',s1_10:'10px',s1_14:'14px',s1_16:'16px',s1_20:'20px'};
  for(const [role,[size,family,lineHeight,weight]] of Object.entries(roles)){
    const node=leaf('semantic.typography.roles.'+role);
    assert.equal(node.fontSize.$value,'{semantic.typography.fontSize.'+size+'}',role);
    assert.equal(node.fontFamily.$value,'{semantic.typography.fontFamily.'+family+'}',role);
    assert.equal(node.lineHeight.$value,lineHeight,role);
    assert.equal(node.fontWeight.$value,'{primitive.fontWeight.'+weight+'}',role);
    assert.equal(leaf('semantic.typography.fontSize.'+size).scale['1'],pxAtScale1[size],role);
  }
  const header=leaf('semantic.typography.roles.tableHeader');
  assert.equal(header.letterSpacing.$value,'0.03em');
  assert.equal(header.textTransform.$value,'uppercase');
  const kpi=leaf('component.s1.kpiValue');
  assert.equal(kpi.fontSize.$value,'{semantic.typography.fontSize.md}');
  assert.equal(kpi.fontFamily.$value,'{semantic.typography.fontFamily.mono}');
  assert.equal(kpi.fontWeight.$value,'{primitive.fontWeight.semibold}');
  assert.equal(tokens.axes.density.default,'compact');
  assert.equal(resolveToken('component.appShell.sidebarWidth'),'15rem');
  assert.equal(resolveToken('component.appShell.sidebarWidthS1'),'15rem');
  assert.equal(resolveToken('component.appShell.topbarHeight'),'3rem');
  assert.equal(resolveToken('component.appShell.statusHeight'),'1.75rem');
  assert.equal(resolveToken('semantic.size.rail.expandedWidth'),'240px');
  assert.equal(resolveToken('component.s1.capsuleHeaderHeight'),'36px');
  assert.equal(resolveToken('component.s1.tableHeaderHeight'),'28px');
  assert.equal(resolveToken('component.s1.tableRowHeight'),'32px');
  assert.equal(resolveToken('component.s1.statusDot'),'8px');
  assert.equal(resolveToken('component.s1.moraleBarWidth'),'48px');
  assert.equal(resolveToken('component.s1.moraleBarHeight'),'6px');
  assert.equal(resolveToken('primitive.radius.s1_xl'),'12px');
  assert.equal(resolveToken('semantic.elevation.s1Floating'),'0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(51, 65, 85, 0.4)');
});
test('S1 vendor mappings resolve with matching types and no tier inversion',()=>{
  const s1maps={'tag.background':'semantic.surface.elevated','tag.color':'semantic.text.primary','tag.border.color':'semantic.border.default','badge.background':'semantic.accent.primary','badge.color':'semantic.accent.primaryContrast','progressbar.background':'semantic.surface.elevated','progressbar.value.background':'semantic.accent.primary','progressbar.border.radius':'semantic.radius.pill','datatable.header.height':'component.s1.tableHeaderHeight','datatable.row.height':'component.s1.tableRowHeight','datatable.header.cell.font.size':'semantic.typography.roles.tableHeader.fontSize','chart.line.color':'semantic.accent.primary','chart.line.burn.color':'semantic.text.disabled','chart.grid.color':'semantic.border.divider'};
  const openvue=mappings.vendorSurfaces.openvue.tokens;
  for(const [vendor,source] of Object.entries(s1maps)){
    const entry=openvue.find(e=>e.vendorToken===vendor);
    assert.ok(entry,vendor);
    assert.equal(entry.status,'mapped');
    assert.equal(entry.sourceToken,source);
  }
  for(const [surface,block] of Object.entries(mappings.vendorSurfaces)){
    const seen=new Set();
    for(const entry of block.tokens){
      assert.ok(!seen.has(entry.vendorToken),'duplicate '+surface+'/'+entry.vendorToken);
      seen.add(entry.vendorToken);
      if(entry.status!=='mapped')continue;
      assert.ok(leaf(entry.sourceToken),'dangling '+surface+'/'+entry.vendorToken);
      assert.equal(leaf(entry.sourceToken).$type,entry.$type,'type '+surface+'/'+entry.vendorToken);
      resolveToken(entry.sourceToken,'dark.normal');
      resolveToken(entry.sourceToken,'light.normal');
    }
  }
  const tier=path=>['primitive','semantic','component'].indexOf(path.split('.')[0]);
  const leaves=[];
  (function walk(node,path){if('$type' in node){leaves.push(path);return;}for(const [key,value] of Object.entries(node))walk(value,path+'.'+key);})(tokens.primitive,'primitive');
  (function walk2(node,path){if('$type' in node){leaves.push(path);return;}for(const [key,value] of Object.entries(node))walk2(value,path+'.'+key);})(tokens.semantic,'semantic');
  (function walk3(node,path){if('$type' in node){leaves.push(path);return;}for(const [key,value] of Object.entries(node))walk3(value,path+'.'+key);})(tokens.component,'component');
  for(const path of leaves){
    const node=leaf(path);
    const values=[node.$value,...Object.values(node.modes??{}),...Object.values(node.density??{}),...Object.values(node.scale??{})].filter(v=>v!==undefined);
    for(const value of values)for(const [,ref] of String(value).matchAll(/\{([\w.]+)\}/g))assert.ok(tier(ref)<=tier(path),'tier inversion '+path+' -> '+ref);
  }
});
test('generated theme.css carries the S1 variables',()=>{
  const css=text('src/design/theme.css');
  assert.ok(css.includes('--cuk-primitive-color-s1-primary: #c0c1ff;'));
  assert.ok(css.includes('--cuk-semantic-surface-canvas: var(--cuk-primitive-color-s1-background);'));
  assert.ok(css.includes('[data-theme-scheme="dark"][data-theme-contrast="normal"]'));
  assert.ok(css.includes('--cuk-component-s1-table-row-height: 32px;'));
  assert.ok(css.includes('--cuk-semantic-typography-font-size-s1_20: 20px;'));
  assert.ok(!css.includes('undefined'));
});
