import { useEffect, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import { getProjectCoverImage, getTeamLeaderDashboard } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
import { Avatar, AvatarStack, CoverArt } from '../ui/Production.jsx';
import { IconCheck, IconChevronRight, IconClose, IconPlay, IconProjects, IconUsers } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useWorkspace } from '../WorkspaceContext.jsx';
import { lifecycleOf } from './lifecycle.js';
import s from './TeamLeaderDashboard.module.css';

/* ------------------------------------------------------------------ dates ("YYYY-MM-DD", read as that calendar day) */
const parse = (day) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const short = (day) => parse(day)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) || '';
const full = (day) => parse(day)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) || '';
const daysBetween = (a, b) => Math.round((b - a) / 86400000);

// the colour of each project state (TeamLeaderDashboard.module.css): purple, blue, green, red
const TONE = { not_started: s.toneWaiting, ongoing: s.toneOngoing, completed: s.toneDone, aborted: s.toneStopped };

/** What a card says about time, and how much of the start-to-deadline span has gone (0-100). */
function timeline(p) {
  const start = parse(p.startDate);
  const end = parse(p.deadline);
  const now = today();
  if (p.lifecycle === 'completed') return { text: 'Delivered', value: 100 };
  if (p.lifecycle === 'aborted') return { text: 'Stopped', value: 100 };
  if (p.lifecycle === 'not_started') return { text: start ? `Starts ${short(p.startDate)}` : 'Not started yet', value: 0 };
  if (!end) return { text: 'No deadline', value: 0 };
  const left = daysBetween(now, end);
  const value = start && end > start ? Math.min(100, Math.max(0, (daysBetween(start, now) / daysBetween(start, end)) * 100)) : 0;
  if (left < 0) return { text: `${-left} ${left === -1 ? 'day' : 'days'} late`, value: 100, late: true };
  if (left === 0) return { text: 'Due today', value: 100 };
  return { text: `${left} ${left === 1 ? 'day' : 'days'} left`, value };
}

/** The small line under each count, worked out from all the projects. */
function details(projects) {
  const now = today();
  const of = (state) => projects.filter((p) => p.lifecycle === state);
  const firstStart = of('not_started').map((p) => p.startDate).filter(Boolean).sort()[0];
  const nextDeadline = of('ongoing').map((p) => p.deadline).filter((d) => d && parse(d) >= now).sort()[0];
  const lastDone = [...of('completed')].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const lastStopped = [...of('aborted')].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const people = new Set(projects.flatMap((p) => p.people || []));
  const active = projects.filter((p) => (p.people || []).length && ['not_started', 'ongoing'].includes(p.lifecycle)).length;
  return {
    total: projects.length ? 'all time' : 'none yet',
    notStarted: firstStart ? `starts ${short(firstStart)}` : of('not_started').length ? 'no start date yet' : 'none waiting',
    ongoing: nextDeadline ? `next deadline ${short(nextDeadline)}` : of('ongoing').length ? 'no upcoming deadline' : 'none running',
    completed: lastDone ? lastDone.title : 'none yet',
    aborted: lastStopped ? lastStopped.title : 'none',
    team: people.size ? `on ${active} active ${active === 1 ? 'project' : 'projects'}` : 'nobody added yet',
    people: people.size,
  };
}

const IconClock = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

/**
 * The Team Leader's home: a welcome, six counts (each with its own colour, which spills in from the card's right
 * edge) and the latest projects as cards. A card shows the project's newest sketch once one has been made (else a
 * drawn cover), its state, the time left and its people; under the mouse it lifts and glows in its state's colour.
 */
