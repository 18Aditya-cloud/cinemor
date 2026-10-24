import { useRef } from 'react';
import logoUrl from './assets/images/cinemor-logo.png';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import useSmoothScroll from './hooks/useSmoothScroll.js';
import Navbar from './components/Navbar.jsx';
import DashboardApp from './dashboard/DashboardApp.jsx';
import TeamLeaderApp from './dashboard/teamLeader/TeamLeaderApp.jsx';
import EmployeeApp from './dashboard/employee/EmployeeApp.jsx';
import ClientApp from './dashboard/client/ClientApp.jsx';
import IndividualApp from './dashboard/individual/IndividualApp.jsx';
import AcceptInvitationPage from './pages/AcceptInvitationPage.jsx';
import ClientInvitationPage from './pages/ClientInvitationPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import ChooseAccountPage from './pages/ChooseAccountPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';
import StudioPage from './pages/StudioPage.jsx';
import ParticleField from './particles/ParticleField.jsx';
import { homeFor } from './auth/homeFor.js';
import { isAuthPath, isClientPath, isDashboardPath, isEmployeePath, isHomePath, isIndividualPath, isTeamLeaderPath, RouterProvider, useRouter } from './router/router.jsx';
import HeroBackground from './sections/HeroBackground.jsx';
import AuthBackdrop from './sections/AuthBackdrop.jsx';
import styles from './App.module.css';

/**
 * Pages:
 *   /        the landing page (HomePage)
 *   /login   Log in            (AuthPage)
 *   /signup  Sign up           (AuthPage)
 *   /choose-account  Individual or Organization, asked once to a new person who used Google (ChooseAccountPage)
 *   /auth/callback   Where Supabase sends the browser back after Google sign-in (AuthCallbackPage)
 *   /forgot-password Asks for the email and sends a reset link (ForgotPasswordPage)
 *   /reset-password  Where the emailed link leads: new password + confirm (ResetPasswordPage), needs ?token=...
 *   /verify-email    Where the sign-up confirmation link leads: confirms the email (VerifyEmailPage), needs ?token=...
 *   /accept-invitation  Where an employee's invitation link leads: choose a password and join (AcceptInvitationPage), needs ?token=...
 *   /client-invitation  Where a client's invitation link leads: choose a password (ClientInvitationPage), needs ?token=...
 *   /client/...        the client portal (ClientApp)
 *   /app     the studio        (StudioPage: write a story with AI)
 *   /organization/...  the organization dashboard (DashboardApp)
 *   /team-leader/...   the Team Leader dashboard (TeamLeaderApp)
 *   /dashboard/...     the individual creator's dashboard (IndividualApp)
 *
 * The eclipse video and the particle canvas are layers behind most pages; Log in / Sign up use their own
 * backdrop instead (AuthBackdrop) and have no navbar (see Navbar.jsx and isAuthPath below), since the logo
 * and the Log in/Sign up switch both live on the card itself there.
 *
 * (There used to be a one-time splash screen here — two hands reaching for a spinning logo — rendered above
 * everything else on first load. It is not used any more; the component's files are still in the project,
 * unused, in `src/components/SplashScreen.jsx` and its neighbours, in case it comes back.)
 */
export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </RouterProvider>
  );
}

function Shell() {
  const stageRef = useRef(null);
  const { path, navigate } = useRouter();
  const { user } = useAuth();
  const home = isHomePath(path);
  const dashboard = isDashboardPath(path);
  const auth = isAuthPath(path);
  // Inertial wheel scrolling suits the marketing pages, not a working dashboard with tables and forms.
  useSmoothScroll({ enabled: !dashboard });

  // "Create your story" and the cards' "Try now": new visitors go to Sign up, signed-in users to their home.
  const handleCreate = () => navigate(user ? homeFor(user) : '/signup');

  // The dashboard has its own frame (sidebar and top bar), so none of the marketing layers are drawn.
  if (isIndividualPath(path)) {
    return (
      <div className="cm-scope cinemor-app">
        <IndividualApp />
      </div>
    );
  }

  if (isEmployeePath(path)) {
    return (
      <div className="cm-scope cinemor-app">
        <EmployeeApp />
      </div>
    );
  }

  if (isClientPath(path)) {
    return (
      <div className="cm-scope cinemor-app">
        <ClientApp />
      </div>
    );
  }

  if (isTeamLeaderPath(path)) {
    return (
      <div className="cm-scope cinemor-app">
        <TeamLeaderApp />
      </div>
    );
  }

  if (dashboard) {
    return (
      <div className="cm-scope cinemor-app">
        <DashboardApp />
      </div>
    );
  }

  let page;
  if (path === '/login') page = <AuthPage mode="login" />;
  else if (path === '/signup') page = <AuthPage mode="signup" />;
  else if (path === '/choose-account') page = <ChooseAccountPage />;
  else if (path === '/auth/callback') page = <AuthCallbackPage />;
  else if (path === '/forgot-password') page = <ForgotPasswordPage />;
  else if (path === '/reset-password') page = <ResetPasswordPage />;
  else if (path === '/verify-email') page = <VerifyEmailPage />;
  else if (path === '/accept-invitation') page = <AcceptInvitationPage />;
  else if (path === '/client-invitation') page = <ClientInvitationPage />;
  else if (path === '/app') page = <StudioPage />;
  else page = <HomePage stageRef={stageRef} onCreate={handleCreate} />;

  return (
    <div className="cm-scope cinemor-app">
      {/* Comes BEFORE the particle canvas, so the particles float over it. */}
      {auth ? <AuthBackdrop /> : <HeroBackground dim={!home} />}
      <ParticleField logoSrc={logoUrl} stageRef={stageRef} stageActive={home} />
      {!auth && <Navbar />}
      <main className={styles.main}>{page}</main>
    </div>
  );
}
