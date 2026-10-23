/**
 * Writing a story with AI (the studio, /app). These two match the backend's own endpoints exactly:
 *
 *   GET  /models              -> { models: [ { id, name, provider, description } ] }
 *   POST /stories/generate    { model, prompt, language, genre[], style[], tone[], word_count, target_audience,
 *                               setting, characters: [ { name, role, details } ], additional_details }
 *                             -> { title, content }
 *   (word_count is 100 to 10000; 502 { detail } when the AI provider fails)
 *   editStory() (asking for changes in the Story page's chat, and AI Edit in the Story Editor) uses the same
 *   endpoint to rewrite an existing story.
 *
 * With no backend (VITE_API_URL empty) they answer with a short made-up story after a pause, so the page can be tried.
 */
import { isBackendConnected, request, wait } from './api.js';

const DEMO_MODELS = [
  { id: 'qwen/qwen3-30b-a3b', name: 'Qwen 3 30B', provider: 'OpenRouter', description: 'Fast and inexpensive, good for first drafts.' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'OpenRouter', description: 'Quick, with strong long-form writing.' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenRouter', description: 'Reliable and well-rounded.' },
];

export async function listModels() {
  if (!isBackendConnected) {
    await wait(250);
    return DEMO_MODELS;
  }
  const data = await request('/models');
  return data?.models ?? [];
}

export async function generateStory(input) {
  if (isBackendConnected) return request('/stories/generate', { method: 'POST', body: input });
  await wait(1800);
  return demoStory(input);
}

/**
 * AI Edit (the Story Editor): rewrite a story following an instruction, e.g. "make the ending more emotional".
 * The backend has no edit endpoint yet, so this asks POST /stories/generate to rewrite it: the instruction and the
 * whole story go in the prompt (its limit is 10,000 characters, so a longer story is refused here with a clear message).
 * Resolves { title, content }: the proposed new version. Nothing is saved here.
 * `extra` (from the Story page's chat) adds the Creative Direction (genre, style, tone, setting, characters...) to the
 * request, so a rewrite keeps to it; the story keeps its own length either way.
 */
export const AI_EDIT_LIMIT = 10000;

export async function editStory({ title, content, instruction, model, language = 'English', extra = null }) {
  const ask = instruction.trim();
  const prompt = [
    `Rewrite the story below. Follow this instruction: ${ask}`,
    'Keep the same characters, setting and plot unless the instruction asks to change them. Return the complete revised story.',
    `Title: ${title.trim()}`,
    content.trim(),
  ].join('\n\n');
  if (prompt.length > AI_EDIT_LIMIT) {
    throw Object.assign(new Error(`This story is too long for AI Edit (it can rewrite stories of up to about ${(AI_EDIT_LIMIT - 400).toLocaleString('en-IN')} characters). Edit it by hand, or shorten it first.`), { status: 422 });
  }
  if (!isBackendConnected) {
    await wait(1600);
    return {
      title: title.trim(),
      // (an earlier demo note is replaced, so asking for several changes does not pile them up)
      content: `${content.trim().replace(/\n\n\(Demo AI edit for "[^\n]*\)$/, '')}\n\n(Demo AI edit for "${ask}". Connect the backend to have the AI rewrite the story.)`,
    };
  }
  const length = Math.min(10000, Math.max(100, (content.trim().match(/\S+/g) || []).length));
  const result = await request('/stories/generate', {
    method: 'POST',
    body: { genre: [], style: [], tone: [], characters: [], learning_points: [], ...(extra || {}), model, prompt, language, word_count: length },
  });
  return { title: result?.title || title.trim(), content: result?.content || '' };
}

// DEMO ONLY: a short story shaped by what was chosen, so the result area can be seen filled in.
const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'from', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'about', 'who', 'that']);
const lowerFirst = (text) => (/^[A-Z](?:[a-z]|\s)/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

function demoStory({ prompt, tone = [], characters = [], setting }) {
  // the Story page sends the plot, then "Characters:" and the characters as text
  const [plotPart, castPart = ''] = prompt.split(/\n\nCharacters:\n/);
  const idea = plotPart.trim().replace(/\s+/g, ' ');
  // the title: the first few words of the idea, without a dangling "a", "of", "the"...
  const words = idea.split(/[.!?]/)[0].split(' ').slice(0, 6);
  while (words.length > 2 && STOP.has(words[words.length - 1].toLowerCase())) words.pop();
  const short = words.join(' ').replace(/[.,!?;:]+$/, '');
  const title = short.charAt(0).toUpperCase() + short.slice(1);
  // the cast: names at the start of each line of the characters text ("Maya (scientist): ..." -> Maya)
  const named = castPart
    .split('\n')
    .map((line) => line.split(/[(:,\-–]/)[0].trim())
    .filter((name) => name && name.split(' ').length <= 4)
    .map((name) => ({ name }));
  const [hero = { name: 'Mira' }, friend] = [...characters.filter((ch) => ch.name), ...named];
  const place = setting ? lowerFirst(setting.trim().replace(/[.!?]+$/, '')) : 'a quiet town at the edge of the map';
  const mood = tone.length ? tone.slice(0, 2).map((t) => t.toLowerCase()).join(' and ') : 'strange and hopeful';
  return {
    title,
    content: [
      `Nobody expected much to happen at ${place}, least of all ${hero.name}. That changed on the morning everything began. ${idea}`,
      `At first it felt small, the kind of thing you could explain away. But the day kept tilting, and by noon ${hero.name} understood that turning back was no longer one of the choices.${friend ? ` ${friend.name} was not convinced, and said so more than once.` : ''}`,
      `What followed was ${mood} in a way ${hero.name} had never known. Every step revealed a little more, and every answer came with a new question folded inside it.`,
      `By the time the light began to fade, ${hero.name} was not the same person who had woken up that morning, and nothing would ever look quite the same again.`,
      '(Demo story: connect the backend to write real stories with the chosen AI model.)',
    ].join('\n\n'),
  };
}
