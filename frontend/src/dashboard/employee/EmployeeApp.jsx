import { useEffect, useLayoutEffect } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { homeFor } from '../../auth/homeFor.js';
import { RouteAlias, useRouter } from '../../router/router.jsx';
import { isBackendConnected } from '../../services/api.js';
import DashboardLayout from '../DashboardLayout.jsx';
import { ThemeProvider } from '../ThemeContext.jsx';
import { WorkspaceProvider } from '../WorkspaceContext.jsx';
import '../theme.css';
import { setProjectApiBase } from '../individual/individualBackend.js';
import AnimationStudioPage from '../individual/AnimationStudioPage.jsx';
import CharacterStudioPage from '../individual/CharacterStudioPage.jsx';
import EnvironmentStudioPage from '../individual/EnvironmentStudioPage.jsx';
import SketchStudioPage from '../individual/SketchStudioPage.jsx';
import StoryboardPage from '../individual/StoryboardPage.jsx';
import StoryEditorPage from '../individual/StoryEditorPage.jsx';
import StoryPage from '../individual/StoryPage.jsx';
import { IconCheckCircle, IconGear, IconOverview, IconProjects, IconUsers, IconWrench } from '../ui/DashIcons.jsx';
import { AccountSettingsPage } from '../pages/SettingsPage.jsx';
import { ToastProvider } from '../ui/Toast.jsx';
import { workBase } from './employeeApi.js';
import EmployeeOverviewPage from './EmployeeOverviewPage.jsx';
import EmployeeProjectPage from './EmployeeProjectPage.jsx';
import EmployeeProjectsPage from './EmployeeProjectsPage.jsx';
import EmployeeReviewsPage from './EmployeeReviewsPage.jsx';
import EmployeeToolsPage from './EmployeeToolsPage.jsx';
import StageBar from './StageBar.jsx';

const NAV = [
  {
    section: 'Workspace',
    items: [
      { to: '/employee', label: 'Overview', icon: IconOverview },
      { to: '/employee/projects', label: 'My Projects', icon: IconProjects, match: (p) => p === '/employee/projects' || p.startsWith('/employee/projects/') },
      { to: '/employee/reviews', label: 'Reviews', icon: IconCheckCircle },
      { to: '/employee/tools', label: 'Tools', icon: IconWrench },
    ],
  },
  { section: 'Account', items: [{ to: '/employee/settings', label: 'Settings', icon: IconGear }] },
];
const ROLE = { roleTitle: 'Employee', roleLabel: 'Employee', roleSentence: 'Employee' };
const TL_ROLE = { roleTitle: 'Team Leader', roleLabel: 'Team Leader', roleSentence: 'Team Leader' };

// Which page an address is. A project's module pages are the creator's own pages (Story, Storyboard...), reused.
function pageFor(path) {
  if (path === '/employee') return { page: 'overview' };
  if (path === '/employee/projects') return { page: 'projects' };
  if (path === '/employee/reviews') return { page: 'reviews' };
  if (path === '/employee/tools') return { page: 'tools' };
  if (path === '/employee/settings') return { page: 'settings' };
  const m = path.match(/^\/employee\/projects\/(\d+)(?:\/(.*))?$/);
  if (!m) return null;
  const id = Number(m[1]);
  const rest = m[2] || '';
  if (!rest) return { page: 'project', id };
  let r = rest.match(/^story(?:\/(new|import|\d+))?$/);
  if (r) {
    if (!r[1]) return { page: 'story', id, stage: 'story', view: 'home' };
    if (r[1] === 'new' || r[1] === 'import') return { page: 'story', id, stage: 'story', view: r[1] };
    return { page: 'story', id, stage: 'story', view: 'chat', storyId: Number(r[1]) };
  }
  r = rest.match(/^stories\/(\d+)\/edit$/);
  if (r) return { page: 'storyEdit', id, stage: 'story', storyId: Number(r[1]) };
  r = rest.match(/^storyboard(?:\/(\d+))?$/);
  if (r) return { page: 'storyboard', id, stage: 'storyboard', storyId: r[1] ? Number(r[1]) : null };
  r = rest.match(/^characters(?:\/(\d+)(?:\/([a-z0-9-]+))?)?$/);
  if (r) return { page: 'characters', id, stage: 'characters', storyId: r[1] ? Number(r[1]) : null, key: r[2] || null };
  r = rest.match(/^environment(?:\/(\d+)(?:\/([a-z0-9-]+))?)?$/);
  if (r) return { page: 'environment', id, stage: 'locations', storyId: r[1] ? Number(r[1]) : null, key: r[2] || null };
  r = rest.match(/^sketches(?:\/(\d+)(?:\/(\d+))?)?$/);
  if (r) return { page: 'sketches', id, stage: 'sketches', storyId: r[1] ? Number(r[1]) : null, sceneNo: r[2] ? Number(r[2]) : null };
  r = rest.match(/^animation(?:\/(\d+))?$/);
  if (r) return { page: 'animation', id, stage: 'animation', storyId: r[1] ? Number(r[1]) : null };
  // anything else of a project (edit, one-click...) is not part of the employee workflow
  return { page: 'project', id, redirect: true };
}

