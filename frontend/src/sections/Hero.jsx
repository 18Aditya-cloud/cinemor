import { useRef } from 'react';
import { HERO } from '../data/content.js';
import Create from '../components/Create.jsx';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import useScrollReveal from '../hooks/useScrollReveal.js';
import styles from './Hero.module.css';

// First screen: headline over the glow, with the "Create your story" button below it.
//
// Motion: one opening sequence (the background glow fades in, headline words rise in one after
// another, then the sub-line and button) and, while you scroll away, the text and button drift at
// slightly different speeds for a feeling of depth. The glow itself is HeroBackground.jsx.
export default function Hero({ onCreate }) {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  // --cm-scroll goes 0 -> 1 as the hero scrolls out of view
  useScrollReveal(ref, { start: 0, end: -0.85, name: '--cm-scroll', disabled: reduced ? 'zero' : false });

  const words = HERO.headline.split(' ');

  return (
    <section ref={ref} id="top" className={styles.hero} aria-labelledby="cm-hero-title">
      <div className={styles.copy}>
        <h1 id="cm-hero-title" className={styles.title}>
          {words.map((word, i) => (
            <span key={`${word}-${i}`}>
              {i > 0 && ' '}
              <span className={styles.word} style={{ '--i': i }}>
                {word}
              </span>
            </span>
          ))}
        </h1>
        <p className={styles.sub}>{HERO.sub}</p>
      </div>

      <div className={styles.cta}>
        <div className={styles.ctaIn}>
          <Create onClick={onCreate}>{HERO.cta}</Create>
        </div>
      </div>
    </section>
  );
}
