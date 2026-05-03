import api from './client';

// Settings persist in two places:
//   1. localStorage  — fast read on every render, survives offline
//   2. /api/user-settings  — synced across devices, source of truth on login
//
// Strategy:
//   - On app boot (post-login), fetch from server and merge into localStorage.
//     Server values overwrite local because that's the cross-device truth.
//   - On every change, write through to localStorage immediately, then debounce
//     a PATCH to the server.

const PATCHABLE_KEYS = new Set([
  'theme',
  'fab-hint-enabled',
  'home-buttons',
  'show-streak',
  'show-suggestion-banner',
  'show-weekly-summary',
  'show-quick-actions-bar',
  'show-planner',
  'compact-ui',
  'large-text',
  'share-weight',
  'show-log-search',
  'show-log-describe',
]);

function lsRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsWrite(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

// Convert the raw value we'd put in localStorage into the JSON the server
// stores. Keeps the server schema simple (string/bool/object) while the
// client keeps its '0'/'1' habit for booleans.
function toServerValue(key, raw) {
  if (raw === null || raw === undefined) return null;
  if (key === 'theme' || key === 'home-buttons') {
    if (key === 'home-buttons') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw; // theme is a string
  }
  // Boolean-flag-like keys
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return raw;
}

function fromServerValue(key, value) {
  if (value === null || value === undefined) return null;
  if (key === 'theme') return String(value);
  if (key === 'home-buttons') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
}

let pendingPatch = {};
let patchTimer = null;
// Coalesce a tiny window of rapid changes into a single request, but stay
// short enough that navigating away after a single toggle still flushes.
const FLUSH_MS = 80;

async function flushPatch() {
  patchTimer = null;
  const payload = pendingPatch;
  pendingPatch = {};
  if (Object.keys(payload).length === 0) return;
  try {
    await api.patch('/user-settings', payload);
  } catch {
    // Quiet fail — local cache stays correct, retry on next change.
  }
}

// Last-resort flush: if a patch is still pending when the tab is being
// closed/navigated, fire it synchronously via sendBeacon so it actually
// reaches the server. The Authorization header isn't supported on Beacon,
// but the cookie/JWT goes via the existing Beacon to /api/user-settings
// which still has the auth middleware — so we fall back to sync XHR with
// the auth header instead.
function flushOnUnload() {
  if (Object.keys(pendingPatch).length === 0) return;
  try {
    const token = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
    if (!token) return;
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', '/api/user-settings', false); // sync — only OK at unload
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(JSON.stringify(pendingPatch));
    pendingPatch = {};
  } catch {}
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushOnUnload);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnUnload();
  });
}

// Public API ------------------------------------------------------------

// Write a settings key both locally and (debounced) to the server.
export function writeSetting(key, value) {
  if (value === null || value === undefined) {
    lsRemove(key);
  } else {
    lsWrite(key, value);
  }
  if (PATCHABLE_KEYS.has(key)) {
    pendingPatch[key] = toServerValue(key, value);
    if (patchTimer) clearTimeout(patchTimer);
    patchTimer = setTimeout(flushPatch, FLUSH_MS);
  }
}

// Pull the user's settings from the server and write them into localStorage
// so the rest of the app reads them through the existing LS code paths.
// Fires once on app boot.
//
// Race-aware: if a PATCH is currently pending or in-flight, we skip those
// keys — otherwise a refresh fired right after a user toggle would clobber
// the new local value with the older server value before the PATCH lands.
export async function syncSettingsFromServer() {
  // Force any debounced patch to flush before we read, so the server gives
  // us the freshest values we just wrote.
  if (patchTimer) {
    clearTimeout(patchTimer);
    patchTimer = null;
    try { await flushPatch(); } catch {}
  }
  try {
    const { data } = await api.get('/user-settings');
    const settings = data?.settings || {};
    let changed = false;
    for (const [key, value] of Object.entries(settings)) {
      // Don't overwrite a key the user is in the middle of changing.
      if (key in pendingPatch) continue;
      const local = fromServerValue(key, value);
      if (local !== null && lsRead(key) !== local) {
        lsWrite(key, local);
        changed = true;
      }
    }
    if (changed) {
      // Tell the dashboard / settings to re-read.
      window.dispatchEvent(new CustomEvent('home-display-changed'));
      // Apply theme right away so we don't FOUC.
      const theme = lsRead('theme');
      if (theme) document.documentElement.setAttribute('data-theme', theme);
    }
  } catch {
    // Likely 401 / offline — fall back to whatever's in localStorage.
  }
}

// Reset on the server to match the client-side reset.
export async function resetServerSettings() {
  try { await api.post('/user-settings/reset'); } catch {}
}
