// sync.js — Offline-first sync layer between localStorage and the API.
//
// Design: localStorage is the source of truth for the running session.
// On boot we try to refresh from the API; on changes we push (debounced).
// If the API is unreachable everything keeps working locally.
//
// Auth model:
//   - Parent signs in with email magic-link → JWT stored in localStorage
//   - JWT has 24h TTL; if expired, we just stay offline until next sign-in
//   - Multiple child profiles per parent; current child id stored in localStorage

const Sync = (() => {
  const LOG  = (...a) => { try { console.log('[Sync]', ...a); } catch (e) {} };
  const WARN = (...a) => { try { console.warn('[Sync]', ...a); } catch (e) {} };

  // API base — set window.HUROOF_API_BASE in index.html. Empty = offline-only.
  // (Falls back to legacy window.ARABIYATI_API_BASE for backwards compat.)
  const API = (typeof window !== 'undefined' && (window.HUROOF_API_BASE || window.ARABIYATI_API_BASE)) || '';

  const JWT_KEY        = 'arabiyati_jwt';
  const JWT_EMAIL_KEY  = 'arabiyati_jwt_email';
  const PROFILE_ID_KEY = 'arabiyati_remote_id';
  const LAST_SYNC_KEY  = 'arabiyati_last_sync';

  let _putTimer = null;
  let _online = navigator.onLine;
  window.addEventListener('online',  () => { _online = true;  LOG('online'); flush(); });
  window.addEventListener('offline', () => { _online = false; LOG('offline'); });

  function isConfigured() { return !!API; }
  function getJwt()       { return localStorage.getItem(JWT_KEY) || null; }
  function getEmail()     { return localStorage.getItem(JWT_EMAIL_KEY) || null; }
  function getProfileId() { return localStorage.getItem(PROFILE_ID_KEY) || null; }
  function isSignedIn()   { return !!getJwt(); }

  function setProfileId(id) {
    if (id) localStorage.setItem(PROFILE_ID_KEY, id);
    else    localStorage.removeItem(PROFILE_ID_KEY);
  }

  function signOut() {
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(JWT_EMAIL_KEY);
    localStorage.removeItem(PROFILE_ID_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
  }

  async function _api(path, opts) {
    if (!isConfigured()) throw new Error('api-not-configured');
    if (!_online)        throw new Error('offline');
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const jwt = getJwt();
    if (jwt) headers['Authorization'] = 'Bearer ' + jwt;
    const res = await fetch(API + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      WARN('JWT expired/invalid; signing out');
      signOut();
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error('http-' + res.status);
    return res.json();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function requestMagicLink(email) {
    return _api('/auth/magiclink', { method: 'POST', body: { email } });
  }

  async function verifyMagicLink(email, token) {
    // No JWT yet — call directly without auth header
    const res = await fetch(API + `/auth/verify?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('verify-failed-' + res.status);
    const data = await res.json();
    localStorage.setItem(JWT_KEY, data.jwt);
    localStorage.setItem(JWT_EMAIL_KEY, email);
    return data;
  }

  // ── Profile listing / creation ────────────────────────────────────────────
  async function listProfiles() {
    const r = await _api('/profiles');
    return r.profiles || [];
  }

  async function createRemoteProfile(name, avatar) {
    const r = await _api('/profiles', { method: 'POST', body: { name, avatar } });
    return r.id;
  }

  async function fetchProfile(id) {
    return _api('/profiles/' + encodeURIComponent(id));
  }

  async function deleteRemoteProfile(id) {
    return _api('/profiles/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  // ── Push current local profile to server (debounced) ──────────────────────
  function schedulePush(profile) {
    if (!isSignedIn() || !getProfileId()) return;
    if (_putTimer) clearTimeout(_putTimer);
    _putTimer = setTimeout(() => flush(profile), 1500);
  }

  async function flush(profile) {
    if (!isSignedIn() || !getProfileId() || !_online) return;
    const p = profile || (typeof loadProfile === 'function' ? loadProfile() : null);
    if (!p) return;
    try {
      await _api('/profiles/' + encodeURIComponent(getProfileId()), {
        method: 'PUT',
        body: { name: p.name, avatar: p.avatar, data: p },
      });
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      LOG('pushed');
    } catch (e) {
      WARN('push failed (will retry on next change):', e.message);
    }
  }

  // ── Pull remote → overwrite local (used on profile pick / cross-device) ──
  async function pullToLocal() {
    if (!isSignedIn() || !getProfileId()) return null;
    try {
      const r = await fetchProfile(getProfileId());
      const data = r.data || {};
      // Merge: remote name/avatar wins, otherwise full data replaces local
      data.name = r.name;
      data.avatar = r.avatar;
      if (typeof saveProfile === 'function') saveProfile(data);
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      LOG('pulled');
      return data;
    } catch (e) {
      WARN('pull failed:', e.message);
      return null;
    }
  }

  // ── Magic-link callback handler (call this on boot) ───────────────────────
  // If the URL is /#/auth?email=...&token=..., complete sign-in and clean up.
  async function handleAuthCallback() {
    const m = location.hash.match(/^#\/auth\?(.+)$/);
    if (!m) return false;
    const params = new URLSearchParams(m[1]);
    const email = params.get('email');
    const token = params.get('token');
    if (!email || !token) return false;
    try {
      await verifyMagicLink(email, token);
      LOG('signed in as', email);
    } catch (e) {
      WARN('verify failed:', e.message);
    }
    // Strip the auth params from the URL
    history.replaceState(null, '', location.pathname + location.search + '#');
    return true;
  }

  return {
    isConfigured, isSignedIn, getEmail, getProfileId, setProfileId, signOut,
    requestMagicLink, verifyMagicLink, handleAuthCallback,
    listProfiles, createRemoteProfile, fetchProfile, deleteRemoteProfile,
    schedulePush, flush, pullToLocal,
  };
})();
