/**
 * DockWorkspace owns the identity of vendor tab nodes. Dockview 8.4.1 emits
 * data-tab-panel-id from panel.id; its counter-based DOM id is presentation only.
 * This binding also repairs the tabpanel's accessible-name reference.
 */

/**
 * @param {ParentNode} root A workspace stage or floating group root.
 * @returns {void}
 */
export function bindDockTabIdentities(root) {
  const references = root.querySelectorAll('[aria-labelledby]');
  for (const tab of root.querySelectorAll('.dv-tab[data-tab-panel-id]')) {
    const panelId = tab.getAttribute('data-tab-panel-id');
    if (typeof panelId !== 'string' || panelId.length === 0) continue;
    // Encode the full immutable id, preserving distinctions such as '/' vs '-'.
    const encoded = encodeURIComponent(panelId);
    const id = `workspace-tab-${encoded}`;
    const previous = tab.id;
    tab.id = id;
    tab.setAttribute('data-semantic-anchor', `workspace/tab/${encoded}`);
    if (!previous || previous === id) continue;
    for (const reference of references) {
      const labels = reference.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
      if (labels.includes(previous)) {
        reference.setAttribute('aria-labelledby', labels.map(label => label === previous ? id : label).join(' '));
      }
    }
  }
}
