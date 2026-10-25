/**
 * Capsule starter Electron main.
 *
 * Serves the built renderer on a privileged `app://` origin, opens one
 * secured window on it, and owns a closed two-channel layout store. The
 * security baseline mirrors the kit reference shell: sandboxed renderer,
 * isolated context, no Node in the renderer, a strict CSP on every
 * protocol response (no eval), default-deny navigation and window
 * creation, and atomic bounded layout persistence.
 *
 * There is no PTY backend here by design: the Terminal capsule runs in
 * the kit placeholder mode until a backend ships. Running under plain
 * node imports only the pure surface below and boots nothing; the
 * Electron boot runs solely when `process.versions.electron` is set.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEME = 'app';
const HOST = 'starter';
const ORIGIN = `${SCHEME}://${HOST}`;
const MAX_URL_CHARS = 2048;
const MAX_LAYOUT_BYTES = 256 * 1024;
const EXPECTED_SCOPE = Object.freeze({
  product: 'capsule-starter',
  profileId: 'default',
  workspaceId: 'starter-wall',
});

export const CHANNELS = Object.freeze({
  load: 'capsule-starter:layout.load',
  save: 'capsule-starter:layout.save',
});

export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const MIME_TYPES = new Map([
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.css', 'text/css'],
  ['.json', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const starterRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * True only for URLs under the privileged starter origin. Total: every
 * malformed value is false.
 * @param {unknown} value Alleged URL.
 * @returns {boolean} True for admitted bundled URLs.
 */
export function isStarterUrl(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_URL_CHARS) return false;
  let parsed = null;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === `${SCHEME}:` &&
    parsed.host === HOST &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === ''
  );
}

/**
 * Navigation decision. Total: malformed or foreign URLs deny.
 * @param {unknown} url Candidate destination.
 * @returns {'allow' | 'deny'} allow only for privileged bundled URLs.
 */
export function decideNavigation(url) {
  return isStarterUrl(url) ? 'allow' : 'deny';
}

/**
 * Resolve one `app://` request target to a real file under the bundle
 * root. The traversal analysis runs on the raw target segments: each
 * segment is percent-decoded exactly once, and dot segments,
 * separators, NUL and undecodable escapes refuse.
 * @param {string} canonicalRoot Canonical admitted bundle root.
 * @param {string} rawUrl Raw request URL.
 * @returns {{ ok: true, path: string } | { ok: false, status: number }} File or refusal.
 */
export function resolveBundleFile(canonicalRoot, rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length < 1 || rawUrl.length > MAX_URL_CHARS) {
    return { ok: false, status: 403 };
  }
  if (rawUrl.includes('\\') || rawUrl.includes('\0')) return { ok: false, status: 403 };
  let parsed = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, status: 403 };
  }
  if (parsed.protocol !== `${SCHEME}:` || parsed.host !== HOST) return { ok: false, status: 403 };
  if (parsed.port !== '' || parsed.username !== '' || parsed.password !== '') {
    return { ok: false, status: 403 };
  }
  const separator = rawUrl.indexOf('://');
  const afterHost = rawUrl.slice(separator + 3 + HOST.length).split(/[?#]/, 1)[0] ?? '';
  const segments = [];
  for (const raw of afterHost.split('/')) {
    if (raw === '' || raw === '.') continue;
    let decoded = null;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return { ok: false, status: 403 };
    }
    if (decoded === '' || decoded === '.' || decoded === '..') return { ok: false, status: 403 };
    if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      return { ok: false, status: 403 };
    }
    segments.push(decoded);
  }
  if (segments.length === 0) segments.push('index.html');
  const joined = resolve(canonicalRoot, join(...segments));
  if (joined !== canonicalRoot && !joined.startsWith(canonicalRoot + sep)) {
    return { ok: false, status: 403 };
  }
  let stat = null;
  try {
    const canonical = realpathSync(joined);
    if (canonical !== joined || !canonical.startsWith(realpathSync(canonicalRoot) + sep)) return { ok: false, status: 403 };
    stat = lstatSync(joined);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return { ok: false, status: 404 };
    return { ok: false, status: 403 };
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return { ok: false, status: 404 };
  return { ok: true, path: joined };
}

