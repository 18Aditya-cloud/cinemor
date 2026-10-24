import { useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { homeFor } from '../../auth/homeFor.js';
import { useRouter } from '../../router/router.jsx';
import { isBackendConnected } from '../../services/api.js';
import { findDemoEmployee } from '../api/organizationApi.js';
import DashboardLayout from '../DashboardLayout.jsx';
import { ThemeProvider } from '../ThemeContext.jsx';
import { WorkspaceProvider } from '../WorkspaceContext.jsx';
import '../theme.css';
import { IconCheckCircle, IconGear, IconOverview, IconProjects, IconUsers } from '../ui/DashIcons.jsx';
import { AccountSettingsPage } from '../pages/SettingsPage.jsx';
import { ToastProvider } from '../ui/Toast.jsx';
import TeamLeaderDashboardPage from './TeamLeaderDashboardPage.jsx';
import TeamLeaderProjectPage from './TeamLeaderProjectPage.jsx';
import TeamLeaderProjectsPage from './TeamLeaderProjectsPage.jsx';
import TeamLeaderTeamPage from './TeamLeaderTeamPage.jsx';

const NAV = [
  {
    section: 'Workspace',
    items: [
      { to: '/team-leader', label: 'Dashboard', icon: IconOverview },
      { to: '/team-leader/projects', label: 'My Projects', icon: IconProjects },
      { to: '/team-leader/team', label: 'Team', icon: IconUsers },
    ],
  },
  // the employee dashboard: stages, reviews, reopening an approved stage (it needs the backend)
  ...(isBackendConnected ? [{ section: 'Production', items: [{ to: '/employee', label: 'My Work', icon: IconCheckCircle }] }] : []),
];
const ROLE = { roleTitle: 'Team Leader', roleLabel: 'Project lead', roleSentence: 'Team Leader' };

/**
 * The Team Leader dashboard: /team-leader (Dashboard), /team-leader/projects (My Projects),
 * /team-leader/projects/:id (one project) and /team-leader/team (Team). It uses the same frame as the organization
 * dashboard, with its own menu. Only employees whom their organization made a Team Leader may see it; anyone else is
 * sent to their own home page (see auth/homeFor.js).
 */
export default function TeamLeaderApp() {
  const { path, navigate } = useRouter();
  const { user, checking } = useAuth();
  // Only while the organization has this person marked as Team Leader right now. In demo mode that is read fresh from
  // the demo database (the organization may have switched it off since they logged in); with a backend, from the
  // user the server returned.
  const current = user && !isBackendConnected ? { ...user, ...(findDemoEmployee(user.email) || { teamLeader: false }) } : user;
  const allowed = current?.accountType === 'employee' && Boolean(current.teamLeader);
  const match = path.match(/^\/team-leader\/projects\/(\d+)$/);
  const known = ['/team-leader', '/team-leader/projects', '/team-leader/team', '/team-leader/settings'].includes(path) || Boolean(match);

  useEffect(() => {
    if (checking) return;
    if (!user) navigate('/login', { replace: true });
    else if (!allowed) navigate(homeFor(current), { replace: true });
    else if (!known) navigate('/team-leader', { replace: true });
  }, [checking, user, current, allowed, known, navigate]);

  if (!allowed || !known) return null;

  return (
    <ThemeProvider>
      <WorkspaceProvider role={ROLE} personName={user.displayName || user.email}>
        <ToastProvider>
          <DashboardLayout nav={NAV} home="/team-leader" settingsTo="/team-leader/settings">
            {match ? (
              <TeamLeaderProjectPage teamLeaderId={current.employeeId} projectId={Number(match[1])} />
            ) : path === '/team-leader/projects' ? (
              <TeamLeaderProjectsPage teamLeaderId={current.employeeId} />
            ) : path === '/team-leader/settings' ? (
              <AccountSettingsPage />
            ) : path === '/team-leader/team' ? (
              <TeamLeaderTeamPage teamLeaderId={current.employeeId} />
            ) : (
              <TeamLeaderDashboardPage teamLeaderId={current.employeeId} email={user.email} />
            )}
          </DashboardLayout>
        </ToastProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
