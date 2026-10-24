import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import { addProjectMember, getTeamLeaderProject, NEXT_LIFECYCLE, removeProjectMember, setEmployeeJobRoles, setProjectStatus } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { IconBriefcase, IconCheck, IconCheckCircle, IconChevronLeft, IconClose, IconPencil, IconPlay, IconPlus, IconTrash, IconUserCog, IconUsers } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import SelectField from '../ui/SelectField.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from '../pages/pages.module.css';
import { initialsOf, lifecycleOf, shortDate } from './lifecycle.js';
import { dayLabel, DelayAlert } from '../projectDates.jsx';
import tl from './TeamLeader.module.css';

// The status buttons: what each move is called, and how it looks.
const MOVES = {
  ongoing: { label: 'Start Project', icon: IconPlay, variant: 'primary', confirm: null },
  completed: { label: 'Mark Completed', icon: IconCheckCircle, variant: 'primary', confirm: { title: 'Mark as completed?', text: 'The project will be finished and its team can no longer change.', label: 'Mark Completed' } },
  aborted: { label: 'Abort Project', icon: IconClose, variant: 'danger', confirm: { title: 'Abort this project?', text: 'The project will be stopped for good and its team can no longer change.', label: 'Abort Project' } },
};

/**
 * One project, as its Team Leader sees it: its details, the status controls (start, complete or abort, depending on
 * where it is now), and the production team, with an inline form to add an employee (in one or more of their job
 * roles) or a reviewer (for one of the job roles they review). An employee's job roles on the project can be changed
 * later (Edit roles). Employees already at their project limit are not offered.
 */
