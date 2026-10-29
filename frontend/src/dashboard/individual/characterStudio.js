/**
 * Character Studio: each character of a story gets a profile (how they look, in detail, so every image of them
 * matches) and a master image (the main picture of them that later images follow).
 *
 * The characters come from the story's storyboard (or, without one, from the story itself). For now the profile
 * and the master image are a DEMO made here in the browser: the profile is filled in from the storyboard and the
 * creator's notes, and the image is a simple drawing in the profile's colours. The backend will make both with AI
 * later; the shapes below are what it will send.
 */
import { buildStoryboard } from './storyboard.js';

export const VISUAL_STYLES = ['3D Animated', '2D Animated', 'Anime', 'Realistic', 'Cinematic', 'Watercolor', 'Comic book'];

// the image models the backend offers (app/clients/openrouter_image_client.py, IMAGE_MODELS)
export const IMAGE_MODELS = [
  { id: 'black-forest-labs/flux.2-flex', name: 'FLUX.2 Flex' },
  { id: 'qwen/qwen-image-2.1-turbo', name: 'Qwen Image 2.1 Turbo' },
  { id: 'qwen/qwen-image-2.1-pro', name: 'Qwen Image 2.1 Pro' },
  { id: 'black-forest-labs/flux.2-pro', name: 'FLUX.2 Pro' },
  { id: 'black-forest-labs/flux.2-max', name: 'FLUX.2 Max' },
  { id: 'openai/gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare' },
  { id: 'openai/gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst' },
];

/** The details that keep a character looking the same in every picture. */
export const IDENTITY_FIELDS = [
  { key: 'age_group', label: 'Age group' },
  { key: 'gender', label: 'Gender' },
  { key: 'skin_tone', label: 'Skin tone' },
  { key: 'eye_color', label: 'Eye colour' },
  { key: 'eye_shape', label: 'Eye shape' },
  { key: 'eyebrows', label: 'Eyebrows' },
  { key: 'hair_color', label: 'Hair colour' },
  { key: 'hair_style', label: 'Hair style' },
  { key: 'hair_length', label: 'Hair length' },
  { key: 'nose_shape', label: 'Nose shape' },
  { key: 'body_type', label: 'Body type' },
  { key: 'default_pose', label: 'Default pose' },
  { key: 'clothing', label: 'Clothing', wide: true },
  { key: 'accessories', label: 'Accessories', wide: true },
  { key: 'distinctive_features', label: 'Distinctive features', wide: true },
];
export const LIMITS = { notes: 1000, field: 200, prompt: 1000 };

/**
 * The profile the backend makes (app/prompts/character_profile_schema.json), grouped the way people describe
 * someone. Lists come as "a, b, c".
 */
export const LIVE_IDENTITY = {
  groups: [
    { title: 'Face', keys: ['face_shape', 'skin_tone', 'eye_color', 'eye_shape', 'eyebrow_style', 'nose_shape', 'lip_shape', 'facial_hair'] },
    { title: 'Hair', keys: ['hair_color', 'hair_style', 'hair_length'] },
    { title: 'Body', keys: ['age_group', 'gender', 'height_category', 'body_type', 'body_proportions', 'default_body_posture'] },
    { title: 'Outfit', keys: ['upper_clothing', 'lower_clothing', 'footwear', 'accessories', 'jewellery', 'weapon', 'special_features', 'color_palette', 'dominant_materials'] },
  ],
  wide: new Set(['body_proportions', 'default_body_posture', 'upper_clothing', 'lower_clothing', 'footwear', 'accessories', 'jewellery', 'weapon', 'special_features', 'color_palette', 'dominant_materials']),
  labels: {
    face_shape: 'Face shape',
    skin_tone: 'Skin tone',
    eye_color: 'Eye colour',
    eye_shape: 'Eye shape',
    eyebrow_style: 'Eyebrows',
    nose_shape: 'Nose shape',
    lip_shape: 'Lips',
    facial_hair: 'Facial hair',
    hair_color: 'Hair colour',
    hair_style: 'Hair style',
    hair_length: 'Hair length',
    age_group: 'Age group',
    gender: 'Gender',
    height_category: 'Height',
    body_type: 'Body type',
    body_proportions: 'Proportions',
    default_body_posture: 'Default pose',
    upper_clothing: 'Top',
    lower_clothing: 'Bottom',
    footwear: 'Footwear',
    accessories: 'Accessories',
    jewellery: 'Jewellery',
    weapon: 'Weapon',
    special_features: 'Distinctive features',
    color_palette: 'Colours',
    dominant_materials: 'Materials',
  },
};

