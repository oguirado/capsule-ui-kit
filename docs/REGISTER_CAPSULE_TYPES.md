# Register capsule types

The consumer owns `starter/src/capsuleTypes.js`. Import each Vue component and add it to the frozen allowlist. Unknown IDs throw; stored layouts never select arbitrary module paths.

```js
import Notes from './capsules/NotesCapsule.vue';
const types = Object.freeze({ notes: Notes });
function resolveType(id) {
  if (!Object.hasOwn(types, id)) throw new Error('Unknown capsule type');
  return types[id];
}
```

`App.vue` registers one `CapsulePanel` adapter with `DockWorkspace.panelComponents`. Dockview passes `params.params.capsuleId`; the adapter resolves the consumer component and renders it in CapsulePanel's `surface` slot. `main.js` provides a validated default layout and stable panel IDs. Add the new panel there using `contentComponent: 'CapsulePanel'` and an allowlisted `capsuleId` parameter. Extend the layout's group views and savedWallPlacements together, then call `decodeAndMigrateLayoutProfile` with the expected scope before mount.

The examples are Hello (local action count) and Notes (bounded local text). Terminal wraps the public `TerminalView` export with `placeholder: true`; a future broker must independently enforce session identity, generation, input ownership and output continuity. Register components through the same adapter in every consumer; do not patch the kit for application-specific views.

Closing, folding or moving a panel changes presentation only. A component mount or Dockview removal is never authority to create or destroy a backend resource.
