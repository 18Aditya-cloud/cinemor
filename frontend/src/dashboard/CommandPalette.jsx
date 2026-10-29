import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import cx from '../utils/cx.js';
import { useRouter } from '../router/router.jsx';
import timeAgo from './timeAgo.js';
import { useTheme } from './ThemeContext.jsx';
import { IconMoon, IconSearch, IconSun } from './ui/DashIcons.jsx';
import styles from './CommandPalette.module.css';

/* ------------------------------------------------------------------ recently opened places (per dashboard) */
const KEY = (home) => `cm-recent:${home}`;
const MAX = 8;
const SUFFIX = / \| Cinemor AI.*$/;

export function readRecent(home) {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY(home)) || '[]');
    return Array.isArray(list) ? list.filter((x) => x && typeof x.to === 'string' && typeof x.title === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Remembers the pages opened inside this dashboard that are not in the menu (a project, a story, a studio), with the
 * tab title they had, so the sidebar can offer "Continue where you left" and the search can jump back to them.
 * Kept in this browser only.
 */
export function useRecentPlaces(home, skip) {
  const { path, search } = useRouter();
  const [recent, setRecent] = useState(() => readRecent(home));
  useEffect(() => {
    const to = `${path}${search || ''}`;
    if (skip(path)) return undefined;
    // wait for the page to set its own title
    const timer = setTimeout(() => {
      const title = document.title.replace(SUFFIX, '').trim();
      if (!title) return;
      const next = [{ to, title, at: Date.now() }, ...readRecent(home).filter((x) => x.to !== to)].slice(0, MAX);
      try {
        window.localStorage.setItem(KEY(home), JSON.stringify(next));
      } catch {
        /* the list lasts until the page is closed */
      }
      setRecent(next);
    }, 900);
    return () => clearTimeout(timer);
  }, [path, search, home, skip]);
  return recent;
}

/**
 * "Search or jump to…" (Ctrl K / ⌘ K): type to find a page of this dashboard, a place you opened recently, or switch
 * the theme. Arrow keys move, Enter opens, Esc closes.
 */
export default function CommandPalette({ open, onClose, nav, recent }) {
  const { navigate, path } = useRouter();
  const { theme, toggle } = useTheme();
  const uid = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActive(0);
    const back = document.activeElement;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      clearTimeout(t);
      if (back && typeof back.focus === 'function') back.focus();
    };
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const has = (text) => !q || text.toLowerCase().includes(q);
    const pages = nav.flatMap((g) => g.items.map((it) => ({ key: `p${it.to}`, group: 'Pages', label: it.label, hint: g.section, icon: it.icon, run: () => navigate(it.to) })));
    const places = recent.filter((x) => x.to !== path).map((x) => ({ key: `r${x.to}`, group: 'Recently opened', label: x.title, hint: timeAgo(x.at), run: () => navigate(x.to) }));
    const actions = [{ key: 'theme', group: 'Actions', label: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', hint: 'Theme', icon: theme === 'light' ? IconMoon : IconSun, run: toggle }];
    return [...places, ...pages, ...actions].filter((x) => has(`${x.label} ${x.hint || ''}`));
  }, [query, nav, recent, path, navigate, theme, toggle]);

  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (item) => {
    onClose();
    item.run();
  };
  const onKey = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (items[active]) choose(items[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault(); // focus stays in the search box while it is open
    }
  };

  let lastGroup = null;
  return createPortal(
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.box} role="dialog" aria-modal="true" aria-label="Search or jump to">
        <div className={styles.field}>
          <IconSearch width={18} height={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Search pages and recent places…"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-activedescendant={items[active] ? `${uid}-${active}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className={styles.kbd}>Esc</kbd>
        </div>
        <ul ref={listRef} id={`${uid}-list`} className={styles.list} role="listbox" aria-label="Results">
          {items.length === 0 && <li className={styles.empty}>Nothing matches “{query}”.</li>}
          {items.map((item, i) => {
            const head = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <li key={item.key} role="presentation">
                {head && <p className={styles.group}>{head}</p>}
                <div
                  id={`${uid}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={cx(styles.item, i === active && styles.itemOn)}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {Icon ? <Icon width={17} height={17} /> : <span className={styles.dot} />}
                  </span>
                  <span className={styles.label}>{item.label}</span>
                  {item.hint && <span className={styles.hint}>{item.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className={styles.foot}>
          <span>
            <kbd className={styles.kbd}>↑</kbd> <kbd className={styles.kbd}>↓</kbd> to move
          </span>
          <span>
            <kbd className={styles.kbd}>Enter</kbd> to open
          </span>
        </p>
      </div>
    </div>,
    document.body,
  );
}
