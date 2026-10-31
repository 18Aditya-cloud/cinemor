import { useEffect, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import { TOOLS } from '../quickCreate/QuickCreatePage.jsx';
import Button from '../ui/Button.jsx';
import { IconPlay, IconPlus, IconProjects, IconSparkles, IconUsers } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import { useWorkspace } from '../WorkspaceContext.jsx';
import { listClients, listProjects } from './individualApi.js';
import { IconArrowRight } from './parts.jsx';
import { loadProduction, MODULES } from './production.js';
import o from './Overview.module.css';

/* ------------------------------------------------------------------ dates ("YYYY-MM-DD", read as that calendar day) */
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

// a project's state as the dashboards say it, with its colour (studio.css)
const STATE = {
  active: { label: 'Ongoing', tone: 'var(--st-ongoing)' },
  pending: { label: 'Not started', tone: 'var(--st-waiting)' },
  completed: { label: 'Completed', tone: 'var(--st-done)' },
  aborted: { label: 'Aborted', tone: 'var(--st-stopped)' },
};
const stateOf = (p) => STATE[p.status] || STATE.pending;
// the project to carry on with: the newest ongoing one, else the newest not started
const RANK = { active: 0, pending: 1, completed: 2, aborted: 3 };
const byWork = (a, b) => (RANK[a.status] ?? 1) - (RANK[b.status] ?? 1) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));

// the Quick Create tools, with the same symbols as the Quick Create page
const QUICK = [
  { slug: 'short-video', label: 'Short video', note: 'A short film from one prompt', tone: 'var(--qc-short)', wide: true },
  { slug: 'character', note: 'Any pose, any look', tone: 'var(--qc-character)' },
  { slug: 'location', note: 'A palace to a forest', tone: 'var(--qc-location)' },
  { slug: 'image', note: 'From your words', tone: 'var(--qc-image)' },
  { slug: 'story', note: 'Edited with AI', tone: 'var(--qc-story)' },
  { slug: 'avatar-video', label: 'Avatar video', note: 'A picture that speaks', tone: 'var(--qc-avatar)' },
  { slug: 'audio', note: 'A voice for any text', tone: 'var(--qc-audio)' },
].map((q) => ({ ...q, tool: TOOLS.find((t) => t.slug === q.slug) }));

