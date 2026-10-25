<script setup>
import { ref } from 'vue';
const presses = ref(0);
</script>
<template><section class="example" aria-label="Hello capsule"><h2>A place to begin</h2>
<p>Keep your tools side by side. Move a tab to reshape the workspace.</p>
<button id="hello-press" data-semantic-anchor="hello/press" @click="presses++">Try an action</button>
<p role="status">Actions taken: {{ presses }}</p></section></template>
