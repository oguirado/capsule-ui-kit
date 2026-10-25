/**
 * Session tab status mapping for the terminal tab strip. Pure helper with no
 * DOM, no framework and no imports: activity names map to the three tab chips
 * (`idle`, `busy`, `exited`). Unknown and missing activities render idle.
 * @module side-terminal/sessionTabStatus
 */

/**
 * Maps a session activity name to its tab-strip chip.
 * @param {unknown} activity Session activity name.
 * @returns {'idle' | 'busy' | 'exited'} Chip for the tab strip.
 */
export function resolveSessionTabStatus(activity) {
  if (activity === 'exited' || activity === 'failed') return 'exited';
  if (activity === 'busy' || activity === 'waiting-input' || activity === 'waiting-permission') return 'busy';
  return 'idle';
}
