<script setup>
import {ref,computed,onMounted,onBeforeUnmount,nextTick} from 'vue';
import VendorMenu from 'openvue/menu';
import { createCspMenu } from '../workspace/cspMenu.js';
const Menu = createCspMenu(VendorMenu);
import VendorDialog from 'openvue/dialog';
import { createCspDialog } from '../workspace/cspDialog.js';
const Dialog = createCspDialog(VendorDialog);
import Badge from 'openvue/badge';
import Message from 'openvue/message';
import Toast from 'openvue/toast';
import SearchIcon from '@openvue/icons/search';
import BarsIcon from '@openvue/icons/bars';
import GridIcon from '@openvue/icons/thlarge';
import CalendarIcon from '@openvue/icons/calendar';
import InfoIcon from '@openvue/icons/infocircle';
import UiButton from './UiButton.vue';
import UiTextInput from './UiTextInput.vue';
import UiTag from './UiTag.vue';
import {setKitScheme} from '../design/aura.js';
const props=defineProps({product:{type:String,required:true},shortcutId:{type:String,default:''},registry:{type:Array,required:true},workspace:{type:Object,default:null},status:{type:String,default:'Ready'},loading:Boolean,error:{type:String,default:''}});
const emit=defineEmits(['open','reset']);
const collapsed=ref(false),palette=ref(false),query=ref(''),scheme=ref('dark'),profile=ref(false);
const iconMap={grid:GridIcon,calendar:CalendarIcon,info:InfoIcon};
function windowState(id){props.workspace?.revision?.value;return props.workspace?.windows?.state('panel-'+id) ?? {hidden:false,floating:false,maximized:false};}
const groups=computed(()=>Array.from(new Set(props.registry.map(item=>item.group))).map(group=>({label:group,items:props.registry.filter(item=>item.group===group).map(item=>({...item,hidden:windowState(item.id).hidden,command:()=>open(item)}))})));
const results=computed(()=>props.registry.filter(item=>item.label.toLowerCase().includes(query.value.toLowerCase())));
function open(item){emit('open',item);palette.value=false;query.value='';}
async function showPalette(){palette.value=true;await nextTick();document.getElementById('shell-command-input')?.focus();}
function shortcut(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();void showPalette();}}
function toggleScheme(){scheme.value=scheme.value==='dark'?'light':'dark';setKitScheme(scheme.value);try{localStorage.setItem('capsule-kit-scheme',scheme.value);}catch{}}
onMounted(()=>{try{if(localStorage.getItem('capsule-kit-scheme')==='light')scheme.value='light';}catch{}setKitScheme(scheme.value);document.addEventListener('keydown',shortcut);});
onBeforeUnmount(()=>document.removeEventListener('keydown',shortcut));
</script>
<template>
 <div id="shell/grid" class="ui-app-shell" :class="{'ui-app-shell--collapsed':collapsed}">
  <header id="shell/header" role="banner" :aria-label="product" class="ui-app-topbar">
   <UiButton id="shell/navigation/toggle" data-semantic-anchor="shell/navigation/toggle" label="Toggle navigation" aria-label="Toggle navigation" :aria-expanded="!collapsed" @click="collapsed=!collapsed"><BarsIcon aria-hidden="true" /></UiButton>
   <slot name="logo"><span class="ui-product-mark" aria-hidden="true"><GridIcon /></span></slot><strong class="ui-product-name">{{product}}</strong>
   <span class="ui-topbar-context">Workspace</span>
   <UiButton id="shell-command-open" data-semantic-anchor="shell/navigation/command-open" label="Search capsules" aria-label="Search capsules (Control K)" aria-keyshortcuts="Control+K" class="ui-command-launch" @click="showPalette"><SearchIcon aria-hidden="true" /><span>Search capsules</span><kbd>Ctrl K</kbd></UiButton>
   <UiButton id="shell-theme-toggle" data-semantic-anchor="shell/navigation/theme-toggle" :label="scheme==='dark'?'Light theme':'Dark theme'" :aria-label="scheme==='dark'?'Use light theme':'Use dark theme'" @click="toggleScheme" />
   <UiButton id="shell-profile-toggle" data-semantic-anchor="shell/navigation/profile-toggle" label="Profile & settings" aria-label="Profile and settings" :aria-expanded="profile" @click="profile=!profile" />
  </header>
  <aside id="shell/navigation" class="ui-app-sidebar" :hidden="collapsed" aria-label="Capsules">
   <p class="ui-sidebar-heading">WORKSPACE</p>
   <Menu id="shell-app-menu" :pt="{ list: { 'data-semantic-anchor': 'shell/menu/app-list' }, item: ({ context }) => ({ style: undefined, 'data-semantic-anchor': 'shell/menu/item-' + context.item.id }) }" :model="groups" aria-label="Capsule menu" class="ui-capsule-menu"><template #item="{item,props:bindings}"><a v-bind="bindings.action" role="button" :id="'shell-menu-'+item.id" :data-semantic-anchor="'shell/navigation/menu-'+item.id" :aria-label="(item.hidden?'Show ':'Open ')+item.label" :data-window-hidden="String(item.hidden)" :class="{'ui-menu-hidden':item.hidden}"><component :is="iconMap[item.icon] || GridIcon" aria-hidden="true" /><span>{{item.label}}</span><span v-if="item.hidden" class="ui-menu-show">Show</span><Badge v-if="item.unread" :value="item.unread" /><UiTag v-if="item.status" :label="item.status" /></a></template></Menu>
   <div class="ui-sidebar-footer"><UiTag label="Local workspace" /><small>{{registry.length}} capsule types</small></div>
  </aside>
  <main id="shell/wall" class="ui-app-main" aria-label="Workspace">
   <Message v-if="error" severity="error" :closable="false" role="alert">{{error}}</Message>
   <div v-if="loading" class="ui-workspace-loading" role="status" aria-label="Loading workspace"></div>
   <slot />
   <Message v-if="!loading && !registry.length" severity="info" :closable="false">No capsules registered.</Message>
  </main>
  <footer class="ui-app-status" role="status" aria-label="Workspace status"><span>{{product}} / Workspace</span><span>{{status}}</span><UiButton v-if="shortcutId" id="shell-terminal-shortcut" data-semantic-anchor="shell/navigation/terminal-shortcut" :label="registry.find(item=>item.id===shortcutId)?.label || shortcutId" @click="open(registry.find(item=>item.id===shortcutId))" /></footer>
  <Dialog v-model:visible="palette" modal header="Open a capsule" class="ui-command-palette" :draggable="false" id="shell-command-palette"><UiTextInput id="shell-command-input" data-semantic-anchor="settings/capsule-search" v-model="query" label="Find capsule" placeholder="Find a capsule…" @keydown.enter="results[0] && open(results[0])" /><div role="list" aria-label="Matching capsules"><UiButton v-for="item in results" :key="item.id" :id="'shell-command-'+item.id" :data-semantic-anchor="'shell/navigation/command-'+item.id" :label="item.label" :aria-label="'Open '+item.label" @click="open(item)" /></div><Message v-if="!results.length" severity="info" :closable="false">No matching capsules. Try another name.</Message></Dialog>
  <Dialog v-model:visible="profile" modal header="Workspace settings" :draggable="false" id="shell-profile-menu"><UiButton id="tp3-reset-cockpit" data-semantic-anchor="settings/reset-cockpit" label="Restore default cockpit" @click="emit('reset');profile=false" /><p>Layout preferences are separate from application saves.</p><UiTag label="Local profile" /></Dialog>
  <Toast position="bottom-right" />
 </div>
