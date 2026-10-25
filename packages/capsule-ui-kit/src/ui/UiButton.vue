<script setup>
import Button from 'openvue/button';
const props=defineProps({label:{type:String,required:true},intent:{type:String,default:'neutral'},loading:Boolean});
</script>
<template><Button :label="label" :loading="loading" :severity="intent === 'danger' ? 'danger' : intent === 'primary' ? undefined : 'secondary'" size="small"><slot>{{label}}</slot></Button></template>
