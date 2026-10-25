<script setup>
defineProps({label:{type:String,required:true},forId:{type:String,required:true},help:{type:String,default:''}});
</script>
<template><div class="ui-field"><label :for="forId">{{label}}</label><slot /><small v-if="help">{{help}}</small></div></template>
