import { useEffect, useId, useMemo, useState } from 'react';
import { ACCOUNT_PASSWORD_RULES, checkPassword } from '../../auth/passwordRules.js';
import PasswordChecklist from '../../components/auth/PasswordChecklist.jsx';
import PasswordField from '../../components/auth/PasswordField.jsx';
import TextField from '../../components/auth/TextField.jsx';
import { changeAccountPassword, isBackendConnected, logoutAllDevices, requestPasswordReset, updateDisplayName } from '../../services/api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useRouter } from '../../router/router.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { getWorkspace, updateOrganizationSettings } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
import { useWorkspace } from '../WorkspaceContext.jsx';
import Button from '../ui/Button.jsx';
import { IconCheck, IconGear, IconKey, IconLogOut, IconUser } from '../ui/DashIcons.jsx';
import DeleteAccountCard from './DeleteAccountCard.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from './SettingsPage.module.css';
import pageStyles from './pages.module.css';

/**
 * Settings: the organization's own details, changing the signed-in administrator's password, and logging out of
 * every device. Independent cards, each with its own Save button; saving the organization's name also refreshes
 * WorkspaceContext, so the heading and the top bar pick up the new name immediately.
 */
export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { data, loading, error, reload } = useResource(() => getWorkspace(), []);

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Settings" subtitle="Manage your organization information and account security." />
      {error && <Notice message={error.message} onRetry={reload} />}
      <div className={styles.stack}>
        <OrganizationCard data={data?.organization} loading={loading && !data} onSaved={reload} />
        <ProfileCard />
        <PasswordCard />
        <SessionsCard />
        <DeleteAccountCard organization />
      </div>
    </div>
  );
}

