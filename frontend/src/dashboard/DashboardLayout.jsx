import { useEffect, useRef, useState } from 'react';
import { useRouter } from '../router/router.jsx';
import cx from '../utils/cx.js';
import Sidebar from './Sidebar.jsx';
import logoUrl from '../assets/images/cinemor-logo.png';
import { IconMenu } from './ui/DashIcons.jsx';
import styles from './DashboardLayout.module.css';

const COLLAPSE_KEY = 'cm-sidebar-collapsed';
const readCollapsed = () => {
  try {
    const saved = window.localStorage.getItem(COLLAPSE_KEY);
    if (saved === '0') return false; // someone chose the wider, labelled rail before
    if (saved === '1') return true;
    return true; // nobody has chosen yet: start as the slim icon rail
  } catch {
    return true;
  }
};

/**
 * The frame around every dashboard page: the sidebar on the left (with the theme switch and the account at its
 * foot; there is no top bar) and the page itself.
 * The sidebar is a slim icon rail by default (a choice to show it with its labels instead is remembered), and on
 * phones it always shows its labels, sliding in from the left as a drawer.
 */
export default function DashboardLayout({ children, nav, home, settingsTo }) {
  const { path } = useRouter();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const mainRef = useRef(null);
  const shownPath = useRef(path); // the page we last moved focus for

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !value;
    });

  // A new page: close the phone menu, and move the keyboard focus to the page content.
  // (Compared with the last path, not a "first time" flag, so it also behaves in React's development
  // double-run and nothing grabs the focus when the dashboard first opens.)
  useEffect(() => {
    if (shownPath.current === path) return;
    shownPath.current = path;
    setDrawer(false);
    mainRef.current?.focus({ preventScroll: true });
  }, [path]);

  // Esc closes the phone menu
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (event) => event.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className={cx(styles.shell, collapsed && styles.collapsed)}>
      <a className={styles.skip} href="#dash-main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} drawerOpen={drawer} nav={nav} home={home} settingsTo={settingsTo} />
      {drawer && <button type="button" className={styles.scrim} aria-label="Close menu" onClick={() => setDrawer(false)} />}
      <div className={styles.column}>
        {/* phones only: the menu button (the sidebar is a drawer there) */}
        <div className={styles.phoneTop}>
          <button type="button" className={styles.menuButton} onClick={() => setDrawer(true)} aria-label="Open menu">
            <IconMenu width={20} height={20} />
          </button>
          <img className={styles.phoneLogo} src={logoUrl} width={26} height={26} alt="" />
        </div>
        <main id="dash-main" ref={mainRef} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