</template>
<style>
:root{font-family:var(--cuk-semantic-typography-font-family-sans);font-size:var(--cuk-semantic-typography-font-size-md);color:var(--cuk-semantic-text-primary);background:var(--cuk-semantic-surface-canvas);}
*{box-sizing:border-box;}body{margin:0;}
.ui-app-shell{height:100dvh;min-width:0;display:grid;grid-template-columns:var(--cuk-component-app-shell-sidebar-width) minmax(0,1fr);grid-template-rows:var(--cuk-component-app-shell-topbar-height) minmax(0,1fr) var(--cuk-component-app-shell-status-height);grid-template-areas:"top top" "side main" "status status";background:var(--cuk-semantic-surface-canvas);}
.ui-app-shell--collapsed{grid-template-columns:0 minmax(0,1fr);}
.ui-app-topbar{grid-area:top;display:flex;align-items:center;gap:var(--cuk-semantic-spacing-sm);padding:0 var(--cuk-semantic-spacing-md);border-bottom:var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);background:var(--cuk-semantic-surface-chrome);}
.ui-product-mark{width:var(--cuk-component-app-shell-logo-size);height:var(--cuk-component-app-shell-logo-size);display:grid;place-items:center;background:var(--cuk-semantic-text-accent);color:var(--cuk-semantic-surface-canvas);border-radius:var(--cuk-semantic-radius-sm);}
.ui-product-mark svg,.ui-capsule-menu svg{width:var(--cuk-semantic-typography-font-size-md);flex-shrink:0;}
.ui-product-name{letter-spacing:var(--cuk-component-app-shell-space-hairline);}.ui-topbar-context{color:var(--cuk-semantic-text-muted);border-left:var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);padding-left:var(--cuk-semantic-spacing-md);}
.ui-command-launch{margin-left:auto;gap:var(--cuk-semantic-spacing-sm);}.ui-command-launch kbd{font-family:var(--cuk-semantic-typography-font-family-mono);color:var(--cuk-semantic-text-muted);}
.ui-app-sidebar{grid-area:side;min-height:0;overflow:auto;display:flex;flex-direction:column;border-right:var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);padding:var(--cuk-semantic-spacing-sm);background:var(--cuk-semantic-surface-chrome);}.ui-app-sidebar[hidden]{display:none;}
.ui-sidebar-heading{font-size:var(--cuk-semantic-typography-font-size-xs);color:var(--cuk-semantic-text-muted);letter-spacing:var(--cuk-component-app-shell-space-hairline);padding:var(--cuk-semantic-spacing-sm);}
.ui-capsule-menu{background:transparent!important;border:0!important;min-width:0!important;width:100%;}.ui-capsule-menu a{display:flex;gap:var(--cuk-semantic-spacing-sm);align-items:center;min-height:var(--cuk-component-app-shell-control-height);text-decoration:none;cursor:pointer;}.ui-menu-hidden{color:var(--cuk-semantic-text-muted);}.ui-menu-show{margin-left:auto;font-size:var(--cuk-semantic-typography-font-size-xs);color:var(--cuk-semantic-text-accent);}
.ui-sidebar-footer{margin-top:auto;display:flex;flex-direction:column;gap:var(--cuk-semantic-spacing-sm);padding:var(--cuk-semantic-spacing-sm);color:var(--cuk-semantic-text-muted);}
.ui-app-main{grid-area:main;min-width:0;min-height:0;overflow:hidden;position:relative;}.ui-app-status{grid-area:status;display:flex;align-items:center;justify-content:space-between;gap:var(--cuk-semantic-spacing-md);padding:0 var(--cuk-semantic-spacing-md);border-top:var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);color:var(--cuk-semantic-text-muted);font-size:var(--cuk-semantic-typography-font-size-xs);}
.ui-command-palette{width:var(--cuk-component-app-shell-palette-width);max-width:100vw;}.ui-command-palette input{width:100%;}.ui-command-palette [role=list]{display:flex;flex-direction:column;gap:var(--cuk-semantic-spacing-xs);padding-top:var(--cuk-semantic-spacing-sm);}.ui-workspace-loading{position:absolute;inset:0;}
.ui-page{padding:var(--cuk-semantic-spacing-md);}.ui-page-title{font-size:var(--cuk-semantic-typography-roles-page-title-font-size);}.ui-field{display:flex;flex-direction:column;gap:var(--cuk-semantic-spacing-xs);}.ui-field small{color:var(--cuk-semantic-text-muted);}
button:focus-visible,a:focus-visible,input:focus-visible{outline:var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);outline-offset:var(--cuk-component-app-shell-space-hairline);}
.dv-tab:has([data-hidden=true]){display:none!important;}

.cuk-csp-dialog:not([open]) { display: none !important; }
.cuk-csp-dialog { margin: auto; padding: 0; color: var(--cuk-semantic-text-primary); background: var(--cuk-component-dialog-host-surface); }
</style>
