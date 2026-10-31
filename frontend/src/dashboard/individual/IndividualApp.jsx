import { useEffect } from 'react';
import './studio.css';
import { useAuth } from '../../auth/AuthContext.jsx';
import { homeFor } from '../../auth/homeFor.js';
import { useRouter } from '../../router/router.jsx';
import DashboardLayout from '../DashboardLayout.jsx';
import { ThemeProvider } from '../ThemeContext.jsx';
import { WorkspaceProvider } from '../WorkspaceContext.jsx';
import '../theme.css';
import { IconGear, IconLibrary, IconOverview, IconProjects, IconSparkles, IconUsers } from '../ui/DashIcons.jsx';
import { ToastProvider } from '../ui/Toast.jsx';
import ClientsPage from './ClientsPage.jsx';
import { setDemoOwner } from './individualApi.js';
import OverviewPage from './OverviewPage.jsx';
import ProjectFormPage from './ProjectFormPage.jsx';
import ProjectPage from './ProjectPage.jsx';
import OneClickPage from './OneClickPage.jsx';
import ProjectsPage from './ProjectsPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import StoryEditorPage from './StoryEditorPage.jsx';
import AnimationStudioPage from './AnimationStudioPage.jsx';
import CharacterStudioPage from './CharacterStudioPage.jsx';
import EnvironmentStudioPage from './EnvironmentStudioPage.jsx';
import SketchStudioPage from './SketchStudioPage.jsx';
import StoryboardPage from './StoryboardPage.jsx';
import StoryPage from './StoryPage.jsx';
import QuickCreatePage, { LibraryPage } from '../quickCreate/QuickCreatePage.jsx';

const NAV = [
  {
    section: 'Workspace',
    items: [
      // (tone: each item's own colour, from studio.css)
      { to: '/dashboard', label: 'Overview', icon: IconOverview, tone: 'var(--cm-violet-hi)' },
      { to: '/dashboard/projects', label: 'My Projects', icon: IconProjects, tone: 'var(--st-board)', match: (p) => p === '/dashboard/projects' || p.startsWith('/dashboard/projects/') },
      { to: '/dashboard/quick-create', label: 'Quick Create', icon: IconSparkles, tone: 'var(--st-sketch)', match: (p) => p === '/dashboard/quick-create' || p.startsWith('/dashboard/quick-create/') },
      { to: '/dashboard/library', label: 'Library', icon: IconLibrary, tone: 'var(--st-anim)' },
      { to: '/dashboard/clients', label: 'Clients', icon: IconUsers, tone: 'var(--st-loc)' },
    ],
  },
  {
    section: 'Account',
    items: [{ to: '/dashboard/settings', label: 'Settings', icon: IconGear, tone: 'var(--cm-ink-dim)' }],
  },
];
const ROLE = { roleTitle: 'Creator', roleLabel: 'Individual Creator', roleSentence: 'Individual Creator' };

// Which page an address is. "My Projects" stays highlighted in the menu on a project's own pages.
function pageFor(path) {
  if (path === '/dashboard') return { page: 'overview' };
  if (path === '/dashboard/projects') return { page: 'projects' };
  if (path === '/dashboard/projects/new') return { page: 'new' };
  if (path === '/dashboard/clients') return { page: 'clients' };
  if (path === '/dashboard/settings') return { page: 'settings' };
  if (path === '/dashboard/library') return { page: 'library' };
  const q = path.match(/^\/dashboard\/quick-create(?:\/(short-video|character|location|image|story|avatar-video|audio))?$/);
  if (q) return { page: 'quick', tool: q[1] || null };
  let m = path.match(/^\/dashboard\/projects\/(\d+)$/);
  if (m) return { page: 'project', id: Number(m[1]) };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/edit$/);
  if (m) return { page: 'edit', id: Number(m[1]) };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/story(?:\/(new|import|\d+))?$/);
  if (m) {
    const part = m[2];
    if (!part) return { page: 'story', id: Number(m[1]), view: 'home' };
    if (part === 'new' || part === 'import') return { page: 'story', id: Number(m[1]), view: part };
    return { page: 'story', id: Number(m[1]), view: 'chat', storyId: Number(part) };
  }
  m = path.match(/^\/dashboard\/projects\/(\d+)\/storyboard(?:\/(\d+))?$/);
  if (m) return { page: 'storyboard', id: Number(m[1]), storyId: m[2] ? Number(m[2]) : null };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/characters(?:\/(\d+)(?:\/([a-z0-9-]+))?)?$/);
  if (m) return { page: 'characters', id: Number(m[1]), storyId: m[2] ? Number(m[2]) : null, characterKey: m[3] || null };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/sketches(?:\/(\d+)(?:\/(\d+))?)?$/);
  if (m) return { page: 'sketches', id: Number(m[1]), storyId: m[2] ? Number(m[2]) : null, sceneNo: m[3] ? Number(m[3]) : null };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/environment(?:\/(\d+)(?:\/([a-z0-9-]+))?)?$/);
  if (m) return { page: 'environment', id: Number(m[1]), storyId: m[2] ? Number(m[2]) : null, locationKey: m[3] || null };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/animation(?:\/(\d+))?$/);
  if (m) return { page: 'animation', id: Number(m[1]), storyId: m[2] ? Number(m[2]) : null };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/generate$/);
  if (m) return { page: 'generate', id: Number(m[1]) };
  m = path.match(/^\/dashboard\/projects\/(\d+)\/stories\/(\d+)\/edit$/);
  if (m) return { page: 'storyEdit', id: Number(m[1]), storyId: Number(m[2]) };
  return null;
}

