import { setKitGeometryRule } from '../workspace/kitGeometrySheet.js';

const geometryCounters = new WeakMap();
/** xterm's documented documentOverride keeps its generated styles nonce-bound.
 * @param {Document} document
 * @returns {Document}
 */
export function createTerminalDocument(document) {
  const nonce=document.querySelector('meta[name$="-style-nonce"]')?.getAttribute('content');
  if(!nonce)throw new Error('Terminal style nonce unavailable');
  const styleNonce=nonce;

  const createElement=document.createElement.bind(document);
  /** @param {string} tagName @param {ElementCreationOptions} [options] */
  function create(tagName,options){
    const element=createElement(tagName,options);
    if(String(tagName).toLowerCase()==='style')element.setAttribute('nonce',styleNonce);
    const setAttribute=element.setAttribute.bind(element);
    const sequence = (geometryCounters.get(document) ?? 0) + 1;
    geometryCounters.set(document, sequence);
    const geometryKey = `cuk-terminal-row-${sequence}`;
    element.setAttribute=(name,value)=>{
      if(name.toLowerCase()==='style'){
        /** @type {Record<string, unknown>} */
        const declarations = {};
        for(const declaration of String(value).split(';')){
          const separator=declaration.indexOf(':');
          if(separator>0) declarations[declaration.slice(0,separator).trim()] = declaration.slice(separator+1).trim();
        }
        setAttribute('data-cuk-geometry-id', geometryKey);
        setKitGeometryRule(document, geometryKey, geometryKey, declarations, true);
      }
      else setAttribute(name,value);
    };
    return element;
  }
  return new Proxy(document,{
    get(target,key){
      if(key==='createElement')return create;
      const value=Reflect.get(target,key,target);
      return typeof value==='function'?value.bind(target):value;
    }
  });
}
