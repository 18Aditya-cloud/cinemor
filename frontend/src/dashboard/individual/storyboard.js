/**
 * The Storyboard: a story broken down into what a film needs: an overview (logline, synopsis, themes, story
 * details), the characters and how they are related, the scenes with their dialogue, the places and the objects.
 *
 * The format below (snake_case, like the backend's) is what the backend will send later and what Export / Import
 * JSON use. Until the backend does it with AI, `buildStoryboard` makes a first version here from the story's text
 * (a demo: the scenes are the workshop's scenes; names, places and objects are picked out of the text).
 */
import { scenesOf } from './oneClick.js';

export const FORMAT_VERSION = 1;

/* ------------------------------------------------------------------ the format */

export const TEMPLATE = {
  format_version: FORMAT_VERSION,
  story_metadata: {
    title: 'The title of the story',
    language: 'en',
    genre: ['Drama'],
    style: ['Cinematic'],
    narrator: 'present',
    point_of_view: 'third_person_omniscient',
    narrator_details: 'Who tells the story and how.',
  },
  logline: 'One sentence: who wants what, and what stands in the way.',
  synopsis: 'A short summary of the whole story.',
  themes: ['courage', 'family'],
  characters: [
    {
      character_id: 1,
      name: 'Character name',
      role: 'protagonist',
      description: 'Who they are, in a sentence.',
      importance: 'primary',
      gender: 'female',
      age_group: 'young_adult',
      aliases: [],
      first_appearance: 1,
      revealed_identity: '',
      appearance: { physical_traits: 'How they look', clothing: 'What they wear', special_features: 'Anything that stands out' },
      dominant_emotions: ['determination'],
    },
  ],
  relationships: [{ source: 1, relationship: 'sibling', target: 2, description: 'How the two are connected.' }],
  scenes: [
    {
      scene_id: 1,
      title: 'Scene title',
      summary: 'What the scene is about.',
      location: 'Place name',
      emotion: 'calm',
      language: 'en',
      transition: 'cut',
      importance: 'major',
      extraction_confidence: 90,
      primary_action: 'What happens.',
      visual_description: 'What we see.',
      camera_suggestion: 'Wide shot to show the place.',
      characters_present: ['Character name'],
      dialogues: [{ speaker: 'Character name', line: 'What they say.', emotion: 'calm' }],
    },
  ],
  locations: [{ location_id: 1, name: 'Place name', description: 'What the place is like.', type: 'exterior', aliases: [], first_appearance: 1 }],
  objects: [{ object_id: 1, name: 'Object name', description: 'What it is and why it matters.', first_appearance: 1 }],
};

/* ------------------------------------------------------------------ reading values */

const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/\s*,\s*/) : []);
const strList = (v) => list(v).map(str).filter(Boolean);
const num = (v) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null);

const EMPTY = /^(not provided|none|n\/a|null|unknown|-)$/i;
/** A value worth showing (empty, "Not provided" and the like are not). */
export const has = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(str(v)) && !EMPTY.test(str(v)));