export default function TeamLeaderDashboardPage({ teamLeaderId, email }) {
  useDocumentTitle('Dashboard');
  const { displayName } = useWorkspace();
  const { data, loading, error, reload } = useResource(() => getTeamLeaderDashboard(teamLeaderId), [teamLeaderId]);
  const stats = data?.stats;
  const all = data?.projects ?? [];
  const latest = all.slice(0, 4);
  const more = details(all);
  const name = displayName || (email || '').split('@')[0] || 'there';
  const value = (n) => (data ? n ?? 0 : '–');

  const cards = [
    { key: 'total', tone: s.toneTotal, icon: IconProjects, label: 'Total projects', count: stats?.total, note: more.total },
    { key: 'waiting', tone: s.toneWaiting, icon: IconClock, label: 'Not started', count: stats?.notStarted, note: more.notStarted },
    { key: 'ongoing', tone: s.toneOngoing, icon: IconPlay, label: 'Ongoing', count: stats?.ongoing, note: more.ongoing },
    { key: 'done', tone: s.toneDone, icon: IconCheck, label: 'Completed', count: stats?.completed, note: more.completed },
    { key: 'stopped', tone: s.toneStopped, icon: IconClose, label: 'Aborted', count: stats?.aborted, note: more.aborted },
    // each person once (the backend's count adds a person again for every project and role)
    { key: 'team', tone: s.toneTeam, icon: IconUsers, label: 'Team members', count: more.people || stats?.teamMembers, note: more.team },
  ];

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <p className={s.eyebrow}>Team Leader workspace</p>
          <h1 className={s.welcome}>Welcome back, {name}</h1>
          <p className={s.lead}>Monitor your projects and manage your production teams.</p>
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}

      <ul className={s.stats} aria-label="Your projects in numbers">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.key} className={cx(s.stat, c.tone)}>
              <span className={s.spill} aria-hidden="true" />
              <span className={s.statIcon} aria-hidden="true">
                <Icon width={21} height={21} />
              </span>
              <div className={s.statText}>
                <p className={s.statLabel}>{c.label}</p>
                <p className={s.statValue}>{value(c.count)}</p>
                {data && <p className={s.statNote}>{c.note}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      <section className={s.panel} aria-labelledby="tl-latest-title">
        <div className={s.panelHead}>
          <div>
            <h2 id="tl-latest-title" className={s.panelTitle}>
              My Projects
            </h2>
            <p className={s.panelSub}>Your latest assigned projects.</p>
          </div>
          <Link to="/team-leader/projects" className={s.viewAll}>
            View all <IconChevronRight width={16} height={16} />
          </Link>
        </div>
        {data && latest.length === 0 ? (
          <EmptyState framed={false} icon={IconProjects} title="No projects yet" text="Projects appear here when your organization makes you the Team Leader of one." />
        ) : (
          <ul className={s.cards}>
            {latest.map((p) => (
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

function ProjectCard({ project: p }) {
  const state = lifecycleOf(p.lifecycle);
  const time = timeline(p);
  const cover = useCover(p.id, p.cover);
  const people = p.people || [];
  const count = people.length || p.memberCount || 0;
  const dates = [full(p.startDate), full(p.deadline)].filter(Boolean);
  return (
    <Link to={`/team-leader/projects/${p.id}`} className={cx(s.card, TONE[p.lifecycle] || s.toneWaiting)} aria-label={`${p.title}, ${state.label}, ${time.text}`}>
      <span className={s.glow} aria-hidden="true" />
      <div className={s.inner}>
        <div className={s.cover}>
          {cover ? (
            <div className={s.sketch}>
              <img src={cover} alt="" />
              <span className={s.shade} aria-hidden="true" />
            </div>
          ) : (
            <CoverArt seed={p.id} className={s.art} />
          )}
          <span className={s.pill}>{state.label}</span>
          <p className={s.title}>{p.title}</p>
        </div>
        <div className={s.body}>
          <p className={s.client}>{p.clientName || 'No client'}</p>
          <div className={s.timeRow}>
            <span className={s.dates}>{dates.length === 2 ? `${dates[0]} → ${dates[1]}` : dates[0] || 'No dates set'}</span>
            <b className={cx(s.when, time.late && s.late)}>{time.text}</b>
          </div>
          <span className={s.bar} aria-hidden="true">
            <i style={{ width: `${Math.max(time.value, 3)}%` }} />
          </span>
          <div className={s.foot}>
            {people.length ? (
              <AvatarStack>
                {people.slice(0, 5).map((mail) => (
                  <Avatar key={mail} name={mail.split('@')[0]} seed={mail} size={28} />
                ))}
              </AvatarStack>
            ) : (
              <span className={s.muted}>No team yet</span>
            )}
            <span className={s.muted}>
              {count} {count === 1 ? 'person' : 'people'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** The project's newest sketch as an image URL (null: keep the drawn cover). */
function useCover(projectId, cover) {
  const [url, setUrl] = useState(null);
  const key = cover ? cover.sketchId : null;
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!key) return undefined;
    getProjectCoverImage(projectId, cover)
      .then((u) => alive && setUrl(u))
      .catch(() => {
        /* the drawn cover stays */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, key]);
  return url;
}
