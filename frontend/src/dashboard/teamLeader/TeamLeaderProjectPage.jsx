import { useId, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import { addProjectMember, getTeamLeaderProject, NEXT_LIFECYCLE, removeProjectMember, setEmployeeJobRoles, setProjectStatus } from '../api/organizationApi.js';
import ClientPanel from '../employee/ClientPanel.jsx';
import { getMyProject } from '../employee/employeeApi.js';
import { projectPath, STAGES, STATE, SUBMISSION } from '../employee/stages.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { IconBriefcase, IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconEye, IconPencil, IconPlus, IconRefresh, IconSearch, IconTrash, IconUsers } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import { Avatar, AvatarStack, Bar, Chip, CoverArt, Dot, palette, stageColor } from '../ui/Production.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from '../pages/pages.module.css';
import { lifecycleOf, shortDate } from './lifecycle.js';
import { dayLabel, DelayAlert } from '../projectDates.jsx';
import tl from './TeamLeader.module.css';
import t from './TeamLeaderProject.module.css';

// The status switch: every state of a project, and what moving there asks first.
const ORDER = ['not_started', 'ongoing', 'completed', 'aborted'];
const LIFE_COLOR = { not_started: 'gray', ongoing: 'warn', completed: 'ok', aborted: 'red' };
const CONFIRM = {
  completed: { title: 'Mark as completed?', text: 'The project will be finished and its team can no longer change.', label: 'Mark Completed' },
  aborted: { title: 'Abort this project?', text: 'The project will be stopped for good and its team can no longer change.', label: 'Abort Project' },
};
const TABS = ['stories', 'team', 'client', 'activity'];

const nameOf = (email) => (email || '').split('@')[0];

/**
 * One project, as its Team Leader sees it: a header with the status switch (only the moves the project allows can be
 * clicked), and four tabs:
 *  - Stories: each story's six stages as coloured bars, opening the story in My Work;
 *  - Team: one card per person (the job roles they work in, in their stage colour, the ones they review, dashed, and
 *    how many projects they are on), "Who covers each stage", and the Add team member panel at the side;
 *  - Client: the conversation with the project's client (client portal);
 *  - Activity: the project's reviews, newest first.
 * Employees at their project limit are shown in the panel but cannot be added.
 */
export default function TeamLeaderProjectPage({ teamLeaderId, projectId }) {
  const toast = useToast();
  const { data, loading, error, reload } = useResource(() => getTeamLeaderProject(teamLeaderId, projectId), [teamLeaderId, projectId]);
  // the project's workflow (stories, who covers each stage, reviews): the Team Leader's own My Work view of it
  const flow = useResource(() => getMyProject(projectId).catch(() => null), [projectId]);
  const [tab, setTab] = useState('team');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editingRoles, setEditingRoles] = useState(null); // the person whose roles here are being changed
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

  const { project, members, availableEmployees, availableReviewers, fullEmployees = [], capacityOf = {}, reviewerRolesOf = {} } = data;
  const state = lifecycleOf(project.lifecycle);
  const moves = NEXT_LIFECYCLE[project.lifecycle] || [];
  const open = moves.length > 0; // a finished project's team can no longer change
  const wf = flow.data;
  const reloadAll = async () => {
    await Promise.all([reload(), flow.reload()]);
  };

  // which stage each job role belongs to (from the workflow: who works on / reviews each stage, in which role)
  const roleStage = {};
  const names = {};
  (wf?.stages || []).forEach((s) => {
    [...s.workers, ...s.reviewers].forEach((w) => {
      if (w.userId && w.name) names[w.userId] = w.name;
      (w.roles || []).forEach((r) => {
        if (!roleStage[r]) roleStage[r] = s.key;
      });
    });
  });
  const colorOf = (roleName) => roleStage[roleName] || 'brand';

  // one row per person: the job roles they do here and the job roles they review here
  const team = [];
  for (const m of members) {
    let row = team.find((x) => x.employeeId === m.employeeId);
    if (!row) {
      row = { key: `p${m.employeeId}`, employeeId: m.employeeId, email: m.email, name: names[m.employeeId] || nameOf(m.email), work: [], review: [], employeeJobRoles: m.employeeJobRoles || [], reviewerJobRoles: reviewerRolesOf[m.employeeId] || [] };
      team.push(row);
    }
    (m.kind === 'reviewer' ? row.review : row.work).push({ memberId: m.id, id: m.jobRoleId, name: m.jobRoleName });
  }
  const counts = { all: team.length, employees: team.filter((m) => m.work.length).length, reviewers: team.filter((m) => m.review.length).length };
  const shown = team.filter((m) => (filter === 'employees' ? m.work.length : filter === 'reviewers' ? m.review.length : true));

  const move = async (to) => {
    if (CONFIRM[to]) return setConfirming(to);
    setMoving(to);
    try {
      await setProjectStatus(teamLeaderId, projectId, to);
      toast(`Project is now ${lifecycleOf(to).label.toLowerCase()}`);
      await reloadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
    setMoving(null);
    return undefined;
  };

  const tabLabel = {
    stories: `Stories${wf ? ` · ${wf.stories.length}` : ''}`,
    team: `Team · ${team.length}`,
    client: 'Client',
    activity: 'Activity',
  };

  return (
    <div className={cx(styles.page, palette)}>
      <BackLink />
      <div className={t.head}>
        <CoverArt seed={`p${project.id}`} sun={false} className={t.headArt} />
        <div className={t.headText}>
          <h1 className={t.title}>{project.title}</h1>
          <p className={t.sub}>
            {project.clientName ? `Client ${project.clientName} · ` : ''}
            {dayLabel(project.startDate) || 'No start date'} → {dayLabel(project.deadline) || 'no deadline'}
          </p>
          <p className={t.subSmall}>
            Created {shortDate(project.createdAt)} · Updated {shortDate(project.updatedAt)}
          </p>
        </div>
        <div className={t.status} role="group" aria-label="Project status">
          {ORDER.map((to) => {
            const on = project.lifecycle === to;
            const can = moves.includes(to);
            return (
              <button
                key={to}
                type="button"
                className={cx(t.statusOption, on && t.statusOn, stageColor(LIFE_COLOR[to]))}
                aria-pressed={on}
                disabled={on || !can || Boolean(moving)}
                title={on ? `The project is ${lifecycleOf(to).label.toLowerCase()}` : can ? `Move to ${lifecycleOf(to).label}` : `A ${state.label.toLowerCase()} project can't move to ${lifecycleOf(to).label.toLowerCase()}`}
                onClick={() => move(to)}
              >
                {moving === to ? 'Saving…' : lifecycleOf(to).label}
              </button>
            );
          })}
        </div>
      </div>
      {project.description && <p className={t.lead}>{project.description}</p>}
      <div style={{ margin: '0 0 14px' }}>
        <DelayAlert project={project} />
      </div>
      {!open && <p className={tl.finished}>This project is {state.label.toLowerCase()}. Its status and team can no longer change.</p>}

      <div className={t.tabs} role="tablist" aria-label="Project sections">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" id={`tl-tab-${id}`} aria-selected={tab === id} aria-controls={`tl-panel-${id}`} className={cx(t.tab, tab === id && t.tabOn)} onClick={() => setTab(id)}>
            {tabLabel[id]}
          </button>
        ))}
      </div>

      <div className={cx(t.body, tab === 'team' && adding && open && t.bodyWithPanel)}>
        <div role="tabpanel" id={`tl-panel-${tab}`} aria-labelledby={`tl-tab-${tab}`} className={t.panelMain}>
          {tab === 'team' && (
            <>
              <div className={t.toolbar}>
                <div className={t.filters} role="group" aria-label="Show">
                  {[
                    ['all', 'Everyone'],
                    ['employees', 'Employees'],
                    ['reviewers', 'Reviewers'],
                  ].map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={filter === id} className={cx(t.filter, filter === id && t.filterOn)} onClick={() => setFilter(id)}>
                      {label} <span>{counts[id]}</span>
                    </button>
                  ))}
                </div>
                <div className={t.toolbarRight}>
                  <Button variant="secondary" icon={IconRefresh} iconOnly onClick={reloadAll} loading={loading} aria-label="Refresh">
                    Refresh
                  </Button>
                  {open && (
                    <Button variant={adding ? 'secondary' : 'primary'} icon={adding ? IconClose : IconPlus} aria-expanded={adding} onClick={() => setAdding((x) => !x)}>
                      {adding ? 'Close' : 'Add team member'}
                    </Button>
                  )}
                </div>
              </div>

              {team.length === 0 ? (
                <div className={t.card}>
                  <EmptyState framed={false} icon={IconUsers} title="No team members" text="No employees or reviewers are assigned to this project yet." />
                </div>
              ) : (
                <ul className={t.people} aria-label="Team members">
                  {shown.map((m) => (
                    <PersonCard key={m.key} member={m} capacity={capacityOf[m.employeeId]} colorOf={colorOf} open={open} onEdit={() => setEditingRoles(m)} onRemove={() => setRemoving(m)} />
                  ))}
                </ul>
              )}

              {wf && (
                <section className={cx(t.card, t.cover)} aria-labelledby="tl-cover">
                  <div className={t.cardHead}>
                    <h2 id="tl-cover" className={t.cardTitle}>
                      Who covers each stage
                    </h2>
                    <span className={t.muted}>empty stages show in red</span>
                  </div>
                  <ul className={t.coverGrid}>
                    {wf.stages.map((s) => (
                      <li key={s.key} className={cx(t.coverCell, stageColor(s.key), s.workers.length === 0 && t.coverGap)}>
                        <b>{s.key === 'animation' ? 'Animation' : s.label}</b>
                        {s.workers.length ? (
                          <AvatarStack>
                            {s.workers.slice(0, 4).map((w) => (
                              <Avatar key={w.userId} name={w.name} seed={w.userId} size={26} />
                            ))}
                          </AvatarStack>
                        ) : (
                          <span className={t.gapText}>No one yet</span>
                        )}
                        <span className={t.coverReview}>{s.reviewers.length ? `Reviewed by ${s.reviewers.map((r) => r.name).join(', ')}` : 'No reviewer'}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {tab === 'stories' && <StoriesTab wf={wf} loading={flow.loading} />}
          {tab === 'client' && (wf ? <ClientPanel project={wf} /> : <p className={t.muted}>{flow.loading ? 'Loading…' : 'The client conversation could not be loaded.'}</p>)}
          {tab === 'activity' && <ActivityTab wf={wf} loading={flow.loading} />}
        </div>

        {tab === 'team' && adding && open && (
          <AddPanel
            key="add"
            teamLeaderId={teamLeaderId}
            projectId={projectId}
            members={members}
            availableEmployees={availableEmployees}
            availableReviewers={availableReviewers}
            fullEmployees={fullEmployees}
            capacityOf={capacityOf}
            names={names}
            colorOf={colorOf}
            onClose={() => setAdding(false)}
            onAdded={reloadAll}
          />
        )}
      </div>

      <ConfirmModal
        open={Boolean(confirming)}
        title={confirming ? CONFIRM[confirming].title : ''}
        text={confirming ? CONFIRM[confirming].text : ''}
        confirmLabel={confirming ? CONFIRM[confirming].label : ''}
        onClose={() => setConfirming(null)}
        onConfirm={async () => {
          await setProjectStatus(teamLeaderId, projectId, confirming);
          toast(`Project is now ${lifecycleOf(confirming).label.toLowerCase()}`);
          await reloadAll();
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
          await reloadAll();
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
          await reloadAll();
        }}
      />
    </div>
  );
}

/** One person on the team: who they are, their roles here (worked in, reviewed), their project load, Edit roles / Remove. */
function PersonCard({ member: m, capacity, colorOf, open, onEdit, onRemove }) {
  const max = capacity?.max;
  const active = capacity?.active ?? null;
  const full = max != null && active != null && active >= max;
  return (
    <li className={t.person}>
      <Avatar name={m.name} seed={m.employeeId} size={46} />
      <div className={t.personText}>
        <p>
          <b>{m.name}</b> <span className={t.muted}>{m.email}</span>
        </p>
        <div className={t.roles}>
          {m.work.map((r) => (
            <Chip key={`w${r.memberId}`} color={colorOf(r.name)}>
              {r.name || 'Job role'}
            </Chip>
          ))}
          {m.review.map((r) => (
            <Chip key={`r${r.memberId}`} color={colorOf(r.name)} dashed icon={IconEye}>
              {r.name || 'Job role'}
            </Chip>
          ))}
        </div>
      </div>
      <div className={t.load}>
        {active != null ? (
          <>
            <span className={t.loadHead}>
              <span className={t.muted}>Projects</span>
              <b className={full ? t.full : undefined}>{max != null ? `${active} / ${max}${full ? ' · full' : ''}` : `${active}`}</b>
            </span>
            <Bar value={max ? (active / max) * 100 : 0} color={full ? 'red' : undefined} />
          </>
        ) : null}
      </div>
      {open ? (
        <div className={t.personActions}>
          <Button variant="secondary" icon={IconPencil} onClick={onEdit} aria-label={`Edit the roles of ${m.email}`}>
            Edit roles
          </Button>
          <Button variant="secondary" icon={IconTrash} iconOnly onClick={onRemove} aria-label={`Remove ${m.email} from this project`}>
            Remove
          </Button>
        </div>
      ) : (
        <span />
      )}
    </li>
  );
}

/** The side panel to add someone: as an employee (in one or more of their job roles) or a reviewer. */
function AddPanel({ teamLeaderId, projectId, members, availableEmployees, availableReviewers, fullEmployees, capacityOf, names, colorOf, onClose, onAdded }) {
  const toast = useToast();
  const uid = useId();
  const [kind, setKind] = useState('employee');
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState(null);
  const [jobRoleIds, setJobRoleIds] = useState([]);
  const [reviewRoleIds, setReviewRoleIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const pool = kind === 'reviewer' ? availableReviewers : availableEmployees;
  const q = query.trim().toLowerCase();
  const match = (p) => !q || p.email.toLowerCase().includes(q) || (names[p.id] || '').toLowerCase().includes(q);
  const list = pool.filter(match);
  const full = kind === 'employee' ? fullEmployees.filter(match) : [];
  const person = pool.find((p) => p.id === personId);
  const reviewedHere = (id) => members.filter((m) => m.kind === 'reviewer' && m.employeeId === id).map((m) => m.jobRoleId);

  const reset = (nextKind = kind) => {
    setKind(nextKind);
    setPersonId(null);
    setJobRoleIds([]);
    setReviewRoleIds([]);
    setFormError('');
  };
  const pick = (p) => {
    setPersonId(p.id);
    setFormError('');
    const reviews = kind === 'reviewer' ? (p.reviewerJobRoles || []).filter((r) => !reviewedHere(p.id).includes(r.id)) : [];
    setReviewRoleIds(reviews.length === 1 ? [reviews[0].id] : []);
    const roles = kind === 'employee' ? p.jobRoles || [] : [];
    setJobRoleIds(roles.length === 1 ? [roles[0].id] : []);
  };

  const add = async (event) => {
    event.preventDefault();
    if (!person) return setFormError(`Choose ${kind === 'reviewer' ? 'a reviewer' : 'an employee'}.`);
    if (kind === 'employee' && jobRoleIds.length === 0) return setFormError('Choose at least one job role they will do on this project.');
    if (kind === 'reviewer' && reviewRoleIds.length === 0) return setFormError('Choose at least one job role they will review on this project.');
    setSaving(true);
    try {
      if (kind === 'employee') await setEmployeeJobRoles(teamLeaderId, projectId, person.id, jobRoleIds);
      else for (const id of reviewRoleIds) await addProjectMember(teamLeaderId, projectId, { employeeId: person.id, kind, jobRoleId: id });
      toast(`${person.email} added`);
      reset();
      await onAdded();
    } catch (err) {
      setFormError(err.message);
    }
    setSaving(false);
    return undefined;
  };

  const load = (p) => {
    const c = capacityOf[p.id];
    if (p.onProject) return 'already on this project';
    if (!c) return '';
    return c.max == null ? `${c.active} active projects` : `${c.active} of ${c.max} projects`;
  };

  return (
    <aside className={t.addPanel} aria-labelledby={`${uid}-title`}>
      <form onSubmit={add} noValidate>
        <div className={t.addHead}>
          <h2 id={`${uid}-title`} className={t.cardTitle}>
            Add team member
          </h2>
          <button type="button" className={t.close} onClick={onClose} aria-label="Close the panel">
            <IconClose width={16} height={16} />
          </button>
        </div>
        <div className={tl.segment} role="group" aria-label="Add as">
          {[
            ['employee', 'Employee'],
            ['reviewer', 'Reviewer'],
          ].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={kind === id} onClick={() => reset(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className={t.search}>
          <IconSearch width={15} height={15} aria-hidden="true" />
          <span className="cm-sr-only">Search people</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" />
        </label>

        <ul className={t.pickList} aria-label={kind === 'reviewer' ? 'Reviewers' : 'Employees'}>
          {list.length === 0 && full.length === 0 && <li className={t.muted}>{kind === 'reviewer' ? 'No reviewers available. Your organization marks people as Reviewers.' : 'No employees with room for another project.'}</li>}
          {list.map((p) => {
            const on = p.id === personId;
            const roles = kind === 'reviewer' ? (p.reviewerJobRoles || []).filter((r) => !reviewedHere(p.id).includes(r.id)) : p.jobRoles || [];
            const value = kind === 'reviewer' ? reviewRoleIds : jobRoleIds;
            const setValue = kind === 'reviewer' ? setReviewRoleIds : setJobRoleIds;
            return (
              <li key={p.id} className={cx(t.pick, on && t.pickOn)}>
                <button type="button" className={t.pickButton} aria-pressed={on} onClick={() => pick(p)}>
                  <Avatar name={names[p.id] || p.email} seed={p.id} size={34} />
                  <span>
                    <b>{names[p.id] || nameOf(p.email)}</b>
                    <span className={t.muted}>
                      {p.email}
                      {load(p) ? ` · ${load(p)}` : ''}
                    </span>
                  </span>
                </button>
                {on && (
                  <fieldset className={t.pickRoles} disabled={saving}>
                    <legend>{kind === 'reviewer' ? 'Reviews' : 'Works on'}</legend>
                    {roles.length === 0 ? (
                      <p className={t.muted}>{kind === 'reviewer' ? 'This reviewer has no job roles to review here.' : 'This employee has no job roles yet.'}</p>
                    ) : (
                      roles.map((r) => {
                        const checked = value.includes(r.id);
                        return (
                          <label key={r.id} className={cx(t.roleRow, stageColor(colorOf(r.name)))} data-on={checked}>
                            <input type="checkbox" checked={checked} onChange={() => setValue(checked ? value.filter((x) => x !== r.id) : [...value, r.id])} />
                            <span className={t.box} aria-hidden="true">
                              {checked && <IconCheck width={12} height={12} strokeWidth={3} />}
                            </span>
                            <Dot color={colorOf(r.name)} />
                            {r.name}
                          </label>
                        );
                      })
                    )}
                  </fieldset>
                )}
              </li>
            );
          })}
          {full.map((p) => (
            <li key={`f${p.id}`} className={cx(t.pick, t.pickFull)} aria-disabled="true">
              <span className={t.pickButton}>
                <Avatar name={names[p.id] || p.email} seed={p.id} size={34} />
                <span>
                  <b>{names[p.id] || nameOf(p.email)}</b>
                  <span className={t.muted}>At their limit · {load(p)}</span>
                </span>
              </span>
              <Chip color="red">Full</Chip>
            </li>
          ))}
        </ul>
        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" icon={IconPlus} loading={saving} disabled={!person} className={t.addButton}>
          {person ? `Add ${names[person.id] || nameOf(person.email)} to the project` : 'Choose someone to add'}
        </Button>
      </form>
    </aside>
  );
}

/** Each story of the project with its six stages as coloured bars; Open shows the story in My Work. */
function StoriesTab({ wf, loading }) {
  if (!wf) return <p className={t.muted}>{loading ? 'Loading…' : 'The stories could not be loaded.'}</p>;
  if (wf.stories.length === 0) return <div className={t.card}><EmptyState framed={false} icon={IconBriefcase} title="No stories yet" text="The Story Writers start the project's first story." /></div>;
  return (
    <ul className={t.storyList}>
      {wf.stories.map((st) => (
        <li key={st.id} className={t.storyRow}>
          <CoverArt seed={`s${st.id}`} sun={false} className={t.storyArt} />
          <span className={t.storyName}>
            <b>{st.title}</b>
            <span className={t.muted}>
              {st.sentBy ? `by ${st.sentBy.name} · ` : ''}
              {st.approvedCount} of {st.stages.length} approved
            </span>
          </span>
          <ol className={t.segs} aria-label={`Stages of ${st.title}`}>
            {st.stages.map((s) => (
              <li key={s.key} className={cx(t.seg, stageColor(s.key), t[`seg_${s.status}`])} title={`${STAGES.find((x) => x.key === s.key)?.label}: ${STATE[s.status]?.label}`}>
                <span className="cm-sr-only">
                  {s.label}: {STATE[s.status]?.label}
                </span>
              </li>
            ))}
          </ol>
          <Link to={`${projectPath(wf.id)}?story=${st.id}`} className={t.openLink}>
            Open <IconChevronRight width={15} height={15} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The project's reviews, newest first. */
function ActivityTab({ wf, loading }) {
  if (!wf) return <p className={t.muted}>{loading ? 'Loading…' : 'The activity could not be loaded.'}</p>;
  if (wf.submissions.length === 0) return <p className={t.muted}>Nothing has been sent for review yet.</p>;
  return (
    <ul className={t.activity}>
      {wf.submissions.map((x) => {
        const st = SUBMISSION[x.status];
        const color = x.status === 'approved' ? 'ok' : x.status === 'changes_requested' ? 'red' : x.status === 'pending' ? 'storyboard' : 'gray';
        return (
          <li key={x.id} className={cx(t.event, stageColor(x.stage))}>
            <span className={t.eventDot} aria-hidden="true" />
            <div>
              <p>
                <b>{x.submittedBy?.name}</b> sent the <b>{x.stageLabel}</b>
                {x.storyTitle ? ` of “${x.storyTitle}”` : ''} to <b>{x.reviewer?.name}</b>
                {x.reviewedBy && ['approved', 'changes_requested'].includes(x.status) ? (
                  <>
                    ; {x.status === 'approved' ? 'approved' : 'changes asked'} by <b>{x.reviewedBy.name}</b>
                  </>
                ) : null}
                .
              </p>
              {x.note && <p className={t.quote}>{x.note}</p>}
              {x.comment && <p className={t.quote}>{x.comment}</p>}
            </div>
            <span className={t.eventSide}>
              <Chip color={color}>{st.label}</Chip>
              <span className={t.muted}>{timeAgo(x.reviewedAt || x.at)}</span>
            </span>
          </li>
        );
      })}
    </ul>
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
      <IconChevronLeft width={16} height={16} /> My Projects
    </Link>
  );
}
