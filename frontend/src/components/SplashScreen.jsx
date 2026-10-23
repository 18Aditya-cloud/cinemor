import { useEffect, useMemo, useRef, useState } from 'react';
import Logo3D from '../dashboard/ui/Logo3D.jsx';
import robotHandUrl from '../assets/images/splash/robot-hand.webp';
import humanHandUrl from '../assets/images/splash/human-hand.webp';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import styles from './SplashScreen.module.css';

const SESSION_KEY = 'cm-splash-shown';

// timing (ms)
const LOAD_MS = 3400; // 0 -> 100%
const TOUCH_HOLD_MS = 320; // a beat at full contact before the logo bursts
const BURST_MS = 640; // the particle burst itself
const FADE_MS = 620; // the whole screen dissolving into the page underneath

// One extended finger from each hand is what actually reaches the logo. These are that fingertip's
// position as a fraction of the photo's own width/height (found once, by hand, in the source images) —
// everything else about where the hands sit on screen is worked out from this one point per hand.
const ROBOT_TIP = { x: 0.995, y: 0.52 };
const HUMAN_TIP = { x: 0.007, y: 0.479 };

// Where each fingertip is aimed on the logo — opposite corners of it, so the two hands reach the logo
// itself, never each other (point 5: "only the logo, not each other").
const ROBOT_TOUCH = { x: -0.34, y: 0.3 }; // fraction of the logo's own size, offset from its centre
const HUMAN_TOUCH = { x: 0.34, y: -0.3 };

// how far off in its own diagonal direction each hand starts, as a fraction of the shorter side of the
// screen — the robot hand rises from the bottom-left, the human hand from the top-right
const ROBOT_START = { x: -0.3, y: 0.27 };
const HUMAN_START = { x: 0.3, y: -0.27 };

// The loading messages. There is no real loading happening — the page underneath is already there —
// so these only need to feel right for the few seconds this is on screen; each one owns a percentage
// onward, in the order a story actually comes together.
const MESSAGES = [
  { at: 0, text: 'Waking up the story engine' },
  { at: 15, text: 'Gathering inspiration' },
  { at: 30, text: 'Sketching the first scene' },
  { at: 46, text: 'Casting your characters' },
  { at: 62, text: 'Building the world' },
  { at: 78, text: 'Polishing every frame' },
  { at: 92, text: 'Almost ready' },
  { at: 98, text: 'Bringing it to life' },
];
const messageFor = (pct) => {
  let m = MESSAGES[0].text;
  for (const item of MESSAGES) {
    if (pct >= item.at) m = item.text;
  }
  return m;
};

// A small, fixed set of pseudo-random numbers (not Math.random) for the burst, so it looks lively without
// being a new, untestable shape on every visit.
const seeded = (i, salt) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const BURST_COUNT = 46;
const BURST = Array.from({ length: BURST_COUNT }, (_, i) => ({
  id: i,
  angle: Math.round(seeded(i, 1) * 360),
  dist: Math.round(120 + seeded(i, 2) * 260),
  size: (2 + seeded(i, 3) * 3.5).toFixed(1),
  delay: (seeded(i, 4) * 0.14).toFixed(2),
  hue: seeded(i, 5),
}));

const shouldShow = () => {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) !== '1';
  } catch {
    return true;
  }
};
const markShown = () => {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* fine — it will just show again next load */
  }
};

/**
 * The splash: two hands (one human, one a machine's — Cinemor is built by people and AI together) rise
 * diagonally from opposite corners while a loading bar fills and a line of status text changes underneath
 * it, reaching the spinning Cinemor logo in the middle exactly as the bar hits 100 — at which point the
 * logo bursts into particles and the whole screen dissolves into the real page, already loaded behind it.
 *
 * It shows once per browser tab (sessionStorage) — see SplashScreen.module.css's neighbour, or just look
 * for SESSION_KEY above. "Reduce motion" skips it entirely, the same way it always has. Click, Enter, Space
 * or Escape skips straight to the reveal.
 */
