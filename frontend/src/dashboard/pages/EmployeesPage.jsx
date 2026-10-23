import { useId, useMemo, useState } from 'react';
import TextField from '../../components/auth/TextField.jsx';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import cx from '../../utils/cx.js';
import { listEmployees, listJobRoles, updateEmployee, deleteEmployee } from '../api/organizationApi.js';
import useModalForm from '../hooks/useModalForm.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import DataTable from '../ui/DataTable.jsx';
import { IconCheck, IconCheckCircle, IconMail, IconPencil, IconShield, IconUserCog, IconTrash } from '../ui/DashIcons.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import StatCard, { StatGrid } from '../ui/StatCard.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from './pages.module.css';
import e from './EmployeesPage.module.css';

const YesNo = ({ value }) => (value ? <Pill tone="green">Yes</Pill> : <Pill tone="gray">No</Pill>);

/**
 * Employees: everyone who has accepted an invitation, one row each, with their job roles, how many projects they may
 * take at once and are on now, and whether they are a Team Leader and / or a Reviewer. "Update" opens one window
 * where all of that is changed together (see EmployeeModal below). Team Leaders and Reviewers then also show up on
 * the Team Leaders and Reviewers pages.
 */
export default function EmployeesPage() {
  useDocumentTitle('Employees');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(listEmployees, []);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const employees = useMemo(() => data ?? [], [data]);

  const columns = [
    { key: 'no', header: 'S.No.', render: (_row, index) => index + 1 },
    { key: 'id', header: 'Employee ID', render: (row) => <span className={e.id}>#{row.id}</span> },
    {
      key: 'email',
      header: 'Email',
      render: (row) => (
        <span className={e.email}>
          <IconMail width={15} height={15} aria-hidden="true" />
          {row.email}
        </span>
      ),
    },
    {
      key: 'roles',
      header: 'Job Role',
      wrap: true,
      render: (row) =>
        row.jobRoles?.length ? (
          <span className={e.roles}>
            {row.jobRoles.map((r) => (
              <span key={r.id} className={e.role}>
                {r.name}
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.muted}>-</span>
        ),
    },
    { key: 'max', header: 'Max Project', render: (row) => (row.maxProjects == null ? <span className={styles.muted}>Default</span> : <span className={e.num}>{row.maxProjects}</span>) },
    {
      key: 'current',
      header: 'Current Project',
      render: (row) => {
        const over = row.maxProjects != null && (row.currentProjects ?? 0) > row.maxProjects;
        return <span className={cx(e.num, over && e.over)}>{row.currentProjects ?? 0}</span>;
      },
    },
    { key: 'tl', header: 'Team Leader', render: (row) => <YesNo value={row.teamLeader} /> },
    { key: 'rv', header: 'Reviewer', render: (row) => <YesNo value={row.reviewer} /> },
    {
      key: 'update',
      header: 'Actions',
      render: (row) => (
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <Button variant="secondary" icon={IconPencil} onClick={() => setEditing(row)} aria-label={`Update ${row.email}`}>
            Update
          </Button>
          <Button variant="secondary" icon={IconTrash} iconOnly onClick={() => setDeleting(row)} aria-label={`Delete ${row.email}`}>
            Delete
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Employees"
        subtitle="Manage employee capacity, job responsibilities, Team Leader status, and Reviewer status from one place."
        actions={<RefreshButton onClick={reload} loading={loading} />}
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      <StatGrid columns={3}>
        <StatCard shout icon={IconUserCog} label="Total employees" value={employees.length} />
        <StatCard shout icon={IconShield} label="Team Leaders" value={employees.filter((x) => x.teamLeader).length} />
        <StatCard shout icon={IconCheckCircle} label="Reviewers" value={employees.filter((x) => x.reviewer).length} />
      </StatGrid>

      {employees.length === 0 ? (
        <EmptyState icon={IconUserCog} title="No accepted employees" text="Employees will appear here after they accept an organization invitation." />
      ) : (
        <DataTable caption="Employees" columns={columns} rows={employees} rowKey={(row) => row.id} />
      )}

      <EmployeeModal
        employee={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          toast(`${saved.email} updated`);
          reload();
        }}
      />
      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete employee?"
        text={
          deleting
            ? `${deleting.email} will be removed from your organization for good: their account, job roles and their place on finished projects. They will no longer be able to sign in. This can't be undone. Someone who leads a project or is on a project that isn't finished can't be deleted yet.`
            : ''
        }
        confirmLabel="Delete Employee"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await deleteEmployee(deleting.id);
          toast(`${deleting.email} deleted`);
          reload();
        }}
      />
    </div>
  );
}

/** A card with a real checkbox inside: a title, an optional line under it, ticked or not. */
function CheckCard({ checked, onChange, title, description, disabled, invalid, describedBy }) {
  return (
    <label className={cx(e.check, checked && e.checkOn, disabled && e.checkDisabled)}>
      <input
        type="checkbox"
        className={e.input}
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={e.box} aria-hidden="true">
        <IconCheck width={13} height={13} strokeWidth={3} />
      </span>
      <span className={e.checkText}>
        <span className={e.checkTitle}>{title}</span>
        {description && <span className={e.checkDesc}>{description}</span>}
      </span>
    </label>
  );
}

/**
 * "Update Employee": job roles (more than one allowed), maximum concurrent projects, Team Leader, Reviewer, and, for
 * a Reviewer, which of their own job roles they review. The same rules as the backend:
 *   - at least one job role
 *   - maximum projects 1 to 100 (empty = the job role's default), never below what they are on right now
 *   - a Reviewer reviews at least one job role, and only job roles they hold (unticking a job role above also takes it
 *     out of "Reviewer For")
 */
function EmployeeModal({ employee, onClose, onSaved }) {
  const uid = useId();
  const open = Boolean(employee);
  const form = useModalForm(
    open,
    {
      jobRoleIds: employee?.jobRoleIds ?? [],
      maxProjects: employee?.maxProjects == null ? '' : String(employee.maxProjects),
      teamLeader: Boolean(employee?.teamLeader),
      reviewer: Boolean(employee?.reviewer),
      reviewerJobRoleIds: employee?.reviewerJobRoleIds ?? [],
    },
    employee?.id ?? 'none',
  );
  const { data: roles, loading: rolesLoading } = useResource(() => (open ? listJobRoles() : Promise.resolve(null)), [open]);
  const allRoles = roles ?? [];
  const held = allRoles.filter((r) => form.values.jobRoleIds.includes(r.id));
  const busyNow = employee?.currentProjects ?? 0;

  const toggleIn = (key, id, on) => {
    const list = form.values[key];
    form.set(key)(on ? [...list, id] : list.filter((x) => x !== id));
  };
  const toggleJobRole = (id, on) => {
    toggleIn('jobRoleIds', id, on);
    // a job role they no longer hold can't be one they review
    if (!on && form.values.reviewerJobRoleIds.includes(id)) form.set('reviewerJobRoleIds')(form.values.reviewerJobRoleIds.filter((x) => x !== id));
  };

  const submit = async (event) => {
    event.preventDefault();
    const { values } = form;
    const errors = {};
    if (!values.jobRoleIds.length) errors.jobRoleIds = 'Give the employee at least one job role.';
    const raw = String(values.maxProjects).trim();
    if (raw) {
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) errors.maxProjects = 'Enter a whole number from 1 to 100, or leave it empty for the job role default.';
      else if (Number(raw) < busyNow) errors.maxProjects = `This employee is on ${busyNow} active ${busyNow === 1 ? 'project' : 'projects'} right now, so it can't be lower than ${busyNow}.`;
    }
    if (values.reviewer && !values.reviewerJobRoleIds.length) errors.reviewerJobRoleIds = 'Select at least one job role this employee will review.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return form.focusFirstInvalid();

    form.setBusy(true);
    try {
      const saved = await updateEmployee(employee.id, {
        jobRoleIds: values.jobRoleIds,
        maxProjects: raw ? Number(raw) : null,
        teamLeader: values.teamLeader,
        reviewer: values.reviewer,
        reviewerJobRoleIds: values.reviewer ? values.reviewerJobRoleIds : [],
      });
      onSaved(saved ?? employee);
      onClose();
    } catch (err) {
      form.setFormError(err.message);
      form.setBusy(false);
    }
    return undefined;
  };

  const rolesErrorId = `${uid}-roles-error`;
  const reviewErrorId = `${uid}-review-error`;

  return (
    <Modal open={open} onClose={onClose} icon={IconUserCog} divider wide title="Update Employee" subtitle={employee ? `${employee.email} · ID #${employee.id}` : ''}>
      <form onSubmit={submit} noValidate>
        <section className={e.section} aria-labelledby={`${uid}-roles`}>
          <div className={e.sectionHead}>
            <h3 id={`${uid}-roles`} className={e.sectionTitle}>
              Job Roles
            </h3>
            <span className={e.sectionHint}>Multiple roles allowed</span>
          </div>
          {allRoles.length === 0 ? (
            <p className={e.empty}>{rolesLoading ? 'Loading job roles...' : 'No job roles yet. Create one on the Job Roles page.'}</p>
          ) : (
            <div className={e.grid} role="group" aria-labelledby={`${uid}-roles`}>
              {allRoles.map((r, index) => (
                <CheckCard
                  key={r.id}
                  title={r.name}
                  checked={form.values.jobRoleIds.includes(r.id)}
                  onChange={(on) => toggleJobRole(r.id, on)}
                  disabled={form.busy}
                  invalid={index === 0 && Boolean(form.errors.jobRoleIds)}
                  describedBy={form.errors.jobRoleIds ? rolesErrorId : undefined}
                />
              ))}
            </div>
          )}
          {form.errors.jobRoleIds ? (
            <p id={rolesErrorId} className={e.error} role="alert">
              {form.errors.jobRoleIds}
            </p>
          ) : (
            <p className={e.help}>The employee can have more than one organization job role.</p>
          )}
        </section>

        <section className={e.section}>
          <TextField
            id={`${uid}-max`}
            label="Maximum concurrent projects"
            inputMode="numeric"
            placeholder="Use job role default"
            value={form.values.maxProjects}
            onChange={form.set('maxProjects')}
            error={form.errors.maxProjects}
            hint={`Must not be lower than the employee's active project count (${busyNow} now). Leave empty to use the job role's default.`}
            disabled={form.busy}
          />
        </section>

        <section className={e.section} aria-label="Responsibilities">
          <div className={e.grid}>
            <CheckCard title="Make Team Leader" description="Allows this employee to act as a Team Leader." checked={form.values.teamLeader} onChange={form.set('teamLeader')} disabled={form.busy} />
            <CheckCard
              title="Make Reviewer"
              description="Allows this employee to act as a Reviewer."
              checked={form.values.reviewer}
              onChange={(on) => {
                form.set('reviewer')(on);
                if (!on) form.set('reviewerJobRoleIds')([]);
              }}
              disabled={form.busy}
            />
          </div>
        </section>

        {form.values.reviewer && (
          <section className={e.section} aria-labelledby={`${uid}-review`}>
            <div className={e.sectionHead}>
              <h3 id={`${uid}-review`} className={e.sectionTitle}>
                Reviewer For
              </h3>
              <span className={e.sectionHint}>Select the job roles this employee can review.</span>
            </div>
            {held.length === 0 ? (
              <p className={e.empty}>Tick at least one job role above first. A Reviewer can only review job roles they hold.</p>
            ) : (
              <div className={e.grid} role="group" aria-labelledby={`${uid}-review`}>
                {held.map((r, index) => (
                  <CheckCard
                    key={r.id}
                    title={r.name}
                    checked={form.values.reviewerJobRoleIds.includes(r.id)}
                    onChange={(on) => toggleIn('reviewerJobRoleIds', r.id, on)}
                    disabled={form.busy}
                    invalid={index === 0 && Boolean(form.errors.reviewerJobRoleIds)}
                    describedBy={form.errors.reviewerJobRoleIds ? reviewErrorId : undefined}
                  />
                ))}
              </div>
            )}
            {form.errors.reviewerJobRoleIds && (
              <p id={reviewErrorId} className={e.error} role="alert">
                {form.errors.reviewerJobRoleIds}
              </p>
            )}
          </section>
        )}

        <p className={e.note}>
          <IconShield width={16} height={16} aria-hidden="true" />
          <span>Team Leader and Reviewer are responsibilities, not organization membership roles. An employee may have neither, either one, or both.</span>
        </p>

        {form.formError && (
          <p className={styles.formError} role="alert">
            {form.formError}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" icon={IconCheck} loading={form.busy}>
            Save Changes
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
