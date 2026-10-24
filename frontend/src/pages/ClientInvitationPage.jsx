import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import { checkPassword } from '../auth/passwordRules.js';
import AuthCard from '../components/auth/AuthCard.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import PasswordChecklist from '../components/auth/PasswordChecklist.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle, ArrowLeft, Check, KeyRound, Lock } from '../components/Icons.jsx';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../router/router.jsx';
import { acceptClientInvitation, getClientInvitation, isBackendConnected } from '../services/api.js';
import styles from './AuthPage.module.css';

/**
 * /client-invitation?token=...: where the link in a client's invitation email leads (Clients page, "Invite").
 * The page first asks the backend who invited whom, then:
 *   - a new client chooses a password and is signed in, landing in the client portal (/client);
 *   - a client who already has a Cinemor client login (another studio invited them before) just confirms, and this
 *     studio's projects are added to that login; they log in as usual.
 * A used, cancelled or expired link says so instead.
 */
export default function ClientInvitationPage() {
  useDocumentTitle('Join the client portal');
  const uid = useId();
  const { search, navigate } = useRouter();
  const { setUser } = useAuth();
  const token = useMemo(() => new URLSearchParams(search).get('token') || '', [search]);
  const [info, setInfo] = useState(null); // { email, clientName, organizationName, hasAccount }
  const [invalid, setInvalid] = useState(!token || !isBackendConnected);
  const [linked, setLinked] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [shake, setShake] = useState(0);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!token || !isBackendConnected) return undefined;
    let alive = true;
    getClientInvitation(token)
      .then((x) => alive && setInfo(x))
      .catch(() => alive && setInvalid(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const check = checkPassword(password);
  const matches = confirm.length > 0 && confirm === password;
  const passwordError = touched.password && !check.allMet ? 'Your password does not meet all the rules yet.' : '';
  const confirmError = touched.confirm && !matches ? (confirm ? 'The two passwords do not match.' : 'Type your password again.') : '';

  const fail = (error) => {
    setSaving(false);
    if ([400, 404, 410].includes(error.status)) setInvalid(true);
    else {
      setFormError(error.message || 'Something went wrong. Please try again.');
      setShake((n) => n + 1);
    }
  };

  const join = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!info.hasAccount) {
      setTouched({ password: true, confirm: true });
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
    }
    setSaving(true);
    try {
      const result = await acceptClientInvitation({ token, password, confirmPassword: confirm });
      if (result.linked) {
        setLinked(true);
        setSaving(false);
        return;
      }
      setUser(result.user);
      navigate(homeFor(result.user), { replace: true });
    } catch (error) {
      fail(error);
    }
  };

  let body;
  if (invalid) {
    body = (
      <AuthSuccess icon={Lock} title="This invitation can't be used" text="The link may have been used already, or it has expired or been cancelled. Ask the studio to send you a new invitation.">
        <div className={styles.backRow}>
          <Link to="/login" className={styles.backLink}>
            <ArrowLeft width={16} height={16} />
            Go to log in
          </Link>
        </div>
      </AuthSuccess>
    );
  } else if (linked) {
    body = (
      <AuthSuccess icon={Check} title="You're in" text={`${info.organizationName}'s projects were added to your client portal. Log in with ${info.email} and your password to see them.`}>
        <div className={styles.backRow}>
          <Link to="/login" className={styles.backLink}>
            <ArrowLeft width={16} height={16} />
            Go to log in
          </Link>
        </div>
      </AuthSuccess>
    );
  } else if (!info) {
    body = <p className={styles.sub} aria-busy="true">Opening your invitation…</p>;
  } else {
    body = (
      <>
        <span className={styles.iconTile} aria-hidden="true">
          <KeyRound width={30} height={30} />
        </span>
        <header className={styles.head} style={{ marginTop: 18 }}>
          <h1 className={styles.title}>{info.hasAccount ? 'Add these projects' : 'Join the client portal'}</h1>
          <p className={styles.sub}>
            <strong>{info.organizationName}</strong> invited {info.clientName ? <strong>{info.clientName}</strong> : 'you'} ({info.email}) to follow your projects on Cinemor AI:
            watch the films, see the storyboards and talk to your Team Leader.
            {info.hasAccount ? ' You already have a client login, so the projects are simply added to it.' : ' Choose a password to finish.'}
          </p>
        </header>
        <form className={styles.form} onSubmit={join} noValidate>
          {!info.hasAccount && (
            <>
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
            </>
          )}
          {formError && (
            <p className={styles.formError} role="alert">
              <AlertCircle width={18} height={18} />
              <span>{formError}</span>
            </p>
          )}
          <GlowButton type="submit" size="lg" className={styles.submit} loading={saving} disabled={saving}>
            {saving ? 'Saving' : info.hasAccount ? 'Add the projects' : 'Set password and join'}
          </GlowButton>
        </form>
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
