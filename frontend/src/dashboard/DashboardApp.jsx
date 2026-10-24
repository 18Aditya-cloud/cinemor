import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/homeFor.js';
import { useRouter } from '../router/router.jsx';
import DashboardLayout from './DashboardLayout.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import { WorkspaceProvider } from './WorkspaceContext.jsx';
import './theme.css';
import { ToastProvider } from './ui/Toast.jsx';
import ActivityPage from './pages/ActivityPage.jsx';
import ClientsPage from './pages/ClientsPage.jsx';
import EmployeesPage from './pages/EmployeesPage.jsx';
import InvitationsPage from './pages/InvitationsPage.jsx';
import JobRolesPage from './pages/JobRolesPage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ReviewersPage from './pages/ReviewersPage.jsx';
import TeamLeadersPage from './pages/TeamLeadersPage.jsx';
import ToolsPage from './pages/ToolsPage.jsx';

// The address of each page. Keep this list in step with NAV in Sidebar.jsx.
const PAGES = {
  '/organization': OverviewPage,
  '/organization/projects': ProjectsPage,
  '/organization/employees': EmployeesPage,
  '/organization/team-leaders': TeamLeadersPage,
  '/organization/reviewers': ReviewersPage,
  '/organization/job-roles': JobRolesPage,
  '/organization/clients': ClientsPage,
  '/organization/invitations': InvitationsPage,
  '/organization/tools': ToolsPage,
  '/organization/activity': ActivityPage, // Overview -> Recent activity -> View all
  '/organization/settings': SettingsPage, // opened from the admin menu in the top bar (it is not in the sidebar)
};

/**
 * The organization dashboard (/organization/...). Only signed-in organization accounts may see it:
 * signed-out visitors go to Log in, and individual accounts go to their studio.
 */
export default function DashboardApp() {
  const { path, navigate } = useRouter();
  const { user, checking } = useAuth();
  // the old "Role Permissions" page now lives inside Job Roles
  const Page = PAGES[path === '/organization/permissions' ? '/organization/job-roles' : path];
  const allowed = user?.accountType === 'organization';

  useEffect(() => {
    if (checking) return;
    if (!user) navigate('/login', { replace: true });
    else if (!allowed) navigate(homeFor(user), { replace: true }); // individuals to the studio, Team Leaders to their own dashboard
    else if (path === '/organization/permissions') navigate('/organization/job-roles', { replace: true });
    else if (!Page) navigate('/organization', { replace: true }); // an address that is not a page
  }, [checking, user, allowed, Page, path, navigate]);

  if (!allowed || !Page) return null;

  return (
    <ThemeProvider>
      <WorkspaceProvider personName={user.displayName || ''}>
        <ToastProvider>
          <DashboardLayout>
            <Page />
          </DashboardLayout>
        </ToastProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
