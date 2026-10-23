import { useCallback, useRef, useState } from 'react';
import { STORIES, STORIES_SECTION } from '../data/content.js';
import PillButton from '../components/PillButton.jsx';
import { ChevronLeft, ChevronRight, StoryIcon } from '../components/Icons.jsx';
import cx from '../utils/cx.js';
import styles from './StoryCarousel.module.css';

// How each card sits depending on how far it is from the centre (0 = centre).
const X = [0, 1.035, 2.07, 3.1]; // sideways distance, in card widths (a little more than 1 leaves a gap)
const SCALE = [1, 0.9, 0.82, 0.74];
const BLUR = [0, 8, 12, 14]; // px
const BRIGHT = [1, 0.5, 0.3, 0.2]; // dimming keeps cards opaque, so particles never show through

/**
 * A row of large cards that slides sideways. The centre card is sharp; the ones on each side
 * are smaller, dimmed and blurred, peeking in from the edges.
 *
 * Move with: the arrow buttons, the dots, the left/right arrow keys, clicking a side card,
 * or dragging/swiping (the row follows your finger or mouse, then settles).
 * Use 7 stories so the loop is seamless.
 */
export default function StoryCarousel({ stories = STORIES, onTry }) {
  const count = stories.length;
  const [active, setActive] = useState(Math.floor(count / 2));
  const stageRef = useRef(null);
  const drag = useRef({ id: null, startX: 0, lastX: 0, lastT: 0, v: 0, dragging: false, moved: false });

  const go = useCallback((step) => setActive((a) => (a + step + count) % count), [count]);

  // Shortest signed distance from the active card, wrapping around the ends.
  const offsetOf = (index) => {
    let d = (index - active) % count;
    if (d > count / 2) d -= count;
    if (d < -count / 2) d += count;
    return d;
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
  };

  /* ---- drag / swipe: the whole row follows the pointer, then settles on release ---- */
  const setDragOffset = (px) => stageRef.current?.style.setProperty('--drag', `${px}px`);

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, a')) return; // let buttons behave normally
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastT: event.timeStamp,
      v: 0,
      dragging: false,
      moved: false,
    };
  };

  const onPointerMove = (event) => {
    const d = drag.current;
    if (d.id !== event.pointerId) return;
    const dx = event.clientX - d.startX;
    if (!d.dragging) {
      if (Math.abs(dx) < 6) return; // small movements are still clicks
      d.dragging = true;
      d.moved = true;
      stageRef.current.dataset.dragging = 'true';
      try {
        stageRef.current.setPointerCapture(event.pointerId);
      } catch {
        /* optional */
      }
    }
    const dt = Math.max(1, event.timeStamp - d.lastT);
    d.v = 0.6 * d.v + 0.4 * ((event.clientX - d.lastX) / dt); // px per ms, smoothed
    d.lastX = event.clientX;
    d.lastT = event.timeStamp;
    setDragOffset(dx);
  };

  const endDrag = (event) => {
    const d = drag.current;
    if (d.id !== event.pointerId) return;
    d.id = null;
    if (!d.dragging) return;
    d.dragging = false;
    const dx = event.clientX - d.startX;
    delete stageRef.current.dataset.dragging;
    setDragOffset(0);
    const far = Math.abs(dx) > 70;
    const flick = Math.abs(d.v) > 0.45;
    if (far) go(dx < 0 ? 1 : -1);
    else if (flick) go(d.v < 0 ? 1 : -1);
  };

  // A drag ends with a click event. Swallow it so the card underneath is not activated.
  const onClickCapture = (event) => {
    if (drag.current.moved) {
      event.stopPropagation();
      event.preventDefault();
      drag.current.moved = false;
    }
  };

  return (
    <section className={styles.section} aria-roledescription="carousel" aria-label={STORIES_SECTION.title}>
      <h2 className={styles.title}>{STORIES_SECTION.title}</h2>

      <div
        ref={stageRef}
        className={styles.stage}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {stories.map((story, index) => {
          const offset = offsetOf(index);
          const distance = Math.min(3, Math.abs(offset));
          const sign = offset < 0 ? -1 : 1;
          const isActive = offset === 0;
          return (
            <article
              key={story.id}
              className={cx(styles.card, isActive && styles.active)}
              style={{
                '--x': sign * X[distance],
                '--s': SCALE[distance],
                '--b': `${BLUR[distance]}px`,
                '--br': BRIGHT[distance],
                '--z': 10 - distance,
                '--h': story.hue,
              }}
              aria-hidden={!isActive}
              data-far={distance >= 3 ? 'true' : undefined}
              onClick={() => {
                if (!isActive) go(offset);
              }}
            >
              <div className={styles.media} aria-hidden="true">
                {story.video ? (
                  <video className={styles.file} src={story.video} autoPlay muted loop playsInline preload="metadata" />
                ) : story.image ? (
                  <img className={styles.file} src={story.image} alt="" />
                ) : (
                  <div className={styles.art}>
                    <span className={styles.glow} />
                    <span className={styles.disc} />
                    <span className={styles.line} />
                    <span className={styles.reflect} />
                  </div>
                )}
              </div>

              <div className={styles.info}>
                <div className={styles.text}>
                  <h3 className={styles.name}>
                    <StoryIcon name={story.icon} className={styles.icon} width={26} height={26} strokeWidth={1.6} />
                    {story.title}
                  </h3>
                  <p className={styles.blurb}>{story.blurb}</p>
                </div>
                <PillButton
                  tabIndex={isActive ? 0 : -1}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isActive) onTry?.(story);
                    else go(offset);
                  }}
                >
                  {STORIES_SECTION.tryLabel}
                </PillButton>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.arrow} onClick={() => go(-1)} aria-label="Previous story">
          <ChevronLeft width={22} height={22} />
        </button>
        <div className={styles.dots}>
          {stories.map((story, index) => (
            <button
              key={story.id}
              type="button"
              className={cx(styles.dot, index === active && styles.dotActive)}
              onClick={() => setActive(index)}
              aria-label={`Show ${story.title}`}
              aria-current={index === active}
            />
          ))}
        </div>
        <button type="button" className={styles.arrow} onClick={() => go(1)} aria-label="Next story">
          <ChevronRight width={22} height={22} />
        </button>
      </div>

      <p className="cm-sr-only" aria-live="polite">
        {`${active + 1} of ${count}: ${stories[active].title}`}
      </p>
    </section>
  );
}
