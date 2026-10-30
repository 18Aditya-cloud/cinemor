import { useEffect, useId, useState } from 'react';
import PasswordField from '../../components/auth/PasswordField.jsx';
import TextField from '../../components/auth/TextField.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useRouter } from '../../router/router.jsx';
import { deleteMyAccount, getAccountDeletionSummary, sendAccountDeletionCode } from '../../services/api.js';
import Button from '../ui/Button.jsx';
import { IconAlert, IconTrash } from '../ui/DashIcons.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import d from './DeleteAccountCard.module.css';
import pageStyles from './pages.module.css';

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/**
 * Settings, "Delete account" (individual creators, and organization administrators). A danger-zone card; its button
 * opens a two-step window:
 *   1. what will be deleted (read from the server: projects, stories, the organization and its people...)
 *   2. prove it is you (your password, or a 6-digit code emailed to you if you sign in with Google), type DELETE,
 *      and tick that you understand it cannot be undone.
 * Then the account is deleted for good and you land on the Log in page with a short note.
 */
export default function DeleteAccountCard({ organization = false }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  return (
    <section className={`${pageStyles.panel} ${d.danger}`} aria-labelledby={`${uid}-title`}>
      <div className={pageStyles.panelHead}>
        <div>
          <h2 id={`${uid}-title`} className={pageStyles.panelTitle}>
            Delete account
          </h2>
          <p className={pageStyles.panelSub}>
            {organization
              ? 'Permanently delete your organization, its projects, clients and team, and your account. This cannot be undone.'
              : 'Permanently delete your account, your projects, stories and everything made from them. This cannot be undone.'}
          </p>
        </div>
        <IconTrash width={20} height={20} className={`${pageStyles.panelIcon} ${d.icon}`} />
      </div>
      <div className={pageStyles.panelBody}>
        <div className={d.footer}>
          <Button variant="danger" icon={IconTrash} onClick={() => setOpen(true)}>
            Delete account…
          </Button>
        </div>
      </div>
      {open && <DeleteAccountDialog onClose={() => setOpen(false)} />}
    </section>
  );
}

function DeleteAccountDialog({ onClose }) {
  const uid = useId();
  const { user, setUser } = useAuth();
  const { navigate } = useRouter();
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState('password'); // password | code
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getAccountDeletionSummary()
      .then((s) => alive && setSummary(s))
      .catch((err) => alive && setLoadError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  const word = summary?.confirmWord || 'DELETE';
  const proof = method === 'password' ? password.length > 0 : /^\d{6}$/.test(code.replace(/\s/g, ''));
  const ready = proof && confirm.trim() === word && understood && !busy;

  const sendCode = async () => {
    setError('');
    setSending(true);
    try {
      await sendAccountDeletionCode();
      setCodeSent(true);
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await deleteMyAccount({ confirm: confirm.trim(), ...(method === 'password' ? { password } : { code: code.replace(/\s/g, '') }) });
      setUser(null);
      navigate('/login?reason=account-deleted', { replace: true });
    } catch (err) {
      setError(err.message || 'The account could not be deleted. Please try again.');
      setBusy(false);
    }
  };

  const org = summary?.organization;
  const items = summary
    ? [
        org && `The organization “${org.name}”, with ${plural(org.projects, 'project')} and ${plural(org.clients, 'client')}`,
        org && org.members > 0 && `${plural(org.members, 'team member')} lose access${org.accountsDeleted ? `; ${plural(org.accountsDeleted, 'account')} of your team and clients are deleted too` : ''}`,
        summary.projects > 0 && `${plural(summary.projects, 'project')} and ${plural(summary.stories, 'story', 'stories')} of your own, with their storyboards, images, sketches and videos`,
        summary.libraryItems > 0 && `${plural(summary.libraryItems, 'item')} in your Quick Create library`,
        `Your account ${summary.email} and your settings`,
      ].filter(Boolean)
    : [];

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={step === 1 ? 'Delete your account?' : 'Confirm it’s you'} subtitle={step === 1 ? 'Please read this first.' : 'This is the last step.'} icon={IconAlert} divider>
      {step === 1 && (
        <div className={d.body}>
          {loadError && (
            <p className={d.error} role="alert">
              {loadError}
            </p>
          )}
          {!summary && !loadError && <p className={d.muted}>Checking what your account holds…</p>}
          {summary && (
            <>
              <div className={d.warn}>
                <IconAlert width={18} height={18} aria-hidden="true" />
                <p>
                  <b>This is permanent.</b> Once deleted, nothing can be brought back, not even by us.
                </p>
              </div>
              <p className={d.lead}>These will be deleted:</p>
              <ul className={d.list}>
                {items.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <p className={d.muted}>Want to keep something? Download your stories, images and films before you go.</p>
            </>
          )}
          <ModalFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setStep(2)} disabled={!summary}>
              Continue
            </Button>
          </ModalFooter>
        </div>
      )}

      {step === 2 && (
        <form className={d.body} onSubmit={submit} noValidate>
          {method === 'password' ? (
            <>
              <PasswordField id={`${uid}-pw`} label="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
              <button
                type="button"
                className={d.link}
                onClick={() => {
                  setMethod('code');
                  setError('');
                }}
                disabled={busy}
              >
                Signed up with Google, or no password? Get a code by email instead
              </button>
            </>
          ) : (
            <>
              {!codeSent ? (
                <div className={d.codeBox}>
                  <p>We’ll email a 6-digit code to <b>{summary?.email || user?.email}</b>. It works for 15 minutes.</p>
                  <Button variant="secondary" onClick={sendCode} loading={sending}>
                    Email me a code
                  </Button>
                </div>
              ) : (
                <>
                  <TextField
                    id={`${uid}-code`}
                    label="Code from the email"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    hint={`Sent to ${summary?.email || user?.email}.`}
                    disabled={busy}
                  />
                  <button type="button" className={d.link} onClick={sendCode} disabled={sending || busy}>
                    {sending ? 'Sending…' : 'Send a new code'}
                  </button>
                </>
              )}
              <button
                type="button"
                className={d.link}
                onClick={() => {
                  setMethod('password');
                  setError('');
                }}
                disabled={busy}
              >
                Use my password instead
              </button>
            </>
          )}

          <TextField
            id={`${uid}-confirm`}
            label={
              <>
                Type <b className={d.word}>{word}</b> to confirm
              </>
            }
            autoComplete="off"
            spellCheck={false}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
          />
          <label className={d.check}>
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={busy} />
            <span>I understand that my account{org ? ', my organization' : ''} and all of the data listed before will be deleted for good.</span>
          </label>
          {error && (
            <p className={d.error} role="alert">
              {error}
            </p>
          )}
          <ModalFooter>
            <Button variant="secondary" onClick={() => setStep(1)} disabled={busy}>
              Back
            </Button>
            <Button type="submit" variant="danger" icon={IconTrash} loading={busy} disabled={!ready}>
              Delete my account permanently
            </Button>
          </ModalFooter>
        </form>
      )}
    </Modal>
  );
}