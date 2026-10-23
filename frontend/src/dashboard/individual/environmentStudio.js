/**
 * Environment Studio: every place where the story happens gets a profile (the details that keep it looking the
 * same in every shot) and a master image, just like a character.
 *
 * The places come from the story's storyboard ("locations"; the backend will send the same list). For now the
 * profile and the image are a DEMO made here in the browser: the profile is filled in from the storyboard (the
 * place's description and the scenes set there) and the creator's notes, and the image is a painted landscape for
 * that kind of place (sketchStudio.js). The backend will make both with AI later, in the same shapes.
 */
import { keyOf } from './characterStudio.js';
import { drawSceneSketch, placeKind, timeOfDay } from './sketchStudio.js';
import { buildStoryboard } from './storyboard.js';

export const LOCATION_STYLES = ['Cinematic 3D Animation', '3D Animated', '2D Animated', 'Anime', 'Realistic', 'Cinematic', 'Watercolor', 'Comic book'];
export const DEFAULT_STYLE_NOTES = 'High-quality cinematic environment, detailed materials, atmospheric lighting, rich colours, professional animated film quality.';

/** The details that keep a place looking the same in every image, in the order they are shown. */
export const LOCATION_FIELDS = [
  { key: 'environment', label: 'Environment' },
  { key: 'location_type', label: 'Location type' },
  { key: 'geography', label: 'Geography', wide: true },
  { key: 'architecture', label: 'Architecture', wide: true },
  { key: 'layout', label: 'Layout', wide: true },
  { key: 'key_landmarks', label: 'Landmarks', wide: true },
  { key: 'lighting', label: 'Lighting', wide: true },
  { key: 'time_of_day', label: 'Time of day' },
  { key: 'weather', label: 'Weather' },
  { key: 'atmosphere', label: 'Atmosphere' },
  { key: 'colour_palette', label: 'Colour palette', wide: true },
];

/** The place profile the backend makes (app/prompts/location_profile_schema.json), in the page's three groups. */
export const LIVE_PLACE = {
  groups: [
    { title: 'Place', keys: ['location_type', 'environment', 'geography', 'vegetation', 'background_elements'] },
    { title: 'Structures', keys: ['architecture', 'layout_and_spatial_structure', 'landmarks', 'surface_materials'] },
    { title: 'Light & mood', keys: ['lighting', 'time_of_day', 'weather_and_atmosphere', 'color_palette', 'camera_and_composition', 'visual_consistency_rules'] },
  ],
  wide: new Set(['environment', 'geography', 'vegetation', 'background_elements', 'architecture', 'layout_and_spatial_structure', 'landmarks', 'surface_materials', 'lighting', 'weather_and_atmosphere', 'color_palette', 'camera_and_composition', 'visual_consistency_rules']),
  labels: {
    location_type: 'Location type',
    environment: 'Environment',
    geography: 'Geography',
    vegetation: 'Vegetation',
    background_elements: 'In the background',
    architecture: 'Architecture',
    layout_and_spatial_structure: 'Layout',
    landmarks: 'Landmarks',
    surface_materials: 'Materials',
    lighting: 'Lighting',
    time_of_day: 'Time of day',
    weather_and_atmosphere: 'Weather and atmosphere',
    color_palette: 'Colour palette',
    camera_and_composition: 'Camera',
    visual_consistency_rules: 'Keep the same',
  },
};

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * The places of a story: { key, name, description, type, scenes: [numbers], firstScene }.
 * From its storyboard's locations; a storyboard without them (or no storyboard) gives the scenes' places.
 */