/**
 * Serve one `app://` request from the admitted bundle root. Total: every
 * refusal is a status response carrying the CSP header.
 * @param {string} canonicalRoot Canonical admitted bundle root.
 * @param {Request} request Fetch-API request delivered by Electron.
 * @returns {Promise<Response>} File or refusal, always with the CSP header.
 */
export async function handleAppRequest(canonicalRoot, request) {
  const refusal = (status, text) =>
    new Response(text, {
      status,
      headers: { 'Content-Type': 'text/plain', 'Content-Security-Policy': CONTENT_SECURITY_POLICY },
    });
  if (request === null || typeof request !== 'object') return refusal(403, 'forbidden');
  if (request.method !== 'GET' && request.method !== 'HEAD') return refusal(403, 'forbidden');
  const resolved = resolveBundleFile(canonicalRoot, request.url);
  if (!resolved.ok) return refusal(resolved.status, resolved.status === 404 ? 'absent' : 'forbidden');
  let bytes = null;
  try {
    bytes = readFileSync(resolved.path);
  } catch {
    return refusal(404, 'absent');
  }
  const dot = resolved.path.lastIndexOf('.');
  const mime = MIME_TYPES.get(dot === -1 ? '' : resolved.path.slice(dot).toLowerCase()) ?? 'application/octet-stream';
  return new Response(request.method === 'HEAD' ? null : bytes, {
    status: 200,
    headers: { 'Content-Type': mime, 'Content-Security-Policy': CONTENT_SECURITY_POLICY },
  });
}

/**
 * Presentation-only layout store. It never enters any command pipeline:
 * the renderer re-validates every profile through the kit decoder, and
 * this store enforces size, JSON shape and scope only.
 * @param {{ userData: string, profileId: string }} options Main-resolved storage root and profile.
 */
