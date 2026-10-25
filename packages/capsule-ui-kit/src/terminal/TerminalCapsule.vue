<script setup>
import {shallowRef,markRaw,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import TerminalView,{createStreamRegistry} from './TerminalView.vue';
import MultiSlot from '../capsules/MultiSlot.vue';
import {createTerminalCapsuleModel} from './terminalCapsuleModel.js';
import {createTerminalDocument} from './nonceDocument.js';
import {tokenValue} from '../design/tokenContract.js';
import mappings from '../design/tokenMappings.json' with {type:'json'};
import TerminalLauncher from './TerminalLauncher.vue';
import TerminalSessionTabs from './TerminalSessionTabs.vue';
import TerminalComposer from './TerminalComposer.vue';
import UiPage from '../ui/UiPage.vue';
const props=defineProps({facade:{type:Object,default:null}});
const slots=shallowRef(/** @type {any} */ (null));
const emit=defineEmits(['state-change']);
const inputError=shallowRef('');
const recipients=shallowRef(/** @type {string[]} */ ([]));
function terminalTheme(){
 const mode=(document.documentElement.dataset.themeScheme==='light'?'light':'dark')+'.normal';
 return Object.fromEntries(mappings.vendorSurfaces.xterm.tokens.filter(t=>t.status==='mapped').map(t=>{if(typeof t.sourceToken!=='string')throw new Error('Mapped terminal token lacks a source');return [t.vendorToken,tokenValue(t.sourceToken,mode)];}));
}
function updateThemes(){for(const s of view.value.projection.sessions)model.registry.updateSessionTheme({sessionId:s.sessionId,theme:terminalTheme()});}
/** @type {MutationObserver|undefined} */
let themeObserver;
class CapsuleTerminal extends Terminal {
 /** @param {any} options */
 constructor(options){super({...options,documentOverride:createTerminalDocument(document)});}
}
const model=markRaw(createTerminalCapsuleModel({facade:/** @type {any} */ (props.facade),createRegistry:createStreamRegistry,
 getTheme:terminalTheme,registryOptions:{TerminalClass:CapsuleTerminal,FitAddonClass:FitAddon},onChange:state=>{view.value=state;emit('state-change',state);}}));
const view=shallowRef(model.snapshot());
/** @param {string} command */
async function launch(command){try{const id=await model.launch(command);await nextTick();if(id)slots.value?.selectSession(id);}catch{}}
/** @param {{text:string,targetIds:string[]}} payload */
async function send(payload){try{await model.send(payload);inputError.value='';}catch(e){inputError.value=String(e);}}
/** @param {{sessionId:string}} event */
function stop(event){void model.stop(event.sessionId).catch(e=>{inputError.value=String(e);});}
/** @param {Event} event */
function optIn(event){void model.optIn(/** @type {HTMLInputElement} */ (event.target).checked);}
onMounted(()=>{void model.initialize();themeObserver=new MutationObserver(updateThemes);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme-scheme']});});
onBeforeUnmount(()=>{themeObserver?.disconnect();model.dispose({closeSessions:false});});
</script>
<template>
 <UiPage title="Terminal" class="ui-terminal-capsule">
  <p id="terminal-real-shell-disclosure">AI terminal mode opens a real operating-system shell with your full user permissions. Commands can read, change or delete your files and access the network. Enable it only if you accept this access. Nothing runs until you explicitly launch a session and send input.</p>
  <label v-if="view.ready && !view.developerMode" class="ui-terminal-opt-in"><input id="terminal-ai-mode" data-semantic-anchor="settings/ai-terminal-mode" aria-label="Enable AI terminal mode" aria-describedby="terminal-real-shell-disclosure" type="checkbox" :checked="view.enabled" @change="optIn" /> Enable AI terminal mode</label>
  <p v-if="!view.ready" role="status">Terminal service unavailable.</p>
  <TerminalLauncher :commands="view.enabled ? view.commands : []" :launching="view.launching" :session-count="view.liveCount" :max-sessions="8" @launch="launch($event.command)" />
  <TerminalSessionTabs :sessions="view.projection.sessions" :selected-id="view.selected ?? ''" @select-tab="model.select($event.sessionId);slots?.selectSession($event.sessionId)" @close-tab="stop" />
  <p role="status" aria-live="polite">{{view.launching?'Starting session':view.enabled?'Terminal enabled':'Enable AI terminal mode to launch a session'}}</p>
  <p v-if="view.error" role="alert">{{view.error}}</p>
  <MultiSlot ref="slots" capsule-id="terminal" capsule-title="Terminal" :projection="view.projection" :epoch="1" :generation="1" console-mode="developer-pty" :attachment-available="false" :has-keyboard-ownership="view.enabled" @select-session="model.select($event.viewedSessionId)" @stop-session="stop">
   <template #terminal="{session,schedulingEnabled,viewed}">
    <TerminalView embedded :session-id="session.sessionId" capsule-id="terminal" :session-title="session.title" :epoch="1" :generation="1" mode="pty" :attachment-state="session.attachment" :activity-state="session.activity" :has-control-lease="session.hasControlLease" :folded="!schedulingEnabled || !viewed" :stream-registry="model.registry" />
   </template>
  </MultiSlot>
  <TerminalComposer input-mode="pty" v-model="recipients" :sessions="view.projection.sessions.filter((/** @type {any} */ s)=>s.sessionId===view.selected && s.hasControlLease)" :disabled="!view.enabled" placeholder="Type a single shell command; Send executes it" @send="send" />
  <p v-if="inputError" role="alert">{{inputError}}</p>
 </UiPage>
</template>
<style>
.ui-terminal-capsule{min-height:100%;display:flex;flex-direction:column;gap:var(--cuk-semantic-spacing-sm);}
.ui-terminal-capsule [role=toolbar]{display:flex;flex-wrap:wrap;gap:var(--cuk-semantic-spacing-sm);}
.ui-terminal-capsule .cui-terminal-viewport{height:var(--cuk-component-app-shell-palette-width);flex:none;}
.ui-terminal-opt-in{display:flex;gap:var(--cuk-semantic-spacing-sm);align-items:center;}
</style>
