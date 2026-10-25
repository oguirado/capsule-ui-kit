/**
 * Starter preload facade (sandbox-loadable).
 *
 * A closed two-method facade over injected transport/bridge handles: the
 * renderer receives no invoke, send, channel, path or handle capability,
 * and the entry refuses any channel outside the fixed set at the native
 * boundary. Fail-fast shaping only; main re-validates every field.
 */
import { contextBridge, ipcRenderer } from 'electron';

/** Fixed exposure name in the renderer main world. */
export const FACADE_NAME = 'capsuleStarter';

/** Fixed channels behind the two facade methods. */
export const CHANNELS = Object.freeze({
  load: 'capsule-starter:layout.load',
  save: 'capsule-starter:layout.save',
});

/** UTF-8 byte cap for layout payloads, mirrored in main. */
export const MAX_LAYOUT_BYTES = 256 * 1024;

const FIXED_CHANNELS = new Set(Object.values(CHANNELS));

/**
 * @param {string} code Failure code.
 * @param {string} message Failure detail.
 * @returns {never} Always throws.
 */
function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

/**
 * @param {unknown} channel Alleged channel.
 * @param {unknown} args Alleged argument vector.
 * @returns {{ channel: string, args: ReadonlyArray<unknown> }} The admitted call.
 */
function assertFixedCall(channel, args) {
  if (typeof channel !== 'string' || !FIXED_CHANNELS.has(channel)) {
    fail('CHANNEL', 'channel outside the fixed preload set');
  }
  if (!Array.isArray(args)) fail('ARGS', 'invoke args must be an array');
  return { channel, args };
}

/**
 * @param {unknown} value Alleged layout JSON.
 * @returns {string} The admitted JSON.
 */
function assertLayoutJson(value) {
  if (typeof value !== 'string') fail('PAYLOAD', 'layout must be a string');
  if (new TextEncoder().encode(value).byteLength > MAX_LAYOUT_BYTES) {
    fail('PAYLOAD', 'layout exceeds UTF-8 byte cap');
  }
  return value;
}

/**
 * @param {unknown} deps Alleged {transport, bridge} handles.
 * @returns {{ transport: { invoke: Function }, bridge: { exposeInMainWorld: Function } }} Validated handles.
 */
function assertDeps(deps) {
  if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) {
    fail('DEPS', 'deps must be an object');
  }
  const keys = Object.keys(deps).sort();
  if (keys.join(',') !== 'bridge,transport') fail('DEPS', 'deps must be exactly {transport, bridge}');
  const { transport, bridge } = /** @type {Record<string, unknown>} */ (deps);
  if (transport === null || typeof transport !== 'object' || typeof transport.invoke !== 'function') {
    fail('DEPS', 'transport.invoke must be a function');
  }
  if (bridge === null || typeof bridge !== 'object' || typeof bridge.exposeInMainWorld !== 'function') {
    fail('DEPS', 'bridge.exposeInMainWorld must be a function');
  }
  return /** @type {{ transport: { invoke: Function }, bridge: { exposeInMainWorld: Function } }} */ ({
    transport,
    bridge,
  });
}

/**
 * Create the narrow facade and expose it under the fixed name.
 * @param {unknown} deps Injected transport/bridge handles.
 * @returns {{ load: () => Promise<unknown>, save: (json: unknown) => Promise<unknown> }} The frozen exposed API.
 */
export function createStarterFacade(deps) {
  const { transport, bridge } = assertDeps(deps);
  const api = {
    load: () => transport.invoke(CHANNELS.load, []),
    save: (json) => transport.invoke(CHANNELS.save, [assertLayoutJson(json)]),
  };
  const frozen = Object.freeze(api);
  bridge.exposeInMainWorld(FACADE_NAME, frozen);
  return frozen;
}

createStarterFacade({
  transport: {
    /**
     * @param {string} channel Fixed channel.
     * @param {ReadonlyArray<unknown>} args Bounded arguments.
     * @returns {Promise<unknown>} Main outcome.
     */
    invoke: (channel, args) => {
      const call = assertFixedCall(channel, args);
      return ipcRenderer.invoke(call.channel, ...call.args);
    },
  },
  bridge: contextBridge,
});