export function createLayoutStore({ userData, profileId }) {
  if (typeof userData !== 'string' || userData.length < 1) throw new Error('LAYOUT_ROOT');
  if (typeof profileId !== 'string' || profileId.length < 1) throw new Error('LAYOUT_PROFILE');
  const scope = Object.freeze({ ...EXPECTED_SCOPE, profileId });
  const directory = join(userData, 'ui-layouts');
  const path = join(directory, `${createHash('sha256').update(profileId).digest('hex')}.json`);

  function load() {
    let stat = null;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LAYOUT_BYTES) {
      throw new Error('LAYOUT_SIZE_OR_TYPE');
    }
    const raw = readFileSync(path, 'utf8');
    if (Buffer.byteLength(raw) > MAX_LAYOUT_BYTES) throw new Error('LAYOUT_SIZE');
    return raw;
  }

  /**
   * @param {unknown} raw Alleged profile JSON.
   * @returns {string} The admitted JSON.
   */
  function validate(raw) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_LAYOUT_BYTES) {
      throw new Error('LAYOUT_SIZE');
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('LAYOUT_JSON');
    }
    const candidate = parsed?.scope;
    if (
      candidate === null ||
      typeof candidate !== 'object' ||
      candidate.product !== scope.product ||
      candidate.profileId !== scope.profileId ||
      candidate.workspaceId !== scope.workspaceId
    ) {
      throw new Error('LAYOUT_SCOPE');
    }
    return raw;
  }

  /**
   * Synchronous transactions serialize the sole main-process writer.
   * @param {unknown} raw Alleged profile JSON.
   */
  function save(raw) {
    const json = validate(raw);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomBytes(12).toString('hex')}.tmp`;
    let fd;
    try {
      fd = openSync(temporary, 'wx', 0o600);
      writeFileSync(fd, json, 'utf8');
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temporary, path);
      // Windows does not expose POSIX directory fsync through Node.
      if (process.platform !== 'win32') {
        const dir = openSync(directory, 'r');
        try { fsyncSync(dir); } finally { closeSync(dir); }
      }
    } finally {
      if (fd !== undefined) closeSync(fd);
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
      }
    }
  }

  return Object.freeze({ scope, path, load, save });
}

/**
 * Fixed window options. Every security flag is pinned here.
 * @param {string} preloadPath Main-resolved absolute preload entry.
 */
export function createWindowOptions(preloadPath) {
  if (typeof preloadPath !== 'string' || preloadPath.length < 1 || preloadPath.length > 1024) {
    throw new Error('OPTIONS_PRELOAD');
  }
  if (preloadPath.includes('\0')) throw new Error('OPTIONS_PRELOAD_NUL');
  return Object.freeze({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    webPreferences: Object.freeze({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: preloadPath,
    }),
  });
}

/**
 * Resolve the renderer bundle root and the preload entry. The offline
 * esbuild bundle wins; the source preload covers dev runs only.
 * @param {{ getAppPath: () => string, getPath: (name: string) => string }} app Electron app handle.
 */
export function resolveStarterPaths(app) {
  const root = app.getAppPath();
  const rendererRoot = resolve(root === starterRoot || !root ? starterRoot : root, 'dist/renderer');
  const bundled = join(rendererRoot, '..', 'preload', 'preload.cjs');
  const source = join(starterRoot, 'electron', 'preload.js');
  let preload = null;
  for (const candidate of [bundled]) {
    try {
      const stat = lstatSync(candidate);
      if (stat.isFile() && !stat.isSymbolicLink()) {
        preload = candidate;
        break;
      }
    } catch {
      /* try the next candidate */
    }
  }
  if (preload === null) throw new Error('PRELOAD_ABSENT');
  return Object.freeze({ rendererRoot: resolve(rendererRoot), preload, userData: app.getPath('userData') });
}

/**
 * Boot the starter main on injected Electron handles. Testable without
 * starting Electron; production passes the real handles.
 */
export async function bootStarterMain({ app, BrowserWindow, ipcMain, protocol, session }) {
  const paths = resolveStarterPaths(app);
  protocol.handle(SCHEME, (request) => handleAppRequest(paths.rendererRoot, request));
  const store = createLayoutStore({ userData: paths.userData, profileId: EXPECTED_SCOPE.profileId });
  const window = new BrowserWindow(createWindowOptions(paths.preload));
  const contents = window.webContents;
  const admitSender = (event) => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame || !isStarterUrl(event.senderFrame?.url)) throw new Error('LAYOUT_SENDER');
  };
  ipcMain.handle(CHANNELS.load, (event) => {
    admitSender(event);
    return store.load();
  });
  ipcMain.handle(CHANNELS.save, (event, raw) => {
    admitSender(event);
    store.save(raw);
    return true;
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (decideNavigation(url) === 'deny') event.preventDefault();
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => window.show());
  if (process.env.CAPSULE_STARTER_SMOKE === '1') {
    const timer = setTimeout(() => { console.error('STARTER_READY_TIMEOUT'); app.exit(1); }, 25000);
    contents.on('console-message', (_event, ...args) => {
      const message = typeof _event?.message === 'string' ? _event.message : args.find(v => typeof v === 'string');
      if (message === 'CAPSULE_STARTER_READY') { clearTimeout(timer); console.log(message); app.quit(); }
    });
    contents.on('render-process-gone', () => { clearTimeout(timer); app.exit(1); });
  }
  await contents.loadURL(`${ORIGIN}/index.html`);
  return window;
}

if (process.versions.electron) {
  const electron = await import('electron');
  electron.protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true } },
  ]);
  if (process.env.CAPSULE_STARTER_USER_DATA) electron.app.setPath('userData', process.env.CAPSULE_STARTER_USER_DATA);
  electron.app.whenReady().then(() => bootStarterMain({
    app: electron.app,
    BrowserWindow: electron.BrowserWindow,
    ipcMain: electron.ipcMain,
    protocol: electron.protocol,
    session: electron.session,
  })).catch(error => { console.error(error); electron.app.exit(1); });
  electron.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') electron.app.quit();
  });
}
