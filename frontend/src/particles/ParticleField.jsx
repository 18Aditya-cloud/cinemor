import { useEffect, useRef } from 'react';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import { createParticleEngine } from './engine.js';
import styles from './ParticleField.module.css';

/**
 * Full-page particle background.
 *
 * Props
 *  - logoSrc : URL of the logo image the particles assemble into
 *  - stageActive: true while the <LogoStage /> section is on the page (only on the home page)
 *  - stageRef: ref to the <LogoStage /> section. Its scroll position decides when the
 *              logo forms and disperses, and it receives the drag-to-rotate events.
 *
 * It renders one <canvas> (plus a soft glow layer under it) and is purely visual (aria-hidden), so it never affects layout,
 * focus or screen readers.
 */
export default function ParticleField({ logoSrc, stageRef, stageActive = true }) {
  const canvasRef = useRef(null);
  const glowRef = useRef(null);
  const engineRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const engine = createParticleEngine({
      canvas: canvasRef.current,
      glowEl: glowRef.current,
      logoSrc,
      stageEl: stageRef?.current ?? null,
      reducedMotion: reducedRef.current,
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [logoSrc, stageRef]);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  // The logo section only exists on the home page. Tell the engine when it appears or goes away.
  useEffect(() => {
    engineRef.current?.setStage(stageActive ? stageRef?.current ?? null : null);
  }, [stageActive, stageRef]);

  return (
    <>
      {/* the soft blue light behind the logo and hand; the engine fades it in with the hand */}
      <div ref={glowRef} className={styles.glow} aria-hidden="true" />
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </>
  );
}
