import cx from '../../utils/cx.js';
import { IconCheck, IconLock } from './DashIcons.jsx';
import p from './Production.module.css';

/**
 * The production look shared by the project pages (Creator project, Employee story, Team Leader project):
 * one colour per stage, cover art, the stage pipeline and the progress ring. Put `palette` on the page's root.
 */
export const palette = p.palette;
export { p as prod };

// the stage colour classes; the Creator's "environment" module is the Locations stage
const STAGE_CLASS = {
  story: p.story,
  storyboard: p.storyboard,
  characters: p.characters,
  locations: p.locations,
  environment: p.locations,
  sketches: p.sketches,
  animation: p.animation,
  ok: p.ok,
  warn: p.warn,
  red: p.red,
  gray: p.gray,
  brand: p.brand,
};
/** The class that gives an element its stage colour (as --c). */
export const stageColor = (key) => STAGE_CLASS[key] || p.gray;

/** A small rounded label in a stage (or state) colour. */
export function Chip({ color, dashed = false, icon: Icon, children, className }) {
  return (
    <span className={cx(p.chip, stageColor(color), dashed && p.chipDashed, className)}>
      {Icon && <Icon width={12} height={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** A stage's icon in its colour. */
export function StageIcon({ color, icon: Icon, small = false }) {
  return (
    <span className={cx(p.icon, small && p.iconSm, stageColor(color))} aria-hidden="true">
      <Icon width={small ? 15 : 18} height={small ? 15 : 18} />
    </span>
  );
}

export const Dot = ({ color }) => <i className={cx(p.dot, stageColor(color))} aria-hidden="true" />;

const seedOf = (seed) => {
  const text = String(seed ?? '');
  let n = 0;
  for (let i = 0; i < text.length; i += 1) n = (n * 31 + text.charCodeAt(i)) % 9973;
  return n;
};

/** Cinematic cover art (a sky, a sun and hills) chosen from the seed, so each project / story keeps its own. */
export function CoverArt({ seed, className, sun = true, children, style }) {
  const variant = [p.art0, p.art1, p.art2, p.art3, p.art4][seedOf(seed) % 5];
  return (
    <div className={cx(p.art, variant, className)} style={style}>
      {sun && <span className={p.sun} aria-hidden="true" />}
      <svg className={p.hills} viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 80 C60 40 110 70 160 55 C220 35 260 75 320 50 C360 35 385 50 400 45 V120 H0z" fill="rgba(10,6,24,.5)" />
        <path d="M0 100 C70 80 120 95 190 85 C260 72 320 98 400 82 V120 H0z" fill="rgba(8,5,18,.82)" />
      </svg>
      <span className={p.shade} aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * The six stages on a line. `nodes`: [{ key, label, icon, state: 'done' | 'now' | 'todo' | 'lock', title }].
 * With `onPick`, every node is a button (it jumps to that stage).
 */
export function Pipeline({ nodes, onPick, label = 'Stages' }) {
  const reached = nodes.reduce((last, n, i) => (n.state === 'done' || n.state === 'now' ? i : last), -1);
  const n = nodes.length;
  return (
    <ol className={p.pipe} style={{ '--n': n }} aria-label={label}>
      {reached > 0 && <span className={p.pipeFill} style={{ width: `calc(${(reached / n) * 100}%)` }} aria-hidden="true" />}
      {nodes.map((node) => (
        <li key={node.key} style={{ display: 'grid' }}>
          <button
            type="button"
            className={cx(p.node, stageColor(node.key), node.state === 'done' && p.nodeDone, node.state === 'now' && p.nodeNow)}
            onClick={onPick ? () => onPick(node.key) : undefined}
            disabled={!onPick}
            title={node.title || node.label}
          >
            <span className={p.nodeDot} aria-hidden="true">
              {node.state === 'done' ? <IconCheck width={16} height={16} strokeWidth={2.8} /> : node.state === 'lock' ? <IconLock width={15} height={15} /> : <node.icon width={16} height={16} />}
            </span>
            {node.label}
            {node.title && <span className="cm-sr-only">: {node.title}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A progress ring: `value` 0-100. */
export function Ring({ value, label, sub, size = 110, color }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className={cx(p.ring, color && stageColor(color))} style={{ '--p': v, '--size': `${size}px` }} role="img" aria-label={`${label}${sub ? ` ${sub}` : ''}`}>
      <div className={p.ringTrack} />
      <div className={p.ringText} aria-hidden="true">
        <span className={p.ringValue}>{label}</span>
        {sub && <span className={p.ringSub}>{sub}</span>}
      </div>
    </div>
  );
}

/** A thin progress bar: `value` 0-100. */
export function Bar({ value, color, className }) {
  return (
    <div className={cx(p.bar, color && stageColor(color), className)} aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

/** A round avatar with the person's initials; the colour comes from the seed. */
export function Avatar({ name, seed, size = 34, className }) {
  const initials = String(name || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const tone = [p.av0, p.av1, p.av2, p.av3, p.av4][seedOf(seed ?? name) % 5];
  return (
    <span className={cx(p.avatar, tone, className)} style={{ '--av': `${size}px` }} title={name} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

export const AvatarStack = ({ children }) => <span className={p.stack}>{children}</span>;
