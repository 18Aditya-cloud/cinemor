import { useId, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import { checkPassword } from '../auth/passwordRules.js';
import AuthCard from '../components/auth/AuthCard.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import PasswordChecklist from '../components/auth/PasswordChecklist.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle, ArrowLeft, KeyRound, Lock } from '../components/Icons.jsx';
import { acceptInvitation, demoInvitationEmail } from '../dashboard/api/organizationApi.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../router/router.jsx';
import { isBackendConnected } from '../services/api.js';
import styles from './AuthPage.module.css';

/**
 * /accept-invitation?token=...: where the link in an employee's invitation email leads (your backend builds that
 * link and sends the email). The employee chooses a password, types it again, and that's all: the backend already
 * knows their email, organization, job role and whether they are a Team Leader or Reviewer, from the invitation.
 * It saves the password against their email and signs them in, so they land on their own home straight away;
 * afterwards they log in with that same email and password (a Team Leader then lands on the Team Leader dashboard).
 *
 * If the link is used, cancelled or expired, the page says so instead. In demo mode the link comes from the
 * organization's Invitations page ("Copy invite link").
 */
export default function AcceptInvitationPage() {
  useDocumentTitle('Set your password');
  const uid = useId();
  const { search, navigate } = useRouter();
  const { setUser } = useAuth();
  const token = useMemo(() => new URLSearchParams(search).get('token') || '', [search]);
  const email = useMemo(() => (isBackendConnected || !token ? '' : demoInvitationEmail(token)), [token]);
  const [invalid, setInvalid] = useState(!token);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [shake, setShake] = useState(0);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const check = checkPassword(password);
  const matches = confirm.length > 0 && confirm === password;
  const passwordError = touched.password && !check.allMet ? 'Your password does not meet all the rules yet.' : '';
  const confirmError = touched.confirm && !matches ? (confirm ? 'The two passwords do not match.' : 'Type your password again.') : '';

  const onSubmit = async (event) => {
    event.preventDefault();
    setTouched({ password: true, confirm: true });
    setFormError('');
    if (!check.allMet) {
      passwordRef.current?.focus();
      setShake((n) => n + 1);
      return;
    }
    if (!matches) {
      confirmRef.current?.focus();
      setShake((n) => n + 1);
      return;
    }
    setSaving(true);
    try {
      const result = await acceptInvitation({ token, password, confirmPassword: confirm });
      setUser(result.user);
      navigate(homeFor(result.user), { replace: true });
    } catch (error) {
      setSaving(false);
      if ([400, 404, 410].includes(error.status)) setInvalid(true);
      else {
        setFormError(error.message || 'Something went wrong. Please try again.');
        setShake((n) => n + 1);
      }
    }
  };

  const body = invalid ? (
    <AuthSuccess icon={Lock} title="This invitation can't be used" text="The link may have been used already, or it has expired or been cancelled. Ask your organization to send you a new invitation.">
      <div className={styles.backRow}>
        <Link to="/login" className={styles.backLink}>
          <ArrowLeft width={16} height={16} />
          Go to log in
        </Link>
      </div>
    </AuthSuccess>
  ) : (
    <>
      <span className={styles.iconTile} aria-hidden="true">
        <KeyRound width={30} height={30} />
      </span>
      <header className={styles.head} style={{ marginTop: 18 }}>
        <h1 className={styles.title}>Set your password</h1>
        <p className={styles.sub}>
          {email ? (
            <>
              You were invited to join your team on Cinemor AI as <strong>{email}</strong>. Choose a password to finish.
            </>
          ) : (
            'You were invited to join your team on Cinemor AI. Choose a password to finish.'
          )}
        </p>
      </header>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div>
          <PasswordField
            id={`${uid}-password`}
            label="Password"
            name="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            inputRef={passwordRef}
            disabled={saving}
            error={passwordError}
            success={check.allMet && password.length > 0}
            describedBy={`${uid}-guide`}
            onChange={(event) => setPassword(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (password) setTouched((t) => ({ ...t, password: true }));
            }}
          />
          <PasswordChecklist id={`${uid}-guide`} password={password} open={focused || password.length > 0} />
        </div>
        <PasswordField
          id={`${uid}-confirm`}
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          inputRef={confirmRef}
          disabled={saving}
          error={confirmError}
          hint={matches ? 'Passwords match' : undefined}
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
          {saving ? 'Saving' : 'Set password and join'}
        </GlowButton>
      </form>
    </>
  );

  return (
    <div className={styles.page}>
      <AuthCard mode="plain" shake={shake}>
        <div className={styles.swap}>{body}</div>
      </AuthCard>
    </div>
  );
}
