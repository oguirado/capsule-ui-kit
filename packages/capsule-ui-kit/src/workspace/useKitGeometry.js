/** Reactive geometry carried by an attribute and a nonce-bearing sheet. */
import { onBeforeUnmount, unref, useId, watchEffect } from 'vue';
import { clearKitGeometryRule, setKitGeometryRule } from './kitGeometrySheet.js';

/** @param {() => any} declarations @returns {string} */
export function useKitGeometry(declarations) {
  const key = `cuk-geometry-${useId()}`;
  const doc = globalThis.document;
  watchEffect(() => setKitGeometryRule(doc, key, key, unref(declarations()), true));
  onBeforeUnmount(() => clearKitGeometryRule(doc, key));
  return key;
}
