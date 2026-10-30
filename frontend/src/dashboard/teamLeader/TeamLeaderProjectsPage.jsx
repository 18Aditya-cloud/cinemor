import { useMemo, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import { listTeamLeaderProjects } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
import { IconChevronRight, IconProjects } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import styles from '../pages/pages.module.css';
import toolbar from '../pages/ProjectsToolbar.module.css';
import { LIFECYCLE, lifecycleOf, sortProjects } from './lifecycle.js';
import { dayLabel, DelayAlert } from '../projectDates.jsx';
import tl from './TeamLeader.module.css';

const FILTERS = [['all', 'All'], ...Object.entries(LIFECYCLE).map(([id, s]) => [id, s.label])];

/** Every project this Team Leader leads, filterable by status; each row opens that project. */
export default function TeamLeaderProjectsPage({ teamLeaderId }) {
  useDocumentTitle('My Projects');
  const { data, loading, error, reload } = useResource(() => listTeamLeaderProjects(teamLeaderId), [teamLeaderId]);
  const [filter, setFilter] = useState('all');
  // ongoing first (nearest deadline first), then not started, completed and aborted
  const projects = useMemo(() => sortProjects(data ?? []), [data]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id]) => [id, id === 'all' ? projects.length : projects.filter((p) => p.lifecycle === id).length])), [projects]);
  const shown = filter === 'all' ? projects : projects.filter((p) => p.lifecycle === filter);

  return (
    <div className={styles.page}>
      <PageHeader title="My Projects" subtitle="View and manage the projects assigned to your team." actions={<RefreshButton onClick={reload} loading={loading} />} />
      {error && <Notice message={error.message} onRetry={reload} />}

      {projects.length === 0 ? (
        <EmptyState icon={IconProjects} title="No projects yet" text="Projects appear here when your organization makes you the Team Leader of one." />
      ) : (
        <>
          <div className={toolbar.bar}>
            <div className={toolbar.group} role="group" aria-label="Show projects">
              {FILTERS.map(([id, label]) => (
                <button key={id} type="button" className={cx(toolbar.tab, filter === id && toolbar.tabOn)} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                  <span className={toolbar.count}>{counts[id]}</span>
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className={toolbar.none}>
              <p>No {lifecycleOf(filter).label.toLowerCase()} projects.</p>
            </div>
          ) : (
            <ul className={tl.list} aria-label="Projects">
              {shown.map((p) => {
                const state = lifecycleOf(p.lifecycle);
                return (
                  <li key={p.id}>
                    <Link to={`/team-leader/projects/${p.id}`} className={tl.row} aria-label={`${p.title}, ${state.label}, ${p.memberCount} members`}>
                      <span className={tl.tile} aria-hidden="true">
                        <IconProjects width={20} height={20} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className={tl.rowTitle}>{p.title}</span>
                        <span className={tl.rowDesc} style={{ display: 'block' }}>
                          {[p.clientName, p.description].filter(Boolean).join(' \u00b7 ') || 'No description.'}
                        </span>
                        {(p.startDate || p.deadline) && (
                          <span className={tl.rowDesc} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', marginTop: 6 }}>
                            <span>
                              {dayLabel(p.startDate) || '-'} to {dayLabel(p.deadline) || '-'}
                            </span>
                            <DelayAlert project={p} compact />
                          </span>
                        )}
                      </span>
                      <span className={tl.rowMeta}>
                        {p.memberCount} {p.memberCount === 1 ? 'member' : 'members'}
                      </span>
                      <Pill tone={state.tone}>{state.label}</Pill>
                      <IconChevronRight width={18} height={18} className={tl.arrow} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}