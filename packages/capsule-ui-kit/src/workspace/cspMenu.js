/** Preserve vendor menu behavior while dropping its empty presentation binding. */
import { cloneVNode, isVNode } from 'vue';

/** Empty vendor style bindings render style="" even when pt supplies null.
 * Nonempty declarations fail so this adapter cannot conceal inline geometry.
 * @param {any} node @returns {any}
 */
export function cleanMenuVNode(node) {
  // Compiled blocks index the same VNodes through children and dynamicChildren.
  // Both paths must reach the mounted copy when Vue patches or unmounts it.
  const copies = new WeakMap();
  /** @param {any} current @returns {any} */
  function clean(current) {
    if (Array.isArray(current)) return current.map(clean);
    if (!isVNode(current)) return current;
    if (copies.has(current)) return copies.get(current);
    // Vue's public VNode declaration omits this compiled-block runtime field.
    /** @type {import('vue').VNode & {dynamicChildren?: import('vue').VNode[] | null}} */
    const block = current;
    /** @type {typeof block} */
    const copy = cloneVNode(current);
    copies.set(current, copy);
    if (copy.props) {
      const { style: presentation, ...attributes } = copy.props;
      if (presentation && (typeof presentation !== 'object' || Object.keys(presentation).length)) {
        throw new Error('Kit menu rejects inline presentation');
      }
      copy.props = attributes;
    }
    if (Array.isArray(current.children)) copy.children = current.children.map(clean);
    if (block.dynamicChildren) copy.dynamicChildren = block.dynamicChildren.map(clean);
    return copy;
  }
  return clean(node);
}

/** @param {any} vendor @returns {any} */
function cleanComponent(vendor) {
  return {
    extends: vendor,
    /** @param {...any} args */
    render(...args) { return cleanMenuVNode(vendor.render.apply(this, args)); },
  };
}

/** @param {any} Menu @returns {any} */
export function createCspMenu(Menu) {
  return {
    ...cleanComponent(Menu),
    components: { ...Menu.components, PVMenuitem: cleanComponent(Menu.components.PVMenuitem) },
  };
}
