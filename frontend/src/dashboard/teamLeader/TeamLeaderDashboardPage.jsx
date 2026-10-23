import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import { getTeamLeaderDashboard } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
import { IconCheckCircle, IconChevronRight, IconClose, IconInfo, IconPlay, IconProjects, IconUsers } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import StatCard, { StatGrid } from '../ui/StatCard.jsx';
import styles from '../pages/pages.module.css';
import { lifecycleOf } from './lifecycle.js';
import { ProjectDates } from '../projectDates.jsx';
import tl from './TeamLeader.module.css';

/** The Team Leader's home: a welcome, six counts, and the latest projects as cards. */
export default function TeamLeaderDashboardPage({ teamLeaderId, email }) {
  useDocumentTitle('Dashboard');
  const { data, loading, error, reload } = useResource(() => getTeamLeaderDashboard(teamLeaderId), [teamLeaderId]);
  const stats = data?.stats;
  const projects = data?.projects ?? [];
  const name = (email || '').split('@')[0] || 'there';

  return (
    <div className={styles.page}>
      <div className={tl.headRow}>
        <div>
          <p className={tl.eyebrow}>Team Leader workspace</p>
          <h1 className={tl.welcome}>
            Welcome back, <span className={tl.welcomeName}>{name}</span>
          </h1>
          <p className={tl.lead}>Monitor your projects and manage your production teams.</p>
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}

      <StatGrid columns={3}>
        <StatCard icon={IconProjects} label="Total projects" value={stats?.total} />
        <StatCard icon={IconInfo} label="Not started" value={stats?.notStarted} />
        <StatCard icon={IconPlay} label="Ongoing" value={stats?.ongoing} />
        <StatCard icon={IconCheckCircle} label="Completed" value={stats?.completed} />
        <StatCard icon={IconClose} label="Aborted" value={stats?.aborted} />
        <StatCard icon={IconUsers} label="Team members" value={stats?.teamMembers} />
      </StatGrid>

      <section className={styles.panel} aria-labelledby="tl-latest-title" style={{ marginTop: 24 }}>
        <div className={styles.panelHead}>
          <div>
            <p className={styles.panelEyebrow}>Production</p>
            <h2 id="tl-latest-title" className={styles.panelTitle}>
              My Projects
            </h2>
            <p className={styles.panelSub}>Your latest assigned projects.</p>
          </div>
          <Link to="/team-leader/projects" className={styles.inlineLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            View all <IconChevronRight width={16} height={16} />
          </Link>
        </div>
        {projects.length === 0 ? (
          <div style={{ padding: '8px 28px 28px' }}>
            <EmptyState framed={false} icon={IconProjects} title="No projects yet" text="Projects appear here when your organization makes you the Team Leader of one." />
          </div>
        ) : (
          <ul className={tl.cardGrid}>
            {projects.map((p) => {
              const state = lifecycleOf(p.lifecycle);
              return (
                <li key={p.id}>
                  <Link to={`/team-leader/projects/${p.id}`} className={tl.projectCard} aria-label={`${p.title}, ${state.label}`}>
                    <div className={tl.cardTop}>
                      <span className={tl.tile} aria-hidden="true">
                        <IconProjects width={20} height={20} />
                      </span>
                      <Pill tone={state.tone}>{state.label}</Pill>
                    </div>
                    <p className={tl.cardTitle}>{p.title}</p>
                    <p className={tl.cardDesc}>{p.description || 'No description.'}</p>
                    <ProjectDates project={p} />
                    <div className={tl.cardFoot}>
                      <div>
                        <p className={tl.label}>Client</p>
                        <p className={tl.value}>{p.clientName || '-'}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p className={tl.label}>Team</p>
                        <p className={tl.value}>{p.memberCount}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
