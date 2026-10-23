import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, isBackendConnected, logout } from '../services/api.js';

// DEMO MODE ONLY: remember who is signed in across page reloads, until they log out. With a backend the
// session lives in a cookie on your server, and this is not used.
const SESSION_KEY = 'cm-demo-session';
const readDemoSession = () => {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
};
const writeDemoSession = (user) => {
  try {
    if (user) window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: the session lasts until the page is closed */
  }
};

/**
 * Who is signed in. The pages call setUser(...) after a successful log in or sign up.
 *
 * With a backend connected, the session is the backend's refresh cookie. On page load services/api.js trades it for
 * an access token (POST /api/auth/refresh) and asks "who am I?" (GET /api/auth/me), so a reload keeps the user
 * signed in. In demo mode there is no server, so the user is kept in localStorage.
 *
 * user looks like: { email: 'a@b.com', accountType: 'individual' | 'organization' | 'employee', teamLeader?, ... }
 * (with a backend, see toUser() in services/api.js for every field)
 */
const AuthContext = createContext({
  user: null,
  checking: false,
  pendingGoogle: null,
  emailHint: '',
  setUser: () => {},
  setPendingGoogle: () => {},
  setEmailHint: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => (isBackendConnected ? null : readDemoSession()));
  // A new Google user who signed in but has not chosen Individual / Organization yet: { email }
  const [pendingGoogle, setPendingGoogle] = useState(null);
  // The email typed on Log in when "Forgot password?" was clicked, so that page can pre-fill it. Kept in memory only.
  const [emailHint, setEmailHint] = useState('');
  const [checking, setChecking] = useState(isBackendConnected);

  const setUser = useCallback((next) => {
    setUserState(next);
    if (!isBackendConnected) writeDemoSession(next);
  }, []);

  useEffect(() => {
    if (!isBackendConnected) return undefined;
    let alive = true;
    getCurrentUser()
      .then((result) => {
        if (!alive) return;
        const found = result?.user ?? null;
        // A Google user who has not chosen Individual / Organization yet is not "in" until they do (/choose-account).
        if (found?.needsAccountType) {
          setPendingGoogle({ email: found.email });
          setUser(null);
        } else {
          setUser(found);
        }
      })
      .catch(() => {})
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [setUser]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      /* even if the server is unreachable, sign out locally */
    }
    setUser(null);
  }, [setUser]);

  const value = useMemo(
    () => ({ user, checking, pendingGoogle, emailHint, setUser, setPendingGoogle, setEmailHint, signOut }),
    [user, checking, pendingGoogle, emailHint, setUser, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