export default function SplashScreen() {
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(() => !reduced && shouldShow());
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState('loading'); // loading -> touch -> burst -> exit
  const rootRef = useRef(null);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const timersRef = useRef([]);

  useEffect(() => {
    if (!visible) return undefined;
    markShown();
    rootRef.current?.focus();

    startRef.current = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - startRef.current) / LOAD_MS);
      setPct(Math.round(t * 1000) / 10); // one decimal place, smooth enough for the bar and the hands
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPhase('touch');
        timersRef.current.push(setTimeout(() => setPhase('burst'), TOUCH_HOLD_MS));
        timersRef.current.push(setTimeout(() => setPhase('exit'), TOUCH_HOLD_MS + BURST_MS));
        timersRef.current.push(setTimeout(() => setVisible(false), TOUCH_HOLD_MS + BURST_MS + FADE_MS));
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [visible]);

  const skip = () => {
    if (phase !== 'loading' && phase !== 'touch') return;
    cancelAnimationFrame(rafRef.current);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPct(100);
    setPhase('burst');
    timersRef.current.push(setTimeout(() => setPhase('exit'), BURST_MS));
    timersRef.current.push(setTimeout(() => setVisible(false), BURST_MS + FADE_MS));
  };
  const onKeyDown = (event) => {
    if (['Enter', ' ', 'Escape'].includes(event.key)) skip();
  };

  // how far along each hand still has to travel: 1 at the very start, 0 once it has reached the logo (98%)
  const travel = Math.max(0, 1 - Math.min(pct, 98) / 98);
  // vw/vh, not %, so "how far off screen" means the same thing regardless of how big the hand itself is
  const handStyle = (start) => ({ '--tx': `${(start.x * travel * 100).toFixed(2)}vw`, '--ty': `${(start.y * travel * 100).toFixed(2)}vh` });

  const burst = useMemo(() => BURST, []);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-phase={phase}
      style={{ '--fade-ms': `${FADE_MS}ms`, '--burst-ms': `${BURST_MS}ms` }}
      onClick={skip}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
    >
      <p className={styles.status} role="status">
        Loading Cinemor AI
      </p>

      <div className={styles.stage} aria-hidden="true">
        <span className={styles.ambient} />

        <div className={styles.centerpiece}>
          <span className={styles.centerGlow} />
          {/* the logo itself is simply not rendered once it has "burst" — trying to fade it out with CSS
              opacity here ran into an unexplained interaction with its own 3D transform layers where the
              computed opacity would not move even though every other element on this page responds to it
              normally; not rendering it at all sidesteps that entirely, and the burst of particles taking
              over at exactly that instant reads fine as the moment it comes apart */}
          {(phase === 'loading' || phase === 'touch') && (
            <div className={styles.logoWrap}>
              <Logo3D className={styles.logo3d} />
            </div>
          )}
          {phase === 'burst' && (
            <span className={styles.burst}>
              {burst.map((p) => (
                <span
                  key={p.id}
                  className={styles.spark}
                  style={{ '--rot': `${p.angle}deg`, '--dist': `${p.dist}px`, '--size': `${p.size}px`, '--delay': `${p.delay}s`, '--hue': p.hue }}
                />
              ))}
            </span>
          )}
        </div>

        <div className={styles.hand} style={{ ...handStyle(ROBOT_START), '--tox': ROBOT_TOUCH.x, '--toy': ROBOT_TOUCH.y }} data-hand="robot">
          <img className={styles.handImg} src={robotHandUrl} alt="" style={{ '--tipx': `${ROBOT_TIP.x * 100}%`, '--tipy': `${ROBOT_TIP.y * 100}%` }} draggable={false} />
        </div>
        <div className={styles.hand} style={{ ...handStyle(HUMAN_START), '--tox': HUMAN_TOUCH.x, '--toy': HUMAN_TOUCH.y }} data-hand="human">
          <img className={styles.handImg} src={humanHandUrl} alt="" style={{ '--tipx': `${HUMAN_TIP.x * 100}%`, '--tipy': `${HUMAN_TIP.y * 100}%` }} draggable={false} />
        </div>
      </div>

      <div className={styles.loader}>
        <p className={styles.message} key={messageFor(pct)}>
          {messageFor(pct)}
        </p>
        <div className={styles.barTrack} role="progressbar" aria-label="Loading Cinemor AI" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className={styles.barFill} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className={styles.percent}>{Math.min(100, Math.round(pct))}%</p>
      </div>
    </div>
  );
}