export function locationsOf(story, storyboard) {
  const board = storyboard?.board || buildStoryboard(story, story.settings || {});
  const sceneNos = (names) => board.scenes.map((sc, i) => (names.some((n) => n && sc.location.toLowerCase() === n.toLowerCase()) ? i + 1 : 0)).filter(Boolean);
  let list = board.locations.map((l) => ({ name: l.name, description: l.description, type: l.type, aliases: l.aliases || [], first: l.first_appearance }));
  if (!list.length) {
    const seen = new Set();
    board.scenes.forEach((sc, i) => {
      const name = str(sc.location);
      if (!name || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      list.push({ name, description: sc.visual_description || sc.summary, type: '', aliases: [], first: i + 1 });
    });
  }
  const keys = new Set();
  list = list.filter((l) => {
    const k = keyOf(l.name);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
  return list.map((l) => {
    const scenes = sceneNos([l.name, ...l.aliases]);
    const there = scenes.map((n) => board.scenes[n - 1]);
    return {
      key: keyOf(l.name),
      name: l.name,
      description: str(l.description),
      type: str(l.type),
      scenes: scenes.length ? scenes : l.first ? [l.first] : [],
      // what the scenes set here say about it (used to fill in the profile)
      sceneText: there.map((sc) => `${sc.visual_description} ${sc.summary} ${sc.primary_action}`).join(' '),
      emotions: there.map((sc) => sc.emotion).filter(Boolean),
    };
  });
}

/* ------------------------------------------------------------------ the demo profile */

const KIND = {
  forest: { environment: 'dense natural forest', type: 'forest', geography: 'towering old trees, winding dirt paths and moss-covered rocks', layout: 'a path leading into a clearing, trees closing in on both sides', palette: 'deep greens, warm browns, golden light' },
  ocean: { environment: 'open sea and coast', type: 'coast', geography: 'wide open water, rolling waves and a far horizon', layout: 'the water filling the lower half, sky and horizon above', palette: 'deep blues, sea greens, silver highlights' },
  city: { environment: 'busy town or kingdom', type: 'urban', geography: 'streets and squares between closely built buildings', layout: 'a main street or square at the centre, buildings rising around it', palette: 'sandstone, terracotta, gold accents' },
  interior: { environment: 'interior space', type: 'interior', geography: 'an enclosed room', layout: 'a main room with a window on one wall, furniture along the sides', palette: 'warm woods, soft creams, lamp light' },
  mountain: { environment: 'mountain landscape', type: 'mountains', geography: 'high peaks, rocky slopes and deep valleys', layout: 'peaks in the distance, a valley or ridge in front', palette: 'slate greys, snow white, cool blues' },
  open: { environment: 'open countryside', type: 'open land', geography: 'gentle hills, open fields and scattered trees', layout: 'open ground in front, hills on the horizon', palette: 'grass greens, earthy browns, soft sky blue' },
};
const LIGHT = {
  day: 'soft natural daylight',
  dawn: 'cool early light with a warm glow on the horizon',
  dusk: 'warm golden light with long shadows',
  night: 'moonlight with deep blue shadows',
};
const MOOD = {
  peace: 'calm and serene',
  calm: 'calm and quiet',
  joy: 'bright and joyful',
  hope: 'hopeful and warm',
  wonder: 'magical and full of wonder',
  tension: 'tense and uneasy',
  fear: 'dark and threatening',
  sadness: 'heavy and sorrowful',
  determination: 'charged and purposeful',
};
const LANDMARKS = [
  [/\b(river|stream|brook)\b/i, 'a river'],
  [/\b(lake|pond)\b/i, 'a lake'],
  [/\b(hut|hermitage|cottage|ashram)\b/i, 'a small hut'],
  [/\b(palace)\b/i, 'a grand palace'],
  [/\b(temple)\b/i, 'a temple'],
  [/\b(tower|towers)\b/i, 'tall towers'],
  [/\b(bridge)\b/i, 'a bridge'],
  [/\b(boat|ship)\b/i, 'boats on the water'],
  [/\b(banyan|old tree|great tree)\b/i, 'an ancient tree'],
  [/\b(gate|gates|walls?)\b/i, 'city walls and gates'],
  [/\b(market)\b/i, 'a market'],
  [/\b(lab|laboratory|desk|screen|radio)\b/i, 'a desk with equipment'],
];

function architectureFor(kind, text) {
  if (/\b(palace|kingdom|fort|castle)\b/i.test(text)) return 'grand palace of stone with towers, domes and decorated walls';
  if (/\b(hut|hermitage|cottage|ashram)\b/i.test(text)) return 'small traditional thatched hut of wood, bamboo and dried leaves';
  if (/\b(temple)\b/i.test(text)) return 'carved stone temple with pillars';
  if (kind === 'city') return 'closely built houses and shops along the streets';
  if (kind === 'interior') return 'plain walls, a window and simple furniture';
  return 'no buildings; a natural environment';
}

/**
 * A profile for a place: { style, style_notes, customization, identity: { ...LOCATION_FIELDS }, made_at }.
 * Made from the place's description, the scenes set there and the creator's notes (`requirements`, which win for
 * time of day and weather).
 */
export function makeLocationProfile(location, { style = LOCATION_STYLES[0], styleNotes = DEFAULT_STYLE_NOTES, requirements = '' } = {}) {
  const text = `${location.name}. ${location.description} ${location.sceneText}`;
  const pseudo = { location: location.name, visual_description: location.description, summary: location.sceneText, primary_action: '' };
  const kind = /interior/i.test(location.type) ? 'interior' : placeKind(pseudo);
  const k = KIND[kind];
  const time = timeOfDay(pseudo, requirements);
  const weather = /\b(storm|thunder)\b/i.test(`${requirements} ${text}`) ? 'stormy' : /\b(rain|monsoon)\b/i.test(`${requirements} ${text}`) ? 'rainy' : /\b(fog|mist|misty)\b/i.test(`${requirements} ${text}`) ? 'misty' : /\b(snow)\b/i.test(`${requirements} ${text}`) ? 'snowy' : 'clear';
  const landmarks = [...new Set(LANDMARKS.filter(([re]) => re.test(`${text} ${requirements}`)).map(([, v]) => v))];
  const mood = location.emotions.map((e) => MOOD[e.toLowerCase()]).find(Boolean) || (time === 'night' ? 'quiet and mysterious' : 'calm and inviting');
  const lighting = kind === 'forest' && (time === 'day' || time === 'dawn') ? 'dappled sunlight filtering through the canopy, golden rays' : kind === 'interior' ? `${time === 'night' ? 'warm lamp light' : 'daylight through the window'}, soft shadows` : LIGHT[time];
  const geography = landmarks.includes('a river') && !k.geography.includes('river') ? `${k.geography}, with a river running through` : k.geography;
  const identity = {
    environment: /\b(sacred|holy|ancient)\b/i.test(text) ? `ancient, sacred ${k.environment}` : k.environment,
    location_type: `${/interior/i.test(location.type) || kind === 'interior' ? 'indoor' : 'outdoor'} ${k.type}`,
    geography,
    architecture: architectureFor(kind, `${text} ${requirements}`),
    layout: k.layout,
    key_landmarks: landmarks.join(', '),
    lighting,
    time_of_day: time,
    weather,
    atmosphere: mood,
    colour_palette: time === 'night' ? `${k.palette.split(',')[0]}, deep blues, silver moonlight` : k.palette,
  };
  return { style, style_notes: str(styleNotes), customization: str(requirements), identity, made_at: new Date().toISOString() };
}

/** The demo master image of a place (a 960 x 540 JPEG data URL), from its profile. */
export function drawLocationImage(location, profile, { seed = 1, prompt = '' } = {}) {
  const id = profile?.identity || {};
  const scene = {
    no: seed,
    location: `${location.name} ${id.environment || ''} ${id.location_type || ''}`,
    visual_description: `${location.description} ${id.key_landmarks || ''} ${id.architecture?.startsWith('no buildings') ? '' : id.architecture || ''}`,
    summary: `${id.time_of_day || ''} ${id.weather || ''}`,
    primary_action: '',
  };
  return drawSceneSketch(scene, { seed, prompt: `${prompt} ${id.time_of_day === 'day' ? '' : id.time_of_day || ''}` });
}