/**
 * The employee dashboard (/employee/...): Overview, My Projects (each project's six-stage workflow), Reviews and
 * Tools. A stage's work happens on the creator's module pages, shown here with a stage bar on top; their calls go to
 * /api/employee/projects/{id}/work, where the backend checks the role and the stage first.
 * Employees (Team Leaders too, from their menu) may see it, with a backend connected.
 */
export default function EmployeeApp() {
  const { path, navigate } = useRouter();
  const { user, checking } = useAuth();
  const allowed = user?.accountType === 'employee' && isBackendConnected;
  const route = pageFor(path);
  // a Team Leader (who came here from "My Work") always has the way back to their own dashboard
  const nav = user?.teamLeader ? [...NAV, { section: 'Team Leader', items: [{ to: '/team-leader', label: 'TL Dashboard', icon: IconUsers }] }] : NAV;

  // the module pages' calls go to this project's work (and back to the creator's own projects when leaving)
  useLayoutEffect(() => {
    setProjectApiBase(workBase);
    return () => setProjectApiBase(null);
  }, []);

  useEffect(() => {
    if (checking) return;
    if (!user) navigate('/login', { replace: true });
    else if (!allowed) navigate(homeFor(user), { replace: true });
    else if (!route) navigate('/employee', { replace: true });
    else if (route.redirect) navigate(`/employee/projects/${route.id}`, { replace: true });
  }, [checking, user, allowed, route, navigate]);

  if (!allowed || !route || route.redirect) return null;
  setProjectApiBase(workBase); // (before the first render of a module page too)

  let page;
  if (route.page === 'projects') page = <EmployeeProjectsPage />;
  else if (route.page === 'project') page = <EmployeeProjectPage key={route.id} projectId={route.id} />;
  else if (route.page === 'reviews') page = <EmployeeReviewsPage />;
  else if (route.page === 'tools') page = <EmployeeToolsPage />;
  else if (route.page === 'settings') page = <AccountSettingsPage />;
  else if (route.page === 'overview') page = <EmployeeOverviewPage email={user.email} />;
  else {
    let module;
    // (only the project's Team Leader deletes a story, from the project page)
    if (route.page === 'story') module = <StoryPage key={`story-${route.id}`} projectId={route.id} view={route.view} storyId={route.storyId} canDelete={false} />;
    else if (route.page === 'storyEdit') module = <StoryEditorPage key={`edit-${route.id}-${route.storyId}`} projectId={route.id} storyId={route.storyId} />;
    else if (route.page === 'storyboard') module = <StoryboardPage key={`storyboard-${route.id}`} projectId={route.id} storyId={route.storyId} />;
    else if (route.page === 'characters') module = <CharacterStudioPage key={`characters-${route.id}`} projectId={route.id} storyId={route.storyId} characterKey={route.key} />;
    else if (route.page === 'environment') module = <EnvironmentStudioPage key={`environment-${route.id}`} projectId={route.id} storyId={route.storyId} locationKey={route.key} />;
    else if (route.page === 'sketches') module = <SketchStudioPage key={`sketches-${route.id}`} projectId={route.id} storyId={route.storyId} sceneNo={route.sceneNo} />;
    else module = <AnimationStudioPage key={`animation-${route.id}`} projectId={route.id} storyId={route.storyId} />;
    page = (
      <>
        <StageBar key={`bar-${route.id}-${route.stage}-${route.storyId || 'none'}`} projectId={route.id} stageKey={route.stage} storyId={route.storyId} />
        <RouteAlias from="/dashboard/projects" to="/employee/projects">
          {module}
        </RouteAlias>
      </>
    );
  }

  return (
    <ThemeProvider>
      <WorkspaceProvider role={user.teamLeader ? TL_ROLE : ROLE} personName={user.displayName || user.email.split('@')[0]}>
        <ToastProvider>
          <DashboardLayout nav={nav} home="/employee" settingsTo="/employee/settings">
            {page}
          </DashboardLayout>
        </ToastProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}
