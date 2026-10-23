import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import { useWorkspace } from '../WorkspaceContext.jsx';
import { IconBuilding, IconProjects, IconUsers } from '../ui/DashIcons.jsx';
import Logo3D from '../ui/Logo3D.jsx';
import styles from './OverviewPage.module.css';

const CARDS = [
  { to: '/organization/projects', icon: IconProjects, title: 'Manage Projects', text: 'Create, track and oversee production projects' },
  { to: '/organization/employees', icon: IconUsers, title: 'Manage Team', text: 'Employees, team leaders and reviewers' },
  { to: '/organization/clients', icon: IconBuilding, title: 'Manage Clients', text: 'Organize and manage client relationships' },
];

/**
 * The earlier ("classic") dashboard home, kept so the redesign can be undone: see DASHBOARD.overview in data/content.js.
 * The name in the heading comes from WorkspaceContext: "Your Organization" for now,
 * the person's own name once their profile has one.
 */
export default function OverviewClassic() {
  const { displayName, roleSentence } = useWorkspace();
  useDocumentTitle('Overview');

  return (
    <div className={styles.page}>
      <Logo3D className={styles.model} />

      <p className={styles.eyebrow}>Organization Workspace</p>
      <h1 className={styles.title}>
        Welcome back, <span className={styles.name}>{displayName}</span>
      </h1>
      <p className={styles.sub}>You are signed in as {roleSentence}.</p>

      <div className={styles.cards}>
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.to} to={card.to} className={styles.card}>
              <span className={styles.tile} aria-hidden="true">
                <Icon width={26} height={26} />
              </span>
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <p className={styles.cardText}>{card.text}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
