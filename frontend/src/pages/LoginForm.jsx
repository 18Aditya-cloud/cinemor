import { useEffect, useId, useRef, useState } from 'react';
import { AUTH } from '../data/content.js';
import { isBackendConnected, login, loginWithGoogle } from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import { validateEmail } from '../auth/validators.js';
import { Link, useRouter } from '../router/router.jsx';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle } from '../components/Icons.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import GoogleButton from '../components/auth/GoogleButton.jsx';
import PasswordChecklist from '../components/auth/PasswordChecklist.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import TextField from '../components/auth/TextField.jsx';
import styles from './AuthPage.module.css';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * Log in: email, password (with the password guide), and "Sign in with Google".
 *
 * The password guide here is only guidance. It never blocks logging in, because an existing
 * account may have an older, weaker password. (On Sign up the guide is required.)
 */
export default function LoginForm({ onInvalid }) {
  const copy = AUTH.login;
  const uid = useId();
  const { navigate, search } = useRouter();
  const { setUser, setPendingGoogle, setEmailHint } = useAuth();
  // Settings sends people here after changing their password (the backend signs every session out when it changes).
  const passwordChanged = new URLSearchParams(search || '').get('reason') === 'password-changed';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | google | success
  const [formError, setFormError] = useState('');

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const alive = useRef(true);
  const timer = useRef(0);

  useEffect(() => {
    alive.current = true;
    // Start typing straight away on a computer; on a phone this would only pop the keyboard up.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) emailRef.current?.focus();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const emailError = touched.email ? validateEmail(email) : '';
  const passwordError = touched.password && !password ? 'Enter your password.' : '';
  const busy = status !== 'idle';

  const finish = (user) => {
    const signedIn = user ?? { email: email.trim(), accountType: 'individual' };
    setUser(signedIn);
    setStatus('success');
    timer.current = setTimeout(() => alive.current && navigate(homeFor(signedIn)), 900);
  };

  const fail = (error) => {
    setStatus('idle');
    setFormError(error.status === 401 || error.status === 400 ? "That email and password don't match." : error.message || GENERIC_ERROR);
    onInvalid?.();
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setFormError('');
    setTouched({ email: true, password: true });
    if (validateEmail(email)) {
      emailRef.current?.focus();
      onInvalid?.();
      return;
    }
    if (!password) {
      passwordRef.current?.focus();
      onInvalid?.();
      return;
    }
    setStatus('loading');
    try {
      const result = await login({ email: email.trim(), password });
      if (!alive.current) return;
      if (result?.user?.needsAccountType) {
        // An account that has never chosen Individual / Organization (it began with Google): ask once first.
        setPendingGoogle({ email: result.user.email });
        navigate('/choose-account');
        return;
      }
      finish(result?.user);
    } catch (error) {
      if (alive.current) fail(error);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setFormError('');
    setStatus('google');
    try {
      const result = await loginWithGoogle({ intent: 'login' });
      if (!alive.current) return;
      if (result?.needsAccountType) {
        // New to Cinemor AI: they are not in the database yet, so ask once, then create the account.
        setPendingGoogle(result.google);
        navigate('/choose-account');
        return;
      }
      finish(result?.user);
    } catch (error) {
      if (alive.current) fail(error);
    }
  };

  if (status === 'success') return <AuthSuccess title="You're in" text="Opening your workspace..." />;

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.sub}>{copy.sub}</p>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {passwordChanged && !formError && (
          <p className={styles.notice} role="status">
            Your password was changed, so you were logged out everywhere. Log in with your new password.
          </p>
        )}
        <GoogleButton loading={status === 'google'} disabled={busy} onClick={onGoogle}>
          {copy.google}
        </GoogleButton>

        <div className={styles.divider} aria-hidden="true">
          <span>or</span>
        </div>

        <TextField
          id={`${uid}-email`}
          label="Email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          inputRef={emailRef}
          disabled={busy}
          error={emailError}
          success={touched.email && !emailError && Boolean(email)}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => email.trim() && setTouched((t) => ({ ...t, email: true }))}
        />

        <div>
          <PasswordField
            id={`${uid}-password`}
            label="Password"
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            inputRef={passwordRef}
            disabled={busy}
            error={passwordError}
            describedBy={`${uid}-guide`}
            onChange={(event) => setPassword(event.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => {
              setPasswordFocused(false);
              if (password) setTouched((t) => ({ ...t, password: true }));
            }}
          />
          <div className={styles.forgotRow}>
            <Link to="/forgot-password" className={styles.forgot} onClick={() => setEmailHint(email.trim())}>
              Forgot password?
            </Link>
          </div>
          <PasswordChecklist id={`${uid}-guide`} password={password} open={passwordFocused || password.length > 0} />
        </div>

        {formError && (
          <p className={styles.formError} role="alert">
            <AlertCircle width={18} height={18} />
            <span>{formError}</span>
          </p>
        )}

        <GlowButton type="submit" size="lg" className={styles.submit} loading={status === 'loading'} disabled={busy}>
          {status === 'loading' ? 'Logging in' : copy.submit}
        </GlowButton>
      </form>

      <p className={styles.switch}>
        {copy.switchText}
        <Link to="/signup">{copy.switchLink}</Link>
      </p>

      {!isBackendConnected && <p className={styles.demo}>Demo mode: no backend is connected, so nothing is sent.</p>}
    </>
  );
}