function OrganizationCard({ data, loading, onSaved }) {
  const toast = useToast();
  const workspace = useWorkspace();
  const [values, setValues] = useState({ name: '', businessType: '', address: '' });
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // fills the form once the organization's details have loaded (or changed underneath, e.g. after a reload)
  useEffect(() => {
    if (data) setValues({ name: data.name || '', businessType: data.businessType || '', address: data.address || '' });
  }, [data]);

  const set = (key) => (event) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    if (key === 'name') setNameError('');
    setFormError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!values.name.trim()) {
      setNameError('Enter an organization name.');
      document.getElementById('settings-org-name')?.focus();
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await updateOrganizationSettings(values);
      toast('Organization details saved');
      workspace.refresh();
      onSaved();
    } catch (err) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    }
    setSaving(false);
  };

  return (
    <section className={pageStyles.panel} aria-labelledby="cm-org-settings-title">
      <div className={pageStyles.panelHead}>
        <div>
          <h2 id="cm-org-settings-title" className={pageStyles.panelTitle}>
            Organization Information
          </h2>
          <p className={pageStyles.panelSub}>Update your organization details.</p>
        </div>
        <Pill tone="green">Active</Pill>
      </div>
      <div className={pageStyles.panelBody}>
        {loading ? (
          <p className={styles.loading}>Loading...</p>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <div className={styles.row}>
              <TextField id="settings-org-name" label="Organization Name" requiredMark placeholder="Enter organization name" value={values.name} onChange={set('name')} error={nameError} disabled={saving} />
              <TextField id="settings-org-type" label="Business Type" placeholder="Enter business type" value={values.businessType} onChange={set('businessType')} disabled={saving} />
            </div>
            <TextField id="settings-org-address" label="Official Address" multiline rows={4} placeholder="Enter official organization address" value={values.address} onChange={set('address')} disabled={saving} />
            {formError && (
              <p className={pageStyles.formError} role="alert">
                {formError}
              </p>
            )}
            <div className={styles.footer}>
              <Button type="submit" icon={IconGear} loading={saving}>
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/**
 * Changing the signed-in person's password (every dashboard's Settings): the current password, then the new one twice.
 * "Forgot your current password?" emails a reset link instead (the same link as on the Log in page).
 */
export function PasswordCard(props) {
  return <PasswordForm {...props} />;
}

/**
 * The name shown on your own dashboard (the welcome heading and the sidebar). The people you work with (reviews,
 * messages, the team) always see the first part of your email. Empty: the first part of the email is shown here too.
 */
export function ProfileCard() {
  const toast = useToast();
  const uid = useId();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fallback = (user?.email || '').split('@')[0];

  const save = async (event) => {
    event.preventDefault();
    if (name.trim().length > 120) return setError('Keep the name under 120 characters.');
    setSaving(true);
    setError('');
    try {
      const saved = await updateDisplayName(name);
      setUser({ ...user, displayName: saved.displayName });
      setName(saved.displayName);
      toast(saved.displayName ? 'Name saved' : 'Name removed');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setSaving(false);
    return undefined;
  };

  return (
    <section className={pageStyles.panel} aria-labelledby={`${uid}-title`}>
      <div className={pageStyles.panelHead}>
        <div>
          <h2 id={`${uid}-title`} className={pageStyles.panelTitle}>
            Your Name
          </h2>
          <p className={pageStyles.panelSub}>
            The name shown on your dashboard. In reviews and messages people see {fallback ? `“${fallback}”` : 'the first part of your email'}{user?.email ? ` (you log in with ${user.email})` : ''}.
          </p>
        </div>
        <IconUser width={20} height={20} className={pageStyles.panelIcon} />
      </div>
      <div className={pageStyles.panelBody}>
        <form className={styles.form} onSubmit={save} noValidate>
          <TextField
            id={`${uid}-name`}
            label="Full Name"
            placeholder={fallback ? `e.g. ${fallback}` : 'Your name'}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
            hint={name.trim() ? undefined : `Without a name, “${fallback}” is shown.`}
            error={error}
            disabled={saving}
            maxLength={120}
          />
          <div className={styles.footer}>
            <Button type="submit" icon={IconCheck} loading={saving} disabled={name.trim() === (user?.displayName || '')}>
              Save Name
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

/** Settings for the dashboards without an organization of their own (Team Leader, employee, client). */
export function AccountSettingsPage() {
  useDocumentTitle('Settings');
  return (
    <div className={pageStyles.page}>
      <PageHeader title="Settings" subtitle="Your name, your password and where you are logged in." />
      <div className={styles.stack}>
        <ProfileCard />
        <PasswordCard description="Update the password you use to log in to Cinemor AI." />
        <SessionsCard />
      </div>
    </div>
  );
}

function PasswordForm({ description = 'Update the password of your organization administrator account.' }) {
  const toast = useToast();
  const { signOut, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const { navigate } = useRouter();
  const uid = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [focused, setFocused] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const check = useMemo(() => checkPassword(password, ACCOUNT_PASSWORD_RULES), [password]);
  const matches = confirm.length > 0 && confirm === password;
  const passwordError = touched.password && password && !check.allMet ? "This password doesn't meet all the requirements yet." : '';
  const confirmError = touched.confirm && confirm && confirm !== password ? "Passwords don't match." : '';

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    setTouched({ password: true, confirm: true });
    if (!current) {
      setFormError('Enter your current password.');
      document.getElementById(`${uid}-current`)?.focus();
      return;
    }
    if (!password || !check.allMet) {
      document.getElementById(`${uid}-new`)?.focus();
      return;
    }
    if (!confirm || confirm !== password) {
      document.getElementById(`${uid}-confirm`)?.focus();
      return;
    }
    setSaving(true);
    try {
      await changeAccountPassword({ currentPassword: current, newPassword: password });
      if (isBackendConnected) {
        // The backend ends every session of the account when its password changes (this one too), so sign out
        // cleanly and let the Log in page say why.
        await signOut();
        navigate('/login?reason=password-changed', { replace: true });
        return;
      }
      toast('Password updated');
      setCurrent('');
      setPassword('');
      setConfirm('');
      setTouched({ password: false, confirm: false });
    } catch (err) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    }
    setSaving(false);
  };

  return (
    <section className={pageStyles.panel} aria-labelledby="cm-password-title">
      <div className={pageStyles.panelHead}>
        <div>
          <h2 id="cm-password-title" className={pageStyles.panelTitle}>
            Change Password
          </h2>
          <p className={pageStyles.panelSub}>{description}</p>
        </div>
        <IconKey width={20} height={20} className={pageStyles.panelIcon} />
      </div>
      <div className={pageStyles.panelBody}>
        <form className={styles.form} onSubmit={submit} noValidate>
          <PasswordField
            id={`${uid}-current`}
            label="Current Password"
            name="currentPassword"
            autoComplete="current-password"
            placeholder="Enter your current password"
            value={current}
            disabled={saving}
            onChange={(event) => {
              setCurrent(event.target.value);
              setFormError('');
            }}
          />
          <div className={styles.row}>
            <div>
              <PasswordField
                id={`${uid}-new`}
                label="New Password"
                name="newPassword"
                autoComplete="new-password"
                placeholder="Enter new password"
                value={password}
                disabled={saving}
                error={passwordError}
                success={check.allMet && password.length > 0}
                describedBy={`${uid}-guide`}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFormError('');
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  if (password) setTouched((t) => ({ ...t, password: true }));
                }}
              />
            </div>
            <PasswordField
              id={`${uid}-confirm`}
              label="Confirm New Password"
              name="confirmNewPassword"
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              disabled={saving}
              error={confirmError}
              hint={confirm && matches ? 'Passwords match' : undefined}
              hintTone={confirm && matches ? 'ok' : undefined}
              success={matches}
              onChange={(event) => {
                setConfirm(event.target.value);
                setFormError('');
              }}
              onBlur={() => confirm && setTouched((t) => ({ ...t, confirm: true }))}
            />
          </div>
          <PasswordChecklist id={`${uid}-guide`} password={password} open={focused || password.length > 0} rules={ACCOUNT_PASSWORD_RULES} />
          {formError && (
            <p className={pageStyles.formError} role="alert">
              {formError}
            </p>
          )}
          <div className={styles.footer} style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Button
              variant="secondary"
              icon={IconKey}
              loading={sendingLink}
              onClick={async () => {
                setSendingLink(true);
                try {
                  await requestPasswordReset({ email: user?.email || '' });
                  toast(`We sent a password reset link to ${user?.email}`);
                } catch (err) {
                  toast(err.message || 'The link could not be sent. Please try again.', 'error');
                }
                setSendingLink(false);
              }}
            >
              Forgot it? Email me a reset link
            </Button>
            <Button type="submit" icon={IconCheck} loading={saving}>
              Update Password
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

/** "Log out of all devices": ends this account's sessions everywhere (other browsers, phones), then signs out here. */
export function SessionsCard() {
  const { signOut } = useAuth();
  const { navigate } = useRouter();
  const [asking, setAsking] = useState(false);
  return (
    <section className={pageStyles.panel} aria-labelledby="cm-sessions-title">
      <div className={pageStyles.panelHead}>
        <div>
          <h2 id="cm-sessions-title" className={pageStyles.panelTitle}>
            Sessions
          </h2>
          <p className={pageStyles.panelSub}>Signed in somewhere you shouldn't be, like a shared or lost computer? Log out everywhere at once.</p>
        </div>
        <IconLogOut width={20} height={20} className={pageStyles.panelIcon} />
      </div>
      <div className={pageStyles.panelBody}>
        <div className={`${styles.footer} ${styles.sessionsFooter}`}>
          <Button variant="secondary" icon={IconLogOut} onClick={() => setAsking(true)}>
            Log out of all devices
          </Button>
        </div>
      </div>
      <ConfirmModal
        open={asking}
        title="Log out of all devices?"
        text="You will be logged out here and on every other device. You'll need your password to log in again."
        confirmLabel="Log out everywhere"
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          await logoutAllDevices();
          await signOut();
          navigate('/login');
        }}
      />
    </section>
  );
}