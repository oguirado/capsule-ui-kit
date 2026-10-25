<script setup>
import InputText from 'openvue/inputtext';
defineProps({modelValue:{type:String,default:''},label:{type:String,required:true}});
const emit=defineEmits(['update:modelValue']);
</script>
<template><InputText :model-value="modelValue" :aria-label="label" @update:model-value="emit('update:modelValue',$event)" /></template>
