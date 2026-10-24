import { useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { homeFor } from '../../auth/homeFor.js';
import { useRouter } from '../../router/router.jsx';
import { isBackendConnected } from '../../services/api.js';
import DashboardLayout from '../DashboardLayout.jsx';
import { ThemeProvider } from '../ThemeContext.jsx';
import { WorkspaceProvider } from '../WorkspaceContext.jsx';
import '../theme.css';
import { AccountSettingsPage } from '../pages/SettingsPage.jsx';
import { IconFilm, IconGear, IconMail, IconOverview, IconProjects } from '../ui/DashIcons.jsx';
import { ToastProvider } from '../ui/Toast.jsx';
import ClientDownloadsPage from './ClientDownloadsPage.jsx';
import ClientMessagesPage from './ClientMessagesPage.jsx';
import ClientOverviewPage from './ClientOverviewPage.jsx';
import ClientProjectPage from './ClientProjectPage.jsx';
import ClientProjectsPage from './ClientProjectsPage.jsx';

const NAV = [
  {
    section: 'Portal',
    items: [
      { to: '/client', label: 'Overview', icon: IconOverview },
      { to: '/client/projects', label: 'My Projects', icon: IconProjects, match: (p) => p === '/client/projects' || p.startsWith('/client/projects/') },
      { to: '/client/downloads', label: 'Downloads', icon: IconFilm },
      { to: '/client/messages', label: 'Messages', icon: IconMail },
    ],
  },
  { section: 'Account', items: [{ to: '/client/settings', label: 'Settings', icon: IconGear }] },
];
const ROLE = { roleTitle: 'Client', roleLabel: 'Client', roleSentence: 'Client' };

function pageFor(path) {
  if (path === '/client') return { page: 'overview' };
  if (path === '/client/projects') return { page: 'projects' };
  if (path === '/client/downloads') return { page: 'downloads' };
  if (path === '/client/messages') return { page: 'messages' };
  if (path === '/client/settings') return { page: 'settings' };
  const m = path.match(/^\/client\/projects\/(\d+)$/);
  return m ? { page: 'project', id: Number(m[1]) } : null;
}

/**
 * The client portal (/client/...): a studio's client follows their projects here. Overview, My Projects (each
 * project: the films, the approved story, storyboard, characters, places and sketches, and the conversation with the
 * Team Leader), Downloads, Messages and Settings. Only what the studio has approved is shown.
 * For client logins (they join from the invitation email), with a backend connected.
 */
export default function ClientApp() {
  const { path, navigate } = useRouter();
  const { user, checking } = useAuth();
  const allowed = user?.accountType === 'client' && isBackendConnected;
  const route = pageFor(path);

  useEffect(() => {
    if (checking) return;
    if (!user) navigate('/login', { replace: true });
    else if (!allowed) navigate(homeFor(user), { replace: true });
    else if (!route) navigate('/client', { replace: true });
  }, [checking, user, allowed, route, navigate]);

  if (!allowed || !route) return null;

  let page;
  if (route.page === 'projects') page = <ClientProjectsPage />;
  else if (route.page === 'project') page = <ClientProjectPage key={route.id} projectId={route.id} />;
  else if (route.page === 'downloads') page = <ClientDownloadsPage />;
  else if (route.page === 'messages') page = <ClientMessagesPage />;
  else if (route.page === 'settings') page = <AccountSettingsPage />;
  else page = <ClientOverviewPage />;

  return (
    <ThemeProvider>
      <WorkspaceProvider role={ROLE} personName={user.displayName || user.email.split('@')[0]}>
        <ToastProvider>
          <DashboardLayout nav={NAV} home="/client" settingsTo="/client/settings">
            {page}
          </DashboardLayout>
        </ToastProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
