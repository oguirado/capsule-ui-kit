# Window semantics

The starter owns one secured Electron window. The docked workspace permits tabs, moves, floating presentation groups and layout persistence. Popout windows remain unavailable under the kit's current policy; show the disabled reason instead of silently invoking window.open.

A capsule's stable identity survives layout moves, folds and presentation close. Backend destruction must be an explicit, independently authorized consumer action. Terminal presentation retains its own attachment lifecycle; no PTY is created by the starter.

DockWorkspace restores beneath a veil and emits wall-settled after its restoration barrier. The starter emits CAPSULE_STARTER_READY from that event. The smoke runner observes this built-renderer signal, closes the app and fails on timeout or renderer loss. An app-ready event alone does not pass the proof.

Use F6 and Shift-F6 for group navigation. Ctrl-K opens the command palette; Escape closes it and returns focus. The palette traps Tab while open. Theme and command buttons have stable IDs and accessible names. Resize preserves a useful workspace at the specified minimum viewport.
