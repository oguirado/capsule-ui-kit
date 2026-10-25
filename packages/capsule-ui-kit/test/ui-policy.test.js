import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc';
import {tokenValue,validateTokenContract} from '../src/design/tokenContract.js';
const root=new URL('../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
const catalog=JSON.parse(text('src/ui/component-catalog.json'));
const files=readdirSync(new URL('src/ui',root)).filter(f=>f.endsWith('.vue'));
test('shared wrappers and recipe examples compile against the installed Vue compiler',()=>{
 for(const file of files){const source=text('src/ui/'+file);const {descriptor,errors}=parse(source,{filename:file});assert.deepEqual(errors,[]);const script=compileScript(descriptor,{id:'ui-'+file});const template=compileTemplate({source:descriptor.template.content,filename:file,id:'ui-'+file,compilerOptions:{bindingMetadata:script.bindings}});assert.deepEqual(template.errors,[],file);}
 for(const component of catalog.components){const source=text('src/ui/'+component.name+'.vue');for(const prop of component.props)assert.ok(source.includes(prop),component.name+'/'+prop);}
 assert.equal(new Set(catalog.recipes.map(r=>r.id)).size,3);
});
const rawStyle=source=>/(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);
test('new shell styles reject literal colors and dimensions outside the token authority',()=>{
 for(const file of files){const {descriptor}=parse(text('src/ui/'+file));for(const style of descriptor.styles)assert.equal(rawStyle(style.content),false,file);}
 assert.equal(rawStyle('.bad{color:#fff}'),true);assert.equal(rawStyle('.bad{padding:13px}'),true);
});
function luminance(hex){const a=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('declared text and focus token pairs satisfy contrast in both schemes; missing and cyclic tokens refuse',()=>{
 for(const mode of ['light.normal','dark.normal']){
  for(const fg of ['primary','muted'])for(const bg of ['canvas','panel','chrome']){const ratio=contrast(tokenValue('semantic.text.'+fg,mode),tokenValue('semantic.surface.'+bg,mode));assert.ok(ratio>=4.5,mode+'/'+fg+'/'+bg+': '+ratio);}
  assert.ok(contrast(tokenValue('semantic.focus.ringColor',mode),tokenValue('semantic.surface.canvas',mode))>=3);
 }
 assert.throws(()=>tokenValue('semantic.missing'),/Unknown token/);assert.throws(()=>tokenValue('semantic.text.primary','dark.normal',new Set(['semantic.text.primary'])),/Token cycle/);assert.equal(contrast('#ffffff','#ffffff'),1);
});

test('token contract rejects missing namespaces, undeclared references and cycles before generation',()=>{
 const tokens=JSON.parse(text('src/design/tokens.json'));assert.ok(validateTokenContract(tokens).leaves>0);
 const missing=structuredClone(tokens);delete missing.semantic;assert.throws(()=>validateTokenContract(missing),/Missing namespace/);
 const unknown=structuredClone(tokens);unknown.component.appShell.gap.$value='{semantic.missing}';assert.throws(()=>validateTokenContract(unknown),/Unknown token/);
 const cycle=structuredClone(tokens);cycle.component.appShell.gap.$value='{component.appShell.gap}';assert.throws(()=>validateTokenContract(cycle),/Token cycle/);
});
