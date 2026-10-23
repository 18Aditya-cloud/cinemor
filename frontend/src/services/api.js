/**
 * The ONLY file that talks to the backend for signing in (the dashboards' own calls are in dashboard/api/).
 *
 * - If VITE_API_URL is empty, every function runs in DEMO MODE: no network requests, a short fake delay, and a fake
 *   success. The site works on its own (this is what the hosted preview uses).
 * - If VITE_API_URL is set (for example http://localhost:8000), the same functions call the Cinemor backend
 *   (FastAPI, backend/services/story-service). Components never change.
 *
 * How signing in works with the backend:
 *   - POST /api/auth/login returns { access_token } and sets an HttpOnly refresh cookie (cinemor_refresh_token,
 *     path /api/auth). The access token lives ONLY in memory here (never in localStorage) and is sent as
 *     "Authorization: Bearer ..." on every request.
 *   - It lasts 15 minutes. When a request answers 401, POST /api/auth/refresh (the cookie) gets a new one and the
 *     request is tried once more. On a page reload the same refresh call restores the session.
 *   - GET /api/auth/me says who is signed in; toUser() turns it into the { email, accountType, ... } the pages use.
 */

const API_URL = (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

export const isBackendConnected = Boolean(API_URL);

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ================================================================================================
 * The session (backend mode): the access token and who is signed in, kept in memory only.
 * ============================================================================================== */
let accessToken = null;
let me = null; // the last GET /api/auth/me, as toUser() made it
let refreshing = null; // one refresh at a time: the refresh token changes on every use, so two at once would clash

/** Who is signed in right now (backend mode), or null. The dashboards read organizationId / id from it. */
export const currentSession = () => me;

const setSession = (token, user = me) => {
  accessToken = token || null;
  me = token ? user : null;
};

/**
 * GET /api/auth/me  ->  the user object every page uses:
 *   { id, email, accountType: 'organization' | 'employee' | 'individual' | null, employeeId, teamLeader, reviewer,
 *     organizationId, organizationName, needsAccountType }
 * accountType comes from the membership role first: the backend stores account_type "organization" for the employees
 * too (they joined an organization), so role "organization_admin" = the organization's own account, role "employee" =
 * an employee. A Google user who has not chosen Individual / Organization yet has account_type null.
 */
export function toUser(data) {
  if (!data?.user) return null;
  const role = data.role || data.membership?.role || null;
  const accountType = role === 'organization_admin' ? 'organization' : role === 'employee' || data.is_employee ? 'employee' : data.account_type || null;
  return {
    id: data.user.id,
    email: data.user.email,
    accountType,
    // Team Leader routes (/api/team-leaders/{id}/...) and every employee route use the USER id.
    employeeId: data.user.id,
    teamLeader: Boolean(data.is_team_leader),
    reviewer: Boolean(data.is_reviewer),
    organizationId: data.organization_id ?? null,
    organizationName: data.organization_name || '',
    needsAccountType: !accountType,
  };
}

/** FastAPI errors: { detail: 'text' } or, for a rejected form, { detail: [ { loc, msg } ] }. Turn either into one sentence. */
function messageFrom(data, status) {
  const detail = data?.detail ?? data?.message ?? data?.error;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    const lines = detail.map((item) => {
      const raw = String(item?.msg || '');
      // the backend's own checks ("Value error, Password must contain ...") are already full sentences
      if (/^Value error,/i.test(raw)) return raw.replace(/^Value error,\s*/i, '');
      // pydantic's generic ones ("String should have at least 12 characters") get the field's name in front
      const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : '';
      const label = typeof field === 'string' && field !== 'body' ? field.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '';
      return label ? `${label}: ${raw.charAt(0).toLowerCase()}${raw.slice(1)}.` : raw;
    });
    return [...new Set(lines)].join(' ');
  }
  if (status >= 500) return 'The server had a problem. Please try again in a moment.';
  return `Request failed (${status})`;
}

/**
 * One request. `body` is sent as JSON, or as it is when it is FormData (file uploads; the browser sets the
 * multipart header). `as: 'blob'` returns the response's bytes (images, videos, downloads) instead of JSON.
 */
async function send(path, { method = 'GET', body, token, as = 'json' } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include', // the refresh cookie
      cache: as === 'blob' ? 'no-store' : undefined,
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    const error = new Error("Can't reach the server. Check your connection and try again.");
    error.status = 0;
    throw error;
  }
  if (as === 'blob' && response.ok) return response.blob();
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty (204) or non-JSON response */
  }
  if (!response.ok) {
    const error = new Error(messageFrom(data, response.status));
    error.status = response.status; // the pages use this, for example 401 = wrong password, 409 = email taken
    error.detail = data?.detail;
    throw error;
  }
  return data;
}

