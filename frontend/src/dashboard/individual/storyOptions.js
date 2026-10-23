/**
 * What can be chosen on the Story page (Creative Direction), and how it is sent to the backend
 * (POST /stories/generate, backend/services/story-service/app/schemas/story_request.py).
 */
export const GENRES = ['Drama', 'Adventure', 'Comedy', 'Romance', 'Thriller', 'Mystery', 'Science Fiction', 'Fantasy', 'Horror', 'Educational'];
export const STYLES = ['Cinematic', 'Realistic', 'Poetic', 'Descriptive', 'Fast-paced', 'Documentary', 'Narrative'];
export const TONES = ['Emotional', 'Inspirational', 'Dark', 'Humorous', 'Suspenseful', 'Serious', 'Hopeful', 'Dramatic'];
export const LANGUAGES = ['English', 'Hindi', 'Hinglish', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Spanish', 'French', 'Japanese', 'Arabic'];
// value = what the backend accepts (story_request.py), label = what the creator sees
export const POV_OPTIONS = [
  { value: 'first_person', label: 'First Person (I / We)' },
  { value: 'second_person', label: 'Second Person (You)' },
  { value: 'third_person_limited', label: 'Third Person Limited' },
  { value: 'third_person_omniscient', label: 'Third Person Omniscient' },
];
export const STORY_FORMATS = [
  { value: 'prose_narrative', label: 'Prose / Narrative' },
  { value: 'script_screenplay', label: 'Script / Screenplay' },
  { value: 'pure_dialogue', label: 'Pure Dialogue' },
  { value: 'epistolary_dialogue', label: 'Epistolary Dialogue' },
  { value: 'epistolary', label: 'Epistolary Format' },
];

export const WORDS_MIN = 100;
export const WORDS_MAX = 10000;

// The "Educational" genre (an earlier version of the page chose it as the story's Purpose).
export const EDUCATIONAL = 'Educational';

// How long each part may be: the backend's own limits (the chat message is the story idea, sent as `prompt`).
export const LIMITS = { message: 10000, setting: 2000, objective: 2000, additionalDetails: 5000 };

export const DEFAULT_SETTINGS = {
  model: '',
  language: 'English',
  pointOfView: 'first_person',
  storyFormat: 'prose_narrative',
  genre: [],
  style: [],
  tone: [],
  wordCount: 1000,
  targetAudience: '',
  subject: '',
  gradeLevel: '',
  educationalObjective: '',
  learningPoints: [],
  setting: '',
  characters: [], // [{ name, role, details }]
  additionalDetails: '',
};

// What belongs to one story (cleared for a new chat); the rest (genre, style, tone, length, audience) carries over.
const PER_STORY = { subject: '', gradeLevel: '', educationalObjective: '', learningPoints: [], setting: '', characters: [], additionalDetails: '' };

const orNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Saved settings (a story's, or an earlier version of this page's) -> the Creative Direction settings.
 * An earlier version kept characters as text ("Name (role): details" lines) and had Purpose and Knowledge;
 * those are carried over as well as they can be.
 */
export function briefFrom(saved, { keepText = true } = {}) {
  const base = { ...DEFAULT_SETTINGS };
  if (saved) {
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      if (saved[key] !== undefined && saved[key] !== null) base[key] = saved[key];
    });
    if (!Array.isArray(base.characters)) base.characters = [];
    if (!base.characters.length && saved.charactersText) {
      base.characters = saved.charactersText
        .split('\n')
        .map((line) => line.match(/^\s*(.+?)\s*\((.+?)\)\s*:\s*(.+)$/))
        .filter(Boolean)
        .map(([, name, role, details]) => ({ name: name.slice(0, 100), role: role.slice(0, 100), details: details.slice(0, 2000) }));
    }
    if (saved.purpose === EDUCATIONAL && !base.genre.includes(EDUCATIONAL)) base.genre = [...base.genre, EDUCATIONAL];
    if (saved.knowledge?.trim() && !base.additionalDetails.includes(saved.knowledge.trim())) {
      base.additionalDetails = [base.additionalDetails.trim(), `Reference material:\n${saved.knowledge.trim()}`].filter(Boolean).join('\n\n').slice(0, LIMITS.additionalDetails);
    }
  }
  return keepText ? base : { ...base, ...PER_STORY };
}

/**
 * The settings and the chat message (the story idea) -> the backend's request body (snake_case).
 * Throws an error with a clear message when the idea is missing or too long.
 */
export function toRequest(settings, message) {
  const prompt = String(message || '').trim();
  if (!prompt) throw new Error('Describe your story idea in the message box.');
  if (prompt.length > LIMITS.message) throw new Error(`The message is too long (${prompt.length.toLocaleString('en-IN')} of ${LIMITS.message.toLocaleString('en-IN')} characters). Please shorten it.`);
  return {
    model: settings.model,
    prompt,
    language: settings.language || 'English',
    point_of_view: settings.pointOfView || 'third_person_limited',
    story_format: settings.storyFormat || 'prose_narrative',
    genre: settings.genre,
    style: settings.style,
    tone: settings.tone,
    word_count: Number(settings.wordCount) || 1000,
    target_audience: orNull(settings.targetAudience),
    subject: orNull(settings.subject),
    educational_objective: orNull(settings.educationalObjective),
    grade_level: orNull(settings.gradeLevel),
    learning_points: settings.learningPoints,
    setting: orNull(settings.setting),
    characters: settings.characters.map((c) => ({ name: c.name.trim(), role: c.role.trim(), details: c.details.trim() })),
    additional_details: orNull(settings.additionalDetails),
  };
}

/** The little tags under the first message in the chat: what the story was shaped by. */
export function briefTags(settings) {
  const n = settings.characters.length;
  return [
    ...settings.genre,
    ...settings.style,
    ...settings.tone,
    `${Number(settings.wordCount).toLocaleString('en-IN')} words`,
    settings.targetAudience.trim(),
    settings.subject.trim(),
    n ? `${n} ${n === 1 ? 'character' : 'characters'}` : '',
    settings.setting.trim() && 'Setting',
  ].filter(Boolean);
}

/** "Adventure, Mystery, Cinematic" (+ how many more), for the summaries on the page. */
export function directionSummary(settings, max = 3) {
  const all = [...settings.genre, ...settings.style, ...settings.tone];
  if (!all.length) return '';
  return all.length > max ? `${all.slice(0, max).join(', ')} and ${all.length - max} more` : all.join(', ');
}

/** How many words a text has. */
export const wordsIn = (text) => (String(text || '').trim().match(/\S+/g) || []).length;
