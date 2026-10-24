import { useEffect, useRef, useState } from 'react';
import logoUrl from '../assets/images/cinemor-logo.png';
import cx from '../utils/cx.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Link, useRouter } from '../router/router.jsx';
import { useTheme } from './ThemeContext.jsx';
import { useWorkspace } from './WorkspaceContext.jsx';
import {
  IconBriefcase,
  IconBuilding,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconGear,
  IconLogOut,
  IconMoon,
  IconSun,
  IconOverview,
  IconProjects,
  IconShield,
  IconUserCog,
  IconUserPlus,
  IconUsers,
  IconWrench,
} from './ui/DashIcons.jsx';
import styles from './Sidebar.module.css';

// The menu. To add a page: add a line here, a route in DashboardApp.jsx, and a page file.
export const NAV = [
  {
    section: 'Workspace',
    items: [
      { to: '/organization', label: 'Overview', icon: IconOverview },
      { to: '/organization/projects', label: 'All Projects', icon: IconProjects },
      { to: '/organization/employees', label: 'Employees', icon: IconUsers },
      { to: '/organization/team-leaders', label: 'Team Leaders', icon: IconShield },
      { to: '/organization/reviewers', label: 'Reviewers', icon: IconUserCog },
      { to: '/organization/job-roles', label: 'Job Roles', icon: IconBriefcase },
      { to: '/organization/clients', label: 'Clients', icon: IconBuilding },
      { to: '/organization/invitations', label: 'Invitations', icon: IconUserPlus },
      { to: '/organization/tools', label: 'Tools', icon: IconWrench },
    ],
  },
  { section: 'Account', items: [{ to: '/organization/settings', label: 'Settings', icon: IconGear }] },
];

/**
 * The dashboard's left rail. By default it is a slim, icon-only rail (a fixed accessible name is set on every
 * item with aria-label, and a small tooltip shows the word on hover or keyboard focus, so nothing is lost by
 * hiding the text); "Expand sidebar" turns it into the earlier, wider menu with the labels shown. On phones it is
 * always the wide, labelled version, opened as a drawer (see the media query at the bottom of the CSS).
 *
 * At the bottom: the Light / Dark switch and the account (name, role, Settings, Log out). There is no top bar.
 */
export default function Sidebar({ collapsed, onToggle, drawerOpen, nav = NAV, home = '/organization', settingsTo = '/organization/settings' }) {
  const { path } = useRouter();
  const asideRef = useRef(null);
  // The one tooltip shown while the rail is icon-only, for whichever item has the mouse or the keyboard focus.
  // It is a sibling of the scrolling <nav>, not a child of it, so nav's own scrollbar never clips it (a scrolling
  // box always clips both directions once either one scrolls, even when the other is set to "visible").
  const [tip, setTip] = useState(null); // { label, top } | null
  const showTip = (label) => (event) => {
    if (!collapsed) return;
    const target = event.currentTarget.getBoundingClientRect();
    const host = asideRef.current?.getBoundingClientRect();
    if (!host) return;
    setTip({ label, top: target.top - host.top + target.height / 2 });
  };
  const hideTip = () => setTip(null);

  return (
    <aside ref={asideRef} className={cx(styles.sidebar, collapsed && styles.collapsed, drawerOpen && styles.drawerOpen)} aria-label="Organization menu">
      <div className={styles.brand}>
        <Link to={home} className={styles.logo} aria-label="Cinemor AI, dashboard home">
          <img className={styles.logoImg} src={logoUrl} width={30} height={30} alt="" />
          <span className={styles.wordmark}>
            cinemor <em>ai</em>
          </span>
        </Link>
      </div>

      <nav className={styles.nav} aria-label="Dashboard pages">
        {nav.map((group) => (
          <div key={group.section} className={styles.group}>
            <p className={styles.section}>{group.section}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              // an item may also stay highlighted on its sub-pages (`match`), e.g. My Projects on a project's own page
              const current = item.match ? item.match(path) : path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cx(styles.link, current && styles.active)}
                  aria-current={current ? 'page' : undefined}
                  aria-label={item.label}
                  onMouseEnter={showTip(item.label)}
                  onMouseLeave={hideTip}
                  onFocus={showTip(item.label)}
                  onBlur={hideTip}
                >
                  <span className={styles.linkIcon} aria-hidden="true">
                    <Icon width={19} height={19} />
                  </span>
                  <span className={styles.linkText}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.foot}>
        <ThemeToggle tip={showTip} hideTip={hideTip} />
        <UserMenu settingsTo={settingsTo} tip={showTip} hideTip={hideTip} />
      </div>

      <button
        type="button"
        className={styles.collapse}
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={collapsed}
        onMouseEnter={showTip('Expand sidebar')}
        onMouseLeave={hideTip}
        onFocus={showTip('Expand sidebar')}
        onBlur={hideTip}
      >
        {collapsed ? <IconChevronRight width={18} height={18} /> : <IconChevronLeft width={18} height={18} />}
        <span className={styles.collapseText}>Collapse sidebar</span>
      </button>

      {/* one shared tooltip, positioned in JS: it is a sibling of <nav>, so its scrollbar can never clip it */}
      {collapsed && tip && (
        <span className={styles.railTip} style={{ top: tip.top }} aria-hidden="true">
          {tip.label}
        </span>
      )}
    </aside>
  );
}

// Closes a dropdown when you click outside it or press Esc.
function useDismiss(open, close, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => !ref.current?.contains(event.target) && close();
    const onKey = (event) => event.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

// Shows which theme you are in ("Light" or "Dark"); one click switches to the other one.
function ThemeToggle({ tip, hideTip }) {
  const { theme, toggle } = useTheme();
  const light = theme === 'light';
  const label = light ? 'Switch to dark theme' : 'Switch to light theme';
  return (
    <button type="button" className={styles.footButton} onClick={toggle} aria-label={label} onMouseEnter={tip(light ? 'Light theme' : 'Dark theme')} onMouseLeave={hideTip} onFocus={tip(light ? 'Light theme' : 'Dark theme')} onBlur={hideTip}>
      <span key={theme} className={styles.themeIcon} aria-hidden="true">
        {light ? <IconSun width={19} height={19} /> : <IconMoon width={19} height={19} />}
      </span>
      <span className={styles.footText}>{light ? 'Light theme' : 'Dark theme'}</span>
    </button>
  );
}

// The account: the avatar (and, on the wide rail, the name and role); its menu has Settings and Log out.
function UserMenu({ settingsTo, tip, hideTip }) {
  const { displayName, initials, roleTitle, roleLabel } = useWorkspace();
  const { signOut } = useAuth();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, () => setOpen(false), ref);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        type="button"
        className={styles.user}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          hideTip();
          setOpen((v) => !v);
        }}
        aria-label={`Account menu for ${displayName}`}
        onMouseEnter={open ? undefined : tip(displayName)}
        onMouseLeave={hideTip}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.userText}>
          <span className={styles.userName}>{roleTitle}</span>
          <span className={styles.userRole}>{roleLabel}</span>
        </span>
        <IconChevronDown width={16} height={16} className={cx(styles.chevron, open && styles.flip)} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHead}>
            <span className={styles.menuName}>{displayName}</span>
            <span className={styles.menuRole}>
              {roleTitle} · {roleLabel}
            </span>
          </div>
          {settingsTo && (
            <Link to={settingsTo} className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
              <IconGear width={18} height={18} />
              Settings
            </Link>
          )}
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/');
            }}
          >
            <IconLogOut width={18} height={18} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
