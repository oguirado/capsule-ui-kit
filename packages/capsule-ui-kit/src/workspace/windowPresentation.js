/** Shared presentation-only window operations. Installed Dockview declarations are the API contract. */

/** Exchange structural references without closing either panel. Panel objects and renderers are reused.
 * @param {any} layout @param {string} source @param {string} target
 */
export function swapLayoutPanels(layout, source, target) {
  if (source === target || !layout.panels[source] || !layout.panels[target]) throw new Error('Invalid swap identities');
  const result = structuredClone(layout);
  const exchange = (/** @type {string} */ id) => id === source ? target : id === target ? source : id;
  let sourceCount = 0, targetCount = 0;
  const visit = (/** @type {any} */ node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.views)) {
      sourceCount += node.views.filter((/** @type {string} */ id) => id === source).length;
      targetCount += node.views.filter((/** @type {string} */ id) => id === target).length;
      node.views = node.views.map(exchange);
      if (node.activeView) node.activeView = exchange(node.activeView);
      for (const group of node.tabGroups ?? []) if (Array.isArray(group.panels)) group.panels = group.panels.map(exchange);
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'panels' && value && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(visit); else visit(value);
    }
  };
  visit(result);
  if (sourceCount !== 1 || targetCount !== 1) throw new Error('Swap requires exactly one structural reference per panel');
  return result;
}

