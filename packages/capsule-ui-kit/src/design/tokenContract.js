import tokens from './tokens.json' with {type:'json'};
/** Resolve only declared token references; absence never acquires a default.
 * @param {string} path
 * @param {string} [mode]
 * @param {Set<string>} [seen]
 * @returns {string}
 */
export function tokenValue(path, mode = 'dark.normal', seen = new Set()) {
  if (seen.has(path)) throw new Error('Token cycle: '+path);
  const node = path.split('.').reduce((/** @type {Record<string, any>} */ value,key)=>value?.[key],/** @type {Record<string, any>} */ (tokens));
  if (!node || !node.$type) throw new Error('Unknown token: '+path);
  const value = node.modes?.[mode] ?? node.$value;
  if (typeof value !== 'string') throw new Error('Unresolved token: '+path);
  return value.replace(/\{([\w.]+)\}/g,(_,ref)=>tokenValue(ref,mode,new Set([...seen,path])));
}

/** Validate namespaces, typed leaves and every reference in every declared mode.
 * @param {Record<string, any>} contract
 */
export function validateTokenContract(contract) {
 /** @type {Map<string, Array<string|number>>} */
 const leaves=new Map();
 /** @param {Record<string, any>} node @param {string} path */
 function walk(node,path){
  if(!node || typeof node!=='object' || Array.isArray(node))throw new Error('Invalid token node: '+path);
  if('$type' in node){
   if(typeof node.$type!=='string' || !node.$type)throw new Error('Missing token type');
   const values=[node.$value,...Object.values(node.modes??{}),...Object.values(node.density??{}),...Object.values(node.scale??{})].filter(v=>v!==undefined);
   if(!values.length || values.some(v=>!['string','number'].includes(typeof v)))throw new Error('Invalid token value: '+path);
   leaves.set(path,values);return;
  }
  for(const [key,value] of Object.entries(node))walk(value,path+'.'+key);
 }
 for(const namespace of ['primitive','semantic','component']){if(!contract[namespace])throw new Error('Missing namespace: '+namespace);walk(contract[namespace],namespace);}
 const edges=new Map([...leaves].map(([path,values])=>[path,values.flatMap(v=>Array.from(String(v).matchAll(/\{([\w.]+)\}/g),m=>/** @type {string} */ (m[1])))]));
 /** @param {string} path @param {Set<string>} [stack] @returns {void} */
 function visit(path,stack=new Set()) {if(!leaves.has(path))throw new Error('Unknown token: '+path);if(stack.has(path))throw new Error('Token cycle: '+path);for(const ref of /** @type {string[]} */ (edges.get(path)))visit(ref,new Set([...stack,path]));}
 for(const path of leaves.keys())visit(path);
 return {leaves:leaves.size};
}
