import Hello from './capsules/HelloCapsule.vue';
import Notes from './capsules/NotesCapsule.vue';
import Terminal from './capsules/TerminalCapsule.vue';
// Consumer-owned, closed registration map. Never load components from profile paths.
export const capsuleTypes = Object.freeze({ hello: Hello, notes: Notes, terminal: Terminal });
/** @param {string} id */
export function resolveCapsuleType(id) {
 if (!Object.hasOwn(capsuleTypes, id)) throw new Error('Unknown capsule type');
 return capsuleTypes[/** @type {keyof typeof capsuleTypes} */ (id)];
}