const str = (v) => (typeof v === 'string' ? v.trim() : '');
export const keyOf = (name) =>
  str(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'character';

/** The characters of a story: from its storyboard when it has one, else picked out of the story. */
export function charactersOf(story, storyboard) {
  const board = storyboard?.board || buildStoryboard(story, story.settings || {});
  const seen = new Set();
  return board.characters
    .filter((c) => {
      const k = keyOf(c.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((c) => ({
      key: keyOf(c.name),
      name: c.name,
      role: c.role,
      description: c.description,
      gender: c.gender,
      age_group: c.age_group,
      appearance: c.appearance || { physical_traits: '', clothing: '', special_features: '' },
    }));
}

/* ------------------------------------------------------------------ the demo profile */

const COLOR_WORDS = 'black|brown|dark brown|light brown|blonde|golden|red|orange|yellow|green|blue|white|grey|gray|silver|purple|violet|pink|saffron|maroon|hazel|amber|auburn|copper|navy|teal|cream|beige';
const pick = (text, re) => (text.match(re) || [])[1] || '';

/** What the creator wrote ("blue eyes, black hair, red jacket") as profile fields. */
export function notesToFields(notes) {
  const text = str(notes).toLowerCase();
  const out = {};
  if (!text) return out;
  const colour = (thing) => pick(text, new RegExp(`\\b(${COLOR_WORDS})\\s+${thing}\\b`));
  if (colour('eyes?')) out.eye_color = colour('eyes?');
  if (colour('hair')) out.hair_color = colour('hair');
  const length = pick(text, /\b(short|long|shoulder[- ]length|medium[- ]length|cropped)\s+(?:\w+\s+)?hair\b/);
  if (length) out.hair_length = length;
  const style = pick(text, /\b(curly|wavy|straight|braided|bun|ponytail|spiky)\b/);
  if (style) out.hair_style = style;
  const skin = pick(text, new RegExp(`\\b(fair|light|wheatish|olive|tan|dark|deep|warm golden|pale|${COLOR_WORDS})\\s+skin(?:ned)?\\b`));
  if (skin) out.skin_tone = skin;
  const body = pick(text, /\b(athletic|slim|muscular|tall|short|stocky|petite|broad)\b/);
  if (body) out.body_type = body;
  const clothes = text.match(new RegExp(`\\b(?:(?:${COLOR_WORDS})\\s+)?(?:jacket|coat|shirt|t-shirt|dress|saree|sari|kurta|dhoti|robe|robes|hoodie|uniform|suit|armou?r|cloak|skirt|jeans|trousers)\\b`, 'g'));
  if (clothes) out.clothing = [...new Set(clothes)].join(', ');
  const acc = text.match(/\b(?:glasses|spectacles|hat|cap|scarf|necklace|earrings?|bow(?: and arrows?)?|sword|staff|watch|backpack|crown|bag|helmet)\b/g);
  if (acc) out.accessories = [...new Set(acc)].join(', ');
  const marks = text.match(/\b(?:scar|tattoo|freckles|beard|moustache|mustache|tilak|birthmark|mole)\b[^,.;]*/g);
  if (marks) out.distinctive_features = marks.map((m) => m.trim()).join(', ');
  return out;
}

const DEFAULTS = {
  female: { hair_style: 'loose waves', hair_length: 'long', eyebrows: 'soft arched', body_type: 'slim', clothing: 'simple everyday clothes' },
  male: { hair_style: 'short and neat', hair_length: 'short', eyebrows: 'straight, thick', body_type: 'athletic', clothing: 'simple everyday clothes' },
  '': { hair_style: 'neat', hair_length: 'medium', eyebrows: 'natural', body_type: 'average', clothing: 'simple everyday clothes' },
};

/**
 * A profile for a character: { style, style_notes, customization, identity: { ...IDENTITY_FIELDS }, made_at }.
 * Made from the storyboard's details, the creator's notes (which win) and sensible defaults.
 */
export function makeProfile(character, { style = VISUAL_STYLES[0], styleNotes = '', customization = '' } = {}) {
  const a = character.appearance || {};
  const gender = /^(male|female)$/i.test(character.gender) ? character.gender.toLowerCase() : '';
  const d = DEFAULTS[gender];
  const traits = [a.physical_traits, a.special_features, character.description].filter(Boolean).join(', ');
  const fromStory = notesToFields(`${traits}, ${a.clothing || ''}`);
  const fromNotes = notesToFields(customization);
  const identity = {
    age_group: (character.age_group || 'young adult').replace(/_/g, ' '),
    gender: gender || 'not stated',
    skin_tone: 'warm medium',
    eye_color: 'dark brown',
    eye_shape: 'almond',
    eyebrows: d.eyebrows,
    hair_color: 'black',
    hair_style: d.hair_style,
    hair_length: d.hair_length,
    nose_shape: 'straight',
    body_type: d.body_type,
    default_pose: 'standing upright, relaxed',
    clothing: str(a.clothing) || d.clothing,
    accessories: '',
    distinctive_features: str(a.special_features),
    ...fromStory,
    ...fromNotes,
  };
  if (str(a.clothing)) identity.clothing = fromNotes.clothing || str(a.clothing);
  Object.keys(identity).forEach((k) => {
    identity[k] = str(identity[k]).slice(0, LIMITS.field);
  });
  return { style, style_notes: str(styleNotes), customization: str(customization), identity, made_at: new Date().toISOString() };
}

/* ------------------------------------------------------------------ the demo image */

const PALETTE = {
  black: '#1d1b22',
  'dark brown': '#3b2a20',
  brown: '#6b4a32',
  'light brown': '#a07850',
  blonde: '#d8b46a',
  golden: '#d9a441',
  red: '#b3362f',
  auburn: '#8a3b22',
  copper: '#b5653a',
  orange: '#e07a2b',
  saffron: '#ef8f1f',
  yellow: '#e9c13c',
  green: '#3f7f52',
  teal: '#2b7f86',
  blue: '#3b63c4',
  navy: '#22325e',
  purple: '#6b46a8',
  violet: '#7c5ccf',
  pink: '#d47aa0',
  maroon: '#6e2234',
  white: '#ecebf0',
  cream: '#efe4cc',
  beige: '#d9c6a3',
  grey: '#8a8a94',
  gray: '#8a8a94',
  silver: '#b9bcc6',
  hazel: '#8a6a3a',
  amber: '#b9801f',
};
const SKIN = [
  [/blue/, '#5d7fc4'],
  [/fair|pale|light/, '#f0cfb4'],
  [/wheat|golden|warm/, '#d9a77e'],
  [/olive/, '#c29a6c'],
  [/tan|medium/, '#c08a62'],
  [/brown/, '#8d5a3b'],
  [/dark|deep/, '#5e3a26'],
];
const colourIn = (text, fallback) => {
  const t = str(text).toLowerCase();
  const found = Object.keys(PALETTE)
    .sort((x, y) => y.length - x.length)
    .find((c) => new RegExp(`\\b${c}\\b`).test(t));
  return found ? PALETTE[found] : fallback;
};
const coloursIn = (text) => {
  const t = str(text).toLowerCase();
  return Object.keys(PALETTE)
    .sort((x, y) => y.length - x.length)
    .map((c) => ({ c, at: t.search(new RegExp(`\\b${c}\\b`)) }))
    .filter((x) => x.at >= 0)
    .sort((x, y) => x.at - y.at)
    .map((x) => PALETTE[x.c]);
};
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
};

const BACKDROPS = {
  '3D Animated': ['#eef0f7', '#d6dbea'],
  '2D Animated': ['#f6efe4', '#e8dcc8'],
  Anime: ['#eef3fb', '#d9e4f5'],
  Realistic: ['#2a2930', '#121116'],
  Cinematic: ['#1f2433', '#0b0d14'],
  Watercolor: ['#f7f3ec', '#ebe2d3'],
  'Comic book': ['#fff6dc', '#f3e2a8'],
};

/**
 * Draw the demo master image: the character standing, front view, in the profile's colours, on a studio backdrop
 * for the chosen style. Resolves to a JPEG data URL (600 x 800).
 */
export async function drawCharacterImage(character, profile, { seed = 1 } = {}) {
  const W = 600;
  const H = 800;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const id = profile.identity;
  const [top, bottom] = BACKDROPS[profile.style] || BACKDROPS['3D Animated'];
  const dark = profile.style === 'Realistic' || profile.style === 'Cinematic';

  // backdrop and floor
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, W * 0.7);
  glow.addColorStop(0, dark ? 'rgba(140,120,255,0.18)' : 'rgba(255,255,255,0.7)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.fillStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(40,30,80,0.16)';
  g.beginPath();
  g.ellipse(W / 2, 742, 120, 16, 0, 0, Math.PI * 2);
  g.fill();

  const skin = (SKIN.find(([re]) => re.test(str(id.skin_tone).toLowerCase())) || [0, '#c08a62'])[1];
  const hair = colourIn(id.hair_color, '#1d1b22');
  const clothes = coloursIn(id.clothing);
  const garment = (words) => {
    const m = str(id.clothing).toLowerCase().match(new RegExp(`\\b([a-z]+(?: [a-z]+)?)\\s+(?:[a-z-]+\\s+)?(?:${words})\\b`));
    return m ? colourIn(m[1], '') : '';
  };
  const topCloth = clothes[0] || ['#5b4bb5', '#2f6f8f', '#8a3b52', '#3f6f4f'][seed % 4];
  const lowCloth = garment('dhoti|trousers|pants|jeans|skirt|shorts|pyjamas?|dress|saree|sari|lehenga') || (dark ? '#4a4558' : '#3a3646');
  const sash = garment('sash|scarf|angavastram|dupatta|shawl|stole');
  const female = /female/i.test(id.gender);
  const broad = /athletic|muscular|broad|tall/i.test(id.body_type) ? 1.1 : /slim|petite/i.test(id.body_type) ? 0.92 : 1;
  const cx = W / 2;
  const outline = dark ? 'rgba(255,255,255,0.08)' : 'rgba(30,20,60,0.22)';
  const fill = (color, path) => {
    g.fillStyle = color;
    g.fill(path);
    g.strokeStyle = outline;
    g.lineWidth = 2;
    g.stroke(path);
  };
  const P = (fn) => {
    const p = new Path2D();
    fn(p);
    return p;
  };

  // long hair behind the head
  if (/long|shoulder|waist/i.test(id.hair_length) && !/bun/i.test(id.hair_style)) {
    fill(hair, P((p) => p.roundRect(cx - 58, 150, 116, female ? 210 : 150, 40)));
  }
  // legs / lower garment
  const hip = 72 * broad;
  if (female && /dress|saree|sari|skirt|gown|robe/i.test(id.clothing)) {
    fill(lowCloth, P((p) => {
      p.moveTo(cx - hip * 0.9, 430);
      p.lineTo(cx + hip * 0.9, 430);
      p.lineTo(cx + hip * 1.5, 728);
      p.lineTo(cx - hip * 1.5, 728);
      p.closePath();
    }));
  } else {
    fill(lowCloth, P((p) => p.roundRect(cx - hip, 430, hip - 6, 300, [8, 8, 14, 14])));
    fill(lowCloth, P((p) => p.roundRect(cx + 6, 430, hip - 6, 300, [8, 8, 14, 14])));
  }
  // feet
  fill(shade('#2a2433', dark ? 1.4 : 1), P((p) => p.roundRect(cx - hip + 2, 722, hip - 10, 18, 8)));
  fill(shade('#2a2433', dark ? 1.4 : 1), P((p) => p.roundRect(cx + 8, 722, hip - 10, 18, 8)));
  // arms
  const shoulder = 92 * broad;
  fill(skin, P((p) => p.roundRect(cx - shoulder - 26, 236, 34, 210, 17)));
  fill(skin, P((p) => p.roundRect(cx + shoulder - 8, 236, 34, 210, 17)));
  // torso
  fill(topCloth, P((p) => {
    p.moveTo(cx - shoulder, 236);
    p.quadraticCurveTo(cx, 214, cx + shoulder, 236);
    p.lineTo(cx + shoulder - 6, 330);
    p.lineTo(cx + hip, 446);
    p.lineTo(cx - hip, 446);
    p.lineTo(cx - shoulder + 6, 330);
    p.closePath();
  }));
  // sleeves
  fill(topCloth, P((p) => p.roundRect(cx - shoulder - 28, 232, 40, 90, 18)));
  fill(topCloth, P((p) => p.roundRect(cx + shoulder - 12, 232, 40, 90, 18)));
  // a sash or scarf across the chest
  if (sash) {
    fill(sash, P((p) => {
      p.moveTo(cx - shoulder + 10, 238);
      p.lineTo(cx - shoulder + 40, 232);
      p.lineTo(cx + hip, 430);
      p.lineTo(cx + hip - 34, 440);
      p.closePath();
    }));
  }
  // neck and head
  fill(skin, P((p) => p.roundRect(cx - 18, 196, 36, 40, 10)));
  fill(skin, P((p) => p.ellipse(cx, 150, 50, 60, 0, 0, Math.PI * 2)));
  // hair on top
  fill(hair, P((p) => {
    p.moveTo(cx - 52, 150);
    p.bezierCurveTo(cx - 56, 78, cx + 56, 78, cx + 52, 150);
    p.bezierCurveTo(cx + 40, 118, cx - 30, 108, cx - 52, 150);
    p.closePath();
  }));
  if (/bun|top knot/i.test(id.hair_style)) fill(hair, P((p) => p.ellipse(cx, 84, 22, 20, 0, 0, Math.PI * 2)));
  // eyes and brows (a calm, simple face)
  const eye = colourIn(id.eye_color, '#3b2a20');
  g.fillStyle = eye;
  g.beginPath();
  g.ellipse(cx - 18, 152, 5, 4, 0, 0, Math.PI * 2);
  g.ellipse(cx + 18, 152, 5, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = hair;
  g.lineWidth = /thick/i.test(id.eyebrows) ? 4 : 2.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 28, 138);
  g.lineTo(cx - 9, 136);
  g.moveTo(cx + 9, 136);
  g.lineTo(cx + 28, 138);
  g.stroke();
  g.strokeStyle = shade(skin.startsWith('#') ? skin : '#c08a62', 0.7);
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx - 9, 182);
  g.quadraticCurveTo(cx, 187, cx + 9, 182);
  g.stroke();
  if (/tilak/i.test(id.distinctive_features)) {
    g.strokeStyle = '#e5533d';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, 112);
    g.lineTo(cx, 130);
    g.stroke();
  }
  // things they carry
  const acc = `${id.accessories} ${id.distinctive_features}`.toLowerCase();
  if (/\bbow\b/.test(acc)) {
    const bowX = cx + shoulder - 100; // the bow's curve reaches just past the right hand
    g.strokeStyle = '#8a5a2b';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(bowX, 400, 210, -Math.PI * 0.42, Math.PI * 0.42);
    g.stroke();
    g.strokeStyle = 'rgba(80,60,40,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(bowX + 210 * Math.cos(-Math.PI * 0.42), 400 + 210 * Math.sin(-Math.PI * 0.42));
    g.lineTo(bowX + 210 * Math.cos(Math.PI * 0.42), 400 + 210 * Math.sin(Math.PI * 0.42));
    g.stroke();
  }
  if (/sword|staff/.test(acc)) {
    g.strokeStyle = /sword/.test(acc) ? '#c9ccd6' : '#7a5530';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(cx - shoulder - 10, 446);
    g.lineTo(cx - shoulder - 40, /sword/.test(acc) ? 250 : 120);
    g.stroke();
  }
  if (/glasses|spectacles/.test(acc)) {
    g.strokeStyle = '#2a2433';
    g.lineWidth = 2.5;
    g.strokeRect(cx - 30, 144, 22, 16);
    g.strokeRect(cx + 8, 144, 22, 16);
  }
  if (/crown/.test(acc)) {
    fill('#e3b341', P((p) => {
      p.moveTo(cx - 40, 100);
      p.lineTo(cx - 34, 70);
      p.lineTo(cx - 14, 90);
      p.lineTo(cx, 64);
      p.lineTo(cx + 14, 90);
      p.lineTo(cx + 34, 70);
      p.lineTo(cx + 40, 100);
      p.closePath();
    }));
  }
  return canvas.toDataURL('image/jpeg', 0.86);
}

/** An image the creator uploads, as a JPEG data URL no larger than 900 px. */
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Choose an image.'));
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('Choose a PNG, JPG, WEBP or GIF image.'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('This image is larger than 15 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be opened.'));
    };
    img.src = url;
    return undefined;
  });
}

/** A colour dot for a colour detail ("skin_tone", "eye_color", "hair_color"), or '' when the value names none. */
export function swatchOf(field, value) {
  if (!str(value)) return '';
  if (field === 'skin_tone') return (SKIN.find(([re]) => re.test(str(value).toLowerCase())) || [0, ''])[1];
  if (field === 'eye_color' || field === 'hair_color') return colourIn(value, '');
  return '';
}