/** @param {any} api @param {()=>void} changed */
export function createWindowPresentation(api, changed) {
  const hiddenHomes = new Map();
  const maximizedFloating = new Map();
  const panel = (/** @type {string} */ id) => {const p = api.getPanel(id); if (!p) throw new Error(`Unknown panel: ${id}`); return p;};
  const hidden = (/** @type {any} */ p) => typeof (p.params ?? {}).viewMode === 'string' && (p.params ?? {}).viewMode.startsWith('window-hidden:');
  function savedHome(/** @type {any} */ p) {
    if (!hidden(p)) return null;
    const home = JSON.parse((p.params ?? {}).viewMode.slice('window-hidden:'.length));
    if (!home || typeof home !== 'object' || typeof home.groupId !== 'string' || !Number.isSafeInteger(home.index) || home.index < 0 || !(home.viewMode === null || typeof home.viewMode === 'string')) throw new Error('Invalid hidden window presentation');
    if (home.floating !== null && (!home.floating || typeof home.floating !== 'object' || Object.values(home.floating).some(value=>typeof value !== 'number' || !Number.isFinite(value)))) throw new Error('Invalid hidden floating bounds');
    return home;
  }
  function listHidden() { return api.panels.filter(hidden).map((/** @type {any} */ p) => ({ id: p.id, title: p.title ?? p.id, capsuleId: (p.params ?? {}).capsuleId ?? p.id })); }
  function state(/** @type {string} */ id) { const p = api.getPanel(id);return { hidden: !!p && hidden(p), floating: p?.api.location.type === 'floating', maximized: !!p?.api.isMaximized() }; }
  const floatingOptions = (/** @type {any} */ bounds) => {const {width,height,...position}=bounds;return {width,height,position};};
  const floatingBounds = (/** @type {string} */ id) => api.toJSON().floatingGroups?.find((/** @type {any} */ group) => group.data?.views.includes(id))?.position;
  function hide(/** @type {string} */ id) {
    const p = panel(id); if (hidden(p)) return;
    if (maximizedFloating.has(id)) maximize(id);
    else if (p.api.isMaximized()) p.api.exitMaximized();
    const home={groupId:p.group.id,index:p.group.panels.indexOf(p),viewMode:(p.params ?? {}).viewMode ?? null,floating:floatingBounds(id) ?? null};
    hiddenHomes.set(id,home);
    // Retain the structural home. Removing its last panel destroys the group and
    // loses its split allocation. Visibility is presentation, never ownership.
    p.api.updateParameters({viewMode: 'window-hidden:'+JSON.stringify(home)});
    const next = p.group.panels.find(candidate => candidate !== p && !hidden(candidate));
    if (next) next.api.setActive(); else p.group.api.setVisible(false);
    changed();
  }
  function show(/** @type {string} */ id) {
    const p = panel(id); if (!hidden(p)) return;
    const home = hiddenHomes.get(id) ?? savedHome(p);
    const destination = api.getGroup(home?.groupId) ?? api.groups.find((/** @type {any} */ g) => g !== p.group && g.api.isVisible && g.api.location.type === 'grid');
    p.group.api.setVisible(true);
    p.api.updateParameters({viewMode: home?.viewMode ?? null});
    if (p.group.id.startsWith('window-hidden-') && destination) p.api.moveTo({group: destination, position:'center', index:home?.index});
    if (home?.floating && p.api.location.type !== 'floating') api.addFloatingGroup(p, floatingOptions(home.floating));
    p.api.setActive(); changed();
  }
  function float(/** @type {string} */ id) {
    const p = panel(id); if (hidden(p)) show(id);
    // Repeated Float (including after Show) must not replace the grid home.
    if (p.api.location.type === 'floating') return;
    if (p.api.isMaximized()) p.api.exitMaximized();
    const homeBounds = p.group.element.getBoundingClientRect();
    const layout = floatLayoutPanel(api.toJSON(), id, {
      left:32,top:32,width:Math.min(520,api.width-64),height:Math.min(400,api.height-64),
    }, {width:homeBounds.width,height:homeBounds.height});
    restoreGridAllocations(layout.grid);
    api.fromJSON(layout, {reuseExistingPanels:true});
    panel(id).api.setActive();
    changed();
  }
  function dock(/** @type {string} */ id) {
    const p = panel(id);
    if (hidden(p)) show(id);
    if (p.api.location.type !== 'floating') return;
    const home = readDockHome(p.params?.viewMode);
    const destination = api.getGroup(home?.groupId) ?? api.groups.find((/** @type {any} */ g) => g !== p.group && g.api.isVisible && g.api.location.type === 'grid');
    if (home && destination?.id !== home.groupId) throw new Error('Missing docking home');
    if (p.api.isMaximized()) p.api.exitMaximized();
    if (home) {
      const state = {...p.toJSON()};
      for (const key of ['minimumWidth','minimumHeight']) {
        if (home[key] === null) delete state[key]; else state[key] = home[key];
      }
      p.updateFromStateModel(state);
    }
    p.api.moveTo(destination ? {group:destination,position:'center',index:home?.index} : {position:'right'});
    if (home) {
      p.api.updateParameters({viewMode:home.viewMode});
    }
    changed();
  }
  function maximize(/** @type {string} */ id) {
    const p=panel(id);
    if (maximizedFloating.has(id)) {
      const layout = maximizedFloating.get(id); maximizedFloating.delete(id);
      p.api.exitMaximized(); float(id); api.addFloatingGroup(panel(id), floatingOptions(layout));
    } else if (p.api.isMaximized()) p.api.exitMaximized();
    else {
      if (p.api.location.type === 'floating') {const bounds=floatingBounds(id);dock(id);maximizedFloating.set(id,bounds);}
      p.api.setActive();p.api.maximize();
    }
    changed();
  }
  function swap(/** @type {string} */ a, /** @type {string} */ b) {
    const source=panel(a), target=panel(b);
    if (source.group === target.group) return;
    api.fromJSON(swapLayoutPanels(api.toJSON(), a, b), {reuseExistingPanels:true});
    panel(a).api.setActive(); changed();
  }
  function showAll() {for (const p of listHidden()) show(p.id);}
  function focusNext() {const visible=api.panels.filter((/** @type {any} */ p)=>!hidden(p));const i=visible.indexOf(api.activePanel);const next=visible[(i+1)%visible.length];if(next){next.api.setActive();const win=next.api.getWindow();win.requestAnimationFrame(()=>win.requestAnimationFrame(()=>win.document.getElementById(`cuk-capsule-tab-${next.id}`)?.focus()));}changed();}
  return {state,listHidden,hide,show,float,dock,maximize,swap,showAll,focusNext};
}