/** Each shown project's production (stages and cover sketch), read after the list itself. */
function useProductions(projects) {
  const [map, setMap] = useState({});
  const key = (projects || []).map((p) => p.id).join(',');
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    key.split(',').forEach((id) => {
      loadProduction(Number(id))
        .then((prod) => alive && setMap((m) => ({ ...m, [id]: prod })))
        .catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}

/**
 * The creator's home, in the studio look (studio.css): what is in production, four useful numbers, the project to
 * carry on with (its six stages and the next one to open), the Quick Create tools, and the latest projects as cards.
 * A project's card shows its first scene sketch once one is made (until then, a drawn cover).
 */
export default function OverviewPage() {
  useDocumentTitle('Overview');
  const { navigate } = useRouter();
  const { displayName } = useWorkspace();
  const { data, error, reload } = useResource(() => Promise.all([listProjects(), listClients()]), []);
  const [projects, clients] = data ?? [null, null];
  const ordered = [...(projects || [])].sort(byWork);
  const focus = ordered.find((p) => ['active', 'pending'].includes(p.status)) || null;
  const recent = [...(projects || [])].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, 3);
  const prods = useProductions([...(focus ? [focus] : []), ...recent.filter((p) => p.id !== focus?.id)]);

  // the numbers
  const live = (projects || []).filter((p) => p.status === 'active');
  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = (projects || []).filter((p) => Date.parse(p.createdAt || '') > weekAgo).length;
  const upcoming = (projects || [])
    .filter((p) => ['active', 'pending'].includes(p.status) && daysLeft(p.deadline) !== null && daysLeft(p.deadline) >= 0)
    .sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline))[0];
  const focusProd = focus ? prods[focus.id] : null;
  const clientProjects = (projects || []).filter((p) => p.projectType === 'client').length;
  const stats = [
    { label: 'Total projects', value: projects?.length ?? '–', note: newThisWeek ? `+${newThisWeek} this week` : 'all time', tone: 'var(--st-sketch)', icon: IconProjects },
    {
      label: 'In production',
      value: projects ? live.length : '–',
      note: focusProd?.current && focus?.status === 'active' ? `${focusProd.current.title || focusProd.current.label} stage` : live.length ? 'ongoing' : 'nothing running',
      tone: 'var(--st-board)',
      icon: IconPlay,
    },
    {
      label: 'Next deadline',
      value: upcoming ? short(upcoming.deadline) : '–',
      note: upcoming ? (daysLeft(upcoming.deadline) === 0 ? 'due today' : `${plural(daysLeft(upcoming.deadline), 'day')} left`) : 'none coming up',
      tone: 'var(--st-story)',
      icon: IconClock,
    },
    { label: 'Clients', value: clients?.length ?? '–', note: clients?.length ? plural(clientProjects, 'client project') : 'add your first', tone: 'var(--st-loc)', icon: IconUsers },
  ];

  return (
    <div className={o.page}>
      <div className={o.top}>
        <div>
          <span className={o.kick}>
            <i aria-hidden="true" />
            Creator workspace{projects ? ` · ${plural(live.length, 'project')} in production` : ''}
          </span>
          <h1 className={o.title}>Welcome, {displayName}</h1>
          <p className={o.lead}>Your projects, clients and AI production in one place.</p>
        </div>
        <div className={o.actions}>
          <Button variant="secondary" icon={IconSparkles} onClick={() => navigate('/dashboard/quick-create')}>
            Quick Create
          </Button>
          <Button icon={IconPlus} onClick={() => navigate('/dashboard/projects/new')}>
            Create Project
          </Button>
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}

      <ul className={o.stats} aria-label="Your work in numbers">
        {stats.map((st) => {
          const Icon = st.icon;
          return (
            <li key={st.label} className={o.stat} style={{ '--c': st.tone }}>
              <span className={o.statIcon} aria-hidden="true">
                <Icon width={19} height={19} />
              </span>
              <span className={o.statLabel}>{st.label}</span>
              <span className={o.statValue}>
                {st.value}
                <small>{st.note}</small>
              </span>
            </li>
          );
        })}
      </ul>

      <div className={o.grid}>
        <section className={o.card} aria-labelledby="ov-continue">
          <div className={o.cardHead}>
            <h2 id="ov-continue" className={o.cardTitle}>
              Continue production
            </h2>
            <Link to="/dashboard/projects" className={o.more}>
              All projects <IconArrowRight width={14} height={14} />
            </Link>
          </div>
          {!projects ? (
            <div className={o.skeleton} />
          ) : focus ? (
            <Continue project={focus} prod={prods[focus.id]} onOpen={(to) => navigate(to)} />
          ) : (
            <div className={o.empty}>
              <p className={o.emptyTitle}>{projects.length ? 'Nothing in production right now' : 'No projects yet'}</p>
              <p className={o.emptyText}>{projects.length ? 'Start a new project, or reopen one from My Projects.' : 'Create your first project to start making a film with Cinemor AI.'}</p>
              <Button icon={IconPlus} onClick={() => navigate('/dashboard/projects/new')}>
                Create Project
              </Button>
            </div>
          )}
        </section>

        <section className={cx(o.card, o.quickCard)} aria-labelledby="ov-quick">
          <div className={o.cardHead}>
            <h2 id="ov-quick" className={o.cardTitle}>
              Quick Create
            </h2>
            <Link to="/dashboard/library" className={o.more}>
              Library <IconArrowRight width={14} height={14} />
            </Link>
          </div>
          <ul className={o.quick}>
            {QUICK.map((q) => {
              const Icon = q.tool?.icon || IconSparkles;
              return (
                <li key={q.slug} className={q.wide ? o.qWide : undefined}>
                  <Link to={`/dashboard/quick-create/${q.slug}`} className={o.q} style={{ '--c': q.tone }} title={q.note}>
                    <span className={o.qIcon} aria-hidden="true">
                      <Icon width={17} height={17} />
                    </span>
                    <span className={o.qText}>
                      <b>{q.label || q.tool?.label}</b>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-labelledby="ov-recent">
        <div className={o.cardHead}>
          <h2 id="ov-recent" className={o.cardTitle}>
            Recent projects
          </h2>
          {recent.length > 0 && (
            <Link to="/dashboard/projects" className={o.more}>
              View all <IconArrowRight width={14} height={14} />
            </Link>
          )}
        </div>
        {projects && recent.length === 0 ? (
          <p className={o.none}>Your projects will show here as cards, with a picture from their sketches once you make one.</p>
        ) : (
          <ul className={o.cards}>
            {recent.map((p) => (
              <li key={p.id}>
                <ProjectCard project={p} prod={prods[p.id]} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A cover: the project's first scene sketch, or a drawn one (its colours from the project id) until there is one. */
function Cover({ id, src, className }) {
  return (
    <div className={cx(o.cover, className)} data-art={Number(id) % 3}>
      {src ? <img src={src} alt="" /> : <span className={o.art} aria-hidden="true" />}
    </div>
  );
}

function Pill({ state }) {
  return (
    <span className={o.pill} style={{ '--c': state.tone }}>
      <i aria-hidden="true" />
      {state.label}
    </span>
  );
}

/** The project to carry on with: its cover, its six stages, how far along it is, and the next module to open. */
function Continue({ project: p, prod, onOpen }) {
  const st = stateOf(p);
  const current = prod?.current;
  const done = prod?.done ?? 0;
  const dates = [p.startedDate && `Started ${short(p.startedDate)}`, p.deadline && `Due ${short(p.deadline)}`].filter(Boolean);
  const to = (m) => `/dashboard/projects/${p.id}/${m.path}`;
  return (
    <div className={o.cont}>
      <Link to={`/dashboard/projects/${p.id}`} aria-label={`Open ${p.title}`} tabIndex={-1}>
        <Cover id={p.id} src={prod?.cover} className={o.contCover} />
      </Link>
      <div className={o.contBody}>
        <Pill state={current && p.status === 'active' ? { label: `${current.title || current.label} in progress`, tone: current.tone } : st} />
        <h3 className={o.contTitle}>
          <Link to={`/dashboard/projects/${p.id}`}>{p.title}</Link>
        </h3>
        <p className={o.meta}>{[p.projectType === 'client' ? p.clientName || 'Client project' : 'Personal project', ...dates].join(' · ')}</p>
        <ol className={o.stages} aria-label="Stages">
          {MODULES.map((m) => {
            const state = prod?.states?.[m.id]?.state;
            const kind = state === 'done' ? 'done' : m.id === current?.id ? 'now' : 'todo';
            const Icon = m.icon;
            return (
              <li key={m.id}>
                <Link to={to(m)} className={cx(o.stage, o[`stage_${kind}`])} style={{ '--c': m.tone }} aria-label={`${m.title || m.label}: ${kind === 'done' ? 'done' : kind === 'now' ? 'next' : 'not yet'}`}>
                  <span className={o.stageIcon} aria-hidden="true">
                    <Icon width={15} height={15} />
                  </span>
                  {m.label}
                </Link>
              </li>
            );
          })}
        </ol>
        <div className={o.bar} aria-hidden="true">
          <i style={{ width: `${Math.max(4, Math.round((done / 6) * 100))}%` }} />
        </div>
        <div className={o.contFoot}>
          <span>{prod ? `${done} of 6 stages · ${Math.round((done / 6) * 100)}%` : 'Checking the stages…'}</span>
          {current && <Button onClick={() => onOpen(to(current))}>Open {current.title || current.label}</Button>}
        </div>
      </div>
    </div>
  );
}

/** A recent project as a card: cover, state, a dot per stage, and who it is for and when. */
function ProjectCard({ project: p, prod }) {
  const st = stateOf(p);
  const left = daysLeft(p.deadline);
  const when =
    p.status === 'completed'
      ? 'Delivered'
      : p.status === 'aborted'
        ? 'Stopped'
        : p.status === 'pending' && p.startedDate
          ? `Starts ${short(p.startedDate)}`
          : left !== null
            ? left < 0
              ? `${plural(-left, 'day')} late`
              : `Due ${short(p.deadline)}`
            : `Updated ${timeAgo(p.updatedAt)}`;
  return (
    <Link to={`/dashboard/projects/${p.id}`} className={o.pc}>
      <Cover id={p.id} src={prod?.cover} className={o.pcCover} />
      <div className={o.pcBody}>
        <div className={o.pcHead}>
          <span className={o.pcTitle}>{p.title}</span>
          <Pill state={st} />
        </div>
        <span className={o.dots} aria-label={prod ? `${prod.done} of 6 stages done` : undefined}>
          {MODULES.map((m) => (
            <i key={m.id} className={cx(prod?.states?.[m.id]?.state === 'done' && o.dotOn)} style={{ '--c': m.tone }} />
          ))}
        </span>
        <span className={o.pcMeta}>
          <span>{p.projectType === 'client' ? p.clientName || 'Client' : 'Personal'}</span>
          <span className={cx(left !== null && left < 0 && !['completed', 'aborted'].includes(p.status) && o.late)}>{when}</span>
        </span>
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