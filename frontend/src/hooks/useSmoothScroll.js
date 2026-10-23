import { useEffect } from 'react';

/**
 * Inertial ("buttery") mouse-wheel scrolling, with no library.
 *
 * A normal wheel jumps the page in steps. Here each wheel notch moves a target position,
 * and every frame the real scroll position glides a fraction of the way toward it. The
 * result is the soft start and long, gentle stop you see on premium sites.
 *
 * It stays out of the way of everything else:
 *  - touch scrolling, keyboard, and dragging the scrollbar stay native, and this follows them
 *  - pinch-zoom (ctrl/cmd + wheel) and sideways scrolling are left alone
 *  - it does nothing while a dialog is open, inside inner scrollable boxes, or if the page
 *    cannot scroll (for example when embedded at full height)
 *  - it is switched off for people who asked their system for reduced motion
 *  - clicks on #anchor links glide instead of jumping
 */
const SPEED = 6.5; // higher = snappier, lower = floatier
const WHEEL_MULTIPLIER = 1;

function scrollableAncestor(node) {
  for (let el = node; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
}

export default function useSmoothScroll({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const root = document.documentElement;
    let current = window.scrollY;
    let target = current;
    let running = false;
    let raf = 0;
    let last = 0;

    const maxScroll = () => Math.max(0, root.scrollHeight - window.innerHeight);
    const clamp = (value) => Math.min(maxScroll(), Math.max(0, value));

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      current += (target - current) * (1 - Math.exp(-dt * SPEED));
      if (Math.abs(target - current) < 0.3) current = target;
      window.scrollTo(0, current);
      if (current === target) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }

    function onWheel(event) {
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (maxScroll() <= 1) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (scrollableAncestor(event.target)) return;

      event.preventDefault();
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1;
      if (!running) {
        current = window.scrollY;
        target = current;
      }
      target = clamp(target + event.deltaY * unit * WHEEL_MULTIPLIER);
      start();
    }

    // If something else moved the page (keyboard, scrollbar, anchor), follow it instead of fighting it.
    function onScroll() {
      if (Math.abs(window.scrollY - current) > 2) {
        cancelAnimationFrame(raf);
        running = false;
        current = window.scrollY;
        target = current;
      }
    }

    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href^="#"]');
      if (!link) return;
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const element = id ? document.getElementById(id) : null;
      if (id && !element) return;
      event.preventDefault();
      current = window.scrollY;
      target = clamp(element ? element.getBoundingClientRect().top + window.scrollY : 0);
      start();
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick);
    };
  }, [enabled]);
}
