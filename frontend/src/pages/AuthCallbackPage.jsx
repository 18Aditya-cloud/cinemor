import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import AuthCard from '../components/auth/AuthCard.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import { ArrowLeft, Lock } from '../components/Icons.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../router/router.jsx';
import { completeGoogleSignup, finishGoogleSignIn } from '../services/api.js';
import styles from './AuthPage.module.css';

/**
 * /auth/callback: where Supabase sends the browser back after "Sign in with Google" (services/api.js,
 * loginWithGoogle). It finishes the sign-in with the backend, then:
 *   - someone who already has an account          -> their home page
 *   - a new Google user who chose a type on Sign up -> that type is saved (POST /api/auth/account-type), then home
 *   - a new Google user from Log in                 -> /choose-account asks Individual or Organization (once)
 */
export default function AuthCallbackPage() {
  useDocumentTitle('Signing in');
  const { search, navigate } = useRouter();
  const { setUser, setPendingGoogle } = useAuth();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code in the link can be used only once
    started.current = true;
    (async () => {
      try {
        let { user, accountType } = await finishGoogleSignIn(search);
        if (user?.needsAccountType && accountType) user = (await completeGoogleSignup({ accountType })).user;
        if (user?.needsAccountType) {
          setPendingGoogle({ email: user.email });
          navigate('/choose-account', { replace: true });
          return;
        }
        setUser(user);
        navigate(homeFor(user), { replace: true });
      } catch (err) {
        setError(err.message || 'Google sign-in failed. Please try again.');
      }
    })();
  }, [search, navigate, setUser, setPendingGoogle]);

  return (
    <div className={styles.page}>
      <AuthCard mode="plain">
        <div className={styles.swap}>
          {error ? (
            <AuthSuccess icon={Lock} title="Google sign-in didn't finish" text={error}>
              <div className={styles.backRow}>
                <Link to="/login" className={styles.backLink}>
                  <ArrowLeft width={16} height={16} />
                  Back to log in
                </Link>
              </div>
            </AuthSuccess>
          ) : (
            <p className={styles.checking} role="status">
              Signing you in with Google...
            </p>
          )}
        </div>
      </AuthCard>
    </div>
  );
}
