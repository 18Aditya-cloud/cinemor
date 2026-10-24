import { useEffect, useState } from 'react';
import { useRouter } from '../../router/router.jsx';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import TextField from '../../components/auth/TextField.jsx';
import { isBackendConnected } from '../../services/api.js';
import { Link } from '../../router/router.jsx';
import { acceptInvitationDemo, listInvitations, listJobRoles, revokeInvitation, sendInvitation } from '../api/organizationApi.js';
import useModalForm from '../hooks/useModalForm.js';
import useResource from '../hooks/useResource.js';
import useOpenFromQuery from '../hooks/useOpenFromQuery.js';
import Button from '../ui/Button.jsx';
import DataTable from '../ui/DataTable.jsx';
import { IconPlus, IconSend, IconShield, IconUserPlus } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import SelectField from '../ui/SelectField.jsx';
import StatCard, { StatGrid } from '../ui/StatCard.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from './pages.module.css';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sentOn = (time) => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function InvitationsPage() {
  const { navigate } = useRouter();
  useDocumentTitle('Invitations');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(() => Promise.all([listInvitations(), listJobRoles()]), []);
  const [inviting, setInviting] = useState(false);
  useOpenFromQuery(() => setInviting(true));
  const [busyId, setBusyId] = useState(null);
  const [invitations, roles] = data ?? [[], []];

  const run = async (id, action, message) => {
    setBusyId(id);
    try {
      await action();
      toast(message);
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    { key: 'no', header: 'No.', render: (_row, index) => index + 1 },
    { key: 'email', header: 'Email', render: (row) => <strong>{row.email}</strong> },
    { key: 'role', header: 'Job Role', render: (row) => row.jobRoleName },
    { key: 'max', header: 'Max Projects', render: (row) => row.maxProjects ?? <span className={styles.muted}>Default</span> },
    { key: 'sent', header: 'Sent', render: (row) => sentOn(row.sentAt) },
    { key: 'status', header: 'Status', render: () => <Pill tone="violet">Pending</Pill> },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className={styles.rowActions}>
          <Button variant="secondary" disabled={busyId === row.id} onClick={() => run(row.id, () => revokeInvitation(row.id), 'Invitation revoked')} aria-label={`Revoke invitation for ${row.email}`}>
            Revoke
          </Button>
          {!isBackendConnected && (
            <Button variant="secondary" disabled={busyId === row.id} onClick={() => run(row.id, () => acceptInvitationDemo(row.id), `${row.email} joined as an employee`)} aria-label={`Accept invitation for ${row.email} (demo)`}>
              Accept (demo)
            </Button>
          )}
          {!isBackendConnected && row.token && (
            // DEMO ONLY: opens the page the invitation email's link leads to (your backend sends the real email),
            // so the whole "set a password and join" step can be tried here, as that employee.
            <Button variant="secondary" onClick={() => navigate(`/accept-invitation?token=${encodeURIComponent(row.token)}`)} aria-label={`Open invite link for ${row.email} (demo)`}>
              Open invite link
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Invitations"
        subtitle="Invite employees to your organization and manage their pending access requests."
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <Button icon={IconPlus} onClick={() => setInviting(true)}>
              Invite Employee
            </Button>
          </>
        }
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      <StatGrid columns={2} compact>
        <StatCard icon={IconSend} label="Pending Invitations" value={invitations.length} />
        <StatCard icon={IconShield} label="Available Job Roles" value={roles.length} />
      </StatGrid>

      {invitations.length === 0 ? (
        <EmptyState
          icon={IconUserPlus}
          title="No pending invitations"
          text="Invite an employee to give them access to your organization."
          action={
            <Button icon={IconPlus} onClick={() => setInviting(true)}>
              Invite Employee
            </Button>
          }
        />
      ) : (
        <DataTable caption="Pending invitations" columns={columns} rows={invitations} rowKey={(row) => row.id} />
      )}

      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        onSent={(email) => {
          toast(`Invitation sent to ${email}`);
          reload();
        }}
      />
    </div>
  );
}

function InviteModal({ open, onClose, onSent }) {
  const form = useModalForm(open, { email: '', jobRoleId: '', maxProjects: '' });
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    listJobRoles()
      .then((list) => alive && setRoles(list.map((r) => ({ value: r.id, label: r.name }))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    const { email, jobRoleId, maxProjects } = form.values;
    const errors = {};
    if (!email.trim()) errors.email = 'Enter the employee email.';
    else if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address, like employee@company.com.';
    if (!jobRoleId) errors.jobRoleId = 'Choose a job role.';
    if (maxProjects.trim() && !(Number.isInteger(Number(maxProjects)) && Number(maxProjects) >= 1)) errors.maxProjects = 'Enter a whole number, 1 or more.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return form.focusFirstInvalid();
    form.setBusy(true);
    try {
      await sendInvitation({ email: email.trim(), jobRoleId, maxProjects: maxProjects.trim() ? Number(maxProjects) : null }); // a number, or null for "use the job role default"
      onSent(email.trim());
      onClose();
    } catch (error) {
      if (error.status === 409) form.setErrors({ email: error.message });
      else form.setFormError(error.message);
      form.setBusy(false);
      if (error.status === 409) form.focusFirstInvalid();
    }
    return undefined;
  };

  return (
    <Modal open={open} onClose={onClose} icon={IconUserPlus} divider title="Invite Employee" subtitle="Send a secure one-time invitation to a new employee.">
      <form onSubmit={submit} noValidate>
        <TextField id="invite-email" label="Employee email" requiredMark type="email" placeholder="employee@company.com" value={form.values.email} onChange={form.set('email')} error={form.errors.email} disabled={form.busy} />
        <SelectField
          id="invite-role"
          label="Job role"
          requiredMark
          placeholder="Select a job role"
          options={roles}
          value={form.values.jobRoleId}
          onChange={form.set('jobRoleId')}
          error={form.errors.jobRoleId}
          emptyText={
            <>
              No job roles yet. Create one on the{' '}
              <Link to="/organization/job-roles" className={styles.inlineLink} onClick={onClose}>
                Job Roles
              </Link>{' '}
              page.
            </>
          }
          disabled={form.busy}
        />
        <TextField id="invite-max" label="Maximum concurrent projects" inputMode="numeric" placeholder="Use job role default" value={form.values.maxProjects} onChange={form.set('maxProjects')} error={form.errors.maxProjects} disabled={form.busy} />
        <p className={styles.hint}>Leave empty to use the selected job role&apos;s default capacity.</p>
        <div className={styles.note}>
          <IconShield width={18} height={18} />
          <p>
            The employee will receive the <strong>Employee</strong> system role. Team Leader and Reviewer responsibilities are assigned later through member management.
          </p>
        </div>
        {form.formError && (
          <p className={styles.formError} role="alert">
            {form.formError}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" icon={IconSend} loading={form.busy}>
            Send Invitation
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
