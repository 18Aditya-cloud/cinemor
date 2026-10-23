import { useEffect, useId, useRef, useState } from 'react';
import { RECOVERY } from '../data/content.js';
import { isBackendConnected, requestPasswordReset } from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { validateEmail } from '../auth/validators.js';
import { Link } from '../router/router.jsx';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle, ArrowLeft, KeyRound, Mail } from '../components/Icons.jsx';
import AuthCard from '../components/auth/AuthCard.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import TextField from '../components/auth/TextField.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import styles from './AuthPage.module.css';

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/**
 * /forgot-password: asks for the email and nothing else.
 *
 * Step 1 (form): the email. Step 2 ("Check your email"): says a link was sent (and does not say whether the address has
 * an account), with a Resend button that waits a little between sends.
 * The email itself, with the link to /reset-password?token=..., is sent by your backend (services/api.js,
 * requestPasswordReset). In demo mode nothing is sent, and a button opens the reset page as if the link was clicked.
 */
export default function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const uid = useId();
  const { emailHint } = useAuth();
  const copy = RECOVERY.forgot;

  const [email, setEmail] = useState(emailHint || '');
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState('form'); // form | sent
  const [status, setStatus] = useState('idle'); // idle | sending
  const [formError, setFormError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [note, setNote] = useState('');
  const [shake, setShake] = useState(0);
  const emailRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) emailRef.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  // counts down the seconds until "Send it again" works
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const emailError = touched ? validateEmail(email) : '';
  const sending = status === 'sending';

  const send = async ({ again = false } = {}) => {
    setFormError('');
    setNote('');
    setStatus('sending');
    try {
      await requestPasswordReset({ email: email.trim() });
      if (!alive.current) return;
      setStatus('idle');
      setStep('sent');
      setCooldown(RECOVERY.resendSeconds);
      if (again) setNote('We sent the link again.');
    } catch (error) {
      if (!alive.current) return;
      setStatus('idle');
      setFormError(error.status === 429 ? error.message || 'Too many requests. Please wait a few minutes and try again.' : error.message || GENERIC_ERROR);
      setShake((n) => n + 1);
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (sending) return;
    setTouched(true);
    if (validateEmail(email)) {
      emailRef.current?.focus();
      setShake((n) => n + 1);
      return;
    }
    send();
  };

  /* ---------------- Step 2: check your email ---------------- */
  if (step === 'sent') {
    return (
      <div className={styles.page}>
        <AuthCard mode="plain" shake={shake}>
          <div className={styles.swap}>
            <AuthSuccess
              icon={Mail}
              title={RECOVERY.sent.title}
              text={
                <>
                  If there&apos;s an account for <span className={styles.maskedEmail}>{email.trim()}</span>, we&apos;ve sent a link to reset your password. It works for {RECOVERY.linkMinutes} minutes.
                </>
              }
            >
              <p className={styles.helper}>{RECOVERY.sent.spam}</p>

              <div className={styles.resendRow}>
                <button type="button" className={styles.textButton} onClick={() => send({ again: true })} disabled={cooldown > 0 || sending}>
                  {sending ? 'Sending...' : cooldown > 0 ? `${RECOVERY.sent.resend} (${cooldown}s)` : RECOVERY.sent.resend}
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    setStep('form');
                    setNote('');
                  }}
                >
                  {RECOVERY.sent.different}
                </button>
              </div>
              <p className={styles.liveNote} role="status" aria-live="polite">
                {note}
              </p>
              {formError && (
                <p className={styles.formError} role="alert">
                  <AlertCircle width={18} height={18} />
                  <span>{formError}</span>
                </p>
              )}

              {!isBackendConnected && (
                <div className={styles.demoBox}>
                  <span>Demo mode: no email was really sent, so there is no link to click.</span>
                  <Link to="/reset-password?token=demo">Open the reset page, as if you clicked the link</Link>
                </div>
              )}

              <div className={styles.backRow}>
                <Link to="/login" className={styles.backLink}>
                  <ArrowLeft width={16} height={16} />
                  {copy.back}
                </Link>
              </div>
            </AuthSuccess>
          </div>
        </AuthCard>
      </div>
    );
  }

  /* ---------------- Step 1: the email ---------------- */
  return (
    <div className={styles.page}>
      <AuthCard mode="plain" shake={shake}>
        <div className={styles.swap}>
          <span className={styles.iconTile} aria-hidden="true">
            <KeyRound width={30} height={30} />
          </span>
          <header className={styles.head} style={{ marginTop: 18 }}>
            <h1 className={styles.title}>{copy.title}</h1>
            <p className={styles.sub}>{copy.sub}</p>
          </header>

          <form className={styles.form} onSubmit={onSubmit} noValidate>
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

          <div className={styles.backRow}>
            <Link to="/login" className={styles.backLink}>
              <ArrowLeft width={16} height={16} />
              {copy.back}
            </Link>
          </div>

          {!isBackendConnected && <p className={styles.demo}>Demo mode: no backend is connected, so no email is sent.</p>}
        </div>
      </AuthCard>
    </div>
  );
}
