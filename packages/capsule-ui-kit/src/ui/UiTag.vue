<script setup>
import Tag from 'openvue/tag';
defineProps({label:{type:String,required:true},status:{type:String,default:'info'}});
</script>
<template><Tag :value="label" :severity="status === 'error' ? 'danger' : status === 'success' ? 'success' : 'info'" /></template>
