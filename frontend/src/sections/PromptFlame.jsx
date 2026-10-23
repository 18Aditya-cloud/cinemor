import { useEffect, useRef, useState } from 'react';
import { FLAME_WORDS } from '../data/content.js';
import useInView from '../hooks/useInView.js';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import flameWebm from '../assets/video/flame.webm';
import flameMp4 from '../assets/video/flame.mp4';
import MorphText from './MorphText.jsx';
import styles from './PromptFlame.module.css';

/**
 * The purple flame video with the PROMPT / CREATE / COLLAB message just above it.
 * The message animates, and the video plays, only while this section is on screen.
 */
export default function PromptFlame() {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false); // if the video cannot load, show a CSS glow instead
  const reduced = usePrefersReducedMotion();
  const visible = useInView(sectionRef, { threshold: 0.3 });
  const near = useInView(sectionRef, { rootMargin: '250px 0px' });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (near && !reduced) {
      video.play()?.catch(() => {});
    } else {
      video.pause();
    }
  }, [near, reduced]);

  return (
    <section ref={sectionRef} className={styles.section}>
      <div className={styles.flame} data-fallback={videoFailed ? 'true' : undefined} aria-hidden="true">
        <video
          ref={videoRef}
          className={styles.video}
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
        >
          <source src={flameWebm} type="video/webm" />
          <source src={flameMp4} type="video/mp4" onError={() => setVideoFailed(true)} />
        </video>
      </div>

      <div className={styles.text}>
        {reduced ? (
          <h2 className={styles.static}>{FLAME_WORDS.join(' ')}</h2>
        ) : (
          <MorphText words={FLAME_WORDS} active={visible} />
        )}
      </div>
    </section>
  );
}
