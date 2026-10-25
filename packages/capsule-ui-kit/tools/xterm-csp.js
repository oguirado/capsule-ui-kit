/** Pinned xterm documentOverride corrections, verified against installed sources.
 * Do not alter node_modules or change the CSP. Refuse changed vendor anchors.
 */
export function patchXtermDocumentOverride(code){
  const replacements=[
    ['this._document??typeof window<"u"?window.document:null','this._document??(typeof window<"u"?window.document:null)'],
    ['this._rowFactory=u.createInstance(Vt,document)','this._rowFactory=u.createInstance(Vt,this._document)']
  ];
  for(const [before,after] of replacements){
    if(code.split(before).length!==2)throw new Error('Pinned xterm documentOverride expression changed');
    code=code.replace(before,after);
  }
  return code;
}
export function xtermCspPlugin(){return {
  name:'xterm-document-csp',enforce:'pre',
  transform(code,id){
    if(!id.replaceAll('\\','/').endsWith('/@xterm/xterm/lib/xterm.mjs'))return null;
    return {code:patchXtermDocumentOverride(code),map:null};
  }
};}
