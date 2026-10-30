import { homeFor } from './homeFor.js';

/*
 * Where to go right after logging in or signing up.
 *
 * Normally that is the person's home (homeFor). The landing page's "Create your first" button asks for Quick Create
 * instead: it calls rememberQuickCreate() and sends a new visitor to Sign up. The wish is kept in this browser for two
 * hours (localStorage, so it survives the email-confirmation tab), and used once by the first individual account that
 * signs in. Quick Create lives in the individual dashboard, so other account types simply go home.
 */
const KEY = 'cm-after-auth';
const QUICK_CREATE = '/dashboard/quick-create';
const FRESH_MS = 2 * 60 * 60 * 1000;

export const quickCreatePath = QUICK_CREATE;

export function rememberQuickCreate() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ to: QUICK_CREATE, at: Date.now() }));
  } catch {
    /* storage off: they land on their home instead */
  }
}

export function afterAuth(user) {
  let wish = null;
  try {
    wish = JSON.parse(localStorage.getItem(KEY) || 'null');
    localStorage.removeItem(KEY);
  } catch {
    wish = null;
  }
  const fresh = wish?.to && Date.now() - (wish.at || 0) < FRESH_MS;
  if (fresh && user?.accountType === 'individual') return wish.to;
  return homeFor(user);
}