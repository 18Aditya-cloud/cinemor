import { useEffect, useRef, useState } from 'react';
import { HERO } from '../data/content.js';
import useInView from '../hooks/useInView.js';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import useScrollReveal from '../hooks/useScrollReveal.js';
import video1080 from '../assets/video/hero-bg-1080.mp4';
import video720 from '../assets/video/hero-bg-720.mp4';
import poster from '../assets/images/hero-bg-poster.jpg';
import HeroGlow from './HeroGlow.jsx';
import styles from './HeroBackground.module.css';

const SMALL_SCREEN = '(max-width: 900px)';

/**
 * The picture behind the hero: a 10-second looping video of the eclipse glow.
 *
 * - It is a layer of its own, placed UNDER the particle canvas (see App.jsx), so the floating
 *   particles drift over it. It covers the first screen and scrolls away with the page.
 * - Small screens get the smaller 720p file, and the video is drawn smaller there so the glow
 *   is not blown up to fill a phone.
 * - The video plays only while it is on (or near) the screen.
 * - With "reduce motion" on, it stays a still picture.
 * - If the video cannot load or play, the lighter drawn glow (HeroGlow) is shown instead.
 *   To use that glow on purpose, set HERO.background to 'glow' in data/content.js.
 */
export default function HeroBackground({ dim = false }) {
  const layerRef = useRef(null);
  const videoRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const near = useInView(layerRef, { rootMargin: '200px 0px' });
  const [failed, setFailed] = useState(false);
  const showVideo = HERO.background === 'video' && !failed;
  const [src] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(SMALL_SCREEN).matches ? video720 : video1080,
  );

  // --cm-scroll goes 0 -> 1 as the first screen scrolls away; the glow drifts down a little for depth
  useScrollReveal(layerRef, { start: 0, end: -0.85, name: '--cm-scroll', disabled: reduced ? 'zero' : false });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (near && !reduced) video.play()?.catch(() => {});
    else video.pause();
  }, [near, reduced, showVideo]);

  return (
    <div ref={layerRef} className={styles.layer} data-dim={dim} aria-hidden="true">
      <div className={styles.shift}>
        {showVideo ? (
          <video
            ref={videoRef}
            className={styles.video}
            src={src}
            poster={poster}
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            tabIndex={-1}
            onError={() => setFailed(true)}
          />
        ) : (
          <HeroGlow />
        )}
      </div>
    </div>
  );
}