/**
 * The individual creator's dashboard (/dashboard/...): Overview, My Projects (with create, edit, one project's
 * page, its Story page and the Story Editor), Clients and Settings, in the same frame as the organization and Team Leader dashboards. Only individual
 * accounts may see it; anyone else is sent to their own home page (see auth/homeFor.js).
 * Its data comes from the backend when one is connected (individualApi.js picks the backend or the demo).
 */
export default function IndividualApp() {
  const { path, navigate } = useRouter();
  const { user, checking } = useAuth();
  const allowed = user?.accountType === 'individual';
  const route = pageFor(path);
  if (allowed) setDemoOwner(user.email);

  // the creator workspace's studio colours (studio.css), only while this dashboard is open
  useEffect(() => {
    document.documentElement.dataset.studio = 'creator';
    return () => {
      delete document.documentElement.dataset.studio;
    };
  }, []);

  useEffect(() => {
    if (checking) return;
    if (!user) navigate('/login', { replace: true });
    else if (!allowed) navigate(homeFor(user), { replace: true });
    else if (!route) navigate('/dashboard', { replace: true });
  }, [checking, user, allowed, route, navigate]);

  if (!allowed || !route) return null;

  let page;
  if (route.page === 'projects') page = <ProjectsPage />;
  else if (route.page === 'new') page = <ProjectFormPage />;
  else if (route.page === 'edit') page = <ProjectFormPage key={`edit-${route.id}`} projectId={route.id} />;
  else if (route.page === 'project') page = <ProjectPage key={route.id} projectId={route.id} />;
  // (one key for all of a project's story addresses, so a new chat keeps its state when it gets its own address)
  else if (route.page === 'story') page = <StoryPage key={`story-${route.id}`} projectId={route.id} view={route.view} storyId={route.storyId} />;
  else if (route.page === 'storyboard') page = <StoryboardPage key={`storyboard-${route.id}`} projectId={route.id} storyId={route.storyId} />;
  else if (route.page === 'characters') page = <CharacterStudioPage key={`characters-${route.id}`} projectId={route.id} storyId={route.storyId} characterKey={route.characterKey} />;
  else if (route.page === 'sketches') page = <SketchStudioPage key={`sketches-${route.id}`} projectId={route.id} storyId={route.storyId} sceneNo={route.sceneNo} />;
  else if (route.page === 'environment') page = <EnvironmentStudioPage key={`environment-${route.id}`} projectId={route.id} storyId={route.storyId} locationKey={route.locationKey} />;
  else if (route.page === 'animation') page = <AnimationStudioPage key={`animation-${route.id}`} projectId={route.id} storyId={route.storyId} />;
  else if (route.page === 'generate') page = <OneClickPage key={`generate-${route.id}`} projectId={route.id} />;
  else if (route.page === 'storyEdit') page = <StoryEditorPage key={`story-${route.id}-${route.storyId}`} projectId={route.id} storyId={route.storyId} />;
  else if (route.page === 'clients') page = <ClientsPage />;
  else if (route.page === 'settings') page = <SettingsPage />;
  else if (route.page === 'quick') page = <QuickCreatePage key={route.tool || 'hub'} tool={route.tool} />;
  else if (route.page === 'library') page = <LibraryPage />;
  else page = <OverviewPage />;

  return (
    <ThemeProvider>
      <WorkspaceProvider role={ROLE} personName={user.displayName || user.email.split('@')[0]}>
        <ToastProvider>
          <DashboardLayout nav={NAV} home="/dashboard" settingsTo="/dashboard/settings">
            {page}
          </DashboardLayout>
        </ToastProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}