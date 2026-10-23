/**
 * The individual dashboard on the real backend (VITE_API_URL set): every call goes to
 * backend/services/story-service/app/api/routes/individual_routes.py (prefix /api/individual).
 *
 * individualApi.js uses these when a backend is connected, so the pages get the same shapes in both modes
 * (camelCase here; the backend's snake_case is mapped in one place per kind of record).
 *
 * A few things the backend does not keep are kept in this browser, per signed-in user (localStorage
 * 'cm-individual-local'): how a project is being built (Layer by layer / One-click), each story's chat (the
 * messages shown on the Story page; the story itself and every version are on the server), whether a story was
 * made in the One-click workshop, which image is a character's or place's main one, and which sketch is a scene's
 * main one. Losing them never loses work: the stories, storyboards, profiles, images, sketches and videos are all
 * on the server.
 */
import { currentSession, request } from '../../services/api.js';
import { fromBackendBoard } from './storyboard.js';

// Where a project's AI work is: the creator's own project (/api/individual/projects/{id}), or, in the employee
// dashboard, an organization project's work (/api/employee/projects/{id}/work, same paths below it).
const OWN_PROJECTS = (projectId) => `/api/individual/projects/${Number(projectId)}`;
let projectBase = OWN_PROJECTS;
export function setProjectApiBase(base) {
  projectBase = base || OWN_PROJECTS;
}
const P = (projectId) => projectBase(projectId);
const S = (projectId, storyId) => `${P(projectId)}/stories/${Number(storyId)}`;
const fail = (message, status) => Object.assign(new Error(message), { status });
const clean = (v) => (typeof v === 'string' ? v.trim() : v ?? '');
const orNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const words = (text) => (String(text || '').trim().match(/\S+/g) || []).length;
const isMissing = (err) => err?.status === 404;

/* =========================================================================================== kept in this browser */
const LOCAL_KEY = 'cm-individual-local';
let localAll = {};
try {
  localAll = JSON.parse(window.localStorage.getItem(LOCAL_KEY)) || {};
} catch {
  /* storage blocked: kept in memory for this visit */
}
function local() {
  const who = String(currentSession()?.id ?? currentSession()?.email ?? 'me');
  if (!localAll[who]) localAll[who] = {};
  const l = localAll[who];
  ['buildMode', 'chats', 'storyMeta', 'imageChoice', 'imageMeta', 'sketchChoice'].forEach((k) => {
    if (!l[k] || typeof l[k] !== 'object') l[k] = {};
  });
  return l;
}
function saveLocal() {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(localAll));
  } catch {
    /* full or blocked: keep going in memory */
  }
}

