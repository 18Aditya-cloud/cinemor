import { useEffect, useRef, useState } from 'react';
import { AUTH } from '../data/content.js';
import { cancelGoogleSignup, completeGoogleSignup, getPendingGoogleSignup } from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle, GoogleG } from '../components/Icons.jsx';
import AccountTypePicker from '../components/auth/AccountTypePicker.jsx';
import AuthCard from '../components/auth/AuthCard.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { useRouter } from '../router/router.jsx';
import styles from './AuthPage.module.css';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * /choose-account: shown ONCE, to a brand-new person who clicked "Sign in with Google" before
 * registering. Their backend account does not exist yet, so we ask how they will use Cinemor AI,
 * then ask the backend to create the account (services/api.js, completeGoogleSignup).
 * Once they exist in the database, Google sign-in never asks again; it just logs them in.
 *
 * Where the Google email comes from: your server remembers the verified Google identity after the
 * Google redirect (GET /api/auth/google/pending). If nothing is pending (the page was opened directly, or
 * it expired) this page sends the visitor back to Log in.
 */
export default function ChooseAccountPage() {
  const copy = AUTH.chooseAccount;
  const { navigate } = useRouter();
  const { user, setUser, pendingGoogle, setPendingGoogle } = useAuth();
  useDocumentTitle('Choose your account');

  const [shake, setShake] = useState(0);
  const [accountType, setAccountType] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | saving | success
  const [error, setError] = useState('');
  const alive = useRef(true);
  const timer = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  // Already signed in? Nothing to choose. Nobody pending? Go and log in.
  useEffect(() => {
    if (status === 'success') return undefined;
    if (user) {
      navigate(homeFor(user), { replace: true });
      return undefined;
    }
    if (pendingGoogle) return undefined;
    let live = true;
    getPendingGoogleSignup()
      .then((pending) => {
        if (!live) return;
        if (pending?.email) setPendingGoogle({ email: pending.email });
        else navigate('/login', { replace: true });
      })
      .catch(() => live && navigate('/login', { replace: true }));
    return () => {
      live = false;
    };
  }, [user, pendingGoogle, status, navigate, setPendingGoogle]);

  const bump = () => setShake((n) => n + 1);

  const onContinue = async () => {
    if (status === 'saving') return;
    if (!accountType) {
      setError(copy.needType);
      bump();
      return;
    }
    setError('');
    setStatus('saving');
    try {
      const result = await completeGoogleSignup({ accountType });
      if (!alive.current) return;
      const created = result?.user ?? { email: pendingGoogle?.email, accountType, provider: 'google' };
      setUser(created);
      setPendingGoogle(null);
      setStatus('success');
      timer.current = setTimeout(() => alive.current && navigate(homeFor(created)), 1100);
    } catch (err) {
      if (!alive.current) return;
      setStatus('idle');
      setError(err.status === 401 ? 'Your Google sign-in expired. Please sign in with Google again.' : err.message || GENERIC_ERROR);
      bump();
    }
  };

  const onDifferent = async () => {
    await cancelGoogleSignup();
    setPendingGoogle(null);
    navigate('/login');
  };

  return (
    <div className={styles.page}>
      <AuthCard mode="welcome" shake={shake}>
        {status === 'success' ? (
          <AuthSuccess title="Account created" text="Opening your workspace..." />
        ) : !pendingGoogle ? (
          <p className={styles.checking} role="status">
            {copy.checking}
          </p>
        ) : (
          <div className={styles.swap}>
            <header className={styles.head}>
              <h1 className={styles.title}>{copy.title}</h1>
              <p className={styles.sub}>{copy.sub}</p>
            </header>

            <p className={styles.who}>
              <GoogleG width={18} height={18} />
              <span>
                {copy.signedInAs} <strong>{pendingGoogle.email}</strong>
              </span>
            </p>

            <AccountTypePicker types={AUTH.types} value={accountType} onSelect={(id) => { setAccountType(id); setError(''); }} />

            {error && (
              <p className={styles.formError} role="alert" style={{ marginTop: 16 }}>
                <AlertCircle width={18} height={18} />
                <span>{error}</span>
              </p>
            )}

            <div className={styles.form}>
              <GlowButton type="button" size="lg" className={styles.submit} loading={status === 'saving'} onClick={onContinue}>
                {status === 'saving' ? 'Creating account' : copy.submit}
              </GlowButton>
            </div>

            <p className={styles.switch}>
              <button type="button" className={styles.linkButton} onClick={onDifferent} disabled={status === 'saving'}>
                {copy.different}
              </button>
            </p>
          </div>
        )}
      </AuthCard>
    </div>
  );
}
