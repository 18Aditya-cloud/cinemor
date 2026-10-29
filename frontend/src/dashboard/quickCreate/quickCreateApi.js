/**
 * Quick Create: the six tools that make one thing on their own, outside any project
 * (backend: app/api/routes/quick_create_routes.py, /api/quick-create/...).
 *
 * They need the backend (they call the AI models); without one, every call says so.
 */
import { isBackendConnected, request } from '../../services/api.js';

const BASE = '/api/quick-create';

const offline = () => Promise.reject(Object.assign(new Error('Quick Create needs the Cinemor server. Please connect the backend.'), { status: 0 }));

/** One saved thing, as the pages use it. */
export const itemView = (x) => ({
  id: x.id,
  kind: x.kind,
  status: x.status,
  title: x.title,
  prompt: x.prompt,
  model: x.model_id,
  settings: x.settings || {},
  hasFile: x.has_file,
  mime: x.mime_type || '',
  hasSource: x.has_source,
  content: x.content || {},
  error: x.error || '',
  createdAt: x.created_at ? Date.parse(x.created_at) : null,
  updatedAt: x.updated_at ? Date.parse(x.updated_at) : null,
});

/** Models, voices, ratios and limits for the tools. */
export async function getOptions() {
  if (!isBackendConnected) return offline();
  const d = await request(`${BASE}/options`);
  return {
    pictureModels: d.picture_models || [],
    storyModels: d.story_models || [],
    videoModels: d.video_models || [],
    defaultVideoModel: d.default_video_model || '',
    audioModels: d.audio_models || [],
    ratios: d.aspect_ratios || ['16:9', '9:16', '1:1'],
    limits: d.limits || {},
  };
}

/** Character, location or image: resolves the new pictures. */
export async function createPictures({ kind, model, prompt, ratio, count, details = {}, improve = false, references = [] }) {
  if (!isBackendConnected) return offline();
  const d = await request(`${BASE}/pictures`, {
    method: 'POST',
    body: { kind, model_id: model, prompt: prompt.trim(), aspect_ratio: ratio, count: Number(count) || 1, details, improve, references },
  });
  return (d.items || []).map(itemView);
}

/** A story from the story module's request body (see individual/storyOptions.js, toRequest). */
export async function createStory(body) {
  if (!isBackendConnected) return offline();
  return itemView(await request(`${BASE}/stories`, { method: 'POST', body }));
}

/** An AI edit; the story comes back with the new version shown. */
export async function editStory(id, instruction) {
  if (!isBackendConnected) return offline();
  return itemView(await request(`${BASE}/stories/${Number(id)}/edit`, { method: 'POST', body: { instruction: instruction.trim() } }));
}

export async function showStoryVersion(id, number) {
  if (!isBackendConnected) return offline();
  return itemView(await request(`${BASE}/stories/${Number(id)}/version`, { method: 'POST', body: { number: Number(number) } }));
}

/** Starts an avatar video; it is made in the background (read it again with getItem). */
export async function createAvatarVideo({ file, script, model, ratio, language, voiceStyle, consent }) {
  if (!isBackendConnected) return offline();
  const form = new FormData();
  form.append('image', file);
  form.append('script', script.trim());
  form.append('model_id', model);
  form.append('aspect_ratio', ratio);
  form.append('language', language || 'English');
  form.append('voice_style', voiceStyle || '');
  form.append('consent', consent ? 'true' : 'false');
  return itemView(await request(`${BASE}/avatar-videos`, { method: 'POST', body: form }));
}

export async function createAudio({ model, voice, text, instructions, speed, language }) {
  if (!isBackendConnected) return offline();
  return itemView(
    await request(`${BASE}/audio`, {
      method: 'POST',
      body: { model_id: model, voice, text: text.trim(), instructions: (instructions || '').trim(), speed: Number(speed) || 1, language: language || '' },
    }),
  );
}

/** The library; `kind`: picture | character | location | image | story | avatar_video | audio, or all. */
export async function listItems(kind = '', limit = 60) {
  if (!isBackendConnected) return offline();
  const q = new URLSearchParams({ limit: String(limit) });
  if (kind) q.set('kind', kind);
  const d = await request(`${BASE}/items?${q}`);
  return (d.items || []).map(itemView);
}

export async function getItem(id) {
  if (!isBackendConnected) return offline();
  return itemView(await request(`${BASE}/items/${Number(id)}`));
}

export async function deleteItem(id) {
  if (!isBackendConnected) return offline();
  await request(`${BASE}/items/${Number(id)}`, { method: 'DELETE' });
  forget(id);
}

/** Deletes several things at once (ones still being made are kept). Resolves how many were deleted. */
export async function deleteMany(ids) {
  if (!isBackendConnected) return offline();
  const d = await request(`${BASE}/items/delete`, { method: 'POST', body: { ids: ids.map(Number) } });
  ids.forEach(forget);
  return d?.deleted ?? 0;
}

/** A picture file -> a data URL, for reference pictures. */
export const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That picture could not be read.'));
    reader.readAsDataURL(file);
  });

/* ------------------------------------------------------------------ files (behind the sign-in: fetched, then shown) */
const urls = new Map();
const forget = (id) => {
  for (const key of [`${id}`, `${id}/source`]) {
    if (urls.has(key)) {
      URL.revokeObjectURL(urls.get(key));
      urls.delete(key);
    }
  }
};

/** The result file (or, with source, the uploaded picture) as an object URL. */
export async function fileUrl(id, { source = false } = {}) {
  const key = source ? `${id}/source` : `${id}`;
  if (urls.has(key)) return urls.get(key);
  const blob = await request(`${BASE}/items/${Number(id)}/file${source ? '?source=1' : ''}`, { as: 'blob' });
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

/** Saves the result to the computer. */
export async function download(item) {
  const url = await fileUrl(item.id);
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }[item.mime] || 'bin';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(item.title || item.kind).replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || item.kind}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}