/** POST /api/auth/refresh (the cookie) -> a new access token. Resolves true / false; never throws. */
export function refreshSession() {
  if (!isBackendConnected) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = send('/api/auth/refresh', { method: 'POST' })
      .then((data) => {
        accessToken = data?.access_token || null;
        return Boolean(accessToken);
      })
      .catch(() => {
        setSession(null);
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * Any backend call. Sends the access token; on 401 refreshes it once and tries again.
 * `auth: false` for the calls made before signing in.
 * Identical GETs made at the same moment (several parts of a page asking for the job-role list, say) share one
 * request instead of each going to the server.
 */
const inFlight = new Map();
export function request(path, options = {}) {
  const method = options.method || 'GET';
  if (method !== 'GET' || options.body !== undefined) return requestOnce(path, options);
  const key = `${options.auth === false ? 'anon' : 'auth'} ${options.as || 'json'} ${path}`;
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      requestOnce(path, options).finally(() => inFlight.delete(key)),
    );
  }
  return inFlight.get(key);
}

async function requestOnce(path, { method = 'GET', body, auth = true, as } = {}) {
  if (!auth) return send(path, { method, body, as });
  if (!accessToken) await refreshSession();
  try {
    return await send(path, { method, body, token: accessToken, as });
  } catch (error) {
    if (error.status !== 401) throw error;
    const renewed = await refreshSession();
    if (!renewed) throw Object.assign(new Error('Your session has ended. Please log in again.'), { status: 401 });
    return send(path, { method, body, token: accessToken, as });
  }
}

/** GET /api/auth/me with the current token, remembered for the dashboards. */
async function loadMe() {
  const data = await request('/api/auth/me');
  me = toUser(data);
  return me;
}

/** After the backend handed us a new access token (login, invitation, Google): who is it? */
export async function startSession(token) {
  setSession(token, null);
  const user = await loadMe();
  return { user };
}

/* ================================================================================================
 * Log in / sign up / log out
 * ============================================================================================== */

/** POST /api/auth/login  { email, password }  ->  { access_token } (+ the refresh cookie) */
export async function login({ email, password }) {
  if (!isBackendConnected) {
    await wait(900);
    // Demo only: someone who joined an organization through an invitation logs in as that organization's employee
    // (and, if the organization made them a Team Leader, lands on the Team Leader dashboard).
    const lower = String(email).trim().toLowerCase();
    const employee = demoEmployee(lower);
    if (employee) {
      // someone who set a password through their invitation link must use that same password to get back in
      const { passwordHash, ...who } = employee;
      if (passwordHash) {
        const given = await demoHash(password);
        if (given && given !== passwordHash) throw demoError('That email and password do not match.', 401);
      }
      return { user: { email, accountType: 'employee', ...who }, demo: true };
    }
    // Demo only: an email that signed up here keeps the type it signed up with (Organization opens the dashboard).
    const known = demoAccounts[lower];
    return { user: { email, accountType: known?.accountType || 'individual' }, demo: true };
  }
  const data = await send('/api/auth/login', { method: 'POST', body: { email, password } });
  return startSession(data.access_token);
}

/**
 * POST /api/auth/register/individual | /api/auth/register/organization  { email, password, confirm_password }
 * The backend creates the account (409 if the email is taken) but does not sign in, so this logs in straight after.
 */
export async function signup({ accountType, email, password }) {
  if (!isBackendConnected) {
    await wait(1000);
    saveDemoAccount(String(email).trim().toLowerCase(), accountType);
    return { user: { email, accountType }, demo: true };
  }
  const type = accountType === 'organization' ? 'organization' : 'individual';
  await send(`/api/auth/register/${type}`, { method: 'POST', body: { email, password, confirm_password: password } });
  return login({ email, password });
}

/** POST /api/auth/logout (ends this browser's session and clears the cookie) */
export async function logout() {
  if (!isBackendConnected) return {};
  try {
    await send('/api/auth/logout', { method: 'POST' });
  } finally {
    setSession(null);
  }
  return {};
}

/** POST /api/auth/logout-all  ->  every session of this account, on every device, ends. */
export async function logoutAllDevices() {
  if (!isBackendConnected) {
    await wait(700);
    return {};
  }
  await request('/api/auth/logout-all', { method: 'POST' });
  setSession(null);
  return {};
}

/**
 * Who is signed in, on page load: the refresh cookie gives a new access token, then GET /api/auth/me.
 * Resolves { user } (user is null when nobody is signed in).
 */
export async function getCurrentUser() {
  if (!isBackendConnected) return { user: null };
  const ok = await refreshSession();
  if (!ok) return { user: null };
  try {
    return { user: await loadMe() };
  } catch {
    setSession(null);
    return { user: null };
  }
}

/* ------------------------------------------------------------------------------------------------
 * DEMO MODE ONLY: a pretend database of accounts, so the site can be tried without a backend. It is kept in memory
 * and, where the browser allows it, in localStorage (so it survives a reload).
 * ---------------------------------------------------------------------------------------------- */
const DEMO_KEY = 'cm-demo-accounts';
const DEMO_GOOGLE_EMAIL = 'demo.user@gmail.com';
let demoAccounts = {};
let demoPending = null; // a Google user who has signed in but has not yet chosen an account type
try {
  demoAccounts = JSON.parse(window.localStorage.getItem(DEMO_KEY) || '{}');
} catch {
  /* storage blocked (for example in a sandboxed preview): the memory copy is used */
}
const saveDemoAccount = (email, accountType) => {
  demoAccounts[email] = { accountType };
  try {
    window.localStorage.setItem(DEMO_KEY, JSON.stringify(demoAccounts));
  } catch {
    /* ignore */
  }
};
const demoError = (message, status) => Object.assign(new Error(message), { status });

// DEMO ONLY: a one-way fingerprint (SHA-256) of a password, so the demo can check "does this password match the one
// chosen when the invitation was accepted" without keeping the password itself. The real check happens on the server.
// Returns '' where the browser offers no crypto (a non-https page), which simply turns the demo check off.
export async function demoHash(text) {
  try {
    const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cinemor-demo:${text}`));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

// DEMO ONLY: the organization dashboard's demo database (see dashboard/api/organizationApi.js) is read straight from
// storage here, rather than imported, to keep this file free of the dashboard's code.
const demoEmployee = (email) => {
  try {
    const org = JSON.parse(window.localStorage.getItem('cm-demo-org') || 'null');
    const e = org?.employees?.find((x) => x.email.toLowerCase() === email);
    return e ? { employeeId: e.id, teamLeader: Boolean(e.teamLeader), reviewer: Boolean(e.reviewer), passwordHash: e.passwordHash || '' } : null;
  } catch {
    return null;
  }
};

/* ================================================================================================
 * "Sign in with Google" / "Sign up with Google" (backend mode: through Supabase, as the backend expects)
 *
 *   1. The browser goes to Supabase, which asks Google (PKCE: a secret "code verifier" stays in this browser).
 *   2. Supabase sends the browser back to /auth/callback?code=...  (pages/AuthCallbackPage.jsx)
 *   3. That page swaps the code for a Supabase access token (POST {SUPABASE}/auth/v1/token?grant_type=pkce),
 *   4. and gives it to the backend: POST /api/auth/oauth/supabase { access_token } -> the Cinemor access token.
 *   5. A brand-new Google user has no account type yet: "Sign up with Google" already chose one (it is remembered
 *      in sessionStorage for the trip), otherwise /choose-account asks, then POST /api/auth/account-type.
 * Needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, and http://localhost:5173/auth/callback (your site's
 * address + /auth/callback) listed under Supabase > Authentication > URL Configuration > Redirect URLs.
 * ============================================================================================== */
const PKCE_KEY = 'cm-google-pkce';
const INTENT_KEY = 'cm-google-intent';

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function loginWithGoogle({ intent = 'login', accountType } = {}) {
  if (!isBackendConnected) {
    await wait(900);
    const known = demoAccounts[DEMO_GOOGLE_EMAIL];
    if (known) {
      return { user: { email: DEMO_GOOGLE_EMAIL, accountType: known.accountType, provider: 'google' }, demo: true };
    }
    if (accountType) {
      saveDemoAccount(DEMO_GOOGLE_EMAIL, accountType);
      return { user: { email: DEMO_GOOGLE_EMAIL, accountType, provider: 'google' }, demo: true };
    }
    demoPending = { email: DEMO_GOOGLE_EMAIL };
    return { needsAccountType: true, google: { ...demoPending }, demo: true };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Google sign-in is not set up: add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the frontend .env file.');
  }
  const verifier = base64url(window.crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try {
    window.sessionStorage.setItem(PKCE_KEY, verifier);
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ intent, accountType: accountType || null }));
  } catch {
    throw new Error('Google sign-in needs this browser to allow site storage.');
  }
  const params = new URLSearchParams({
    provider: 'google',
    redirect_to: `${window.location.origin}/auth/callback`,
    code_challenge: challenge,
    code_challenge_method: 's256',
  });
  window.location.assign(`${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`);
  return new Promise(() => {}); // the page is leaving, so this never finishes
}

/**
 * /auth/callback: finish the Google sign-in. Resolves { user, accountType } where accountType is what "Sign up with
 * Google" chose before leaving (or null); user.needsAccountType is true for a Google user with no type yet.
 */
export async function finishGoogleSignIn(search = window.location.search) {
  const params = new URLSearchParams(search);
  const failure = params.get('error_description') || params.get('error');
  if (failure) throw new Error(failure.replace(/\+/g, ' '));
  const code = params.get('code');
  let verifier = '';
  let chosen = null;
  try {
    verifier = window.sessionStorage.getItem(PKCE_KEY) || '';
    chosen = JSON.parse(window.sessionStorage.getItem(INTENT_KEY) || 'null')?.accountType || null;
    window.sessionStorage.removeItem(PKCE_KEY);
    window.sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* storage blocked */
  }
  if (!code || !verifier) throw new Error('This Google sign-in link has expired. Please try again.');

  let supabase;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    supabase = await response.json().catch(() => null);
    if (!response.ok || !supabase?.access_token) throw new Error(supabase?.error_description || supabase?.msg || 'Google sign-in failed.');
  } catch (error) {
    throw new Error(error.message || 'Google sign-in failed.');
  }

  const data = await send('/api/auth/oauth/supabase', { method: 'POST', body: { access_token: supabase.access_token } });
  const { user } = await startSession(data.access_token);
  return { user, accountType: chosen };
}

/** Who is waiting to choose an account type: a Google user signed in with no type yet. Resolves { email } or null. */
export async function getPendingGoogleSignup() {
  if (!isBackendConnected) return demoPending ? { ...demoPending } : null;
  if (!me) await getCurrentUser();
  return me?.needsAccountType ? { email: me.email } : null;
}

/** POST /api/auth/account-type { account_type }  ->  (once only) the account becomes Individual or Organization. */
export async function completeGoogleSignup({ accountType }) {
  if (!isBackendConnected) {
    await wait(800);
    if (!demoPending) throw demoError('Your Google sign-in expired. Please sign in with Google again.', 401);
    const { email } = demoPending;
    saveDemoAccount(email, accountType);
    demoPending = null;
    return { user: { email, accountType, provider: 'google' }, demo: true };
  }
  await request('/api/auth/account-type', { method: 'POST', body: { account_type: accountType } });
  return { user: await loadMe() };
}

/** "Use a different account": forget the half-finished Google sign-in (signs out; errors are ignored). */
export async function cancelGoogleSignup() {
  if (!isBackendConnected) {
    demoPending = null;
    return {};
  }
  try {
    await logout();
  } catch {
    /* ignore */
  }
  return {};
}

/* ================================================================================================
 * Forgot / reset / change password
 *
 * Log in -> "Forgot password?" -> the visitor types their email -> the server emails a link ->
 * {FRONTEND_URL}/reset-password?token=THE_TOKEN -> they choose a new password.
 * Demo mode (no backend): nothing is sent. The token "demo" is treated as a valid link; anything else as expired.
 * ============================================================================================== */

/** POST /api/auth/forgot-password { email } -> 200 whether or not the email has an account. */
export async function requestPasswordReset({ email }) {
  if (!isBackendConnected) {
    await wait(900);
    return {};
  }
  return send('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

/**
 * Is a reset link still good? The backend has no "check the link" endpoint, so with a backend the page simply opens
 * and a used or expired link is reported when the new password is saved.
 */
export async function verifyResetToken(token) {
  if (!isBackendConnected) {
    await wait(700);
    if (token !== 'demo') throw Object.assign(new Error('This link has expired.'), { status: 410 });
    return { email: 'de***@gmail.com' };
  }
  if (!token || token.length < 32) throw Object.assign(new Error('This link is not valid.'), { status: 400 });
  return {};
}

/** POST /api/auth/reset-password { token, new_password, confirm_password } */
export async function resetPassword({ token, password }) {
  if (!isBackendConnected) {
    await wait(1000);
    if (token !== 'demo' || !password) throw Object.assign(new Error('This link has expired.'), { status: 410 });
    return {};
  }
  return send('/api/auth/reset-password', { method: 'POST', body: { token, new_password: password, confirm_password: password } });
}

/**
 * Can the signed-in person change their password from Settings? The backend only has this for an organization's
 * administrator (PATCH /api/organizations/{id}/profile/password); others can use "Forgot password?" for now.
 */
export const canChangePassword = () => !isBackendConnected || me?.accountType === 'organization';

/** Settings, "Change Password": PATCH /api/organizations/{id}/profile/password { new_password, confirm_password } */
export async function changeAccountPassword({ newPassword }) {
  if (!isBackendConnected) {
    await wait(900);
    return {};
  }
  if (!canChangePassword() || !me?.organizationId) {
    throw new Error('Changing the password here is not available for this account yet. Use "Forgot password?" on the Log in page instead.');
  }
  return request(`/api/organizations/${me.organizationId}/profile/password`, {
    method: 'PATCH',
    body: { new_password: newPassword, confirm_password: newPassword },
  });
}
