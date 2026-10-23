import { useMemo, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import { IconPlus, IconProjects, IconSearch } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { listProjects } from './individualApi.js';
import { formatDate, Header, IconArrowRight, IconCalendar, projectFor, StatusPill, Tile } from './parts.jsx';
import s from './Individual.module.css';

const FILTERS = [
  ['all', 'All', () => true],
  ['personal', 'My Projects', (p) => p.projectType === 'personal'],
  ['client', 'Client Projects', (p) => p.projectType === 'client'],
  ['active', 'Active', (p) => p.status === 'active'],
  ['completed', 'Completed', (p) => p.status === 'completed'],
];

/** Every project the creator has, searchable and filterable; each card opens that project. */
export default function ProjectsPage() {
  useDocumentTitle('My Projects');
  const { navigate } = useRouter();
  const { data, loading, error, reload } = useResource(listProjects, []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const projects = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id, , test]) => [id, projects.filter(test).length])), [projects]);
  const shown = useMemo(() => {
    const test = FILTERS.find(([id]) => id === filter)[2];
    const q = query.trim().toLowerCase();
    return projects.filter((p) => test(p) && (!q || [p.title, p.description, p.clientName].some((v) => (v || '').toLowerCase().includes(q))));
  }, [projects, filter, query]);

  const create = () => navigate('/dashboard/projects/new');

  return (
    <div className={s.page}>
      <Header
        title="My Projects"
        subtitle="Create, manage, and continue working on your Cinemor AI projects."
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <Button icon={IconPlus} onClick={create}>
              Create Project
            </Button>
          </>
        }
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      {data && projects.length === 0 ? (
        <EmptyState
          icon={IconProjects}
          title="No projects yet"
          text="Create your first project, for yourself or for a client."
          action={
            <Button icon={IconPlus} onClick={create}>
              Create Project
            </Button>
          }
        />
      ) : (
        <>
          <div className={cx(s.card, s.toolbar)}>
            <label className={s.search}>
              <IconSearch width={18} height={18} aria-hidden="true" />
              <span className="cm-sr-only">Search projects</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects..." autoComplete="off" />
            </label>
            <div className={s.tabs} role="group" aria-label="Show projects">
              {FILTERS.map(([id, label]) => (
                <button key={id} type="button" className={cx(s.tab, filter === id && s.tabOn)} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                  <span className={s.count}>{counts[id]}</span>
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className={cx(s.card, s.none)}>
              <p>No projects match {query.trim() ? `"${query.trim()}"` : 'this filter'}.</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
                style={{ marginTop: 12 }}
              >
                Show all projects
              </Button>
            </div>
          ) : (
            <ul className={s.grid} aria-label="Projects">
              {shown.map((p) => (
                <li key={p.id}>
                  <Link to={`/dashboard/projects/${p.id}`} className={cx(s.card, s.projectCard)}>
                    <span className={s.cardTop}>
                      <Tile icon={IconProjects} />
                      <StatusPill status={p.status} />
                    </span>
                    <span className={s.cardTitle}>{p.title}</span>
                    <span className={s.cardDesc}>{p.description || <span className={s.muted}>No description.</span>}</span>
                    <span className={s.cardMeta}>
                      <span className={s.metaLine}>
                        <IconCalendar width={16} height={16} />
                        {p.startedDate ? `Started: ${formatDate(p.startedDate)}` : 'No start date'}
                      </span>
                      <span className={s.metaLine}>
                        <span className={s.dot} aria-hidden="true" />
                        {projectFor(p)}
                      </span>
                    </span>
                    <span className={s.cardFoot}>
                      <span>{p.deadline ? `Deadline: ${formatDate(p.deadline)}` : 'No deadline'}</span>
                      <span className={s.link}>
                        Open <IconArrowRight width={16} height={16} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
