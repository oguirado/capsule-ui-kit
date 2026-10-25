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
    // xterm row styling uses setAttribute('style'). Use the equivalent CSSOM
    // setter so generated presentation stays inside the admitted script realm.
    const setAttribute=element.setAttribute.bind(element);
    element.setAttribute=(name,value)=>{
      if(name.toLowerCase()==='style'){
        for(const property of Array.from(element.style))element.style.removeProperty(property);
        for(const declaration of String(value).split(';')){
          const separator=declaration.indexOf(':');
          if(separator>0)element.style.setProperty(declaration.slice(0,separator).trim(),declaration.slice(separator+1).trim());
        }
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
