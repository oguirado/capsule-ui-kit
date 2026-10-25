#!/usr/bin/env python3
"""Full kit file coverage; vendored schema validation and index compiler."""
import hashlib,json,sys,tempfile,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'router/kit/tools'))
import jsonschema_lite as schema

def material():
 files=sorted(p for p in (ROOT/'packages/capsule-ui-kit').rglob('*') if p.is_file() and 'node_modules' not in p.parts and '__pycache__' not in p.parts)
 nodes=[]; routes=[]; coverage={}
 spec=json.loads((ROOT/'router/kit/standards/schemas/ctx.node.v2.schema.json').read_text())
 for p in files:
  if p.is_symlink(): raise ValueError('Symlink in kit')
  rel=p.relative_to(ROOT).as_posix(); digest=hashlib.sha256(p.read_bytes()).hexdigest()
  ident='file:'+hashlib.sha256(rel.encode()).hexdigest()[:20]
  node={'schema':'ctx.node.v2','id':ident,'corpus':'kit','kind':'asset','title':p.name,'purpose':'Kit file '+rel,'anchors':[{'a':'file','role':'section'}],'search':{'triggers':[p.stem[:64]],'keywords':[p.suffix.lstrip('.') or 'file']},'status':'active','source_sha256':digest}
  # Validate with the vendored tool, not an independent imitation.
  errors=schema.validate(node,spec)
  if errors: raise ValueError(str(errors))
  nodes.append(node); routes.append(ident+'\t'+rel+'\n'); coverage[rel]={'id':ident,'sha256':digest}
 canonical=lambda o:json.dumps(o,sort_keys=True,separators=(',',':'))+'\n'
 return {'kit.nodes.jsonl':''.join(canonical(n) for n in nodes),'routes.tsv':''.join(routes),'coverage.json':canonical({'schema':'kit-router-coverage/v1','files':coverage,'covered':len(files),'total':len(files),'percent':100})}

def main():
 check='--check' in sys.argv
 data=material(); out=ROOT/'router/catalogue'; out.mkdir(exist_ok=True)
 if check:
  for name,text in data.items():
   if not (out/name).exists() or (out/name).read_text()!=text: raise ValueError('Stale or incomplete router: '+name)
 else:
  for name,text in data.items(): (out/name).write_text(text)
 args=[sys.executable,str(ROOT/'router/kit/tools/build_index_v2.py'),'--nodes',str(out/'kit.nodes.jsonl'),'--out',str(ROOT/'router/index'),'--thesaurus',str(ROOT/'router/kit/standards/thesaurus.json'),'--corpus','kit']
 if check: args+=['--check']
 subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
 print('KIT_ROUTER_COVERAGE 100% '+str(len(json.loads(data['coverage.json'])['files']))+' files')
if __name__=='__main__':
 try: main()
 except Exception as e: print(str(e),file=sys.stderr); sys.exit(1)