const LANGUAGES = { en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German', ja: 'Japanese', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', mr: 'Marathi' };
/** "young_adult" -> "Young adult", "en" -> "English" */
export function nice(value) {
  const v = str(value);
  if (!v) return '';
  if (LANGUAGES[v.toLowerCase()]) return LANGUAGES[v.toLowerCase()];
  const words = v.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Check a storyboard (from the backend or an imported file) and tidy it: missing lists become empty, numbers
 * become numbers. Returns { board } or { error } with a plain message saying what is wrong.
 */
export function readStoryboard(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'This file is not a storyboard. It should be a JSON object like the template.' };
  if (!Array.isArray(data.scenes) || !data.scenes.length) return { error: 'The storyboard has no scenes. Add a "scenes" list with at least one scene.' };
  const problems = [];
  const meta = data.story_metadata && typeof data.story_metadata === 'object' ? data.story_metadata : {};
  const characters = list(data.characters).filter((c) => c && typeof c === 'object');
  characters.forEach((c, i) => {
    if (!str(c.name)) problems.push(`Character ${i + 1} has no name.`);
  });
  data.scenes.forEach((sc, i) => {
    if (!sc || typeof sc !== 'object') problems.push(`Scene ${i + 1} is not an object.`);
    else if (!str(sc.title) && !str(sc.summary)) problems.push(`Scene ${i + 1} needs a title or a summary.`);
  });
  if (problems.length) return { error: problems.slice(0, 3).join(' ') };

  const board = {
    format_version: FORMAT_VERSION,
    story_metadata: {
      title: str(meta.title),
      language: str(meta.language),
      genre: strList(meta.genre),
      style: strList(meta.style),
      narrator: str(meta.narrator),
      point_of_view: str(meta.point_of_view),
      narrator_details: str(meta.narrator_details),
    },
    logline: str(data.logline),
    synopsis: str(data.synopsis),
    themes: strList(data.themes ?? data.theme),
    characters: characters.slice(0, 200).map((c, i) => ({
      character_id: num(c.character_id) ?? i + 1,
      name: str(c.name),
      role: str(c.role),
      description: str(c.description),
      importance: str(c.importance),
      gender: str(c.gender),
      age_group: str(c.age_group),
      aliases: strList(c.aliases),
      first_appearance: num(c.first_appearance),
      revealed_identity: str(c.revealed_identity),
      appearance: {
        physical_traits: str(c.appearance?.physical_traits),
        clothing: str(c.appearance?.clothing),
        special_features: str(c.appearance?.special_features),
      },
      dominant_emotions: strList(c.dominant_emotions),
    })),
    relationships: list(data.relationships)
      .filter((r) => r && typeof r === 'object')
      .slice(0, 400)
      .map((r) => ({ source: num(r.source) ?? str(r.source), relationship: str(r.relationship), target: num(r.target) ?? str(r.target), description: str(r.description) })),
    scenes: data.scenes.slice(0, 300).map((sc, i) => ({
      scene_id: num(sc.scene_id) ?? i + 1,
      title: str(sc.title) || `Scene ${i + 1}`,
      summary: str(sc.summary),
      location: str(sc.location),
      emotion: str(sc.emotion),
      language: str(sc.language),
      transition: str(sc.transition),
      importance: str(sc.importance),
      extraction_confidence: num(sc.extraction_confidence),
      primary_action: str(sc.primary_action),
      visual_description: str(sc.visual_description),
      camera_suggestion: str(sc.camera_suggestion),
      characters_present: strList(sc.characters_present),
      dialogues: list(sc.dialogues)
        .filter((d) => d && typeof d === 'object' && str(d.line ?? d.text))
        .map((d) => ({ speaker: str(d.speaker ?? d.character), line: str(d.line ?? d.text), emotion: str(d.emotion) })),
    })),
    locations: list(data.locations)
      .filter((l) => l && typeof l === 'object' && str(l.name))
      .slice(0, 200)
      .map((l, i) => ({ location_id: num(l.location_id) ?? i + 1, name: str(l.name), description: str(l.description), type: str(l.type), aliases: strList(l.aliases), first_appearance: num(l.first_appearance) })),
    objects: list(data.objects)
      .filter((o) => o && typeof o === 'object' && str(o.name))
      .slice(0, 200)
      .map((o, i) => ({ object_id: num(o.object_id) ?? i + 1, name: str(o.name), description: str(o.description), first_appearance: num(o.first_appearance) })),
  };
  return { board };
}

/**
 * The backend's storyboard JSON (app/prompts/storyboard_schema.json: logline and synopsis inside story_metadata,
 * scene locations as objects, dialogue as { speaker_name, text }, relationships as { source_id, type, target_id })
 * -> this page's format. Keeps the extra details it has (time of day, object category, emotion intensity).
 */
