<script setup>
defineProps({title:{type:String,required:true}});
</script>
<template><section class="ui-page"><h1 class="ui-page-title">{{title}}</h1><slot /></section></template>
