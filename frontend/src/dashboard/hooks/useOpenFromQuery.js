import { useEffect, useRef } from 'react';
import { useRouter } from '../../router/router.jsx';

/**
 * Lets a link such as /organization/projects?new=1 open the page's "create" window straight away
 * (the Overview's quick actions use it). The ?new=1 is removed from the address once it has been used.
 *   useOpenFromQuery(() => setCreating(true));
 */
export default function useOpenFromQuery(open) {
  const { path, search, navigate } = useRouter();
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (new URLSearchParams(search).get('new') !== '1') return;
    openRef.current();
    navigate(path, { replace: true });
  }, [search, path, navigate]);
}