export default function TeamLeaderProjectPage({ teamLeaderId, projectId }) {
  const toast = useToast();
  const { data, loading, error, reload } = useResource(() => getTeamLeaderProject(teamLeaderId, projectId), [teamLeaderId, projectId]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('employee');
  const [personId, setPersonId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [jobRoleIds, setJobRoleIds] = useState([]); // an employee can do several of their job roles on one project
  const [editingRoles, setEditingRoles] = useState(null); // the employee whose job roles are being changed
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [moving, setMoving] = useState(null); // the status being moved to while it saves
  const [confirming, setConfirming] = useState(null); // a move that needs an "are you sure?"
  const [removing, setRemoving] = useState(null);
  useDocumentTitle(data?.project?.title || 'Project');

  if (!data) {
    return (
      <div className={styles.page} aria-busy={loading}>
        <BackLink />
        {error && <Notice message={error.message} onRetry={reload} />}
      </div>
    );
  }

  const { project, members, availableEmployees, availableReviewers } = data;
  const state = lifecycleOf(project.lifecycle);
  const moves = NEXT_LIFECYCLE[project.lifecycle] || [];
  const open = moves.length > 0; // a finished project's team can no longer change
  const pool = kind === 'reviewer' ? availableReviewers : availableEmployees;
  const person = pool.find((p) => p.id === personId);

  const resetForm = () => {
    setPersonId('');
    setJobRoleId('');
    setJobRoleIds([]);
    setFormError('');
  };

  // one row per employee (with all their job roles here), then one row per reviewer assignment
  const team = [];
  for (const m of members) {
    if (m.kind === 'employee') {
      let row = team.find((t) => t.kind === 'employee' && t.employeeId === m.employeeId);
      if (!row) {
        row = { key: `e${m.employeeId}`, kind: 'employee', employeeId: m.employeeId, email: m.email, roles: [], employeeJobRoles: m.employeeJobRoles || [] };
        team.push(row);
      }
      row.roles.push({ memberId: m.id, id: m.jobRoleId, name: m.jobRoleName });
    } else {
      team.push({ key: `r${m.id}`, kind: 'reviewer', employeeId: m.employeeId, email: m.email, roles: [{ memberId: m.id, id: m.jobRoleId, name: m.jobRoleName }] });
    }
  }

  const move = async (to) => {
    setMoving(to);
    try {
      await setProjectStatus(teamLeaderId, projectId, to);
      toast(`Project is now ${lifecycleOf(to).label.toLowerCase()}`);
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
    setMoving(null);
  };

  const add = async (event) => {
    event.preventDefault();
    if (!personId) return setFormError(`Choose ${kind === 'reviewer' ? 'a reviewer' : 'an employee'}.`);
    if (kind === 'employee' && jobRoleIds.length === 0) return setFormError('Choose at least one job role they will do on this project.');
    if (kind === 'reviewer' && !jobRoleId) return setFormError('Choose the job role they will review on this project.');
    setSaving(true);
    try {
      if (kind === 'employee') await setEmployeeJobRoles(teamLeaderId, projectId, personId, jobRoleIds);
      else await addProjectMember(teamLeaderId, projectId, { employeeId: personId, kind, jobRoleId });
      toast(`${person?.email ?? 'Member'} added`);
      resetForm();
      setAdding(false);
      await reload();
    } catch (err) {
      setFormError(err.message);
    }
    setSaving(false);
    return undefined;
  };

  return (
    <div className={styles.page}>
      <BackLink />
      <div className={tl.headRow}>
        <div>
          <p className={tl.eyebrow}>Project</p>
          <h1 className={tl.welcome}>{project.title}</h1>
          {project.description && <p className={tl.lead}>{project.description}</p>}
        </div>
        <Pill tone={state.tone}>{state.label}</Pill>
      </div>

      <div className={tl.info}>
        <Info label="Client" value={project.clientName || '-'} />
        <Info label="Start date" value={dayLabel(project.startDate) || '-'} />
        <Info label="Deadline" value={dayLabel(project.deadline) || '-'} />
        <Info label="Team members" value={new Set(members.map((m) => m.employeeId)).size} />
        <Info label="Created" value={shortDate(project.createdAt)} />
        <Info label="Last updated" value={shortDate(project.updatedAt)} />
      </div>
      <div style={{ margin: '-8px 0 18px' }}>
        <DelayAlert project={project} />
      </div>

      <div className={tl.stack}>
        <section className={styles.panel} aria-labelledby="tl-status-title">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.panelEyebrow}>Project control</p>
              <h2 id="tl-status-title" className={styles.panelTitle}>
                Status
              </h2>
            </div>
          </div>
          {open ? (
            <div className={tl.controls}>
              {moves.map((to) => {
                const m = MOVES[to];
                return (
                  <Button key={to} variant={m.variant} icon={m.icon} loading={moving === to} disabled={Boolean(moving)} onClick={() => (m.confirm ? setConfirming(to) : move(to))}>
                    {m.label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className={tl.finished}>This project is {state.label.toLowerCase()}. Its status and team can no longer change.</p>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="tl-team-title">
          <div className={`${styles.panelHead} ${tl.wrapHead}`}>
            <div>
              <p className={styles.panelEyebrow}>Production team</p>
              <h2 id="tl-team-title" className={styles.panelTitle}>
                Team Members
              </h2>
              <p className={styles.panelSub}>Employees do the work; reviewers check it.</p>
            </div>
            <div className={styles.rowActions}>
              {open && (
                <Button
                  variant={adding ? 'secondary' : 'primary'}
                  icon={adding ? IconClose : IconPlus}
                  aria-expanded={adding}
                  onClick={() => {
                    setAdding((v) => !v);
                    resetForm();
                  }}
                >
                  {adding ? 'Close' : 'Add Team Member'}
                </Button>
              )}
              <RefreshButton onClick={reload} loading={loading} />
            </div>
          </div>

          {adding && open && (
            <form className={tl.addBox} onSubmit={add} noValidate aria-labelledby="tl-add-title">
              <p id="tl-add-title" className={tl.addTitle}>
                Add Team Member
              </p>
              <p className={tl.addSub}>Assign an employee or a reviewer to this project.</p>
              <div className={tl.segment} role="group" aria-label="Add as">
                {[
                  ['employee', 'Employee'],
                  ['reviewer', 'Reviewer'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={kind === id}
                    onClick={() => {
                      setKind(id);
                      resetForm();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <SelectField
                id="tl-person"
                label={kind === 'reviewer' ? 'Reviewer' : 'Employee'}
                icon={kind === 'reviewer' ? IconUserCog : IconUsers}
                placeholder={kind === 'reviewer' ? 'Select reviewer' : 'Select employee'}
                options={pool.map((p) => ({
                  value: p.id,
                  label: p.onProject
                    ? `${p.email} (already on this project)`
                    : `${p.email} (${p.maxProjects == null ? `${p.activeProjects} active` : `${p.activeProjects} of ${p.maxProjects} projects`})`,
                }))}
                value={personId}
                onChange={(v) => {
                  setPersonId(v);
                  // a reviewer who reviews only one job role has it chosen for them
                  const reviews = kind === 'reviewer' ? pool.find((p) => p.id === v)?.reviewerJobRoles || [] : [];
                  setJobRoleId(reviews.length === 1 ? reviews[0].id : '');
                  // an employee with a single job role has it chosen for them
                  const roles = kind === 'employee' ? pool.find((p) => p.id === v)?.jobRoles || [] : [];
                  setJobRoleIds(roles.length === 1 ? [roles[0].id] : []);
                  setFormError('');
                }}
                emptyText={kind === 'reviewer' ? 'No reviewers available. Your organization marks people as Reviewers.' : 'No employees with room for another project.'}
                disabled={saving}
              />
              {person && kind === 'employee' && (
                <RoleChecks
                  label="Job Roles"
                  hint="Choose one or more of their job roles for this project."
                  roles={person.jobRoles}
                  value={jobRoleIds}
                  onChange={(ids) => {
                    setJobRoleIds(ids);
                    setFormError('');
                  }}
                  disabled={saving}
                />
              )}
              {person && kind === 'reviewer' && (
                <SelectField
                  id="tl-role"
                  label={kind === 'reviewer' ? 'Reviews Job Role' : 'Job Role'}
                  placeholder="Select job role"
                  options={(kind === 'reviewer' ? person.reviewerJobRoles || [] : person.jobRoles).map((r) => ({ value: r.id, label: r.name }))}
                  value={jobRoleId}
                  onChange={(v) => {
                    setJobRoleId(v);
                    setFormError('');
                  }}
                  emptyText={kind === 'reviewer' ? 'This reviewer has no job roles to review yet. Your organization sets them on the Employees page.' : 'This employee has no job roles yet.'}
                  disabled={saving}
                />
              )}
              {formError && (
                <p className={styles.formError} role="alert">
                  {formError}
                </p>
              )}
              <div className={tl.addFoot}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdding(false);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" icon={IconPlus} loading={saving}>
                  Add Member
                </Button>
              </div>
            </form>
          )}

          {team.length === 0 ? (
            <div style={{ padding: '8px 28px 28px' }}>
              <EmptyState framed={false} icon={IconUsers} title="No team members" text="No employees or reviewers are assigned to this project yet." />
            </div>
          ) : (
            <ul className={tl.people} aria-label="Team members">
              {team.map((m) => (
                <li key={m.key} className={tl.person}>
                  <span className={tl.avatar} aria-hidden="true">
                    {initialsOf(m.email)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className={tl.email} style={{ display: 'block' }}>
                      {m.email}
                    </span>
                    <span className={tl.rowDesc} style={{ display: 'block' }}>
                      {m.roles.map((r) => r.name).filter(Boolean).join(', ') || '-'}
                    </span>
                  </span>
                  <Pill tone={m.kind === 'reviewer' ? 'violet' : 'blue'}>{m.kind === 'reviewer' ? 'Reviewer' : 'Employee'}</Pill>
                  {open ? (
                    <span className={tl.personActions}>
                      {m.kind === 'employee' && (
                        <Button variant="secondary" icon={IconPencil} onClick={() => setEditingRoles(m)} aria-label={`Edit the job roles of ${m.email}`}>
                          Edit roles
                        </Button>
                      )}
                      <Button variant="secondary" icon={IconTrash} iconOnly onClick={() => setRemoving(m)} aria-label={`Remove ${m.email} from this project`}>
                        Remove
                      </Button>
                    </span>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmModal
        open={Boolean(confirming)}
        title={confirming ? MOVES[confirming].confirm.title : ''}
        text={confirming ? MOVES[confirming].confirm.text : ''}
        confirmLabel={confirming ? MOVES[confirming].confirm.label : ''}
        onClose={() => setConfirming(null)}
        onConfirm={async () => {
          await setProjectStatus(teamLeaderId, projectId, confirming);
          toast(`Project is now ${lifecycleOf(confirming).label.toLowerCase()}`);
          await reload();
        }}
      />
      <ConfirmModal
        open={Boolean(removing)}
        title="Remove from project?"
        text={removing ? `${removing.email} will no longer be on "${project.title}" as ${removing.kind === 'reviewer' ? 'a reviewer' : 'an employee'}.` : ''}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          for (const role of removing.roles) await removeProjectMember(teamLeaderId, projectId, role.memberId);
          toast(`${removing.email} removed`);
          await reload();
        }}
      />
      <EditRolesModal
        member={editingRoles}
        onClose={() => setEditingRoles(null)}
        onSave={async (ids) => {
          await setEmployeeJobRoles(teamLeaderId, projectId, editingRoles.employeeId, ids);
          toast(`${editingRoles.email}'s job roles updated`);
          setEditingRoles(null);
          await reload();
        }}
      />
    </div>
  );
}

/** Tick boxes for job roles (an employee can do several of their job roles on one project). */
function RoleChecks({ label, hint, roles, value, onChange, disabled }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className={tl.roleChecks} disabled={disabled}>
      <legend className={tl.roleLegend}>{label}</legend>
      {roles.length === 0 ? (
        <p className={tl.roleHint}>This employee has no job roles yet. Your organization gives them on the Employees page.</p>
      ) : (
        <div className={tl.roleList}>
          {roles.map((r) => {
            const on = value.includes(r.id);
            return (
              <label key={r.id} className={tl.roleCheck} data-on={on}>
                <input type="checkbox" checked={on} onChange={() => toggle(r.id)} />
                <span className={tl.roleBox} aria-hidden="true">
                  {on && <IconCheck width={13} height={13} strokeWidth={3} />}
                </span>
                {r.name}
              </label>
            );
          })}
        </div>
      )}
      {hint && roles.length > 0 && <p className={tl.roleHint}>{hint}</p>}
    </fieldset>
  );
}

/** Change which of their job roles an employee does on this project. */
function EditRolesModal({ member, onClose, onSave }) {
  const [ids, setIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shownFor, setShownFor] = useState(null);
  if (member && shownFor !== member.key) {
    // a new person was opened: start from the job roles they do here now
    setShownFor(member.key);
    setIds(member.roles.map((r) => r.id).filter((id) => id != null));
    setError('');
  }
  if (!member && shownFor !== null) setShownFor(null);
  // their organization job roles, plus any role they still hold here that the organization has since taken away
  const roles = member ? [...member.employeeJobRoles, ...member.roles.filter((r) => r.id != null && !member.employeeJobRoles.some((x) => x.id === r.id))] : [];

  const save = async (event) => {
    event.preventDefault();
    if (ids.length === 0) return setError('Choose at least one job role. To take them off the project, use Remove.');
    setBusy(true);
    try {
      await onSave(ids);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
    return undefined;
  };

  return (
    <Modal open={Boolean(member)} onClose={busy ? () => {} : onClose} icon={IconBriefcase} title="Edit job roles" subtitle={member ? `What ${member.email} does on this project.` : ''}>
      <form onSubmit={save} noValidate>
        <RoleChecks
          label="Job Roles"
          hint="Only the job roles your organization gave this employee can be chosen."
          roles={roles}
          value={ids}
          onChange={(next) => {
            setIds(next);
            setError('');
          }}
          disabled={busy}
        />
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={IconPencil} loading={busy}>
            Save Roles
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function BackLink() {
  return (
    <Link to="/team-leader/projects" className={tl.back}>
      <IconChevronLeft width={16} height={16} /> Back to projects
    </Link>
  );
}

function Info({ label, value }) {
  return (
    <div className={tl.infoCard}>
      <p className={tl.label}>{label}</p>
      <p className={tl.value}>{value}</p>
    </div>
  );
}
