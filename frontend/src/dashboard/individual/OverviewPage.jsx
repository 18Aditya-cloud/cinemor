import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import { IconBriefcase, IconPlus, IconProjects, IconUsers } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import StatCard, { StatGrid } from '../ui/StatCard.jsx';
import { useWorkspace } from '../WorkspaceContext.jsx';
import { listClients, listProjects } from './individualApi.js';
import { Header, IconArrowRight, projectFor, StatusPill, Tile } from './parts.jsx';
import s from './Individual.module.css';

const QUICK = [
  { to: '/dashboard/projects/new', icon: IconPlus, title: 'Create a Project', text: 'Start a new project for yourself or for one of your clients.', link: 'Create Project' },
  { to: '/dashboard/projects', icon: IconProjects, title: 'My Projects', text: 'View and manage all your creative projects.', link: 'View Projects' },
  { to: '/dashboard/clients', icon: IconUsers, title: 'Manage Clients', text: 'Add and manage the clients you make projects for.', link: 'View Clients' },
];

/** The creator's home: three counts, quick actions, and the latest projects. */
export default function OverviewPage() {
  useDocumentTitle('Overview');
  const { navigate } = useRouter();
  const { displayName } = useWorkspace();
  const { data, error, reload } = useResource(() => Promise.all([listProjects(), listClients()]), []);
  const [projects, clients] = data ?? [null, null];
  const recent = (projects ?? []).slice(0, 4);

  return (
    <div className={s.page}>
      <Header
        title={`Welcome, ${displayName}`}
        subtitle="Manage your creative projects, clients, and AI-powered production workflow from one place."
        actions={
          <Button icon={IconPlus} onClick={() => navigate('/dashboard/projects/new')}>
            Create Project
          </Button>
        }
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      <StatGrid columns={3}>
        <StatCard icon={IconProjects} label="Total Projects" value={projects?.length} />
        <StatCard icon={IconBriefcase} label="Active Projects" value={projects?.filter((p) => p.status === 'active').length} />
        <StatCard icon={IconUsers} label="Clients" value={clients?.length} />
      </StatGrid>

      <div className={s.sectionHead}>
        <div>
          <h2 className={s.sectionTitle}>Quick Actions</h2>
          <p className={s.sectionSub}>Start working on your next creative project.</p>
        </div>
      </div>
      <div className={s.actionsGrid}>
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className={cx(s.card, s.action)}>
            <Tile icon={q.icon} />
            <span className={s.actionTitle}>{q.title}</span>
            <span className={s.actionText}>{q.text}</span>
            <span className={s.link}>
              {q.link} <IconArrowRight width={16} height={16} />
            </span>
          </Link>
        ))}
      </div>

      <div className={s.sectionHead}>
        <div>
          <h2 className={s.sectionTitle}>Recent Projects</h2>
          <p className={s.sectionSub}>Your latest creative projects.</p>
        </div>
        {recent.length > 0 && (
          <Link to="/dashboard/projects" className={s.link}>
            View all <IconArrowRight width={16} height={16} />
          </Link>
        )}
      </div>
      {projects && recent.length === 0 ? (
        <EmptyState
          icon={IconProjects}
          title="No projects yet"
          text="Create your first project to start building a story with Cinemor AI."
          action={
            <Button icon={IconPlus} onClick={() => navigate('/dashboard/projects/new')}>
              Create Project
            </Button>
          }
        />
      ) : (
        <ul className={s.rows} aria-label="Recent projects">
          {recent.map((p) => (
            <li key={p.id}>
              <Link to={`/dashboard/projects/${p.id}`} className={cx(s.card, s.row)}>
                <Tile icon={IconProjects} size="sm" />
                <span style={{ minWidth: 0 }}>
                  <span className={s.rowTitle}>{p.title}</span>
                  <span className={s.rowSub}>{p.description || projectFor(p)}</span>
                </span>
                <StatusPill status={p.status} />
                <IconArrowRight width={18} height={18} className={s.arrow} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
