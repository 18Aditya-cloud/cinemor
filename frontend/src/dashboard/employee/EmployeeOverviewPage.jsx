import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import { useWorkspace } from '../WorkspaceContext.jsx';
import timeAgo from '../timeAgo.js';
import { IconBuilding, IconCheck, IconChevronRight, IconEye, IconList, IconLock, IconPencil, IconPlay } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { itemLabel, listMyProjects, listMySubmissions, listReviews } from './employeeApi.js';
import { NotificationBell } from './EmployeeParts.jsx';
import { modulePath, projectPath, stageMeta, STAGES, upNext } from './stages.js';
import x from './EmployeeOverview.module.css';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

async function loadAll() {
  const [projects, reviews, sent] = await Promise.all([listMyProjects(), listReviews(), listMySubmissions()]);
  return { projects, reviews, sent };
}

/* ------------------------------------------------------------------ colours (individual/studio.css) */
const STAGE_TONE = {
  story: 'var(--st-story)',
  storyboard: 'var(--st-board)',
  characters: 'var(--st-char)',
  locations: 'var(--st-loc)',
  sketches: 'var(--st-sketch)',
  animation: 'var(--st-anim)',
};
const STATE = {
  ongoing: { label: 'Ongoing', tone: 'var(--st-ongoing)' },
  not_started: { label: 'Not started', tone: 'var(--st-waiting)' },
  completed: { label: 'Completed', tone: 'var(--st-done)' },
  aborted: { label: 'Aborted', tone: 'var(--st-stopped)' },
};
const SENT = {
  pending: { label: 'In review', tone: 'var(--st-board)' },
  approved: { label: 'Approved', tone: 'var(--st-done)' },
  changes_requested: { label: 'Changes asked', tone: 'var(--st-stopped)' },
};
const FILTERS = [
  { key: 'all', label: 'All', tone: 'var(--cm-violet-hi)' },
  { key: 'ongoing', label: 'Ongoing', tone: STATE.ongoing.tone },
  { key: 'not_started', label: 'Not started', tone: STATE.not_started.tone },
  { key: 'completed', label: 'Completed', tone: STATE.completed.tone },
  { key: 'aborted', label: 'Aborted', tone: STATE.aborted.tone },
];