export function fromBackendBoard(data) {
  const d = data && typeof data === 'object' ? data : {};
  const meta = d.story_metadata && typeof d.story_metadata === 'object' ? d.story_metadata : {};
  const narrator = d.narrator && typeof d.narrator === 'object' ? d.narrator : {};
  // (each scene and line keeps `at`, its position in the backend's storyboard_data: editing a line uses it)
  const scenes = list(d.scenes)
    .map((sc, at) => (sc && typeof sc === 'object' ? { ...sc, __at: at } : null))
    .filter(Boolean);
  const nameOf = (id) => list(d.characters).find((c) => c && Number(c.character_id) === Number(id))?.name || '';
  const board = {
    format_version: FORMAT_VERSION,
    story_metadata: {
      title: str(meta.title),
      language: str(meta.language),
      genre: strList(meta.genre),
      style: strList(meta.style),
      narrator: narrator.present || meta.has_narrator ? 'present' : '',
      point_of_view: str(narrator.point_of_view),
      narrator_details: str(narrator.description),
    },
    logline: str(meta.logline),
    synopsis: str(meta.synopsis),
    themes: strList(meta.theme ?? meta.themes),
    characters: list(d.characters)
      .filter((c) => c && typeof c === 'object' && str(c.name))
      .map((c, i) => ({
        character_id: num(c.character_id) ?? i + 1,
        name: str(c.name),
        role: str(c.role),
        description: str(c.description),
        importance: str(c.importance),
        gender: str(c.gender),
        age_group: str(c.age_group),
        aliases: strList(c.aliases),
        first_appearance: num(c.first_appearance_scene_id),
        revealed_identity: str(c.revealed_identity),
        appearance: {
          physical_traits: str(c.appearance?.physical_traits),
          clothing: str(c.appearance?.clothing),
          special_features: str(c.appearance?.special_features),
        },
        dominant_emotions: strList(c.dominant_emotions),
      })),
    relationships: list(d.relationships)
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({ source: num(r.source_id) ?? str(r.source_id), relationship: str(r.type ?? r.relationship_type), target: num(r.target_id) ?? str(r.target_id), description: str(r.description) })),
    scenes: scenes.map((sc, i) => ({
      at: sc.__at,
      scene_id: num(sc.scene_id) ?? i + 1,
      title: str(sc.title) || `Scene ${i + 1}`,
      summary: str(sc.summary),
      location: str(typeof sc.location === 'object' ? sc.location?.name : sc.location),
      time_of_day: str(sc.location?.time_of_day),
      emotion: str(sc.overall_emotion ?? sc.emotion),
      language: str(sc.language),
      transition: str(sc.scene_transition ?? sc.transition),
      importance: str(sc.importance),
      extraction_confidence: num(sc.extraction_confidence),
      primary_action: str(sc.primary_action),
      visual_description: str(sc.visual_description),
      camera_suggestion: str(sc.camera_suggestion),
      characters_present: list(sc.characters_present)
        .map((c) => (typeof c === 'string' ? c : str(c?.name) || nameOf(c?.character_id)))
        .filter(Boolean),
      dialogues: list(sc.dialogues)
        .map((dl, at) => [dl, at])
        .filter(([dl]) => dl && typeof dl === 'object' && str(dl.text ?? dl.line))
        .map(([dl, at]) => ({ at, speaker: str(dl.speaker_name ?? dl.speaker) || nameOf(dl.speaker_id) || 'Narrator', line: str(dl.text ?? dl.line), emotion: str(dl.emotion) })),
    })),
    locations: list(d.locations)
      .filter((l) => l && typeof l === 'object' && str(l.name))
      .map((l, i) => ({ location_id: num(l.location_id) ?? i + 1, name: str(l.name), description: str(l.description), type: str(l.type), aliases: strList(l.aliases), first_appearance: num(l.first_appearance_scene_id) })),
    objects: list(d.objects)
      .filter((o) => o && typeof o === 'object' && str(o.name))
      .map((o, i) => ({ object_id: num(o.object_id) ?? i + 1, name: str(o.name), description: str(o.description), category: str(o.category), first_appearance: num(o.first_appearance_scene_id) })),
  };
  return board;
}

/* ------------------------------------------------------------------ counts and look-ups */

export function countsOf(board) {
  return {
    characters: board.characters.length,
    scenes: board.scenes.length,
    locations: board.locations.length,
    objects: board.objects.length,
    relationships: board.relationships.length,
    dialogue: board.scenes.reduce((n, sc) => n + sc.dialogues.length, 0),
  };
}

/** A character by id or name (relationships may use either). */
export function findCharacter(board, ref) {
  return board.characters.find((c) => c.character_id === ref || String(c.character_id) === String(ref)) || board.characters.find((c) => c.name.toLowerCase() === String(ref).toLowerCase()) || null;
}

/** The scene numbers a place appears in. */
export function scenesAt(board, location) {
  const names = [location.name, ...location.aliases].map((n) => n.toLowerCase());
  return board.scenes.map((sc, i) => (names.includes(sc.location.toLowerCase()) ? i + 1 : 0)).filter(Boolean);
}

