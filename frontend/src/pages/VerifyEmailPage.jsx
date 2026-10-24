import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { VERIFY } from '../data/content.js';
import { isBackendConnected, resendVerification, verifyEmail } from '../services/api.js';
import { validateEmail } from '../auth/validators.js';
import { Link, useRouter } from '../router/router.jsx';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle, ArrowLeft, Lock, Mail } from '../components/Icons.jsx';
import AuthCard from '../components/auth/AuthCard.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import TextField from '../components/auth/TextField.jsx';
import VerifyEmailNotice from '../components/auth/VerifyEmailNotice.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import styles from './AuthPage.module.css';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * /verify-email?token=...: where the confirmation link from the sign-up email leads.
 *
 *   checking -> done ("Email confirmed", Log in)  or  already (link opened before: also fine)
 *            -> invalid (expired, replaced by a newer link, or no token): enter the email to get a new link
 *            -> error (server unreachable): Try again
 *
 * The token is removed from the address bar as soon as it is read, so it does not linger in the history or leak in a
 * Referer header. In demo mode the token "demo" is a good link.
 */
export default function VerifyEmailPage() {
  useDocumentTitle('Confirm your email');
  const uid = useId();
  const { search, navigate } = useRouter();
  const copy = VERIFY.page;

  const urlToken = useMemo(() => new URLSearchParams(search).get('token') || '', [search]);
  const [token, setToken] = useState(urlToken);
  const [phase, setPhase] = useState(urlToken ? 'checking' : 'invalid'); // checking | done | already | invalid | error | sent
  const [attempt, setAttempt] = useState(0); // bumped by "Try again"
  const pending = useRef(null); // one request per token and attempt, even when React runs effects twice

  // a new link opened while this page is already showing (for example the demo link)
  useEffect(() => {
    if (urlToken && urlToken !== token) {
      setToken(urlToken);
      setPhase('checking');
    }
  }, [urlToken, token]);

  // Keep the token out of the address bar and history.
  useEffect(() => {
    if (window.location.search.includes('token=')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      return undefined;
    }
    let live = true;
    const key = `${token}#${attempt}`;
    if (!pending.current || pending.current.key !== key) {
      pending.current = { key, promise: verifyEmail(token) };
    }
    pending.current.promise
      .then((result) => {
        if (live) setPhase(result?.already_verified ? 'already' : 'done');
      })
      .catch((error) => {
        // a broken link is "invalid"; a network or server problem is "error" (the link may still be fine)
        if (live) setPhase(error.status === 0 || error.status >= 500 ? 'error' : 'invalid');
      });
    return () => {
      live = false;
    };
  }, [token, attempt]);

  /* ------------------------------------------------ ask for a new link (invalid / expired) */
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [shake, setShake] = useState(0);
  const emailRef = useRef(null);
  const emailError = touched ? validateEmail(email) : '';

  const requestNewLink = async (event) => {
    event.preventDefault();
    if (sending) return;
    setTouched(true);
    setFormError('');
    if (validateEmail(email)) {
      emailRef.current?.focus();
      setShake((n) => n + 1);
      return;
    }
    setSending(true);
    try {
      await resendVerification({ email: email.trim() });
      setPhase('sent');
    } catch (error) {
      setFormError(error.status === 429 ? 'Too many requests. Please wait a minute and try again.' : error.message || GENERIC_ERROR);
      setShake((n) => n + 1);
    } finally {
      setSending(false);
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
  } else if (phase === 'done' || phase === 'already') {
    body = (
      <AuthSuccess title={phase === 'done' ? copy.doneTitle : copy.alreadyTitle} text={phase === 'done' ? copy.doneText : copy.alreadyText}>
        <div className={styles.actions}>
          <GlowButton type="button" size="lg" className={styles.submit} onClick={() => navigate('/login')}>
            Log in
          </GlowButton>
        </div>
      </AuthSuccess>
    );
  } else if (phase === 'sent') {
    body = <VerifyEmailNotice email={email.trim()} />;
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
      <AuthSuccess icon={Lock} title={copy.invalidTitle} text={copy.invalidText}>
        <form className={styles.form} onSubmit={requestNewLink} noValidate>
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
            disabled={sending}
            error={emailError}
            success={touched && !emailError && Boolean(email)}
            onChange={(event) => {
              setEmail(event.target.value);
              setFormError('');
            }}
            onBlur={() => email.trim() && setTouched(true)}
          />
          {formError && (
            <p className={styles.formError} role="alert">
              <AlertCircle width={18} height={18} />
              <span>{formError}</span>
            </p>
          )}
          <GlowButton type="submit" size="lg" className={styles.submit} loading={sending} disabled={sending}>
            {sending ? 'Sending' : copy.submit}
          </GlowButton>
        </form>
        {!isBackendConnected && (
          <div className={styles.demoBox}>
            <Mail width={16} height={16} />
            <Link to="/verify-email?token=demo">Demo: open a good confirmation link</Link>
          </div>
        )}
        {backToLogin}
      </AuthSuccess>
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