/* ------------------------------------------------------------------ dates ("YYYY-MM-DD") */
const dayOf = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const short = (v) => dayOf(v)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) || '';
const daysLeft = (v) => {
  const d = dayOf(v);
  if (!d) return null;
  const now = new Date();
  return Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// ongoing first (nearest deadline first), then not started, completed, aborted
const RANK = { ongoing: 0, not_started: 1, completed: 2, aborted: 3 };
const dayKey = (v) => (dayOf(v) ? v.slice(0, 10) : '9999-99-99');
const byState = (a, b) =>
  (RANK[a.lifecycle] ?? 1) - (RANK[b.lifecycle] ?? 1) ||
  (a.lifecycle === 'not_started' ? dayKey(a.startDate).localeCompare(dayKey(b.startDate)) : dayKey(a.deadline).localeCompare(dayKey(b.deadline))) ||
  b.lastActivity - a.lastActivity;

/**
 * The employee's home (the studio look, like the creator's Overview): their organization and roles, four numbers,
 * Up next (what is open in their roles, and what opens next), their work in review with what the reviewer said, and
 * their projects as cards with the six stages, filtered by state.
 */
export default function EmployeeOverviewPage({ email }) {
  useDocumentTitle('My Work');
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { data, loading, error, reload } = useResource(loadAll, []);
  const { displayName } = useWorkspace();
  const name = displayName || (email || '').split('@')[0] || 'there';
  const [filter, setFilter] = useState('all');

  const projects = [...(data?.projects || [])].sort(byState);
  const tasks = data ? upNext(projects, data.reviews) : [];
  const fixes = tasks.filter((t) => t.kind === 'fix').length;
  // what opens next in this person's roles (shown under the open work, locked)
  const later = [];
  projects
    .filter((p) => ['ongoing', 'not_started'].includes(p.lifecycle))
    .forEach((p) =>
      p.stages
        .filter((s) => s.roleAllows && !s.canWork && s.status === 'locked')
        .forEach((s) => later.push({ key: `l-${p.id}-${s.key}`, project: p, stage: s })),
    );
  // the latest answer (or wait) for each stage this person sent
  const latest = [];
  (data?.sent || []).forEach((s) => {
    if (['withdrawn', 'cancelled'].includes(s.status)) return;
    if (!latest.some((y) => y.projectId === s.projectId && y.stage === s.stage)) latest.push(s);
  });
  const pending = latest.filter((s) => s.status === 'pending').length;
  const ongoing = projects.filter((p) => p.lifecycle === 'ongoing');
  const next = projects
    .filter((p) => ['ongoing', 'not_started'].includes(p.lifecycle) && daysLeft(p.deadline) !== null && daysLeft(p.deadline) >= 0)
    .sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline))[0];
  const roles = [...new Set(projects.flatMap((p) => p.workRoles.map((r) => r.name)))];
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, f.key === 'all' ? projects.length : projects.filter((p) => p.lifecycle === f.key).length]));
  const shown = filter === 'all' ? projects : projects.filter((p) => p.lifecycle === filter);

  const stats = [
    { label: 'My projects', value: data ? projects.length : '–', note: `${ongoing.length} ongoing`, tone: 'var(--st-board)', icon: IconList },
    { label: 'Up next', value: data ? tasks.length : '–', note: fixes ? `${plural(fixes, 'change')} asked` : tasks.length ? 'open for you' : 'nothing open', tone: 'var(--st-story)', icon: IconPlay },
    { label: 'In review', value: data ? pending : '–', note: pending ? 'with reviewers' : 'nothing pending', tone: 'var(--st-sketch)', icon: IconEye },
    {
      label: 'Next deadline',
      value: next ? short(next.deadline) : '–',
      note: next ? (daysLeft(next.deadline) === 0 ? 'due today' : `${plural(daysLeft(next.deadline), 'day')} left`) : 'none coming up',
      tone: 'var(--st-stopped)',
      icon: IconClock,
    },
  ];

  const summary = !data
    ? ''
    : projects.length === 0
      ? 'No projects yet. Your Team Leader adds you to one.'
      : fixes
        ? `${plural(fixes, 'thing')} need${fixes === 1 ? 's' : ''} your changes${tasks.length > fixes ? `, and ${tasks.length - fixes} more ${tasks.length - fixes === 1 ? 'is' : 'are'} open` : ''}.`
        : tasks.length
          ? `${plural(tasks.length, 'thing')} ${tasks.length === 1 ? 'is' : 'are'} waiting for you.`
          : 'Nothing is waiting for you right now.';

  return (
    <div className={x.page}>
      <div className={x.top}>
        <div>
          <div className={x.chips}>
            {user?.organizationName && (
              <span className={x.org}>
                <IconBuilding width={15} height={15} aria-hidden="true" />
                {user.organizationName}
              </span>
            )}
            <span className={x.role}>
              {user?.teamLeader ? 'Team Leader' : 'Employee'}
              {roles.length ? ` · ${roles.slice(0, 2).join(', ')}${roles.length > 2 ? ` +${roles.length - 2}` : ''}` : ''}
            </span>
          </div>
          <h1 className={x.title}>
            {greeting()}, {name}
          </h1>
          {data && (
            <p className={x.lead}>
              {projects.length > 0 && (
                <>
                  You are on <b>{plural(projects.length, 'project')}</b>.{' '}
                </>
              )}
              {summary}
            </p>
          )}
        </div>
        <div className={x.tools}>
          <NotificationBell />
          <RefreshButton onClick={reload} loading={loading} />
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}

      <ul className={x.stats} aria-label="Your work in numbers">
        {stats.map((st) => {
          const Icon = st.icon;
          return (
            <li key={st.label} className={x.stat} style={{ '--c': st.tone }}>
              <span className={x.statIcon} aria-hidden="true">
                <Icon width={19} height={19} />
              </span>
              <span className={x.statLabel}>{st.label}</span>
              <span className={x.statValue}>
                {st.value}
                <small>{st.note}</small>
              </span>
            </li>
          );
        })}
      </ul>

      <div className={x.grid}>
        <section className={x.card} aria-labelledby="emp-next">
          <div className={x.cardHead}>
            <h2 id="emp-next" className={x.cardTitle}>
              Up next
            </h2>
            <span className={x.cardSub}>Work in your roles that is open now</span>
          </div>
          {!data ? (
            <div className={x.skeleton} />
          ) : tasks.length === 0 && later.length === 0 ? (
            <p className={x.empty}>Nothing to do right now. A stage opens for you when the one before it is approved, and you will see it here.</p>
          ) : (
            <ul className={x.rows}>
              {tasks.slice(0, 5).map((t, i) => {
                const key = t.kind === 'review' ? t.review.stage : t.stage?.key;
                const tone = t.kind === 'fix' ? 'var(--st-stopped)' : t.kind === 'review' ? 'var(--st-done)' : STAGE_TONE[key] || 'var(--cm-violet-hi)';
                const Icon = t.kind === 'fix' ? IconPencil : t.kind === 'review' ? IconEye : stageMeta(key).icon;
                const sub =
                  t.kind === 'review'
                    ? `${t.review.projectTitle} · sent ${timeAgo(t.review.at)}${t.review.note ? ` · “${t.review.note}”` : ''}`
                    : [t.project.title, stageMeta(key).label, t.kind === 'fix' && t.story?.stages ? 'changes asked' : t.stage?.requires?.length ? `${t.stage.requires.map((k) => stageMeta(k).label).join(' and ')} approved` : ''].filter(Boolean).join(' · ');
                return (
                  <li key={t.key} className={x.row} style={{ '--c': tone }}>
                    <span className={x.rowIcon} aria-hidden="true">
                      <Icon width={17} height={17} />
                    </span>
                    <span className={x.rowText}>
                      <b>{t.title}</b>
                      <small>{sub}</small>
                    </span>
                    <button type="button" className={cx(x.btn, i === 0 && x.btnPrimary)} onClick={() => navigate(t.to)}>
                      {t.kind === 'review' ? 'Review' : t.kind === 'fix' ? 'Open' : 'Start'}
                    </button>
                  </li>
                );
              })}
              {later.slice(0, Math.max(0, 4 - Math.min(tasks.length, 5))).map((l) => {
                const Icon = stageMeta(l.stage.key).icon;
                const why = l.project.lifecycle === 'not_started' ? `opens when the project starts${l.project.startDate ? ` (${short(l.project.startDate)})` : ''}` : l.stage.requires?.length ? `opens after the ${l.stage.requires.map((k) => stageMeta(k).label).join(' and ')} ${l.stage.requires.length > 1 ? 'are' : 'is'} approved` : 'opens soon';
                return (
                  <li key={l.key} className={cx(x.row, x.rowLater)} style={{ '--c': STAGE_TONE[l.stage.key] }}>
                    <span className={x.rowIcon} aria-hidden="true">
                      <Icon width={17} height={17} />
                    </span>
                    <span className={x.rowText}>
                      <b>
                        {stageMeta(l.stage.key).label} for “{l.project.title}”
                      </b>
                      <small>{why}</small>
                    </span>
                    <span className={x.locked}>
                      <IconLock width={13} height={13} aria-hidden="true" /> Locked
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={x.card} aria-labelledby="emp-sent">
          <div className={x.cardHead}>
            <h2 id="emp-sent" className={x.cardTitle}>
              Your work in review
            </h2>
            <Link to="/employee/reviews" className={x.more}>
              Reviews <IconChevronRight width={14} height={14} />
            </Link>
          </div>
          {!data ? (
            <div className={x.skeleton} />
          ) : latest.length === 0 ? (
            <p className={x.empty}>Nothing sent yet. When your part of a stage is ready, use Submit for review.</p>
          ) : (
            <ul className={x.rows}>
              {latest.slice(0, 3).map((s) => {
                const st = SENT[s.status] || SENT.pending;
                return (
                  <li key={s.id} className={x.sent} style={{ '--c': st.tone }}>
                    <div className={x.sentHead}>
                      <b>{itemLabel(s)}</b>
                      <span className={x.pill}>
                        <i aria-hidden="true" />
                        {st.label}
                      </span>
                    </div>
                    <small>
                      {s.projectTitle} · {s.status === 'pending' ? `with ${s.reviewer?.name || 'the reviewer'}, sent ${timeAgo(s.at)}` : timeAgo(s.reviewedAt)}
                    </small>
                    {s.comment && (
                      <p className={x.quote}>
                        {s.comment}
                        <em>{s.reviewedBy?.name}</em>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="emp-projects">
        <div className={x.cardHead}>
          <h2 id="emp-projects" className={x.cardTitle}>
            My projects
          </h2>
          <div className={x.legend}>
            <span>
              <i className={x.legMine} /> Your part
            </span>
            <span>
              <i className={x.legDone} /> Approved
            </span>
            <span>
              <i className={x.legLocked} /> Not open yet
            </span>
            <Link to="/employee/projects" className={x.more}>
              View all <IconChevronRight width={14} height={14} />
            </Link>
          </div>
        </div>
        <div className={x.tabs} role="tablist" aria-label="Projects by state">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={cx(x.tab, filter === f.key && x.tabOn)} style={{ '--c': f.tone }} onClick={() => setFilter(f.key)}>
              {f.key !== 'all' && <i aria-hidden="true" />}
              {f.label}
              <small>{counts[f.key]}</small>
            </button>
          ))}
        </div>
        {data && shown.length === 0 ? (
          <p className={x.none}>{projects.length ? 'No projects in this state.' : 'You are not on any project yet. When your Team Leader adds you to one, it appears here with the stages you work on.'}</p>
        ) : (
          <ul className={x.cards}>
            {shown.map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A project: cover with its state, deadline, client and Team Leader, the person's roles, and the six stages. */
function ProjectCard({ project: p }) {
  const st = STATE[p.lifecycle] || STATE.not_started;
  const left = daysLeft(p.deadline);
  const when =
    p.lifecycle === 'completed'
      ? 'Delivered'
      : p.lifecycle === 'aborted'
        ? 'Stopped'
        : p.lifecycle === 'not_started' && p.startDate
          ? `Starts ${short(p.startDate)}`
          : left === null
            ? ''
            : left < 0
              ? `${plural(-left, 'day')} late`
              : left === 0
                ? 'Due today'
                : `${plural(left, 'day')} left`;
  const approved = p.stages.filter((s) => s.status === 'approved').length;
  const roles = [...p.workRoles.map((r) => ({ key: `w${r.jobRoleId}`, text: r.name, mine: true })), ...p.reviewRoles.map((r) => ({ key: `r${r.jobRoleId}`, text: `${r.name} reviewer` }))];
  if (!roles.length && p.isTeamLeader) roles.push({ key: 'tl', text: 'Team Leader' });
  return (
    <Link to={projectPath(p.id)} className={x.pc} style={{ '--c': st.tone }}>
      <div className={x.cover} data-art={p.id % 3}>
        <span className={x.art} aria-hidden="true" />
        <span className={cx(x.pill, x.coverPill)}>
          <i aria-hidden="true" />
          {st.label}
        </span>
      </div>
      <div className={x.pcBody}>
        <div className={x.pcHead}>
          <b>{p.title}</b>
          {when && <span className={cx(left !== null && left < 0 && ['ongoing', 'not_started'].includes(p.lifecycle) && x.late)}>{when}</span>}
        </div>
        <p className={x.pcMeta}>{[p.clientName && `Client: ${p.clientName}`, p.teamLeader && `Team Leader: ${p.teamLeader.name}`].filter(Boolean).join(' · ')}</p>
        {roles.length > 0 && (
          <span className={x.roles}>
            {roles.slice(0, 3).map((r) => (
              <span key={r.key} className={cx(r.mine && x.roleMine)}>
                {r.text}
              </span>
            ))}
            {roles.length > 3 && <span>+{roles.length - 3}</span>}
          </span>
        )}
        <ol className={x.stages} aria-label="Stages">
          {STAGES.map((meta) => {
            const s = p.stages.find((y) => y.key === meta.key);
            const done = s?.status === 'approved';
            const mine = !done && (s?.roleAllows || s?.canReview);
            const kind = done ? 'done' : mine ? 'mine' : s?.status === 'locked' ? 'locked' : 'todo';
            const Icon = done ? IconCheck : meta.icon;
            return (
              <li key={meta.key} className={cx(x.sg, x[`sg_${kind}`])} style={{ '--c': STAGE_TONE[meta.key] }} title={`${meta.label}: ${done ? 'approved' : mine ? 'your part' : kind === 'locked' ? 'not open yet' : 'open'}`}>
                <span aria-hidden="true">
                  <Icon width={12} height={12} />
                </span>
                {meta.short === 'Characters' ? 'Chars' : meta.short === 'Locations' ? 'Places' : meta.short === 'Sketches' ? 'Sketch' : meta.short === 'Animation' ? 'Anim' : meta.short}
              </li>
            );
          })}
        </ol>
        <div className={x.pcFoot}>
          <span>{p.storyCount ? `${plural(p.storyCount, 'story', 'stories')} · ${p.finishedStoryCount} finished` : 'No story yet'}</span>
          <span>{approved} of 6 approved</span>
        </div>
      </div>
    </Link>
  );
}

function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}