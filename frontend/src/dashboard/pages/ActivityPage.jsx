import { useCallback, useEffect, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import cx from '../../utils/cx.js';
import { listActivityPage } from '../api/organizationApi.js';
import ActivityFeed, { ACTIVITY_KINDS } from '../ui/ActivityFeed.jsx';
import Button from '../ui/Button.jsx';
import { IconMotion } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import styles from './pages.module.css';
import a from './ActivityPage.module.css';

const PAGE_SIZE = 25;
const FILTERS = [{ key: '', label: 'Everything' }, ...Object.entries(ACTIVITY_KINDS).map(([key, kind]) => ({ key, label: kind.label }))];

/** Activity (/organization/activity, from Overview → Recent activity → View all): everything that happened, newest first. */
export default function ActivityPage() {
  useDocumentTitle('Activity');
  const [kind, setKind] = useState('');
  const [state, setState] = useState({ items: [], hasMore: false, loading: true, more: false, error: null });
  const run = useRef(0);

  const load = useCallback(async (filter, beforeId) => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: !beforeId, more: Boolean(beforeId), error: null }));
    try {
      const page = await listActivityPage({ limit: PAGE_SIZE, beforeId, kind: filter || undefined });
      if (id !== run.current) return;
      setState((s) => ({ items: beforeId ? [...s.items, ...page.items] : page.items, hasMore: page.hasMore, loading: false, more: false, error: null }));
    } catch (error) {
      if (id === run.current) setState((s) => ({ ...s, loading: false, more: false, error }));
    }
  }, []);

  useEffect(() => {
    load(kind);
  }, [kind, load]);

  const { items, hasMore, loading, more, error } = state;
  const first = loading && items.length === 0;
  const filterLabel = FILTERS.find((f) => f.key === kind)?.label.toLowerCase();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Activity"
        subtitle="Everything that has changed in your organization in the last 14 days, newest first. Older activity is deleted."
        actions={<RefreshButton withText onClick={() => load(kind)} loading={loading} />}
      />
      {error && <Notice message={error.message} onRetry={() => load(kind)} />}

      <div className={a.filters} role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.key || 'all'} type="button" className={cx(a.filter, f.key === kind && a.filterOn)} aria-pressed={f.key === kind} onClick={() => setKind(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <section className={a.card} aria-busy={loading || undefined}>
        {first ? (
          <ul className={a.loading} aria-label="Loading activity">
            {[0, 1, 2, 3, 4].map((n) => (
              <li key={n}>
                <span className={a.skDot} />
                <span className={a.skLine} style={{ width: `${70 - n * 9}%` }} />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          !error && (
            <EmptyState
              framed={false}
              icon={IconMotion}
              title={kind ? `No ${filterLabel} activity yet` : 'Nothing has happened yet'}
              text={kind ? 'Try another filter, or come back after your team has done some work.' : 'When you or your team create, change or approve something, it shows up here.'}
            />
          )
        ) : (
          <>
            <ActivityFeed items={items} label="Activity" />
            <div className={a.footer}>
              {hasMore ? (
                <Button variant="secondary" loading={more} onClick={() => load(kind, items.at(-1).id)}>
                  Show older activity
                </Button>
              ) : (
                <p className={a.end}>That's everything.</p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}