/** The scene numbers a character is in. */
export function scenesWith(board, character) {
  const names = [character.name, ...character.aliases].map((n) => n.toLowerCase());
  return board.scenes.map((sc, i) => (sc.characters_present.some((n) => names.includes(n.toLowerCase())) || sc.dialogues.some((d) => names.includes(d.speaker.toLowerCase())) ? i + 1 : 0)).filter(Boolean);
}

/* ------------------------------------------------------------------ kinds of places (for the demo) */

const PLACE_WORDS = [
  ['ocean', /\b(sea|ocean|pacific|atlantic|wave|waves|shore|beach|boat|ship|deck|harbou?r|tide|underwater|reef|coast|river|lake)\b/i],
  ['city', /\b(city|street|streets|town|road|traffic|market|building|buildings|rooftop|station|alley|downtown|kingdom|palace|lanka)\b/i],
  ['interior', /\b(room|lab|laboratory|office|house|home|kitchen|inside|desk|hall|corridor|classroom|library|bedroom|cabin|studio|workshop|hut|hermitage|temple|court)\b/i],
  ['forest', /\b(forest|woods|trees|jungle|garden|park|grove)\b/i],
  ['mountain', /\b(mountains?|hills?|cliffs?|peaks?|valley|ridge)\b/i],
];
// the kind of place mentioned first in the text
const placeIn = (text) => {
  let best = '';
  let at = Infinity;
  PLACE_WORDS.forEach(([kind, re]) => {
    const m = re.exec(text);
    if (m && m.index < at) {
      at = m.index;
      best = kind;
    }
  });
  return best;
};

/* ------------------------------------------------------------------ the demo breakdown */

// sentences, never running across a line break (a heading is its own "sentence")
const sentencesOf = (text) =>
  text
    .split(/\n+/)
    .flatMap((line) =>
      line
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(?<=[.!?]["”’)]?)\s+(?=["“A-Z0-9])/),
    )
    .filter(Boolean);
const NOT_NAMES = new Set(
  'The A An And But Or So Then When While After Before As At In On Of To For From With Without Into Over Under By It Its He She They We I You His Her Their Our My Your This That These Those There Here What Who Why How Nobody Somebody Someone Everyone Everything Nothing One Two Three First Last Next Every Each Some Many More Most No Not Yes Mr Mrs Ms Dr Scene Chapter Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December God Earth Pacific Atlantic Ocean Sea North South East West'.split(
    ' ',
  ),
);
const THEMES = ['love', 'courage', 'family', 'friendship', 'hope', 'loss', 'discovery', 'duty', 'sacrifice', 'betrayal', 'freedom', 'identity', 'trust', 'fear', 'curiosity', 'home', 'change'];
const EMOTIONS = [
  ['fear', /\b(fear|afraid|scared|terrified|dread|panic)\b/i],
  ['tension', /\b(tension|tense|uneasy|danger|threat|strange|mysterious)\b/i],
  ['wonder', /\b(wonder|amazed|awe|discover|discovers|discovered|signal)\b/i],
  ['joy', /\b(joy|happy|laugh|smile|delight|celebrat)/i],
  ['sadness', /\b(sad|grief|tears|cry|cried|loss|lost|mourn)/i],
  ['hope', /\b(hope|hopeful|believe|promise|light)\b/i],
  ['determination', /\b(determined|resolve|refused|decided|must|would not)\b/i],
];
const OBJECT_WORDS = /\b(signal|screen|letter|phone|map|book|key|photo|photograph|note|device|machine|radio|clock|watch|ring|box|lamp|computer|monitor|recorder|camera|bow|sword|chariot|necklace|boat|ship)\b/gi;

const emotionOf = (text, fallback = 'calm') => EMOTIONS.find(([, re]) => re.test(text))?.[0] || fallback;
const firstSentence = (text) => sentencesOf(text)[0] || '';

function namesIn(text, known) {
  const found = [];
  known.forEach((name) => {
    if (name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text) && !found.includes(name)) found.push(name);
  });
  sentencesOf(text).forEach((sentence) => {
    sentence
      .replace(/["“”‘’(),;:!?.]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w, i) => {
        if (i === 0 || !/^[A-Z][a-z]{2,}$/.test(w) || NOT_NAMES.has(w) || found.includes(w)) return;
        found.push(w);
      });
  });
  return found;
}

