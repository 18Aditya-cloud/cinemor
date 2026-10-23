import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data for a page and lets the page reload it (the refresh button).
 *   const { data, loading, error, reload } = useResource(() => listClients(), []);
 * `data` keeps its last value while reloading, so tables do not flash empty.
 */
export default function useResource(load, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const alive = useRef(true);
  const run = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await load();
      if (alive.current && id === run.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (alive.current && id === run.current) setState((s) => ({ data: s.data, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
