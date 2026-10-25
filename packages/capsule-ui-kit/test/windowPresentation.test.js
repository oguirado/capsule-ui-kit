import {test} from 'node:test';
import assert from 'node:assert/strict';
import {swapLayoutPanels,createWindowPresentation,floatLayoutPanel,restoreGridAllocations} from '../src/workspace/windowPresentation.js';
const panel=id=>({id,contentComponent:'CapsulePanel',params:{capsuleId:id},renderer:'always'});
function layout(){return {grid:{root:{type:'branch',data:[{type:'leaf',data:{id:'left',views:['a','c'],activeView:'a'},size:700},{type:'leaf',data:{id:'right',views:['b'],activeView:'b'},size:300}]},width:1000,height:700,orientation:'HORIZONTAL'},panels:{a:panel('a'),b:panel('b'),c:panel('c')}};}
test('center swap exchanges exact identities, preserves all panel payloads, sizes and inactive tabs',()=>{
  const before=layout(),saved=structuredClone(before),after=swapLayoutPanels(before,'a','b');
  assert.deepEqual(before,saved,'input must remain unchanged');assert.deepEqual(after.panels,before.panels);
  assert.deepEqual(after.grid.root.data.map(n=>n.data.views),[['b','c'],['a']]);
  assert.deepEqual(after.grid.root.data.map(n=>n.data.activeView),['b','a']);
  assert.deepEqual(after.grid.root.data.map(n=>n.size),[700,300]);
  assert.deepEqual(swapLayoutPanels(after,'a','b'),before,'swap is reversible');
});
test('swap follows references into floating layouts without changing their bounds',()=>{
  const before=layout();before.grid.root.data.pop();before.floatingGroups=[{data:{id:'float',views:['b'],activeView:'b'},position:{left:20,top:30,width:400,height:300}}];
  const after=swapLayoutPanels(before,'a','b');assert.deepEqual(after.floatingGroups[0].data.views,['a']);assert.deepEqual(after.floatingGroups[0].position,before.floatingGroups[0].position);
});
test('missing, duplicated, and self identities refuse before deserializing a layout',()=>{
  assert.throws(()=>swapLayoutPanels(layout(),'a','missing'));
  assert.throws(()=>swapLayoutPanels(layout(),'a','a'));
  const duplicate=layout();duplicate.grid.root.data[0].data.views.push('b');assert.throws(()=>swapLayoutPanels(duplicate,'a','b'),/exactly one/);
  const missing=layout();missing.grid.root.data[1].data.views=[];assert.throws(()=>swapLayoutPanels(missing,'a','b'),/exactly one/);
});

test('restored window state reads initialized panel params before any API parameter-update event',()=>{
  const p={id:'a',title:'Alpha',params:{capsuleId:'alpha',viewMode:'window-hidden:'+JSON.stringify({groupId:'home',index:0,viewMode:null,floating:null})},api:{getParameters:()=>({}),location:{type:'grid'},isMaximized:()=>false}};
  const api={panels:[p],getPanel:id=>id==='a'?p:undefined};const windows=createWindowPresentation(api,()=>{});
  assert.deepEqual(windows.state('a'),{hidden:true,floating:false,maximized:false});
  assert.deepEqual(windows.listHidden(),[{id:'a',title:'Alpha',capsuleId:'alpha'}]);
  assert.throws(()=>windows.hide('unknown'),/Unknown panel/);
});
test('malformed saved hidden presentation refuses Show before a group mutation',()=>{
  const p={id:'a',params:{viewMode:'window-hidden:{"groupId":"home","index":-1,"viewMode":null,"floating":null}'}};
  const api={panels:[p],getPanel:()=>p,getGroup:()=>{throw Error('MUTATION REACHED');}};
  assert.throws(()=>createWindowPresentation(api,()=>{}).show('a'),/Invalid hidden window presentation/);
});

test('Float retains both populated and empty home leaves, exact split sizes and sibling order',()=>{
  for(const id of ['a','b']) {
    const before=layout(),original=structuredClone(before);
    const after=floatLayoutPanel(before,id,{left:32,top:32,width:520,height:400},{width:700,height:700});
    assert.deepEqual(before,original,'source profile is immutable');
    assert.deepEqual(after.grid.root.data.map(node=>node.size),[700,300]);
    assert.deepEqual(after.grid.root.data.map(node=>node.data.id),['left','right']);
    assert.deepEqual(after.grid.root.data.map(node=>node.data.views),id==='a'?[['c'],['b']]:[['a','c'],[]]);
    const home=JSON.parse(after.panels[id].params.viewMode.slice('window-floating:'.length));
    assert.equal(home.groupId,id==='a'?'left':'right');assert.equal(home.index,0);
    assert.deepEqual(after.floatingGroups[0].data.views,[id]);
    assert.deepEqual(after.floatingGroups[0].position,{left:32,top:32,width:520,height:400});
    assert.deepEqual(Object.keys(after.panels).sort(),['a','b','c'],'no placeholder capsule');
  }
});
test('Float records a nonzero tab index and original presentation and minimum sizes',()=>{
  const before=layout();before.panels.c.params.viewMode='compact';before.panels.c.minimumHeight=80;
  const after=floatLayoutPanel(before,'c',{left:32,top:32,width:520,height:400},{width:700,height:700});
  const home=JSON.parse(after.panels.c.params.viewMode.slice('window-floating:'.length));
  assert.deepEqual(home,{groupId:'left',index:1,width:700,height:700,viewMode:'compact',minimumWidth:null,minimumHeight:80});
  assert.throws(()=>floatLayoutPanel(before,'missing',{}, {width:700,height:700}),/grid home/);
  assert.throws(()=>floatLayoutPanel(before,'a',{}, {width:0,height:700}),/Invalid docking home/);
});
test('rendered split sizes regain only the measured gap deficit before deserialization',()=>{
  const grid={orientation:'HORIZONTAL',width:1000,height:700,root:{type:'branch',data:[
    {type:'branch',size:698,data:[{type:'leaf',size:298},{type:'leaf',size:398}]},
    {type:'leaf',size:298},
  ]}};
  restoreGridAllocations(grid);
  assert.deepEqual(grid.root.data.map(node=>node.size),[700,300]);
  assert.deepEqual(grid.root.data[0].data.map(node=>node.size),[300,400]);
  const noGap=layout().grid,saved=structuredClone(noGap);restoreGridAllocations(noGap);
  assert.deepEqual(noGap,saved,'a profile without a measured deficit is unchanged');
});
