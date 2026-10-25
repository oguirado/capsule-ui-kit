<script setup>
import {shallowRef,markRaw,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import TerminalView,{createStreamRegistry} from '../terminal/TerminalView.vue';
import MultiSlot from '../capsules/MultiSlot.vue';
import {createTerminalCapsuleModel,TERMINAL_LAUNCHERS} from '../terminal/terminalCapsuleModel.js';
import {createTerminalDocument} from '../terminal/nonceDocument.js';
import {tokenValue} from '../design/tokenContract.js';
import mappings from '../design/tokenMappings.json' with {type:'json'};
import UiButton from './UiButton.vue';
import UiPage from './UiPage.vue';
const props=defineProps({facade:{type:Object,default:null}});
const slots=shallowRef(null);
function terminalTheme(){
 const mode=(document.documentElement.dataset.themeScheme==='light'?'light':'dark')+'.normal';
 return Object.fromEntries(mappings.vendorSurfaces.xterm.tokens.filter(t=>t.status==='mapped').map(t=>[t.vendorToken,tokenValue(t.sourceToken,mode)]));
}
function updateThemes(){for(const s of view.value.projection.sessions)model.registry.updateSessionTheme({sessionId:s.sessionId,theme:terminalTheme()});}
let themeObserver;
class CapsuleTerminal extends Terminal {
 constructor(options){super({...options,documentOverride:createTerminalDocument(document)});}
}
const model=markRaw(createTerminalCapsuleModel({facade:props.facade,createRegistry:createStreamRegistry,
 getTheme:terminalTheme,registryOptions:{TerminalClass:CapsuleTerminal,FitAddonClass:FitAddon},onChange:state=>{view.value=state;}}));
const view=shallowRef(model.snapshot());
async function launch(command){try{const id=await model.launch(command);await nextTick();if(id)slots.value?.selectSession(id);}catch{}}
function stop(event){void model.stop(event.sessionId).catch(()=>{});}
onMounted(()=>{void model.initialize();themeObserver=new MutationObserver(updateThemes);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme-scheme']});});
onBeforeUnmount(()=>{themeObserver?.disconnect();model.dispose();});
</script>
<template>
 <UiPage title="Terminal" class="ui-terminal-capsule">
  <label v-if="view.ready && !view.developerMode" class="ui-terminal-opt-in"><input id="terminal-ai-mode" data-semantic-anchor="settings/ai-terminal-mode" aria-label="Enable AI terminal mode" type="checkbox" :checked="view.enabled" @change="model.optIn($event.target.checked)" /> Enable AI terminal mode</label>
  <p v-if="!view.ready" role="status">Terminal service unavailable.</p>
  <div role="toolbar" aria-label="Session launchers">
   <UiButton v-for="launcher in TERMINAL_LAUNCHERS" :key="launcher.id" :id="'terminal-launch-'+launcher.id" :data-semantic-anchor="'shell/navigation/terminal-'+launcher.id" :label="launcher.label" :disabled="!view.enabled || view.launching || !view.commands.includes(launcher.id) || view.projection.sessions.length>=8" @click="launch(launcher.id)" />
  </div>
  <p role="status" aria-live="polite">{{view.launching?'Starting session':view.enabled?'Terminal enabled':'Enable AI terminal mode to launch a session'}}</p>
  <p v-if="view.error" role="alert">{{view.error}}</p>
  <MultiSlot ref="slots" capsule-id="terminal" capsule-title="Terminal" :projection="view.projection" :epoch="1" :generation="1" console-mode="developer-pty" :attachment-available="false" :has-keyboard-ownership="view.enabled" @select-session="model.select($event.viewedSessionId)" @stop-session="stop">
   <template #terminal="{session,schedulingEnabled,viewed}">
    <TerminalView embedded :session-id="session.sessionId" capsule-id="terminal" :session-title="session.title" :epoch="1" :generation="1" mode="pty" :attachment-state="session.attachment" :activity-state="session.activity" :has-control-lease="session.hasControlLease" :folded="!schedulingEnabled || !viewed" :stream-registry="model.registry" />
   </template>
  </MultiSlot>
 </UiPage>
</template>
<style>
.ui-terminal-capsule{min-height:100%;display:flex;flex-direction:column;gap:var(--cuk-semantic-spacing-sm);}
.ui-terminal-capsule [role=toolbar]{display:flex;flex-wrap:wrap;gap:var(--cuk-semantic-spacing-sm);}
.ui-terminal-capsule .cui-terminal-viewport{height:var(--cuk-component-app-shell-palette-width);flex:none;}
.ui-terminal-opt-in{display:flex;gap:var(--cuk-semantic-spacing-sm);align-items:center;}
</style>
