import { useEffect, useState } from 'react';

// True while the element is on (or within rootMargin of) the screen.
// Used to pause work that nobody can see, such as video and text animation.
export default function useInView(ref, { threshold = 0, rootMargin = '0px' } = {}) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold,
      rootMargin,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);

  return inView;
}
