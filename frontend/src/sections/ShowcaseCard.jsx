import { useEffect, useRef, useState } from 'react';
import { SHOWCASE } from '../data/content.js';
import useInView from '../hooks/useInView.js';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import useScrollReveal from '../hooks/useScrollReveal.js';
import { Play } from '../components/Icons.jsx';
import filmMp4 from '../assets/video/how-it-works-720.mp4';
import filmWebm from '../assets/video/how-it-works-720.webm';
import defaultPoster from '../assets/images/how-it-works-poster.jpg';
import styles from './ShowcaseCard.module.css';

/**
 * The large near-full-width card that grows into view as you scroll, showing the "How Cinemor AI works" film.
 *
 * - The film has no sound: it plays muted and loops, like a moving picture.
 * - It plays only while the card is on (or near) the screen.
 * - One 720p film for every screen (light enough for the landing page), as WebM (VP9) and MP4 (H.264); the
 *   browser picks the first one it can play.
 * - With "reduce motion" on, it does not start by itself; the player controls are shown instead.
 * - To use another video, set videoSrc (and optionally poster) in data/content.js, or pass them as props.
 *   If the video cannot load, the empty placeholder is shown.
 */
export default function ShowcaseCard({ videoSrc = SHOWCASE.videoSrc, poster = SHOWCASE.poster }) {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const near = useInView(sectionRef, { rootMargin: '200px 0px' });
  const [failed, setFailed] = useState(false);
  // [{ src, type }] in the order the browser should try them
  const sources = videoSrc
    ? [{ src: videoSrc }]
    : [
        { src: filmWebm, type: 'video/webm' },
        { src: filmMp4, type: 'video/mp4' },
      ];
  useScrollReveal(sectionRef, { start: 0.98, end: 0.34, disabled: reduced });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (near && !reduced) video.play()?.catch(() => {});
    else video.pause();
  }, [near, reduced, failed]);

  return (
    <section id="how-it-works" ref={sectionRef} className={styles.section} aria-label={SHOWCASE.label}>
      <div className={styles.card} data-video={!failed}>
        {!failed ? (
          <video
            ref={videoRef}
            className={styles.video}
            poster={poster || defaultPoster}
            muted
            loop
            playsInline
            preload="metadata"
            controls={reduced}
            disablePictureInPicture
            aria-label={SHOWCASE.label}
          >
            {sources.map((s, i) => (
              // the last source failing means none of them could be played
              <source key={s.type || i} src={s.src} type={s.type} onError={i === sources.length - 1 ? () => setFailed(true) : undefined} />
            ))}
          </video>
        ) : (
          <div className={styles.empty}>
            <span className={styles.play} aria-hidden="true">
              <Play width={30} height={30} />
            </span>
            <p className={styles.label}>{SHOWCASE.label}</p>
            <p className={styles.note}>{SHOWCASE.emptyNote}</p>
          </div>
        )}
      </div>
    </section>
  );
}
