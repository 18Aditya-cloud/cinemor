/**
 * Where a project stands, for the creator's Overview: its stories, storyboards, characters, places, sketches and
 * clips, read once (the same reading as the project page's production line), and
 *   states   each module: { state: done | now | todo | lock, stat, value, count } (ProjectPage's moduleStates)
 *   cover    the picture for the project's card: the first scene sketch made (null until one is made)
 *   current  the module to work on next
 */
import { getCharacterRecords, getLocationRecords, getSceneSketches, isLive, listProjectStories, listStoryboards, listVideoClips } from './individualApi.js';
import { moduleStates } from './ProjectPage.jsx';
import { IconBook, IconFilm, IconImage, IconPencil, IconStoryboard, IconUser } from '../ui/DashIcons.jsx';

const quiet = (promise) => Promise.resolve(promise).catch(() => null);
const imageOf = (record) => {
  const im = record?.images;
  if (!im) return null;
  return (im.active === 'uploaded' ? im.uploaded?.src : im.master?.src) || im.master?.src || im.uploaded?.src || null;
};

// the six modules, in order, with their colours (studio.css), the project page's own symbols, and addresses
export const MODULES = [
  { id: 'story', label: 'Story', tone: 'var(--st-story)', icon: IconBook, path: 'story' },
  { id: 'storyboard', label: 'Board', title: 'Storyboard', tone: 'var(--st-board)', icon: IconStoryboard, path: 'storyboard' },
  { id: 'characters', label: 'Characters', tone: 'var(--st-char)', icon: IconUser, path: 'characters' },
  { id: 'environment', label: 'Locations', tone: 'var(--st-loc)', icon: IconImage, path: 'environment' },
  { id: 'sketches', label: 'Sketches', tone: 'var(--st-sketch)', icon: IconPencil, path: 'sketches' },
  { id: 'animation', label: 'Animation', tone: 'var(--st-anim)', icon: IconFilm, path: 'animation' },
];

export async function loadProduction(projectId) {
  const stories = (await quiet(listProjectStories(projectId))) || [];
  const boards = stories.length ? (await quiet(listStoryboards(projectId))) || [] : [];
  const per = await Promise.all(
    boards.map(async ({ storyId }) => {
      const [chars, places, sketches, clips] = await Promise.all([
        quiet(getCharacterRecords(projectId, storyId)),
        quiet(getLocationRecords(projectId, storyId)),
        quiet(getSceneSketches(projectId, storyId)),
        isLive ? quiet(listVideoClips(projectId, storyId)) : null,
      ]);
      return { chars: Object.values(chars || {}), places: Object.values(places || {}), sketches: Object.values(sketches || {}), clips: clips || [] };
    }),
  );
  const deep = { chars: 0, charsDone: 0, places: 0, placesDone: 0, scenes: 0, sketched: 0, clipped: 0, charImages: [], placeImages: [], sketchImages: [] };
  per.forEach((r) => {
    deep.chars += r.chars.length;
    deep.places += r.places.length;
    deep.charsDone += r.chars.filter((c) => imageOf(c)).length;
    deep.placesDone += r.places.filter((l) => imageOf(l)).length;
    deep.scenes += r.sketches.length;
    r.sketches.forEach((rec, i) => {
      const made = rec?.sketches || [];
      if (!made.length) return;
      deep.sketched += 1;
      const chosen = made.find((k) => k.id === rec.selected) || made[0];
      if (chosen?.src) deep.sketchImages.push({ src: chosen.src, alt: `Sketch of scene ${i + 1}` });
    });
    deep.clipped += new Set(r.clips.filter((c) => c.status === 'generated').map((c) => c.sceneId)).size;
  });
  const states = moduleStates(stories, boards, deep);
  const current = MODULES.find((m) => states[m.id]?.state !== 'done') || null;
  const done = MODULES.filter((m) => states[m.id]?.state === 'done').length;
  return { stories, boards, states, current, done, cover: deep.sketchImages[0]?.src || null };
}