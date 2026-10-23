import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';

/**
 * Light or dark for the dashboard.
 *
 * The choice is remembered in the browser (localStorage key "cm-theme"); dark is the default. The theme is applied by
 * putting data-theme="light" on the <html> element while the dashboard is open, which switches the colours defined in
 * theme.css. It is removed when you leave the dashboard, so the landing page and the log in / sign up pages always stay dark.
 */
const KEY = 'cm-theme';
const read = () => {
  try {
    return window.localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

const ThemeContext = createContext({ theme: 'dark', toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(read);
  const reduced = usePrefersReducedMotion();
  const fadeTimer = useRef(0);

  // before the browser paints, so there is never a flash of the wrong theme
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useLayoutEffect(
    () => () => {
      clearTimeout(fadeTimer.current);
      document.documentElement.classList.remove('cm-theme-fade');
      delete document.documentElement.dataset.theme;
    },
    [],
  );

  const toggle = useCallback(() => {
    if (!reduced) {
      // let the colours fade for a moment instead of jumping
      const root = document.documentElement;
      root.classList.add('cm-theme-fade');
      clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => root.classList.remove('cm-theme-fade'), 450);
    }
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        /* the choice lasts until the page is closed */
      }
      return next;
    });
  }, [reduced]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
