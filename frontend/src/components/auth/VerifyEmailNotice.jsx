import { useEffect, useRef, useState } from 'react';
import { VERIFY } from '../../data/content.js';
import { isBackendConnected, resendVerification } from '../../services/api.js';
import { Link } from '../../router/router.jsx';
import { AlertCircle, ArrowLeft, Mail } from '../Icons.jsx';
import AuthSuccess from './AuthSuccess.jsx';
import styles from '../../pages/AuthPage.module.css';

/**
 * "Check your inbox": shown after Sign up, and on Log in when the account's email is not confirmed yet.
 *
 * Says a confirmation link was sent to `email`, with "Send a new link" (waits VERIFY.resendSeconds between sends, as
 * the backend does) and a way back. The backend answers resends the same way for every address, so this never
 * reveals whether an account exists.
 *
 * Props: email, title, text (optional overrides), startCooldown (true right after a link was sent),
 * onBack + backLabel (a button), or no onBack for a "Back to log in" link.
 */
export default function VerifyEmailNotice({ email, title, text, startCooldown = true, onBack, backLabel = 'Back to log in' }) {
  const [cooldown, setCooldown] = useState(startCooldown ? VERIFY.resendSeconds : 0);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (sending || cooldown > 0) return;
    setError('');
    setNote('');
    setSending(true);
    try {
      await resendVerification({ email });
      if (!alive.current) return;
      setNote(VERIFY.inbox.resent);
      setCooldown(VERIFY.resendSeconds);
    } catch (err) {
      if (!alive.current) return;
      setError(err.status === 429 ? 'Too many requests. Please wait a minute and try again.' : err.message || 'Something went wrong. Please try again.');
    } finally {
      if (alive.current) setSending(false);
    }
  };

  return (
    <AuthSuccess
      icon={Mail}
      title={title || VERIFY.inbox.title}
      text={
        text || (
          <>
            We sent a link to <span className={styles.maskedEmail}>{email}</span>. Open it to confirm your email and finish
            creating your account. It works for {VERIFY.linkHours} hours.
          </>
        )
      }
    >
      <p className={styles.helper}>{VERIFY.inbox.spam}</p>

      <div className={styles.resendRow}>
        <button type="button" className={styles.textButton} onClick={resend} disabled={cooldown > 0 || sending}>
          {sending ? 'Sending...' : cooldown > 0 ? `${VERIFY.inbox.resend} (${cooldown}s)` : VERIFY.inbox.resend}
        </button>
      </div>
      <p className={styles.liveNote} role="status" aria-live="polite">
        {note}
      </p>
      {error && (
        <p className={styles.formError} role="alert">
          <AlertCircle width={18} height={18} />
          <span>{error}</span>
        </p>
      )}

      {!isBackendConnected && (
        <div className={styles.demoBox}>
          <span>Demo mode: no email was really sent, so there is no link to click.</span>
          <Link to="/verify-email?token=demo">Open the confirmation page, as if you clicked the link</Link>
        </div>
      )}

      <div className={styles.backRow}>
        {onBack ? (
          <button type="button" className={styles.backLink} onClick={onBack}>
            <ArrowLeft width={16} height={16} />
            {backLabel}
          </button>
        ) : (
          <Link to="/login" className={styles.backLink}>
            <ArrowLeft width={16} height={16} />
            {backLabel}
          </Link>
        )}
      </div>
    </AuthSuccess>
  );
}
