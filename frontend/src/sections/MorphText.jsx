import { useEffect, useState } from 'react';
import cx from '../utils/cx.js';
import styles from './MorphText.module.css';

const TYPE_MS = 150; // time between letters while first typing
const HOLD_MS = 1600; // how long a finished word stays
const STEP_MS = 170; // delay between one letter starting to change and the next
const SCRAMBLE_MS = 430; // how long each changing letter flickers before settling
const FLICKER_MS = 55;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

const emptyCells = (length) => Array.from({ length }, () => ({ ch: '', state: 'empty', caret: false }));

/**
 * Writes the first word letter by letter, then changes it into the next word one
 * letter at a time (each letter flickers through random letters and settles), and so on
 * in a loop. All words must have the same number of letters.
 *
 * `active` starts and stops the animation, so nothing runs while it is off screen.
 */
export default function MorphText({ words, active = true, className }) {
  const length = words[0].length;
  const [cells, setCells] = useState(() => emptyCells(length));

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    const setCell = (index, patch) =>
      setCells((prev) => prev.map((cell, i) => (i === index ? { ...cell, ...patch } : cell)));

    async function changeLetter(index, target, delay) {
      await sleep(delay, signal);
      const end = Date.now() + SCRAMBLE_MS;
      while (Date.now() < end) {
        setCell(index, { ch: ALPHABET[Math.floor(Math.random() * 26)], state: 'scramble' });
        await sleep(FLICKER_MS, signal);
      }
      setCell(index, { ch: target, state: 'settled' });
    }

    async function play() {
      try {
        setCells(emptyCells(length));
        const first = words[0];
        for (let i = 0; i < length; i += 1) {
          await sleep(TYPE_MS, signal);
          setCells((prev) =>
            prev.map((cell, k) => ({
              ...cell,
              ch: k === i ? first[i] : cell.ch,
              state: k === i ? 'settled' : cell.state,
              caret: k === i,
            })),
          );
        }

        let current = first;
        let index = 0;
        for (;;) {
          await sleep(HOLD_MS, signal);
          setCells((prev) => prev.map((cell) => ({ ...cell, caret: false })));
          index = (index + 1) % words.length;
          const next = words[index];
          const jobs = [];
          let order = 0;
          for (let i = 0; i < length; i += 1) {
            if (current[i] === next[i]) continue; // same letter, leave it alone
            jobs.push(changeLetter(i, next[i], order * STEP_MS));
            order += 1;
          }
          await Promise.all(jobs);
          current = next;
        }
      } catch (error) {
        if (error.name !== 'AbortError') throw error;
      }
    }

    play();
    return () => controller.abort();
  }, [active, words, length]);

  return (
    <h2 className={cx(styles.word, className)} aria-label={words.join(', ')}>
      {cells.map((cell, i) => (
        <span key={i} className={cx(styles.cell, styles[cell.state])} aria-hidden="true">
          {cell.ch || '\u00A0'}
          {cell.caret && <span className={styles.caret} />}
        </span>
      ))}
    </h2>
  );
}