/** Closed presentation metadata; separate from the temporary Hide/Show home.
 * @param {unknown} value @returns {any}
 */
function readDockHome(value) {
  if (typeof value !== 'string' || !value.startsWith('window-floating:')) return null;
  const home = JSON.parse(value.slice('window-floating:'.length));
  if (!home || typeof home.groupId !== 'string' || !home.groupId ||
      !Number.isSafeInteger(home.index) || home.index < 0 ||
      !(home.viewMode === null || typeof home.viewMode === 'string') ||
      !['width','height'].every(key => Number.isFinite(home[key]) && home[key] > 0) ||
      !['minimumWidth','minimumHeight'].every(key => home[key] === null || (Number.isFinite(home[key]) && home[key] >= 0))) throw new Error('Invalid docking home');
  return home;
}

/** Float a view while retaining its grid leaf, split allocation and sibling order.
 * Dockview's addFloatingGroup(panel) removes an empty source group, losing that
 * allocation. Its public serialized-layout API admits empty leaves and reuses
 * the existing panel renderers, so no placeholder capsule or lifecycle is needed.
 * @param {any} layout @param {string} id @param {any} bounds @param {{width:number,height:number}} size
 */
export function floatLayoutPanel(layout, id, bounds, size) {
  const result = structuredClone(layout);
  /** @type {any} */
  let leaf;
  const visit = (/** @type {any} */ node) => {
    if (node.type === 'leaf' && node.data.views.includes(id)) leaf = node;
    else if (node.type === 'branch') node.data.forEach(visit);
  };
  visit(result.grid.root);
  if (!leaf || !result.panels[id]) throw new Error('Float requires a grid home');
  const state = result.panels[id];
  const home = {groupId:leaf.data.id,index:leaf.data.views.indexOf(id),...size,viewMode:state.params?.viewMode ?? null,
    minimumWidth:state.minimumWidth ?? null,minimumHeight:state.minimumHeight ?? null};
  const viewMode = 'window-floating:'+JSON.stringify(home);
  readDockHome(viewMode);
  state.params = {...state.params,viewMode};
  state.minimumWidth = 240; state.minimumHeight = 240;
  leaf.data.views = leaf.data.views.filter((/** @type {string} */ view) => view !== id);
  if (leaf.data.activeView === id) {
    if (leaf.data.views.length) leaf.data.activeView = leaf.data.views[0]; else delete leaf.data.activeView;
  }
  if (leaf.data.tabGroups) leaf.data.tabGroups = leaf.data.tabGroups.map((/** @type {any} */ group) => ({...group,panels:group.panels.filter((/** @type {string} */ view) => view !== id)})).filter((/** @type {any} */ group) => group.panels.length);
  let groupId = `window-float-${id}`;
  while ((result.floatingGroups ?? []).some((/** @type {any} */ group) => group.data?.id === groupId) || groupId === home.groupId) groupId += '-next';
  result.floatingGroups = [...(result.floatingGroups ?? []),{data:{id:groupId,views:[id],activeView:id},position:bounds}];
  result.activeGroup = groupId;
  return result;
}

/** Dockview serializes rendered sizes after subtracting the theme gap, but
 * deserializes them as allocations before subtracting that gap. Restore the
 * measured per-branch deficit before a presentation-only round trip.
 * @param {any} grid
 */
export function restoreGridAllocations(grid) {
  const visit = (/** @type {any} */ node, /** @type {number} */ width, /** @type {number} */ height, /** @type {boolean} */ horizontal) => {
    if (node.type !== 'branch' || !node.data.length) return;
    const available = horizontal ? width : height;
    const deficit = available - node.data.reduce((/** @type {number} */ sum, /** @type {any} */ child) => sum + child.size, 0);
    for (const child of node.data) {
      const rendered = child.size;
      child.size += deficit / node.data.length;
      visit(child, horizontal ? rendered : width, horizontal ? height : rendered, !horizontal);
    }
  };
  visit(grid.root, grid.width, grid.height, grid.orientation === 'HORIZONTAL');
}