/* ================================================================================================= clients */
const toClient = (c, projects = []) => ({
  id: c.id,
  name: c.name || '',
  email: c.email || '',
  phone: c.phone || '',
  companyName: c.company_name || '',
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  projectCount: projects.filter((p) => p.client_id === c.id).length,
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function clientBody(values) {
  if (!clean(values.name)) throw fail('Enter the client name.', 422);
  if (clean(values.email) && !EMAIL.test(clean(values.email))) throw fail('Enter a valid email address, like client@company.com.', 422);
  return { name: clean(values.name), email: orNull(values.email), phone: orNull(values.phone), company_name: orNull(values.companyName) };
}

export async function listClients() {
  const [clients, projects] = await Promise.all([request('/api/individual/clients'), request('/api/individual/projects')]);
  return clients.map((c) => toClient(c, projects));
}
export async function getClient(id) {
  const [client, projects] = await Promise.all([request(`/api/individual/clients/${Number(id)}`), request('/api/individual/projects')]);
  return toClient(client, projects);
}
export async function createClient(values) {
  return toClient(await request('/api/individual/clients', { method: 'POST', body: clientBody(values) }));
}
export async function updateClient(id, values) {
  const [client, projects] = await Promise.all([request(`/api/individual/clients/${Number(id)}`, { method: 'PATCH', body: clientBody(values) }), request('/api/individual/projects')]);
  return toClient(client, projects);
}
export async function deleteClient(id) {
  const [client, projects] = await Promise.all([request(`/api/individual/clients/${Number(id)}`), request('/api/individual/projects')]);
  const used = projects.filter((p) => p.client_id === client.id).length;
  if (used) throw fail(`${client.name} still has ${used} ${used === 1 ? 'project' : 'projects'}. Delete ${used === 1 ? 'it' : 'them'}, or change ${used === 1 ? 'it' : 'them'} to a personal project, first.`, 409);
  await request(`/api/individual/clients/${client.id}`, { method: 'DELETE' });
}

/* ================================================================================================ projects */
// the backend's words <-> the dashboard's
const STATUS_IN = { pending: 'pending', started: 'active', completed: 'completed', aborted: 'aborted' };
const STATUS_OUT = { pending: 'pending', active: 'started', completed: 'completed', aborted: 'aborted' };

const toProject = (p, clients = []) => ({
  id: p.id,
  title: p.title,
  description: p.description || '',
  projectType: p.project_type === 'client' ? 'client' : 'personal',
  clientId: p.client_id ?? null,
  clientName: p.client_id ? clients.find((c) => c.id === p.client_id)?.name ?? '' : '',
  startedDate: p.started_date || null,
  deadline: p.deadline || null,
  status: STATUS_IN[p.status] || 'pending',
  buildMode: local().buildMode[p.id] || null,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function projectBody(values, { withStatus = false } = {}) {
  if (!clean(values.title)) throw fail('Enter a project title.', 422);
  if (values.projectType === 'client' && !values.clientId) throw fail('Choose a client for this project.', 422);
  if (values.startedDate && !DATE.test(values.startedDate)) throw fail('Enter a valid start date.', 422);
  if (values.deadline && !DATE.test(values.deadline)) throw fail('Enter a valid deadline.', 422);
  if (values.startedDate && values.deadline && values.deadline < values.startedDate) throw fail('The deadline can’t be before the start date.', 422);
  const body = {
    title: clean(values.title),
    description: orNull(values.description),
    project_type: values.projectType === 'client' ? 'client' : 'self',
    client_id: values.projectType === 'client' ? Number(values.clientId) : null,
    started_date: values.startedDate || null,
    deadline: values.deadline || null,
  };
  if (withStatus && values.status) body.status = STATUS_OUT[values.status] || 'pending';
  return body;
}

export async function listProjects() {
  const [projects, clients] = await Promise.all([request('/api/individual/projects'), request('/api/individual/clients')]);
  return projects.map((p) => toProject(p, clients)).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}
export async function getProject(id) {
  const [project, clients] = await Promise.all([request(P(id)), request('/api/individual/clients')]);
  return toProject(project, clients);
}
export async function createProject(values) {
  const created = await request('/api/individual/projects', { method: 'POST', body: projectBody(values) });
  return getProject(created.id);
}
export async function updateProject(id, values) {
  await request(P(id), { method: 'PATCH', body: projectBody(values, { withStatus: true }) });
  return getProject(id);
}
export async function setProjectStatus(id, status) {
  if (!STATUS_OUT[status]) throw fail('Unknown project status.', 422);
  await request(P(id), { method: 'PATCH', body: { status: STATUS_OUT[status] } });
  return getProject(id);
}
export async function setProjectBuildMode(id, mode) {
  local().buildMode[Number(id)] = mode;
  saveLocal();
  return getProject(id);
}
export async function deleteProject(id) {
  await request(P(id), { method: 'DELETE' });
  const l = local();
  delete l.buildMode[Number(id)];
  saveLocal();
}

/* ================================================================================================= stories */
const REASON_IN = { ai_generated: 'ai_generated', user_uploaded: 'user_uploaded', manual_edit: 'user_edit', ai_edit: 'ai_edit', rollback: 'rollback' };

/** A backend story's creative settings -> the Story page's Creative Direction settings. */
function settingsOf(st) {
  return {
    model: st.model_id || '',
    language: st.language || 'English',
    genre: st.genre || [],
    style: st.style || [],
    tone: st.tone || [],
    wordCount: st.word_count || 1000,
    pointOfView: st.point_of_view || 'third_person_limited',
    storyFormat: st.story_format || 'prose_narrative',
    targetAudience: st.target_audience || '',
    subject: st.subject || '',
    gradeLevel: st.grade_level || '',
    educationalObjective: st.educational_objective || '',
    learningPoints: st.learning_points || [],
    setting: st.setting || '',
    characters: (st.characters || []).map((c) => ({ name: c.name || '', role: c.role || '', details: c.details || '' })),
    additionalDetails: st.additional_details || '',
    prompt: st.prompt || '',
  };
}

const VERSION_NOTES = { user_edit: 'Edited in the Story Editor', ai_edit: 'Changed with AI Edit', ai_generated: 'Written again', rollback: 'Restored' };

// The chat kept in this browser for a story; one made from its versions when there is none (another device).
function chatFor(st, versions) {
  const l = local();
  const saved = l.chats[st.id];
  if (Array.isArray(saved) && saved.length) return saved;
  const chat = [];
  versions.forEach((v) => {
    if (v.no === 1) {
      if (st.source_type === 'user_uploaded') chat.push({ role: 'event', text: 'Imported', at: v.at });
      else if (st.prompt) chat.push({ role: 'user', kind: 'brief', text: st.prompt, at: v.at });
      chat.push({ role: 'ai', version: 1, at: v.at });
    } else {
      chat.push({ role: 'event', text: VERSION_NOTES[v.reason] || 'Saved', version: v.no, at: v.at });
    }
  });
  return chat.map((m, i) => ({ id: i + 1, ...m }));
}
function pushChat(storyId, messages) {
  const l = local();
  const chat = Array.isArray(l.chats[storyId]) ? l.chats[storyId] : [];
  const at = new Date().toISOString();
  messages.forEach((m) => {
    const id = (chat[chat.length - 1]?.id || 0) + 1;
    const message = { id, role: m.role, at };
    if (m.role === 'user') {
      message.kind = m.kind === 'brief' ? 'brief' : 'message';
      message.text = String(m.text || '').trim();
      if (m.tags?.length) message.tags = m.tags.map(String).slice(0, 12);
      if (m.file) message.file = String(m.file);
      if (Array.isArray(m.attachments) && m.attachments.length) {
        message.attachments = m.attachments
          .slice(0, 6)
          .map((a) => (a?.kind === 'image' && typeof a.src === 'string' && a.src.length <= 450000 ? { kind: 'image', name: String(a.name || 'image'), src: a.src } : a?.kind === 'script' ? { kind: 'script', name: String(a.name || 'script'), words: Number(a.words) || 0 } : null))
          .filter(Boolean);
      }
    } else if (m.role === 'ai') {
      message.version = Number(m.version);
    } else {
      message.role = 'event';
      message.text = String(m.text || '');
      if (m.version) message.version = Number(m.version);
    }
    chat.push(message);
  });
  l.chats[storyId] = chat;
  saveLocal();
}

// story versions are saved in UTC without a timezone ("2026-10-21T12:30:00"); without the "Z" the browser reads them
// as local time (in India, 5½ hours old the moment they are made)
const asUtc = (t) => (typeof t === 'string' && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t) ? `${t}Z` : t);
const toVersion = (v) => ({ id: v.id, no: v.version_number, reason: REASON_IN[v.source_type] || 'user_edit', title: v.title, content: v.content, at: asUtc(v.created_at) });

function toStory(st, rawVersions) {
  const versions = rawVersions.map(toVersion).sort((a, b) => a.no - b.no);
  const meta = local().storyMeta[st.id] || {};
  const first = versions[0];
  const last = versions[versions.length - 1];
  const settings = { ...settingsOf(st), ...(meta.settings || {}), ...(meta.oneClick ? { oneClick: true, length: meta.length, fromScript: meta.fromScript } : {}) };
  return {
    id: st.id,
    title: st.title,
    content: st.content,
    source: st.source_type === 'user_uploaded' ? 'import' : 'ai',
    model: st.model_id || '',
    fileName: meta.fileName || '',
    settings,
    createdAt: first?.at || null,
    updatedAt: last?.at || null,
    versions: versions.length ? versions : [{ id: null, no: 1, reason: st.source_type === 'user_uploaded' ? 'user_uploaded' : 'ai_generated', title: st.title, content: st.content, at: null }],
    chat: chatFor(st, versions),
  };
}

const lastLine = (chat) => {
  for (let i = chat.length - 1; i >= 0; i -= 1) if (chat[i].role === 'user' || chat[i].role === 'event') return chat[i].text;
  return '';
};
const summaryOf = (story) => ({
  id: story.id,
  title: story.title,
  source: story.source,
  model: story.model,
  fileName: story.fileName,
  words: words(story.content),
  excerpt: story.content.slice(0, 220),
  versionCount: story.versions.length,
  messageCount: story.chat.filter((m) => m.role === 'user').length,
  oneClick: Boolean(story.settings?.oneClick),
  lastMessage: lastLine(story.chat).slice(0, 160),
  createdAt: story.createdAt,
  updatedAt: story.updatedAt,
});

const versionsOf = (projectId, storyId) => request(`${S(projectId, storyId)}/versions`).catch(() => []);

async function rawStory(projectId, storyId) {
  const list = await request(`${P(projectId)}/stories`);
  const st = list.find((x) => x.id === Number(storyId));
  if (!st) throw fail('That story no longer exists.', 404);
  return st;
}

/** The project's stories, newest first (without their full text and versions). */
export async function listProjectStories(projectId) {
  const list = await request(`${P(projectId)}/stories`);
  const stories = await Promise.all(list.map(async (st) => toStory(st, await versionsOf(projectId, st.id))));
  return stories.map(summaryOf).sort((a, b) => (b.createdAt === a.createdAt ? b.id - a.id : (b.createdAt || '') > (a.createdAt || '') ? 1 : -1));
}

/** One story, with its full text, every saved version and its chat. */
export async function getProjectStory(projectId, storyId) {
  const [st, versions] = await Promise.all([rawStory(projectId, storyId), versionsOf(projectId, storyId)]);
  return toStory(st, versions);
}

function rememberMeta(storyId, meta) {
  if (!meta) return;
  const l = local();
  l.storyMeta[storyId] = { ...(l.storyMeta[storyId] || {}), ...meta };
  saveLocal();
}

/**
 * Write a new story with AI: POST /stories/generate (the backend saves it as version 1).
 * `request` is the generation body (storyOptions.toRequest); `chat` the messages that asked for it.
 */
export async function writeProjectStory(projectId, { request: body, chat = [], meta = null }) {
  const created = await request(`${P(projectId)}/stories/generate`, { method: 'POST', body });
  // the story list (GET /stories) does not return POV and format, so they are remembered here too
  rememberMeta(created.id, { ...(meta || {}), settings: { pointOfView: body.point_of_view, storyFormat: body.story_format, ...(meta?.settings || {}) } });
  pushChat(created.id, [...chat.filter((m) => m.role === 'user'), { role: 'ai', version: 1 }]);
  return getProjectStory(projectId, created.id);
}

/**
 * Bring in a story the creator already has: POST /stories/upload (TXT, DOCX or PDF). `file` is sent as it is; without
 * one, `content` is sent as a TXT file. The backend names the story after the file, so the file carries the title.
 */
export async function importProjectStory(projectId, { file = null, title = '', content = '', fileName = '', chat = [], meta = null }) {
  const name = clean(title) || (file?.name || fileName || 'Story').replace(/\.[^.]+$/, '');
  const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'Story';
  const ext = file ? (file.name.match(/\.[^.]+$/)?.[0] || '.txt') : '.txt';
  const upload = file ? new File([file], `${safe}${ext}`, { type: file.type }) : new File([content], `${safe}.txt`, { type: 'text/plain' });
  const form = new FormData();
  form.append('file', upload);
  const created = await request(`${P(projectId)}/stories/upload`, { method: 'POST', body: form });
  rememberMeta(created.id, { fileName: fileName || file?.name || '', ...(meta || {}) });
  pushChat(created.id, [{ role: 'event', text: fileName || file?.name ? `Imported from ${fileName || file.name}` : 'Imported' }, ...chat.filter((m) => m.role === 'user'), { role: 'ai', version: 1 }]);
  return getProjectStory(projectId, created.id);
}

/** Save the title and text by hand (the Story Editor): a new 'manual_edit' version on the server. */
export async function updateProjectStory(projectId, storyId, { title, content, chat, note, settings }) {
  if (!clean(title)) throw fail('Give the story a title.', 422);
  if (!String(content || '').trim()) throw fail('The story is empty.', 422);
  await request(S(projectId, storyId), { method: 'PATCH', body: { title: clean(title), content: content.trim() } });
  if (settings) rememberMeta(storyId, { settings });
  const story = await getProjectStory(projectId, storyId);
  const no = story.versions[story.versions.length - 1].no;
  pushChat(storyId, chat ? [...chat.filter((m) => m.role === 'user'), { role: 'ai', version: no }] : [{ role: 'event', text: note || VERSION_NOTES.user_edit, version: no }]);
  return getProjectStory(projectId, storyId);
}

/** AI Edit: the backend rewrites the SAVED story and keeps the result as a preview until it is accepted. */
export async function previewStoryEdit(projectId, storyId, instruction) {
  if (clean(instruction).length > 5000) throw fail(`The instruction is too long (${clean(instruction).length.toLocaleString('en-IN')} of 5,000 characters). Please shorten it.`, 422);
  const preview = await request(`${S(projectId, storyId)}/ai-edit`, { method: 'POST', body: { instruction: clean(instruction) } });
  return { previewId: preview.preview_id, title: preview.title, content: preview.content, instruction: clean(instruction) };
}
export async function acceptStoryEdit(projectId, storyId, previewId, { chat, note } = {}) {
  await request(`${P(projectId)}/stories/previews/${Number(previewId)}/accept`, { method: 'POST' });
  const story = await getProjectStory(projectId, storyId);
  const no = story.versions[story.versions.length - 1].no;
  pushChat(storyId, chat ? [...chat.filter((m) => m.role === 'user'), { role: 'ai', version: no }] : [{ role: 'event', text: note || VERSION_NOTES.ai_edit, version: no }]);
  return getProjectStory(projectId, storyId);
}
export async function discardStoryEdit(projectId, previewId) {
  await request(`${P(projectId)}/stories/previews/${Number(previewId)}/discard`, { method: 'POST' });
}
/** Asking for a change in a chat: the AI edit, accepted straight away (the creator asked for it). */
export async function rewriteProjectStory(projectId, storyId, { instruction, chat = [], settings = null }) {
  const preview = await previewStoryEdit(projectId, storyId, instruction);
  if (settings) rememberMeta(storyId, { settings });
  return acceptStoryEdit(projectId, storyId, preview.previewId, { chat });
}

/** Go back to an earlier version: the backend saves it again as the newest version ('rollback'). */
export async function restoreStoryVersion(projectId, storyId, versionNo) {
  const versions = (await versionsOf(projectId, storyId)).map(toVersion);
  const version = versions.find((v) => v.no === Number(versionNo));
  if (!version) throw fail('That version no longer exists.', 404);
  await request(`${S(projectId, storyId)}/versions/${version.id}/restore`, { method: 'POST' });
  const story = await getProjectStory(projectId, storyId);
  pushChat(storyId, [{ role: 'event', text: `Version ${version.no} restored`, version: story.versions[story.versions.length - 1].no }]);
  return getProjectStory(projectId, storyId);
}

export async function deleteProjectStory(projectId, storyId) {
  await request(S(projectId, storyId), { method: 'DELETE' });
  const l = local();
  delete l.chats[storyId];
  delete l.storyMeta[storyId];
  saveLocal();
}

/** Messages that are not a new version (reference images sent in the workshop, notes): kept with the chat. */
export async function addStoryMessages(projectId, storyId, messages) {
  pushChat(storyId, messages.filter((m) => m.role === 'user' || m.role === 'event'));
  return getProjectStory(projectId, storyId);
}

/** The settings the newest AI story of this project was written with (to start the next one from), or null. */
export async function latestStorySettings(projectId) {
  const list = await request(`${P(projectId)}/stories`);
  const ai = list.filter((st) => st.source_type !== 'user_uploaded').sort((a, b) => b.id - a.id)[0];
  if (!ai) return null;
  return { ...settingsOf(ai), ...(local().storyMeta[ai.id]?.settings || {}) };
}

/* ============================================================================================= storyboards */
async function storyboardRaw(projectId, storyId) {
  try {
    return await request(`${S(projectId, storyId)}/storyboard`);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}
// made before the story's newest version was saved?
const isOutdated = (sb, versions) => {
  const newest = Math.max(0, ...versions.map((v) => Date.parse(asUtc(v.created_at)) || 0));
  const made = Date.parse(asUtc(sb.updated_at));
  return Boolean(newest && made && newest > made);
};

/** The storyboards of a project, one line each: { storyId, storyTitle, scenes, characters, updatedAt, outdated }. */
export async function listStoryboards(projectId) {
  const stories = await request(`${P(projectId)}/stories`);
  const rows = await Promise.all(
    stories.map(async (st) => {
      const [sb, versions] = await Promise.all([storyboardRaw(projectId, st.id), versionsOf(projectId, st.id)]);
      if (!sb) return null;
      const data = sb.storyboard_data || {};
      return {
        storyId: st.id,
        storyTitle: st.title,
        scenes: (data.scenes || []).length,
        characters: (data.characters || []).length,
        updatedAt: sb.updated_at,
        outdated: isOutdated(sb, versions),
      };
    }),
  );
  return rows.filter(Boolean).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
}

/** A story's storyboard (in the dashboard's format, see storyboard.js), or null when it has none yet. */
export async function getStoryboard(projectId, storyId) {
  const [sb, versions] = await Promise.all([storyboardRaw(projectId, storyId), versionsOf(projectId, storyId)]);
  if (!sb) return null;
  const meta = sb.metadata || sb.metadata_json || {};
  return {
    storyId: Number(storyId),
    id: sb.id,
    source: meta.source === 'upload' || meta.source === 'import' || meta.imported ? 'import' : 'generated',
    fileName: '',
    board: fromBackendBoard(sb.storyboard_data || {}),
    status: sb.status,
    outdated: isOutdated(sb, versions),
    createdAt: sb.created_at,
    updatedAt: sb.updated_at,
  };
}

/**
 * Change the text of one dialogue line (PATCH /storyboard/scenes/{scene}/dialogues/{line}). `sceneAt` and `lineAt` are
 * the positions kept by fromBackendBoard (`at`). Resolves the storyboard, as getStoryboard does.
 */
export async function updateStoryboardDialogue(projectId, storyId, sceneAt, lineAt, text) {
  await request(`${S(projectId, storyId)}/storyboard/scenes/${Number(sceneAt)}/dialogues/${Number(lineAt)}`, { method: 'PATCH', body: { text } });
  return getStoryboard(projectId, storyId);
}

/** Break the story down with AI (POST /storyboard). Replaces the story's storyboard. */
export async function generateStoryboard(projectId, storyId, { model }) {
  await request(`${S(projectId, storyId)}/storyboard`, { method: 'POST', body: { model_id: model || null } });
  return getStoryboard(projectId, storyId);
}

/** Import a storyboard JSON file (the backend's format: see storyboardTemplate). */
export async function importStoryboard(projectId, storyId, file) {
  const form = new FormData();
  form.append('file', file);
  await request(`${S(projectId, storyId)}/storyboard/upload`, { method: 'POST', body: form });
  return getStoryboard(projectId, storyId);
}

/** The saved storyboard as the backend's JSON file (Blob). */
export const exportStoryboard = (projectId, storyId) => request(`${S(projectId, storyId)}/storyboard/export`, { as: 'blob' });
/** An empty storyboard in the backend's format, to fill in and import (Blob). */
export const storyboardTemplate = () => request('/api/individual/storyboard/template', { as: 'blob' });

/* ======================================================================================== studio images */
// Images are behind the sign-in, so they are fetched with the token and shown from object URLs. One URL per image
// is kept until that image changes.
const imageUrls = new Map();
async function imageUrl(cacheKey, path, { refresh = false } = {}) {
  if (!refresh && imageUrls.has(cacheKey)) return imageUrls.get(cacheKey);
  try {
    const blob = await request(path, { as: 'blob' });
    const old = imageUrls.get(cacheKey);
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(blob);
    imageUrls.set(cacheKey, url);
    return url;
  } catch (err) {
    if (isMissing(err)) {
      imageUrls.delete(cacheKey);
      return null;
    }
    throw err;
  }
}

/** Arrays in a profile become "a, b, c"; empty values are left out. */
const flatten = (data) =>
  Object.fromEntries(
    Object.entries(data || {})
      .filter(([k]) => k !== 'generation_metadata')
      .map(([k, v]) => [k, Array.isArray(v) ? v.filter(Boolean).join(', ') : typeof v === 'string' ? v : v == null ? '' : String(v)]),
  );

/* ====================================================================================== character studio */
const C = (projectId, storyId, id) => `${S(projectId, storyId)}/characters/${Number(id)}`;

/** The storyboard's characters: [{ key, id, name, role, description, gender, age_group, appearance, profile }]. */
export async function listCharacters(projectId, storyId) {
  try {
    const list = await request(`${S(projectId, storyId)}/characters`);
    return list.map((c) => ({
      key: String(c.character_id),
      id: c.character_id,
      name: c.name,
      role: c.role,
      description: c.description,
      gender: c.gender,
      age_group: c.age_group,
      appearance: c.appearance || {},
      profile: c.profile || null,
    }));
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

const toProfile = (p, extra = {}) =>
  p
    ? {
        style: p.style_name || '',
        style_notes: extra.style_notes ?? '',
        customization: p.customization_prompt || '',
        identity: flatten(p.profile_data),
        made_at: p.updated_at || p.created_at,
        version: p.version,
        model: p.model_name || '',
      }
    : null;

async function characterImages(projectId, storyId, id, refresh) {
  const key = `c/${projectId}/${storyId}/${id}`;
  const [master, uploaded] = await Promise.all([
    imageUrl(`${key}/canonical`, `${C(projectId, storyId, id)}/master-image/preview?image_type=canonical`, { refresh }),
    imageUrl(`${key}/user_upload`, `${C(projectId, storyId, id)}/master-image/preview?image_type=user_upload`, { refresh }),
  ]);
  const l = local();
  const meta = l.imageMeta[key] || {};
  const choice = l.imageChoice[key];
  return {
    master: master ? { src: master, model: meta.model || '', prompt: meta.prompt || '', at: meta.at || null } : null,
    uploaded: uploaded ? { src: uploaded, name: meta.uploadName || '', at: meta.uploadAt || null } : null,
    active: choice === 'uploaded' && uploaded ? 'uploaded' : choice === 'master' && master ? 'master' : uploaded && !master ? 'uploaded' : 'master',
  };
}

/** Everything saved for a story's characters: { [key]: { key, id, name, profile, images } }. */
export async function getCharacterRecords(projectId, storyId) {
  const characters = await listCharacters(projectId, storyId);
  const records = await Promise.all(
    characters.map(async (c) => ({ key: c.key, id: c.id, name: c.name, profile: toProfile(c.profile, { style_notes: local().imageMeta[`c/${projectId}/${storyId}/${c.id}`]?.styleNotes }), images: await characterImages(projectId, storyId, c.id) })),
  );
  return Object.fromEntries(records.map((r) => [r.key, r]));
}

async function characterRecord(projectId, storyId, key, { refresh = false } = {}) {
  const characters = await listCharacters(projectId, storyId);
  const c = characters.find((x) => x.key === String(key));
  if (!c) throw fail('This character is not in the storyboard any more.', 404);
  return { key: c.key, id: c.id, name: c.name, profile: toProfile(c.profile, { style_notes: local().imageMeta[`c/${projectId}/${storyId}/${c.id}`]?.styleNotes }), images: await characterImages(projectId, storyId, c.id, refresh) };
}

/** Make (or make again) a character's profile with AI. `model`: a text model id (the story's when it has one). */
export async function generateCharacterProfile(projectId, storyId, key, { style, styleNotes = '', customization = '', reference = '', model = null }) {
  await request(`${C(projectId, storyId, key)}/profile`, {
    method: 'POST',
    body: { style_name: style, style_instructions: styleNotes, customization_instructions: customization, reference_information: reference, model_id: model || null },
  });
  const l = local();
  const k = `c/${projectId}/${storyId}/${Number(key)}`;
  l.imageMeta[k] = { ...(l.imageMeta[k] || {}), styleNotes };
  saveLocal();
  return characterRecord(projectId, storyId, key);
}

/** Make the master image with an image model (POST /master-image, image_type canonical). */
export async function generateCharacterImage(projectId, storyId, key, { model, prompt = '' }) {
  const made = await request(`${C(projectId, storyId, key)}/master-image`, { method: 'POST', body: { image_type: 'canonical', model_id: model, customization_instructions: prompt } });
  const l = local();
  const k = `c/${projectId}/${storyId}/${Number(key)}`;
  l.imageMeta[k] = { ...(l.imageMeta[k] || {}), model: made.model_name || model, prompt, at: made.created_at || new Date().toISOString() };
  if (l.imageChoice[k] !== 'uploaded') l.imageChoice[k] = 'master';
  saveLocal();
  return characterRecord(projectId, storyId, key, { refresh: true });
}

/** Upload the creator's own image; it becomes the main one. */
export async function uploadCharacterImage(projectId, storyId, key, file) {
  const form = new FormData();
  form.append('image', file);
  form.append('image_type', 'user_upload');
  await request(`${C(projectId, storyId, key)}/master-image/upload`, { method: 'POST', body: form });
  const l = local();
  const k = `c/${projectId}/${storyId}/${Number(key)}`;
  l.imageMeta[k] = { ...(l.imageMeta[k] || {}), uploadName: file.name, uploadAt: new Date().toISOString() };
  l.imageChoice[k] = 'uploaded';
  saveLocal();
  return characterRecord(projectId, storyId, key, { refresh: true });
}

/** Which image is the character's main one: 'master' | 'uploaded'. */
export async function setCharacterMainImage(projectId, storyId, key, which) {
  const l = local();
  l.imageChoice[`c/${projectId}/${storyId}/${Number(key)}`] = which === 'uploaded' ? 'uploaded' : 'master';
  saveLocal();
  return characterRecord(projectId, storyId, key);
}

/** The image file to save (Blob): 'master' | 'uploaded'. */
export const downloadCharacterImage = (projectId, storyId, key, which) =>
  request(`${C(projectId, storyId, key)}/master-image/download?image_type=${which === 'uploaded' ? 'user_upload' : 'canonical'}`, { as: 'blob' });

/* ==================================================================================== environment studio */
const L = (projectId, storyId, id) => `${S(projectId, storyId)}/locations/${Number(id)}`;

/** The storyboard's places: [{ key, id, name, description, type, scenes: [scene numbers], profile }]. */
export async function listLocations(projectId, storyId) {
  try {
    const [list, sb] = await Promise.all([request(`${S(projectId, storyId)}/locations`), storyboardRaw(projectId, storyId)]);
    const data = sb?.storyboard_data || {};
    const scenes = Array.isArray(data.scenes) ? data.scenes : [];
    const places = Array.isArray(data.locations) ? data.locations : [];
    return list.map((l) => {
      const place = places.find((p) => Number(p?.location_id ?? p?.id) === Number(l.location_id)) || {};
      const names = [l.name, ...(Array.isArray(place.aliases) ? place.aliases : [])].map((n) => String(n || '').toLowerCase()).filter(Boolean);
      const seen = scenes.map((sc, i) => (names.includes(String(sc?.location?.name ?? sc?.location ?? '').toLowerCase()) ? i + 1 : 0)).filter(Boolean);
      return { key: String(l.location_id), id: l.location_id, name: l.name, description: l.description, type: place.type || '', scenes: seen.length ? seen : place.first_appearance_scene_id ? [place.first_appearance_scene_id] : [], profile: l.profile || null };
    });
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

async function locationImages(projectId, storyId, id, refresh) {
  const key = `l/${projectId}/${storyId}/${id}`;
  const [master, uploaded] = await Promise.all([
    imageUrl(`${key}/canonical`, `${L(projectId, storyId, id)}/master-image/preview?image_type=canonical`, { refresh }),
    imageUrl(`${key}/user_upload`, `${L(projectId, storyId, id)}/master-image/preview?image_type=user_upload`, { refresh }),
  ]);
  const l = local();
  const meta = l.imageMeta[key] || {};
  const choice = l.imageChoice[key];
  return {
    master: master ? { src: master, model: meta.model || '', prompt: meta.prompt || '', at: meta.at || null } : null,
    uploaded: uploaded ? { src: uploaded, name: meta.uploadName || '', at: meta.uploadAt || null } : null,
    active: choice === 'uploaded' && uploaded ? 'uploaded' : choice === 'master' && master ? 'master' : uploaded && !master ? 'uploaded' : 'master',
  };
}

export async function getLocationRecords(projectId, storyId) {
  const places = await listLocations(projectId, storyId);
  const records = await Promise.all(
    places.map(async (p) => ({ key: p.key, id: p.id, name: p.name, profile: toProfile(p.profile, { style_notes: local().imageMeta[`l/${projectId}/${storyId}/${p.id}`]?.styleNotes }), images: await locationImages(projectId, storyId, p.id) })),
  );
  return Object.fromEntries(records.map((r) => [r.key, r]));
}

async function locationRecord(projectId, storyId, key, { refresh = false } = {}) {
  const places = await listLocations(projectId, storyId);
  const p = places.find((x) => x.key === String(key));
  if (!p) throw fail('This place is not in the storyboard any more.', 404);
  return { key: p.key, id: p.id, name: p.name, profile: toProfile(p.profile, { style_notes: local().imageMeta[`l/${projectId}/${storyId}/${p.id}`]?.styleNotes }), images: await locationImages(projectId, storyId, p.id, refresh) };
}

export async function generateLocationProfile(projectId, storyId, key, { style, styleNotes = '', customization = '', reference = '', model = null }) {
  await request(`${L(projectId, storyId, key)}/profile`, {
    method: 'POST',
    body: { style_name: style, style_instructions: styleNotes, customization_instructions: customization, reference_information: reference, model_id: model || null },
  });
  const l = local();
  const k = `l/${projectId}/${storyId}/${Number(key)}`;
  l.imageMeta[k] = { ...(l.imageMeta[k] || {}), styleNotes };
  saveLocal();
  return locationRecord(projectId, storyId, key);
}

export async function generateLocationImage(projectId, storyId, key, { model, prompt = '' }) {
  const made = await request(`${L(projectId, storyId, key)}/master-image`, { method: 'POST', body: { image_type: 'canonical', model_id: model, prompt } });
  const l = local();
  const k = `l/${projectId}/${storyId}/${Number(key)}`;
  l.imageMeta[k] = { ...(l.imageMeta[k] || {}), model: made.model_name || model, prompt, at: made.created_at || new Date().toISOString() };
  if (l.imageChoice[k] !== 'uploaded') l.imageChoice[k] = 'master';
  saveLocal();
  return locationRecord(projectId, storyId, key, { refresh: true });
}

export async function uploadLocationImage(projectId, storyId, key, file) {
  const form = new FormData();
  form.append('image', file);
  await request(`${L(projectId, storyId, key)}/master-image/upload`, { method: 'POST', body: form });
  const l = local();
  const k = `l/${projectId}/${storyId}/${Number(key)}`;
  l.imageMeta[k] = { ...(l.imageMeta[k] || {}), uploadName: file.name, uploadAt: new Date().toISOString() };
  l.imageChoice[k] = 'uploaded';
  saveLocal();
  return locationRecord(projectId, storyId, key, { refresh: true });
}

export async function setLocationMainImage(projectId, storyId, key, which) {
  const l = local();
  l.imageChoice[`l/${projectId}/${storyId}/${Number(key)}`] = which === 'uploaded' ? 'uploaded' : 'master';
  saveLocal();
  return locationRecord(projectId, storyId, key);
}

export const downloadLocationImage = (projectId, storyId, key, which) =>
  request(`${L(projectId, storyId, key)}/master-image/download?image_type=${which === 'uploaded' ? 'user_upload' : 'canonical'}`, { as: 'blob' });

/* ========================================================================================= sketch studio */
/** The storyboard's scenes as the backend numbers them: [{ id, no, title, summary, description, locationId }]. */
export async function listSketchScenes(projectId, storyId) {
  try {
    const list = await request(`${S(projectId, storyId)}/scenes`);
    return list.map((sc, i) => ({ id: sc.id, no: i + 1, title: sc.title, summary: sc.summary, description: sc.description, locationId: sc.location_id }));
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

// (k.prompt is the backend's whole image prompt, not what the creator typed, so it is not shown)
const toSketch = (k, src) => ({ id: k.id, src, model: k.model_name || '', prompt: '', at: k.created_at || null, status: k.status, error: k.error_message || '', version: k.version, uploaded: k.source_type === 'user_upload' });

/** One scene's sketches, newest first, with which one is the main one: { sketches, selected }. */
export async function getSceneSketchRecord(projectId, storyId, sceneId) {
  const data = await request(`${S(projectId, storyId)}/scenes/${Number(sceneId)}/sketches`);
  const made = (data.sketches || []).filter((k) => k.status === 'generated').sort((a, b) => b.id - a.id);
  const sketches = await Promise.all(made.map(async (k) => toSketch(k, await imageUrl(`k/${projectId}/${storyId}/${sceneId}/${k.id}`, `${S(projectId, storyId)}/scenes/${Number(sceneId)}/sketches/${k.id}/preview`))));
  const shown = sketches.filter((k) => k.src);
  const chosen = local().sketchChoice[`${projectId}/${storyId}/${sceneId}`];
  return { sketches: shown, selected: shown.some((k) => k.id === chosen) ? chosen : shown[0]?.id ?? null };
}

/** Every scene's sketches: { [sceneId]: { sketches, selected } }. */
export async function getSceneSketches(projectId, storyId, scenes) {
  const list = scenes || (await listSketchScenes(projectId, storyId));
  const rows = await Promise.all(list.map(async (sc) => [sc.id, await getSceneSketchRecord(projectId, storyId, sc.id)]));
  return Object.fromEntries(rows);
}

/** Make a new sketch for a scene (it becomes the main one). */
export async function generateSceneSketch(projectId, storyId, sceneId, { model, prompt = '' }) {
  const made = await request(`${S(projectId, storyId)}/scenes/${Number(sceneId)}/sketches/auto`, { method: 'POST', body: { model_id: model, prompt, max_sketches: 1 } });
  const newest = (made?.sketches || []).filter((k) => k.status === 'generated').sort((a, b) => b.id - a.id)[0];
  if (!newest) {
    const failed = (made?.sketches || []).find((k) => k.error_message);
    throw fail(failed?.error_message || 'The sketch could not be made. Please try again.', 502);
  }
  const l = local();
  l.sketchChoice[`${projectId}/${storyId}/${sceneId}`] = newest.id;
  saveLocal();
  return getSceneSketchRecord(projectId, storyId, sceneId);
}

/** Upload the creator's own image as a scene's sketch (it becomes the main one). */
export async function uploadSceneSketch(projectId, storyId, sceneId, file) {
  const form = new FormData();
  form.append('image', file);
  const made = await request(`${S(projectId, storyId)}/scenes/${Number(sceneId)}/sketches/upload`, { method: 'POST', body: form });
  const l = local();
  l.sketchChoice[`${projectId}/${storyId}/${sceneId}`] = made.id;
  saveLocal();
  return getSceneSketchRecord(projectId, storyId, sceneId);
}

export async function selectSceneSketch(projectId, storyId, sceneId, sketchId) {
  const l = local();
  l.sketchChoice[`${projectId}/${storyId}/${sceneId}`] = sketchId;
  saveLocal();
  return getSceneSketchRecord(projectId, storyId, sceneId);
}

export const downloadSceneSketch = (projectId, storyId, sceneId, sketchId) => request(`${S(projectId, storyId)}/scenes/${Number(sceneId)}/sketches/${Number(sketchId)}/download`, { as: 'blob' });

/* =========================================================================================== AI animation */
const toJob = (j) =>
  j
    ? {
        id: j.id,
        status: j.status,
        mode: j.generation_mode,
        total: j.total_scenes || 0,
        done: j.completed_scenes || 0,
        failed: j.failed_scenes || 0,
        sceneIds: j.scene_ids || null,
        model: j.model_name,
        error: j.error_message || '',
      }
    : null;

/** Turn scenes into video clips: mode 'all' | 'selected' (with sceneIds). Runs on the server; poll getAnimationJob. */
export async function startAnimation(projectId, storyId, { mode = 'all', sceneIds = null, model }) {
  const job = await request(`${S(projectId, storyId)}/video-generation`, {
    method: 'POST',
    body: { story_id: Number(storyId), project_id: Number(projectId), generation_mode: mode, scene_ids: mode === 'selected' ? sceneIds : null, provider: 'openrouter', model_name: model },
  });
  return toJob(job);
}
export const getAnimationJob = async (projectId, storyId, jobId) => toJob(await request(`${S(projectId, storyId)}/video-generation/${Number(jobId)}`));
export async function latestAnimationJob(projectId, storyId) {
  try {
    return toJob(await request(`${S(projectId, storyId)}/video-generation/latest`));
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

/** Every clip made for the story's scenes (newest version of each first). */
export async function listVideoClips(projectId, storyId) {
  try {
    const clips = await request(`${S(projectId, storyId)}/video-clips`);
    return clips.map((c) => ({
      id: c.id,
      sceneId: c.scene_id,
      no: c.clip_number,
      title: c.title,
      status: c.status,
      error: c.error_message || '',
      seconds: c.actual_duration_seconds || c.planned_duration_seconds || null,
      version: c.version,
      model: c.model_name,
    }));
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}
/** A clip's video, as an object URL to play. */
export const clipUrl = (projectId, storyId, clipId) => imageUrl(`v/${projectId}/${storyId}/${clipId}`, `${S(projectId, storyId)}/video-clips/${Number(clipId)}/download`);

/** Join the scenes' newest clips, in this order, into the finished film. */
export async function assembleFilm(projectId, storyId, jobId, sceneIds) {
  const query = sceneIds.map((id) => `scene_ids=${Number(id)}`).join('&');
  await request(`${S(projectId, storyId)}/video-generation/${Number(jobId)}/assemble?${query}`, { method: 'POST' });
  imageUrls.delete(`f/${projectId}/${storyId}/${jobId}`);
  return getAnimationJob(projectId, storyId, jobId);
}
/** The finished film, as an object URL to play (refresh after assembling again). */
export const filmUrl = (projectId, storyId, jobId, refresh = false) => imageUrl(`f/${projectId}/${storyId}/${jobId}`, `${S(projectId, storyId)}/video-generation/${Number(jobId)}/download`, { refresh });
export const downloadFilm = (projectId, storyId, jobId) => request(`${S(projectId, storyId)}/video-generation/${Number(jobId)}/download`, { as: 'blob' });
