<script setup>
import Toolbar from 'openvue/toolbar';
defineProps({label:{type:String,required:true}});
</script>
<template><Toolbar :aria-label="label"><template #start><slot name="start" /></template><template #end><slot name="end" /></template></Toolbar></template>
