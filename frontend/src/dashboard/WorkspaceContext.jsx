import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getWorkspace } from './api/organizationApi.js';

/**
 * The names shown around the dashboard.
 *
 * Right now everyone sees "Your Organization". Later, when the backend has a profile step and the person
 * adds their name, GET /api/organization returns { profile: { name: 'Aarush' } } and the whole dashboard
 * (the welcome heading, the top bar, the avatar initials) changes to "Welcome back, Aarush" from the next
 * visit, with no change to any page. Only this file decides which name is shown.
 *
 * `refresh()` re-reads GET /api/organization; call it after Settings saves a new organization name so the
 * heading and the top bar pick it up immediately, without a full page reload.
 */
const FALLBACK_NAME = 'Your Organization';

const WorkspaceContext = createContext({
  organizationName: FALLBACK_NAME,
  displayName: FALLBACK_NAME,
  initials: 'YO',
  roleTitle: 'Administrator',
  roleLabel: 'Organization Admin',
  roleSentence: 'Organization Administrator',
  refresh: () => {},
});

const initialsOf = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || 'YO';

// Who is looking at the dashboard, for the top bar's account button. The organization's own admin by default;
// the Team Leader dashboard passes its own words and name.
const ADMIN_ROLE = { roleTitle: 'Administrator', roleLabel: 'Organization Admin', roleSentence: 'Organization Administrator' };

export function WorkspaceProvider({ children, role = ADMIN_ROLE, personName = '' }) {
  const [info, setInfo] = useState({ organizationName: FALLBACK_NAME, profileName: '' });

  const load = useCallback(() => {
    let cancelled = false;
    getWorkspace()
      .then((workspace) => {
        if (cancelled) return;
        setInfo({
          organizationName: workspace?.organization?.name || FALLBACK_NAME,
          profileName: workspace?.profile?.name || '',
        });
      })
      .catch(() => {
        /* keep the fallback name if the request fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  const value = useMemo(() => {
    const displayName = personName || info.profileName || info.organizationName;
    return {
      organizationName: info.organizationName,
      displayName,
      initials: initialsOf(displayName),
      ...role,
      refresh: load,
    };
  }, [info, load, role, personName]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => useContext(WorkspaceContext);
