/**
 * One-click generation (the workshop): how a written story becomes scenes on a timeline.
 *
 * The story is split at its paragraphs into scenes (very short paragraphs join the one before; a story with too many
 * is grouped so there are at most MAX_SCENES). Each scene lasts about as long as its words take to narrate.
 */
export const LENGTHS = [
  { id: 'short', label: 'Short', words: 300 },
  { id: 'medium', label: 'Medium', words: 700 },
  { id: 'long', label: 'Long', words: 1500 },
];

const WORDS_PER_SECOND = 2.5; // a calm narration pace
const MIN_SCENE = 4; // seconds
const MAX_SCENE = 45;
const MAX_SCENES = 10;
const SHORT_PARAGRAPH = 22; // words

const wordsOf = (text) => (text.match(/\S+/g) || []).length;

// A scene that starts with a short line without an ending mark ("The Lighthouse Keeper") starts with a heading.
const headingOf = (text) => {
  const [line, ...rest] = text.split('\n');
  return rest.length && wordsOf(line) <= 8 && !/[.!?,;:]$/.test(line.trim()) ? line.trim() : '';
};

/** A short name for a scene: its heading if it has one, otherwise the first few words of its first sentence. */
function titleOf(text) {
  const heading = headingOf(text);
  if (heading) return heading;
  const first = text.split(/(?<=[.!?])\s/)[0].replace(/["“”]/g, '');
  const words = first.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?-]+$/, '');
  return words.length < first.length ? `${words}…` : words;
}

/** The story's text -> [{ no, title, text, body, words, start, duration }] (times in seconds; body is the text without its heading). */
export function scenesOf(content) {
  const text = String(content || '');
  // paragraphs are split by blank lines; a script with none (one line per paragraph) is split at its lines
  let parts = text
    .split(/\n{2,}/.test(text) ? /\n{2,}/ : /\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\(Demo .*\)$/s.test(p)); // the demo's own note is not part of the film

  // one long block: cut it into groups of sentences
  if (parts.length === 1 && wordsOf(parts[0]) > 120) {
    const sentences = parts[0].split(/(?<=[.!?])\s+/);
    parts = [];
    let current = '';
    sentences.forEach((sentence) => {
      current = current ? `${current} ${sentence}` : sentence;
      if (wordsOf(current) >= 60) {
        parts.push(current);
        current = '';
      }
    });
    if (current) parts.push(current);
  }

  // very short paragraphs (a heading, one line of dialogue) join the one before
  const merged = [];
  parts.forEach((p) => {
    if (merged.length && wordsOf(p) < SHORT_PARAGRAPH) merged[merged.length - 1] += `\n\n${p}`;
    else merged.push(p);
  });

  // too many: group them evenly
  let groups = merged;
  if (merged.length > MAX_SCENES) {
    const size = Math.ceil(merged.length / MAX_SCENES);
    groups = [];
    for (let i = 0; i < merged.length; i += size) groups.push(merged.slice(i, i + size).join('\n\n'));
  }

  let start = 0;
  return groups.map((text, i) => {
    const words = wordsOf(text);
    const duration = Math.min(MAX_SCENE, Math.max(MIN_SCENE, Math.round(words / WORDS_PER_SECOND)));
    const heading = headingOf(text);
    const body = heading ? text.slice(text.indexOf('\n') + 1).trim() : text;
    const scene = { no: i + 1, title: titleOf(text), text, body, words, start, duration };
    start += duration;
    return scene;
  });
}

/** "1 scene", "4 scenes" */
export const sceneCount = (n) => `${n} ${n === 1 ? 'scene' : 'scenes'}`;

export const totalOf = (scenes) => (scenes.length ? scenes[scenes.length - 1].start + scenes[scenes.length - 1].duration : 0);

/** 75 -> "01:15" */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** The scene playing at a time (the last one at the very end). */
export function sceneAt(scenes, time) {
  if (!scenes.length) return null;
  return scenes.find((sc) => time >= sc.start && time < sc.start + sc.duration) || scenes[scenes.length - 1];
}