const PLACE_NAMES = { ocean: 'The sea', city: 'The town', interior: 'Indoors', forest: 'The forest', mountain: 'The mountains', open: 'Open land' };
const GENERIC = [
  [/^(waves?|water|tide|ocean|sea|deep)$/i, 'The sea'],
  [/^(trees|woods|forest|jungle)$/i, 'The forest'],
  [/^(hills?|mountains?)$/i, 'The mountains'],
];
function locationIn(text) {
  const matches = [...text.matchAll(/\b(?:in|at|inside|near|on|across|into|through|above|over)\s+(?:the|a|an)\s+([a-z]+(?:\s+[a-z]+)?)\b/gi)];
  const hit = matches.map((m) => m[1]).find((w) => placeIn(w) || placeIn(w.split(' ').pop()));
  if (hit) {
    // "quiet town" keeps its describing word; "cliffs was" keeps only the place
    const [first, second] = hit.split(' ');
    const word = second && placeIn(second) ? hit : first;
    const generic = GENERIC.find(([re]) => re.test(word));
    return generic ? generic[1] : `The ${word.toLowerCase()}`;
  }
  const place = placeIn(text);
  return place ? PLACE_NAMES[place] : '';
}

const CAMERA = [
  (loc) => `Wide shot to establish ${loc ? loc.toLowerCase().replace(/^the /, 'the ') : 'the place'}.`,
  () => 'Medium shot following the main character; slow push in as the moment builds.',
  () => 'Close-up on the face to catch the reaction.',
  () => 'Over-the-shoulder shots for the conversation.',
  () => 'Low angle, slow pan across the scene.',
];

/**
 * A first storyboard made from the story's text (a demo of what the backend will return).
 * `settings` is the brief the story was written from (genre, style, characters, language), when there is one.
 */
