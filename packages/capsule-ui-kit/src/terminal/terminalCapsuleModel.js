/** PTY display adapter. Model output never becomes input or readiness evidence. */
export const TERMINAL_LAUNCHERS = Object.freeze([
  {id:'shell',label:'Shell'}, {id:'pi',label:'Pi'},
  {id:'claude',label:'Claude Code'}, {id:'codex',label:'Codex'}
]);

/** Generic one-line session-kind hints for the launcher popover (S4). Keys match TERMINAL_LAUNCHERS ids. */
export const TERMINAL_LAUNCHER_HINTS = Object.freeze({
  shell: 'Interactive shell session',
  pi: 'Pi agent session',
  claude: 'Claude agent session',
  codex: 'Codex agent session'
});

/** @param {{facade:any,createRegistry:(options:any)=>any,onChange?:(state:any)=>void,registryOptions?:any,getTheme?:()=>any}} options */
export function createTerminalCapsuleModel({facade,createRegistry,onChange=()=>{},registryOptions={},getTheme=()=>undefined}) {
  /** @type {Map<string,any>} */
  const sessions = new Map();
  /** @type {any} */
  let capabilities = null;
  let optedIn = false, disposed = false, launching = false;
  /** @type {string|null} */
  let selected=null;
  let error='', earlyBytes=0;
  /** @type {any[]} */
  let early=[];
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let outputTimer;
  let earlyOverflow = false;
  /** @param {any} e */
  const report = e => {error=String(e?.message ?? e); publish();};
  const registry = createRegistry({...registryOptions,
    /** @param {{sessionId:string,acknowledgedSeq:number}} event */
    onAckOutput({sessionId,acknowledgedSeq}) {
      const s=sessions.get(sessionId), bytes=s?.credits.get(acknowledgedSeq);
      if(!s || bytes===undefined || disposed || ['exited','failed'].includes(s.activity))return;
      for(const seq of s.credits.keys())if(seq<=acknowledgedSeq)s.credits.delete(seq);
      Promise.resolve(facade.ack({session:sessionId,seq:acknowledgedSeq,bytes})).catch(report);
    },
    /** @param {{sessionId:string,data:string}} event */
    onSendAuthorizedPtyInput({sessionId,data}) {
      if(!enabled() || selected!==sessionId || !sessions.has(sessionId) || ['exited','failed'].includes(sessions.get(sessionId).activity))return;
      Promise.resolve(facade.write({session:sessionId,bytes:Array.from(new TextEncoder().encode(data))})).catch(report);
    },
    /** @param {{sessionId:string,cols:number,rows:number}} event */
    onResizePty({sessionId,cols,rows}) {
      if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||rows<2||cols>1000||rows>1000)return;
      if(!sessions.has(sessionId)||['exited','failed'].includes(sessions.get(sessionId).activity))return;
      Promise.resolve(facade.resize({session:sessionId,cols,rows})).catch(report);
    },
    /** @param {string} sessionId @param {string} text */
    onAccessibleTextUpdated(sessionId,text) {
      const s=sessions.get(sessionId);if(s){s.accessibleText=text;if(outputTimer===undefined)outputTimer=setTimeout(()=>{outputTimer=undefined;publish();},16);}
    }
  });
  function enabled(){return capabilities!==null && (capabilities.developerMode || optedIn);}
  function publish(){if(!disposed)onChange(snapshot());}
  function snapshot(){return {
    enabled:enabled(),developerMode:capabilities?.developerMode===true,ready:capabilities!==null,
    commands:capabilities?.commands ?? [],launching,error,selected,liveCount:Array.from(sessions.values()).filter(s=>!['exited','failed'].includes(s.activity)).length,
    projection:{capsuleId:'terminal',capsuleTitle:'Terminal',backendLifecycle:'active',epoch:1,generation:1,
      sessions:Array.from(sessions.values(),s=>({sessionId:s.id,title:s.title,role:s.id===selected?'controller':'reviewer',
        hasControlLease:enabled()&&s.id===selected&&s.activity!=='exited'&&s.activity!=='failed',
        activity:s.activity,attachment:s.attachment,viewRetention:'live-view',accessibleText:s.accessibleText}))}
  };}
  /** @param {string|null} id */
  function select(id){
    if(id===null||!sessions.has(id))return;
    selected=id;
    for(const s of sessions.values())registry.setControlLease({sessionId:s.id,epoch:1,
      hasControlLease:enabled()&&s.id===id&&!['exited','failed'].includes(s.activity)});
    publish();
  }
  /** @param {any} frame */
  function receive(frame){
    if(disposed)return;
    const s=sessions.get(frame?.session);
    if(!s){
      if(launching){
        const n=Array.isArray(frame?.bytes)?frame.bytes.length:0;
        if(early.length>=128 || earlyBytes+n>262144){earlyOverflow=true;report('Terminal startup output overflow');return;}
        early.push(frame);earlyBytes+=n;
      }
      return;
    }
    if(['exited','failed'].includes(s.activity))return;
    try {
      if(!Number.isSafeInteger(frame.seq)||frame.seq!==s.seq+1||!Array.isArray(frame.bytes)||
        frame.bytes.length>65536||frame.bytes.some((/** @type {number} */ b)=>!Number.isInteger(b)||b<0||b>255)||frame.byteLength!==frame.bytes.length)
        throw new Error('Invalid terminal frame or sequence gap');
      s.seq=frame.seq;s.bytes+=frame.bytes.length;s.credits.set(frame.seq,s.bytes);
      registry.writeOutputChunk({sessionId:s.id,epoch:1,attachmentId:s.id,startSeq:frame.seq-1,endSeq:frame.seq,data:Uint8Array.from(frame.bytes)});
    }catch(e){s.activity='failed';s.attachment='disconnected';registry.setControlLease({sessionId:s.id,epoch:1,hasControlLease:false});void Promise.resolve(facade.close({session:s.id})).catch(report);report(e);}
  }
  /** @param {any} event */
  function exit(event){
    if(disposed)return;
    const s=sessions.get(event?.session);
    if(!s){if(launching&&early.length<128)early.push({exit:event});return;}
    s.activity='exited';s.attachment='disconnected';
    registry.setControlLease({sessionId:s.id,epoch:1,hasControlLease:false});publish();
  }
  /** @param {{session:string,command:string,seq?:number,ackedSeq?:number,bytes?:number,replay?:number[]}} attachment */
  function attachSession({session:id,command,seq=0,ackedSeq=0,bytes=0,replay=[]}) {
    if(typeof id!=='string'||!id||sessions.has(id)||!TERMINAL_LAUNCHERS.some(x=>x.id===command)||!Number.isSafeInteger(seq)||seq<0||!Number.isSafeInteger(bytes)||bytes<0||!Array.isArray(replay)||replay.length>131072||replay.some(x=>!Number.isInteger(x)||x<0||x>255))throw new Error('Invalid terminal attachment');
    sessions.set(id,{id,title:TERMINAL_LAUNCHERS.find(x=>x.id===command)?.label ?? command,activity:'unknown',attachment:'live',accessibleText:'',seq,bytes,credits:new Map(seq>ackedSeq ? [[seq,bytes]] : [])});
    registry.createSession({sessionId:id,capsuleId:'terminal',epoch:1,generation:1,mode:'pty',hasControlLease:false,theme:getTheme()});
    registry.beginAttach({sessionId:id,epoch:1,attachmentId:id});
    registry.applyRestoreSnapshot({sessionId:id,epoch:1,attachmentId:id,snapshotCursorSeq:seq,snapshotData:Uint8Array.from(replay)});
  }
  const offData=facade?.onData(receive),offExit=facade?.onExit(exit);
  return {registry,snapshot,select,
    /** @param {{text:string,targetIds:string[]}} payload */
    async send({text,targetIds}) {
      if(disposed||!enabled()||typeof text!=='string'||!text.trim()||/[\x00-\x1f\x7f]/.test(text)||new TextEncoder().encode(text).length>65535||!Array.isArray(targetIds)||targetIds.length!==1||targetIds[0]!==selected||(selected===null||!sessions.has(selected))||['exited','failed'].includes(sessions.get(selected ?? '').activity))throw new Error('Terminal input refused');
      return facade.write({session:selected,bytes:Array.from(new TextEncoder().encode(text+'\r'))});
    },
    async initialize(){
      try{
        const c=await facade.capabilities();
        if(disposed)return;
        if(typeof c?.developerMode!=='boolean'||!Array.isArray(c.commands)||c.commands.some((/** @type {string} */ x)=>typeof x!=='string'))throw new Error('Terminal capabilities unavailable');
        capabilities={developerMode:c.developerMode,commands:c.commands};
        if(typeof facade.attach==='function') {
          launching=true;
          try {
            const attached=await facade.attach();
            if(disposed)return;
            if(!Array.isArray(attached?.sessions)||attached.sessions.length>8||typeof attached.enabled!=='boolean')throw new Error('Invalid terminal attachment');
            optedIn=attached.enabled;
            for(const s of attached.sessions)attachSession(s);
            select(sessions.keys().next().value ?? null);
            for(const frame of early){if(frame.exit)exit(frame.exit);else if(frame.seq> (sessions.get(frame.session)?.seq ?? 0))receive(frame);}
          } finally {launching=false;early=[];earlyBytes=0;}
        }
        publish();
      }catch(e){capabilities=null;report(e);}
    },
    /** @param {boolean} value */
    async optIn(value){
      optedIn=false;select(selected);publish();
      try{await facade.setEnabled(value===true);if(disposed)return;optedIn=value===true;select(selected);publish();}
      catch(e){report(e);}
    },
    /** @param {string} command */
    async launch(command){
      if(disposed||!enabled()||launching||Array.from(sessions.values()).filter(s=>!['exited','failed'].includes(s.activity)).length>=8||!capabilities.commands.includes(command)||!TERMINAL_LAUNCHERS.some(x=>x.id===command))throw new Error('Terminal launch unavailable');
      launching=true;error='';publish();
      try{
        const reply=await facade.open({command,cols:80,rows:24});
        if(disposed){await facade.close({session:reply.session});return;}
        if(typeof reply?.session!=='string'||!reply.session||sessions.has(reply.session))throw new Error('Invalid terminal session');
        const id=reply.session;
        if(earlyOverflow){await facade.close({session:id});throw new Error('Terminal startup output overflow');}
        while(sessions.size>=8){
          const old=Array.from(sessions.values()).find(s=>['exited','failed'].includes(s.activity));
          if(!old)break;registry.disposeSession(old.id);registry.forgetSession(old.id);sessions.delete(old.id);
        }
        attachSession({session:id,command});
        select(id);
        for(const frame of early){if(frame.exit)exit(frame.exit);else receive(frame);}
        return id;
      }catch(e){report(e);throw e;}
      finally{early=[];earlyBytes=0;earlyOverflow=false;launching=false;publish();}
    },
    /** @param {string} id */
    async stop(id){if(sessions.has(id)&&!['exited','failed'].includes(sessions.get(id).activity))await facade.close({session:id});},
    dispose({closeSessions=true}={}){disposed=true;clearTimeout(outputTimer);offData?.();offExit?.();for(const s of sessions.values()){registry.disposeSession(s.id);if(closeSessions&&!['exited','failed'].includes(s.activity))void Promise.resolve(facade.close({session:s.id})).catch(()=>{});}sessions.clear();early=[];}
  };
}
