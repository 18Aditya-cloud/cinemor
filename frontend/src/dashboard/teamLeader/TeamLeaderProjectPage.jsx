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
 * roles) or a reviewer (for one or more of the job roles they review). Each person has one row, also when they both
 * work and review here; Edit roles changes what they do and what they review in one window. Employees already at
 * their project limit are not offered.
 */
export default function TeamLeaderProjectPage({ teamLeaderId, projectId }) {
  const toast = useToast();
  const { data, loading, error, reload } = useResource(() => getTeamLeaderProject(teamLeaderId, projectId), [teamLeaderId, projectId]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState('employee');
  const [personId, setPersonId] = useState('');
  const [jobRoleIds, setJobRoleIds] = useState([]); // an employee can do several of their job roles on one project
  const [reviewRoleIds, setReviewRoleIds] = useState([]); // and a reviewer can review several job roles
  const [editingRoles, setEditingRoles] = useState(null); // the person whose roles here are being changed
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

  const { project, members, availableEmployees, availableReviewers, reviewerRolesOf = {} } = data;
  const state = lifecycleOf(project.lifecycle);
  const moves = NEXT_LIFECYCLE[project.lifecycle] || [];
  const open = moves.length > 0; // a finished project's team can no longer change
  const pool = kind === 'reviewer' ? availableReviewers : availableEmployees;
  const person = pool.find((p) => p.id === personId);

  const resetForm = () => {
    setPersonId('');
    setJobRoleIds([]);
    setReviewRoleIds([]);
    setFormError('');
  };

  // one row per person: the job roles they do here and the job roles they review here
  const team = [];
  for (const m of members) {
    let row = team.find((t) => t.employeeId === m.employeeId);
    if (!row) {
      row = { key: `p${m.employeeId}`, employeeId: m.employeeId, email: m.email, work: [], review: [], employeeJobRoles: m.employeeJobRoles || [], reviewerJobRoles: reviewerRolesOf[m.employeeId] || [] };
      team.push(row);
    }
    (m.kind === 'reviewer' ? row.review : row.work).push({ memberId: m.id, id: m.jobRoleId, name: m.jobRoleName });
  }
  const names = (roles) => roles.map((r) => r.name).filter(Boolean).join(', ');
  // the job roles this reviewer does not review here yet (the add form offers only those)
  const reviewedHere = (id) => members.filter((m) => m.kind === 'reviewer' && m.employeeId === id).map((m) => m.jobRoleId);
  const newReviewRoles = person && kind === 'reviewer' ? (person.reviewerJobRoles || []).filter((r) => !reviewedHere(person.id).includes(r.id)) : [];

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
    if (kind === 'reviewer' && reviewRoleIds.length === 0) return setFormError('Choose at least one job role they will review on this project.');
    setSaving(true);
    try {
      if (kind === 'employee') await setEmployeeJobRoles(teamLeaderId, projectId, personId, jobRoleIds);
      else for (const id of reviewRoleIds) await addProjectMember(teamLeaderId, projectId, { employeeId: personId, kind, jobRoleId: id });
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
                  // a reviewer with only one job role left to review here has it chosen for them
                  const reviews = kind === 'reviewer' ? (pool.find((p) => p.id === v)?.reviewerJobRoles || []).filter((r) => !reviewedHere(v).includes(r.id)) : [];
                  setReviewRoleIds(reviews.length === 1 ? [reviews[0].id] : []);
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
                <RoleChecks
                  label="Reviews Job Roles"
                  hint="Choose one or more of the job roles they review."
                  roles={newReviewRoles}
                  empty="This reviewer has no job roles to review yet. Your organization sets them on the Employees page."
                  value={reviewRoleIds}
                  onChange={(ids) => {
                    setReviewRoleIds(ids);
                    setFormError('');
                  }}
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
                    {m.work.length > 0 && (
                      <span className={tl.rowDesc} style={{ display: 'block' }}>
                        {m.review.length > 0 ? 'Works on: ' : ''}
                        {names(m.work) || '-'}
                      </span>
                    )}
                    {m.review.length > 0 && (
                      <span className={tl.rowDesc} style={{ display: 'block' }}>
                        Reviews: {names(m.review) || '-'}
                      </span>
                    )}
                  </span>
                  <span className={tl.personPills}>
                    {m.work.length > 0 && <Pill tone="blue">Employee</Pill>}
                    {m.review.length > 0 && <Pill tone="violet">Reviewer</Pill>}
                  </span>
                  {open ? (
                    <span className={tl.personActions}>
                      <Button variant="secondary" icon={IconPencil} onClick={() => setEditingRoles(m)} aria-label={`Edit the roles of ${m.email}`}>
                        Edit roles
                      </Button>
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
        text={removing ? `${removing.email} will no longer be on "${project.title}"${removing.work.length && removing.review.length ? ', neither as an employee nor as a reviewer' : removing.review.length ? ' as a reviewer' : ' as an employee'}.` : ''}
        confirmLabel="Remove"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          for (const role of [...removing.work, ...removing.review]) await removeProjectMember(teamLeaderId, projectId, role.memberId);
          toast(`${removing.email} removed`);
          await reload();
        }}
      />
      <EditRolesModal
        member={editingRoles}
        onClose={() => setEditingRoles(null)}
        onSave={async ({ work, review }) => {
          const m = editingRoles;
          // reviewer roles first (added, then taken off), so the person keeps their place on the project throughout
          const had = m.review.map((r) => r.id);
          for (const id of review.filter((x) => !had.includes(x))) await addProjectMember(teamLeaderId, projectId, { employeeId: m.employeeId, kind: 'reviewer', jobRoleId: id });
          if (m.work.length > 0 && work.length > 0) await setEmployeeJobRoles(teamLeaderId, projectId, m.employeeId, work);
          if (m.work.length > 0 && work.length === 0) for (const r of m.work) await removeProjectMember(teamLeaderId, projectId, r.memberId);
          for (const r of m.review.filter((x) => !review.includes(x.id))) await removeProjectMember(teamLeaderId, projectId, r.memberId);
          toast(`${m.email}'s roles updated`);
          setEditingRoles(null);
          await reload();
        }}
      />
    </div>
  );
}

/** Tick boxes for job roles (an employee can do several of their job roles on one project). */
function RoleChecks({ label, hint, roles, value, onChange, disabled, empty = 'This employee has no job roles yet. Your organization gives them on the Employees page.' }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className={tl.roleChecks} disabled={disabled}>
      <legend className={tl.roleLegend}>{label}</legend>
      {roles.length === 0 ? (
        <p className={tl.roleHint}>{empty}</p>
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

/**
 * Change what one person does on this project, in one window: the job roles they work in (when they are an employee
 * here) and the job roles they review (when they are a reviewer here). Only the roles the organization gave them can be
 * chosen. Taking every role off is done with Remove.
 */
function EditRolesModal({ member, onClose, onSave }) {
  const [work, setWork] = useState([]);
  const [review, setReview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shownFor, setShownFor] = useState(null);
  if (member && shownFor !== member.key) {
    // a new person was opened: start from what they do here now
    setShownFor(member.key);
    setWork(member.work.map((r) => r.id).filter((id) => id != null));
    setReview(member.review.map((r) => r.id).filter((id) => id != null));
    setError('');
  }
  if (!member && shownFor !== null) setShownFor(null);
  // their organization roles, plus any role they still hold here that the organization has since taken away
  const withHeld = (given, held) => [...given, ...held.filter((r) => r.id != null && !given.some((x) => x.id === r.id))];
  const workRoles = member ? withHeld(member.employeeJobRoles, member.work) : [];
  const reviewRoles = member ? withHeld(member.reviewerJobRoles, member.review) : [];
  const isEmployee = Boolean(member?.work.length);
  const isReviewer = Boolean(member?.review.length);

  const save = async (event) => {
    event.preventDefault();
    if (work.length === 0 && review.length === 0) return setError('Choose at least one role. To take them off the project, use Remove.');
    setBusy(true);
    try {
      await onSave({ work, review });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
    return undefined;
  };

  const title = isEmployee && isReviewer ? 'Edit roles' : isReviewer ? 'Edit review roles' : 'Edit job roles';
  return (
    <Modal open={Boolean(member)} onClose={busy ? () => {} : onClose} icon={IconBriefcase} title={title} subtitle={member ? `What ${member.email} does on this project.` : ''}>
      <form onSubmit={save} noValidate style={{ display: 'grid', gap: 18 }}>
        {isEmployee && (
          <RoleChecks
            label="Works as (Employee)"
            hint="The job roles they do the work in. Only the job roles your organization gave this employee can be chosen."
            roles={workRoles}
            value={work}
            onChange={(next) => {
              setWork(next);
              setError('');
            }}
            disabled={busy}
          />
        )}
        {isReviewer && (
          <RoleChecks
            label="Reviews (Reviewer)"
            hint="The job roles they check. Only the job roles your organization lets them review can be chosen."
            roles={reviewRoles}
            empty="This reviewer has no job roles to review. Your organization sets them on the Employees page."
            value={review}
            onChange={(next) => {
              setReview(next);
              setError('');
            }}
            disabled={busy}
          />
        )}
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
