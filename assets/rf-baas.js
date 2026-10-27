(() => {
  'use strict';
  const config = window.RidgefieldBaasConfig;
  if (!config?.url || !config?.publishableKey) return;
  const SESSION_KEY = 'rf_supabase_session';
  let refreshing = null;
  let memorySession = null;
  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') || memorySession; }
    catch { return memorySession; }
  }
  function saveSession(value) {
    memorySession = value;
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* An in-memory session still works if browser storage is blocked. */ }
    window.dispatchEvent(new Event('ridgefield-auth-change'));
  }
  function restoreAuthCallback() {
    if (typeof location === 'undefined' || typeof history === 'undefined' || !location.hash) return;
    const values = new URLSearchParams(location.hash.slice(1));
    const accessToken = values.get('access_token');
    const refreshToken = values.get('refresh_token');
    if (!accessToken || !refreshToken) return;
    const expiresIn = Number(values.get('expires_in') || 3600);
    const expiresAt = Number(values.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn;
    saveSession({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt });
    history.replaceState(null, '', location.pathname + location.search);
  }
  async function authRequest(path, body, failureMessage = 'Sign-in failed. Check your details and try again.') {
    const response = await fetch(config.url + '/auth/v1/' + path, {
      method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(failureMessage);
    return result;
  }
  async function accessToken() {
    const current = session();
    if (!current?.access_token) return null;
    if (current.expires_at * 1000 > Date.now() + 60000) return current.access_token;
    if (!refreshing) {
      refreshing = authRequest('token?grant_type=refresh_token', { refresh_token: current.refresh_token })
        .then(value => { saveSession(value); return value.access_token; })
        .catch(error => { saveSession(null); throw error; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function request(path, options = {}) {
    const { authenticated = false, ...init } = options;
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid service path.');
    const headers = new Headers(init.headers);
    headers.set('apikey', config.publishableKey);
    if (authenticated) {
      const token = await accessToken();
      if (!token) throw new Error('Please sign in to continue.');
      headers.set('Authorization', 'Bearer ' + token);
    }
    const response = await fetch(config.url + '/functions/v1/ridgefield-api' + path, {
      ...init, headers, signal: init.signal || AbortSignal.timeout(30000), cache: 'no-store'
    });
    if (authenticated && response.status === 401) saveSession(null);
    return response;
  }
  async function api(path, options = {}) {
    const response = await request(path, options);
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok === false) throw new Error(value.error || 'The request could not be completed.');
    return value;
  }
  async function signIn(email, password) {
    const value = await authRequest('token?grant_type=password', { email: email.trim(), password });
    saveSession(value);
    try { await api('/me', { authenticated: true }); }
    catch (error) { saveSession(null); throw error; }
    return value.user;
  }
  async function signUp(email, password, metadata = {}, redirectTo = location.href) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new Error('Use a password between 12 and 128 characters.');
    }
    const redirect = encodeURIComponent(redirectTo);
    const value = await authRequest('signup?redirect_to=' + redirect, {
      email: email.trim(), password, data: metadata
    }, 'The account could not be created. Check the email and try again.');
    const nextSession = value.session || (value.access_token ? value : null);
    saveSession(nextSession);
    return value.user || value;
  }
  async function signOut() {
    try {
      const token = await accessToken();
      if (token) await fetch(config.url + '/auth/v1/logout', {
        method: 'POST', headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(10000)
      });
    } finally { saveSession(null); }
  }
  restoreAuthCallback();
  window.RidgefieldBaas = Object.freeze({ enabled: true, request, api, signIn, signUp, signOut, hasSession: () => !!session()?.access_token });
})();
