import { useEffect } from 'react';

/**
 * Writes a number from 0 to 1 into the CSS variable --cm-reveal on `ref`'s element
 * as it scrolls into view. CSS then does the animating, so React never re-renders
 * while scrolling.
 *
 * start / end are viewport fractions: 0 is the top edge, 1 is the bottom edge.
 * reveal = 0 when the element's top is at `start`, and 1 when it reaches `end`.
 *
 * Attach it to a wrapper that is NOT transformed, otherwise the measurement
 * would change as the transform animates.
 */
export default function useScrollReveal(ref, { start = 0.95, end = 0.3, disabled = false, name = '--cm-reveal' } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (disabled) {
      el.style.setProperty(name, disabled === 'zero' ? '0' : '1');
      return undefined;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top;
      const progress = (vh * start - top) / (vh * (start - end));
      el.style.setProperty(name, Math.min(1, Math.max(0, progress)).toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, start, end, disabled, name]);
}