export function buildStoryboard(story, settings = {}) {
  const all = scenesOf(story.content || '');
  // a scene that is only a heading (the story's title) is not a scene
  const scenesText = all.filter((sc, i) => !(all.length > 1 && i === 0 && sc.words <= 8 && !/[.!?]/.test(sc.text)));
  const text = scenesText.map((sc) => sc.body).join('\n\n');
  const given = Array.isArray(settings?.characters) ? settings.characters.filter((c) => c?.name) : [];
  const knownNames = given.map((c) => c.name);

  // characters: the ones in the brief, then names found in the text, most mentioned first
  const mentions = {};
  namesIn(text, knownNames).forEach((name) => {
    mentions[name] = (text.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
  });
  const found = Object.keys(mentions).filter((n) => mentions[n] >= 2 || knownNames.includes(n));
  const names = [...new Set([...knownNames, ...found.sort((a, b) => mentions[b] - mentions[a])])].slice(0, 8);
  const sceneOfName = (name) => Math.max(1, scenesText.findIndex((sc) => new RegExp(`\\b${name}\\b`, 'i').test(sc.text)) + 1);
  const characters = names.map((name, i) => {
    const brief = given.find((c) => c.name === name);
    const lines = sentencesOf(text).filter((s) => new RegExp(`\\b${name}\\b`).test(s));
    const about = lines.join(' ');
    const she = /\b(she|her)\b/i.test(about);
    const he = /\b(he|his|him)\b/i.test(about);
    return {
      character_id: i + 1,
      name,
      role: brief?.role ? brief.role.toLowerCase() : i === 0 ? 'protagonist' : 'supporting',
      description: brief?.details || firstSentence(lines[0] || '') || `${name} appears in the story.`,
      importance: i === 0 ? 'primary' : i < 3 ? 'secondary' : 'tertiary',
      gender: she && !he ? 'female' : he && !she ? 'male' : '',
      age_group: /\b(young|student|girl|boy)\b/i.test(about) ? 'young_adult' : '',
      aliases: [],
      first_appearance: sceneOfName(name),
      revealed_identity: '',
      appearance: { physical_traits: '', clothing: '', special_features: '' },
      dominant_emotions: [...new Set(EMOTIONS.filter(([, re]) => re.test(about)).map(([e]) => e))].slice(0, 3),
    };
  });

  // relationships: characters who share a sentence
  const relationships = [];
  for (let a = 0; a < characters.length; a += 1) {
    for (let b = a + 1; b < characters.length; b += 1) {
      const together = sentencesOf(text).find((s) => s.includes(characters[a].name) && s.includes(characters[b].name));
      if (together && relationships.length < 6) relationships.push({ source: a + 1, relationship: 'ally', target: b + 1, description: together });
    }
  }

  let previousPlace = '';
  const scenes = scenesText.map((sc, i) => {
    const sentences = sentencesOf(sc.body);
    const location = locationIn(sc.body) || (i > 0 ? previousPlace : '');
    previousPlace = location;
    const present = namesIn(sc.text, names).filter((n) => names.includes(n));
    const SAID = '(?:said|asked|whispered|shouted|replied|called|cried|murmured)';
    const dialogues = [...sc.body.matchAll(new RegExp(`(?:([A-Z][a-z]+)\\s+${SAID},?\\s*)?["“]([^"”]{2,300})["”]\\s*(?:,?\\s*(?:${SAID}\\s+([A-Z][a-z]+)|([A-Z][a-z]+)\\s+${SAID}))?`, 'g'))].map((m) => {
      const said = [m[3], m[4], m[1]].find((n) => n && names.includes(n));
      return { speaker: said || present[0] || 'Narrator', line: m[2].trim().replace(/,$/, '.'), emotion: emotionOf(m[2], '') };
    });
    const visual = sentences.find((s) => /\b(light|dark|sky|water|sun|moon|shadow|glow|colou?r|silent|quiet|bright)\b/i.test(s)) || sentences[1] || sentences[0] || '';
    return {
      scene_id: i + 1,
      title: sc.title,
      summary: sentences[0] || '',
      location,
      emotion: emotionOf(sc.text),
      language: 'en',
      transition: i === scenesText.length - 1 ? 'fade_out' : i === 0 ? 'fade_in' : 'cut',
      importance: i === 0 || i === scenesText.length - 1 ? 'major' : 'minor',
      extraction_confidence: 82 + ((i * 7) % 15),
      primary_action: sentences.find((s) => s !== sentences[0] && /\b[a-z]+(ed|s)\b/.test(s)) || sentences[0] || '',
      visual_description: visual,
      camera_suggestion: CAMERA[i % CAMERA.length](location),
      characters_present: present,
      dialogues,
    };
  });

  const locations = [];
  scenes.forEach((sc, i) => {
    if (!sc.location || locations.some((l) => l.name.toLowerCase() === sc.location.toLowerCase())) return;
    const where = placeIn(`${sc.location} ${sc.visual_description}`);
    locations.push({
      location_id: locations.length + 1,
      name: sc.location,
      description: sentencesOf(scenesText[i].body).find((s) => placeIn(s) === where) || sc.visual_description || sc.summary,
      type: where === 'interior' ? 'interior' : 'exterior',
      aliases: [],
      first_appearance: i + 1,
    });
  });

  const objects = [];
  scenesText.forEach((sc, i) => {
    [...sc.text.matchAll(OBJECT_WORDS)].forEach((m) => {
      const name = m[0].toLowerCase();
      if (objects.length >= 6 || objects.some((o) => o.name.toLowerCase() === name)) return;
      objects.push({ object_id: objects.length + 1, name: name.replace(/^./, (c) => c.toUpperCase()), description: sentencesOf(sc.text).find((s) => new RegExp(`\\b${name}\\b`, 'i').test(s)) || '', first_appearance: i + 1 });
    });
  });

  const lower = text.toLowerCase();
  const themes = THEMES.filter((t) => lower.includes(t)).slice(0, 5);
  const genre = Array.isArray(settings?.genre) && settings.genre.length ? settings.genre : ['Drama'];
  const style = Array.isArray(settings?.style) && settings.style.length ? settings.style : ['Cinematic'];

  return readStoryboard({
    story_metadata: {
      title: story.title,
      language: settings?.language && settings.language !== 'English' ? settings.language : 'en',
      genre,
      style,
      narrator: 'present',
      point_of_view: /\b(I|my|me)\b/.test(text) ? 'first_person' : 'third_person_omniscient',
      narrator_details: /\b(I|my|me)\b/.test(text) ? 'Told by one of the characters.' : 'A neutral observer telling the events of the story.',
    },
    logline: scenes[0]?.summary || firstSentence(text),
    synopsis: scenes
      .slice(0, 5)
      .map((sc) => sc.summary)
      .filter(Boolean)
      .join(' '),
    themes: themes.length ? themes : ['discovery', 'hope'],
    characters,
    relationships,
    scenes,
    locations,
    objects,
  }).board;
}
