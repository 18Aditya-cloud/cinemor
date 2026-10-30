import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AUTH } from '../data/content.js';
import { isBackendConnected, loginWithGoogle, signup } from '../services/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { afterAuth } from '../auth/afterAuth.js';
import { checkPassword } from '../auth/passwordRules.js';
import { validateEmail } from '../auth/validators.js';
import { Link, useRouter } from '../router/router.jsx';
import GlowButton from '../components/GlowButton.jsx';
import { AlertCircle, Building, Person } from '../components/Icons.jsx';
import AccountTypePicker from '../components/auth/AccountTypePicker.jsx';
import AuthSuccess from '../components/auth/AuthSuccess.jsx';
import GoogleButton from '../components/auth/GoogleButton.jsx';
import PasswordChecklist from '../components/auth/PasswordChecklist.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import TextField from '../components/auth/TextField.jsx';
import VerifyEmailNotice from '../components/auth/VerifyEmailNotice.jsx';
import cx from '../utils/cx.js';
import styles from './AuthPage.module.css';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const TYPE_ICONS = { individual: Person, organization: Building };

/**
 * Sign up, in two steps:
 *   1. Choose Individual or Organization.
 *   2. Email, password (with the password guide) and confirm password, plus "Sign up with Google".
 * The chosen type is sent to the backend as accountType.
 * Unlike Log in, the password guide is REQUIRED here: every rule must be met.
 * With a backend, the account works only after its email is confirmed: after submitting, this shows "Check your inbox"
 * (the backend answers the same way whether or not the email was already registered, so nothing here says which).
 */
export default function SignupForm({ onInvalid }) {
  const copy = AUTH.signup;
  const uid = useId();
  const { navigate } = useRouter();
  const { setUser } = useAuth();

  const [step, setStep] = useState('type'); // type | form
  const [direction, setDirection] = useState('forward');
  const [moved, setMoved] = useState(false); // false until the first step change, so nothing slides on load
  const [accountType, setAccountType] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false, confirm: false });
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | google | success | sent
  const [sentEmail, setSentEmail] = useState('');
  const [formError, setFormError] = useState('');

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  const alive = useRef(true);
  const advancing = useRef(false);
  const timer = useRef(0);
  const advanceTimer = useRef(0);

  const type = AUTH.types.find((t) => t.id === accountType);
  const check = useMemo(() => checkPassword(password), [password]);
  const busy = status !== 'idle';

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearTimeout(advanceTimer.current);
    };
  }, []);

  // When the form step opens, start typing straight away on a computer (not on a phone).
  useEffect(() => {
    if (step === 'form' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) emailRef.current?.focus();
  }, [step]);

  const chooseType = (id) => {
    if (advancing.current) return;
    setAccountType(id);
    advancing.current = true;
    // a short pause so you can see your choice light up before the next step slides in
    advanceTimer.current = setTimeout(() => {
      advancing.current = false;
      if (!alive.current) return;
      setDirection('forward');
      setMoved(true);
      setStep('form');
    }, 420);
  };

  const backToType = () => {
    setDirection('back');
    setMoved(true);
    setStep('type');
  };

  const finish = (user) => {
    const created = user ?? { email: email.trim(), accountType };
    setUser(created);
    setStatus('success');
    timer.current = setTimeout(() => alive.current && navigate(afterAuth(created)), 1100);
  };

  const emailError = touched.email ? validateEmail(email) : '';
  const passwordError = touched.password && !check.allMet ? "Your password doesn't meet all the requirements yet." : '';
  const matches = confirm.length > 0 && confirm === password;
  const confirmError = touched.confirm ? (!confirm ? 'Confirm your password.' : confirm !== password ? "Passwords don't match." : '') : '';
  const confirmHint = confirm ? (matches ? 'Passwords match' : "Passwords don't match yet") : '';

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setFormError('');
    setTouched({ email: true, password: true, confirm: true });
    if (validateEmail(email)) {
      emailRef.current?.focus();
      onInvalid?.();
      return;
    }
    if (!check.allMet) {
      passwordRef.current?.focus();
      onInvalid?.();
      return;
    }
    if (!confirm || confirm !== password) {
      confirmRef.current?.focus();
      onInvalid?.();
      return;
    }
    setStatus('loading');
    try {
      const result = await signup({ accountType, email: email.trim(), password });
      if (!alive.current) return;
      if (result?.verificationRequired) {
        setSentEmail(result.email || email.trim());
        setStatus('sent');
        return;
      }
      finish(result?.user);
    } catch (error) {
      if (!alive.current) return;
      setStatus('idle');
      setFormError(error.status === 429 ? 'Too many sign-up attempts. Please wait a minute and try again.' : error.message || GENERIC_ERROR);
      onInvalid?.();
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setFormError('');
    setStatus('google');
    try {
      const result = await loginWithGoogle({ intent: 'signup', accountType });
      if (alive.current) finish(result?.user);
    } catch (error) {
      if (!alive.current) return;
      setStatus('idle');
      setFormError(error.message || GENERIC_ERROR);
      onInvalid?.();
    }
  };

  if (status === 'success') return <AuthSuccess title="Account created" text="Opening your workspace..." />;
  if (status === 'sent') return <VerifyEmailNotice email={sentEmail} />;

  const slide = moved ? (direction === 'back' ? styles.stepBack : styles.stepForward) : undefined;

  /* ---------------- Step 1: Individual or Organization ---------------- */
  if (step === 'type' || !type) {
    return (
      <div key="type" className={slide}>
        <header className={styles.head}>
          <h1 className={styles.title}>{copy.typeTitle}</h1>
          <p className={styles.sub}>{copy.typeSub}</p>
        </header>

        <AccountTypePicker types={AUTH.types} value={accountType} onSelect={chooseType} />

        <p className={styles.switch}>
          {copy.switchText}
          <Link to="/login">{copy.switchLink}</Link>
        </p>
      </div>
    );
  }

  /* ---------------- Step 2: the details ---------------- */
  const TypeIcon = TYPE_ICONS[type.id] || Person;
  return (
    <div key="form" className={slide}>
      <header className={styles.head}>
        <h1 className={styles.title}>{copy.formTitle}</h1>
      </header>

      <div className={styles.chip}>
        <span className={styles.chipInfo}>
          <span className={styles.chipIcon} aria-hidden="true">
            <TypeIcon width={18} height={18} />
          </span>
          <span>{type.title} account</span>
        </span>
        <button type="button" className={styles.chipChange} onClick={backToType} disabled={busy}>
          Change
        </button>
      </div>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <GoogleButton loading={status === 'google'} disabled={busy} onClick={onGoogle}>
          {copy.google}
        </GoogleButton>

        <div className={styles.divider} aria-hidden="true">
          <span>or</span>
        </div>

        <TextField
          id={`${uid}-email`}
          label={type.emailLabel}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={type.emailPlaceholder}
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
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            inputRef={passwordRef}
            disabled={busy}
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
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          inputRef={confirmRef}
          disabled={busy}
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

        <GlowButton type="submit" size="lg" className={cx(styles.submit)} loading={status === 'loading'} disabled={busy}>
          {status === 'loading' ? 'Creating account' : copy.submit}
        </GlowButton>
      </form>

      <p className={styles.switch}>
        {copy.switchText}
        <Link to="/login">{copy.switchLink}</Link>
      </p>

      {!isBackendConnected && <p className={styles.demo}>Demo mode: no backend is connected, so nothing is sent.</p>}
    </div>
  );
}