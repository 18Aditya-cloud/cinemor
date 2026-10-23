import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RECOVERY } from '../data/content.js';
import { resetPassword, verifyResetToken } from '../services/api.js';
import { checkPassword } from '../auth/passwordRules.js';
import { Link, useRouter } from '../router/router.jsx';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle, ArrowLeft, KeyRound, Lock } from '../components/Icons.jsx';
import AuthCard from '../components/auth/AuthCard.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import PasswordChecklist from '../components/auth/PasswordChecklist.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import styles from './AuthPage.module.css';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * /reset-password?token=...: where the link in the email leads.
 *
 * It first asks the backend whether the link is still good (services/api.js, verifyResetToken), then shows:
 *   checking -> ready (new password + confirm) -> done ("Password updated")
 *   or: invalid (expired / already used / no token)    or: error (could not reach the server)
 * The new password must meet every rule of the password guide, same as on Sign up.
 * In demo mode the token "demo" is a good link; anything else is shown as expired.
 */
export default function ResetPasswordPage() {
  useDocumentTitle('Reset password');
  const uid = useId();
  const { search, navigate } = useRouter();
  const copy = RECOVERY.reset;
  const token = useMemo(() => new URLSearchParams(search).get('token') || '', [search]);

  const [phase, setPhase] = useState(token ? 'checking' : 'invalid'); // checking | ready | invalid | error | done
  const [maskedEmail, setMaskedEmail] = useState('');
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [shake, setShake] = useState(0);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Is the link still good?
  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      return undefined;
    }
    let live = true;
    setPhase('checking');
    verifyResetToken(token)
      .then((result) => {
        if (!live) return;
        setMaskedEmail(result?.email || '');
        setPhase('ready');
      })
      .catch((error) => {
        if (!live) return;
        // a broken link is "invalid"; a network or server problem is "error" (the link may still be fine)
        setPhase(error.status === 0 || error.status >= 500 ? 'error' : 'invalid');
      });
    return () => {
      live = false;
    };
  }, [token, attempt]);

  // Start typing straight away on a computer once the form appears
  useEffect(() => {
    if (phase === 'ready' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) passwordRef.current?.focus();
  }, [phase]);

  const check = useMemo(() => checkPassword(password), [password]);
  const matches = confirm.length > 0 && confirm === password;
  const passwordError = touched.password && !check.allMet ? "Your password doesn't meet all the requirements yet." : '';
  const confirmError = touched.confirm ? (!confirm ? 'Confirm your new password.' : confirm !== password ? "Passwords don't match." : '') : '';
  const confirmHint = confirm ? (matches ? 'Passwords match' : "Passwords don't match yet") : '';

  const onSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setFormError('');
    setTouched({ password: true, confirm: true });
    if (!check.allMet) {
      passwordRef.current?.focus();
      setShake((n) => n + 1);
      return;
    }
    if (!confirm || confirm !== password) {
      confirmRef.current?.focus();
      setShake((n) => n + 1);
      return;
    }
    setSaving(true);
    try {
      await resetPassword({ token, password });
      if (alive.current) setPhase('done');
    } catch (error) {
      if (!alive.current) return;
      setSaving(false);
      if (error.status === 400 || error.status === 404 || error.status === 410) setPhase('invalid'); // the link stopped working meanwhile
      else {
        setFormError(error.message || GENERIC_ERROR);
        setShake((n) => n + 1);
      }
    }
  };

  const backToLogin = (
    <div className={styles.backRow}>
      <Link to="/login" className={styles.backLink}>
        <ArrowLeft width={16} height={16} />
        Back to log in
      </Link>
    </div>
  );

  let body;
  if (phase === 'checking') {
    body = (
      <p className={styles.checking} role="status">
        {copy.checking}
      </p>
    );
  } else if (phase === 'done') {
    body = (
      <AuthSuccess title={copy.doneTitle} text={copy.doneText}>
        <div className={styles.actions}>
          <GlowButton type="button" size="lg" className={styles.submit} onClick={() => navigate('/login')}>
            Log in
          </GlowButton>
        </div>
      </AuthSuccess>
    );
  } else if (phase === 'invalid') {
    body = (
      <AuthSuccess icon={Lock} title={copy.invalidTitle} text={copy.invalidText}>
        <div className={styles.actions}>
          <GlowButton type="button" size="lg" className={styles.submit} onClick={() => navigate('/forgot-password')}>
            Request a new link
          </GlowButton>
        </div>
        {backToLogin}
      </AuthSuccess>
    );
  } else if (phase === 'error') {
    body = (
      <AuthSuccess icon={AlertCircle} title={copy.errorTitle} text={copy.errorText}>
        <div className={styles.actions}>
          <GlowButton type="button" size="lg" className={styles.submit} onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </GlowButton>
        </div>
        {backToLogin}
      </AuthSuccess>
    );
  } else {
    body = (
      <>
        <span className={styles.iconTile} aria-hidden="true">
          <KeyRound width={30} height={30} />
        </span>
        <header className={styles.head} style={{ marginTop: 18 }}>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.sub}>
            {maskedEmail ? (
              <>
                {copy.subWithEmail} <span className={styles.maskedEmail}>{maskedEmail}</span>.
              </>
            ) : (
              copy.sub
            )}
          </p>
        </header>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div>
            <PasswordField
              id={`${uid}-password`}
              label="New password"
              name="password"
              autoComplete="new-password"
              placeholder="Create a new password"
              value={password}
              inputRef={passwordRef}
              disabled={saving}
              error={passwordError}
              success={check.allMet && password.length > 0}
              describedBy={`${uid}-guide`}
              onChange={(event) => setPassword(event.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => {
                setPasswordFocused(false);
                if (password) setTouched((t) => ({ ...t, password: true }));
              }}
            />
            <PasswordChecklist id={`${uid}-guide`} password={password} open={passwordFocused || password.length > 0} />
          </div>

          <PasswordField
            id={`${uid}-confirm`}
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            inputRef={confirmRef}
            disabled={saving}
            error={confirmError}
            hint={confirmHint}
            hintTone={matches ? 'ok' : undefined}
            success={matches}
            onChange={(event) => setConfirm(event.target.value)}
            onBlur={() => confirm && setTouched((t) => ({ ...t, confirm: true }))}
          />

          {formError && (
            <p className={styles.formError} role="alert">
              <AlertCircle width={18} height={18} />
              <span>{formError}</span>
            </p>
          )}

          <GlowButton type="submit" size="lg" className={styles.submit} loading={saving} disabled={saving}>
            {saving ? 'Updating password' : copy.submit}
          </GlowButton>
        </form>
        {backToLogin}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <AuthCard mode="plain" shake={shake}>
        <div className={styles.swap}>{body}</div>
      </AuthCard>
    </div>
  );
}
