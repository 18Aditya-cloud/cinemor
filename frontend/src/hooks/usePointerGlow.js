import { useEffect } from 'react';

/**
 * Makes an element react to the mouse:
 *  - --mx / --my  : pointer position inside the element (for a spotlight effect)
 *  - --tx / --ty  : a small pull toward the pointer (for a "magnetic" feel)
 * CSS decides what to do with those variables.
 */
export default function usePointerGlow(ref, { magnet = 0 } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!finePointer) return undefined;

    const onMove = (event) => {
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
      if (magnet) {
        el.style.setProperty('--tx', `${(x / rect.width - 0.5) * magnet * 2}px`);
        el.style.setProperty('--ty', `${(y / rect.height - 0.5) * magnet * 2}px`);
      }
    };
    const onLeave = () => {
      el.style.setProperty('--tx', '0px');
      el.style.setProperty('--ty', '0px');
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [ref, magnet]);
}
