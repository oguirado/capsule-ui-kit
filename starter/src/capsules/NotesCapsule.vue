<script setup>
import { ref } from 'vue';
const draft = ref('');
const notes = ref(/** @type {string[]} */ ([]));
function addNote() { const text = draft.value.trim().slice(0,280); if (!text || notes.value.length >= 50) return; notes.value.push(text); draft.value=''; }
</script>
<template><section class="example" aria-label="Notes capsule"><h2>Session notes</h2><p>Notes remain in this session only.</p>
<form @submit.prevent="addNote"><label for="note-draft">New note</label><input id="note-draft" v-model="draft" maxlength="280" data-semantic-anchor="notes/draft" />
<button id="note-add" :disabled="!draft.trim() || notes.length >= 50" data-semantic-anchor="notes/add">Add note</button></form>
<ul><li v-for="(note,index) in notes" :key="index">{{ note }}</li></ul><p v-if="!notes.length" role="status">Write your first note above.</p></section></template>
