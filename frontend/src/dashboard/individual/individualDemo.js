/**
 * The individual dashboard WITHOUT a backend (VITE_API_URL empty): a demo database in this browser
 * (localStorage 'cm-demo-individual', kept separately for each signed-in email), so the hosted preview works on its
 * own. With a backend, individualApi.js sends every call to individualBackend.js instead; the shapes are the same.
 *
 * A chat message is one of
 *   { id, role: 'user', kind: 'brief' | 'message', text, tags?, file?, attachments?, at }   what the creator sent
 *      attachments: [{ kind: 'image', name, src (a small JPEG data URL) } | { kind: 'script', name, words }]
 *   { id, role: 'ai', version, at }                                            Cinemor's answer: that version of the story
 *   { id, role: 'event', text, version?, at }                                  something done elsewhere (an edit, a restore)
 */
import { wait } from '../../services/api.js';
import { editStory, generateStory } from '../../services/storyApi.js';
import { charactersOf, drawCharacterImage, makeProfile, readImageFile } from './characterStudio.js';
import { drawLocationImage, locationsOf, makeLocationProfile } from './environmentStudio.js';
import { drawSceneSketch, scenesOfStory } from './sketchStudio.js';
import { buildStoryboard, readStoryboard, TEMPLATE } from './storyboard.js';
import { readStoryFile } from './storyImport.js';

const KEY = 'cm-demo-individual';
const LATENCY = 240;

export const PROJECT_TYPES = { personal: 'Personal Project', client: 'Client Project' };
export const PROJECT_STATUSES = {
  pending: { label: 'Pending', tone: 'blue' },
  active: { label: 'Active', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
  aborted: { label: 'Aborted', tone: 'red' },
};

let store = {};
try {
  store = JSON.parse(window.localStorage.getItem(KEY)) || {};
} catch {
  /* storage blocked or empty: start with an empty demo database */
}

const persist = () => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
};
const fail = (message, status) => Object.assign(new Error(message), { status });
const clone = (value) => JSON.parse(JSON.stringify(value));

// The signed-in creator's own space in the demo database (each email gets its own clients and projects).
let owner = '';
/** Called by the dashboard once it knows who is signed in. */
export function setDemoOwner(email) {
  owner = String(email || '').trim().toLowerCase();
}
const space = () => {
  if (!owner) throw fail('Please log in again.', 401);
  if (!store[owner]) store[owner] = { next: { client: 1, project: 1 }, clients: [], projects: [] };
  return store[owner];
};

async function demo(action) {
  await wait(LATENCY);
  const result = action(space());
  persist();
  return result === undefined ? undefined : clone(result);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v) => (typeof v === 'string' ? v.trim() : v ?? '');

/* ------------------------------------------------------------------------------------------------- clients */
function checkClient({ name, email }) {
  if (!clean(name)) throw fail('Enter the client name.', 422);
  if (clean(email) && !EMAIL.test(clean(email))) throw fail('Enter a valid email address, like client@company.com.', 422);
}
const clientView = (s, c) => ({ ...c, projectCount: s.projects.filter((p) => p.clientId === c.id).length });

export async function listClients() {
  return demo((s) => s.clients.map((c) => clientView(s, c)));
}

export async function getClient(id) {
  return demo((s) => {
    const client = s.clients.find((c) => c.id === Number(id));
    if (!client) throw fail('That client no longer exists.', 404);
    return clientView(s, client);
  });
}

export async function createClient(values) {
  return demo((s) => {
    checkClient(values);
    const now = new Date().toISOString();
    const client = { id: s.next.client++, name: clean(values.name), email: clean(values.email), phone: clean(values.phone), companyName: clean(values.companyName), createdAt: now, updatedAt: now };
    s.clients.push(client);
    return clientView(s, client);
  });
}

export async function updateClient(id, values) {
  return demo((s) => {
    const client = s.clients.find((c) => c.id === Number(id));
    if (!client) throw fail('That client no longer exists.', 404);
    checkClient(values);
    Object.assign(client, { name: clean(values.name), email: clean(values.email), phone: clean(values.phone), companyName: clean(values.companyName), updatedAt: new Date().toISOString() });
    return clientView(s, client);
  });
}

export async function deleteClient(id) {
  return demo((s) => {
    const client = s.clients.find((c) => c.id === Number(id));
    if (!client) throw fail('That client no longer exists.', 404);
    const used = s.projects.filter((p) => p.clientId === client.id).length;
    if (used) throw fail(`${client.name} still has ${used} ${used === 1 ? 'project' : 'projects'}. Delete ${used === 1 ? 'it' : 'them'}, or change ${used === 1 ? 'it' : 'them'} to a personal project, first.`, 409);
    s.clients = s.clients.filter((c) => c.id !== client.id);
  });
}

/* ------------------------------------------------------------------------------------------------ projects */
function checkProject(s, { title, projectType, clientId, startedDate, deadline, status }) {
  if (!clean(title)) throw fail('Enter a project title.', 422);
  if (!PROJECT_TYPES[projectType]) throw fail('Choose who the project is for.', 422);
  if (projectType === 'client' && !s.clients.some((c) => c.id === Number(clientId))) throw fail('Choose a client for this project.', 422);
  if (startedDate && !DATE.test(startedDate)) throw fail('Enter a valid start date.', 422);
  if (deadline && !DATE.test(deadline)) throw fail('Enter a valid deadline.', 422);
  if (startedDate && deadline && deadline < startedDate) throw fail('The deadline can’t be before the start date.', 422);
  if (status !== undefined && !PROJECT_STATUSES[status]) throw fail('Unknown project status.', 422);
}
const projectView = (s, p) => ({
  ...p,
  clientName: p.clientId ? s.clients.find((c) => c.id === p.clientId)?.name ?? '' : '',
  storyCount: storiesOf(s, p.id).length,
});

export async function listProjects() {
  return demo((s) => [...s.projects].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).map((p) => projectView(s, p)));
}

export async function getProject(id) {
  return demo((s) => {
    const project = s.projects.find((p) => p.id === Number(id));
    if (!project) throw fail('That project no longer exists.', 404);
    return projectView(s, project);
  });
}

export async function createProject(values) {
  return demo((s) => {
    checkProject(s, values);
    const now = new Date().toISOString();
    const project = {
      id: s.next.project++,
      title: clean(values.title),
      description: clean(values.description),
      projectType: values.projectType,
      clientId: values.projectType === 'client' ? Number(values.clientId) : null,
      startedDate: values.startedDate || null,
      deadline: values.deadline || null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    s.projects.push(project);
    return projectView(s, project);
  });
}

export async function updateProject(id, values) {
  return demo((s) => {
    const project = s.projects.find((p) => p.id === Number(id));
    if (!project) throw fail('That project no longer exists.', 404);
    checkProject(s, values);
    Object.assign(project, {
      title: clean(values.title),
      description: clean(values.description),
      projectType: values.projectType,
      clientId: values.projectType === 'client' ? Number(values.clientId) : null,
      startedDate: values.startedDate || null,
      deadline: values.deadline || null,
      ...(values.status ? { status: values.status } : {}),
      updatedAt: new Date().toISOString(),
    });
    return projectView(s, project);
  });
}

/** Only the status: 'pending' | 'active' | 'completed'. Used by the Project page's "Project Status" buttons. */
export async function setProjectStatus(id, status) {
  return demo((s) => {
    const project = s.projects.find((p) => p.id === Number(id));
    if (!project) throw fail('That project no longer exists.', 404);
    if (!PROJECT_STATUSES[status]) throw fail('Unknown project status.', 422);
    project.status = status;
    project.updatedAt = new Date().toISOString();
    return projectView(s, project);
  });
}

// How the creator builds a project: 'layers' (one module at a time) or 'oneclick' (a whole draft from one prompt).
export const BUILD_MODES = ['layers', 'oneclick'];

/** Remember how the project is being built ('layers' | 'oneclick'), chosen on the project page. */
export async function setProjectBuildMode(id, mode) {
  return demo((s) => {
    const project = s.projects.find((p) => p.id === Number(id));
    if (!project) throw fail('That project no longer exists.', 404);
    if (!BUILD_MODES.includes(mode)) throw fail('Unknown way of building.', 422);
    project.buildMode = mode;
    project.updatedAt = new Date().toISOString();
    return projectView(s, project);
  });
}

export async function deleteProject(id) {
  return demo((s) => {
    if (!s.projects.some((p) => p.id === Number(id))) throw fail('That project no longer exists.', 404);
    s.projects = s.projects.filter((p) => p.id !== Number(id));
    if (s.stories) delete s.stories[Number(id)];
    if (s.storyboards) delete s.storyboards[Number(id)];
    if (s.characterStudio) delete s.characterStudio[Number(id)];
    if (s.locationStudio) delete s.locationStudio[Number(id)];
    if (s.sceneSketches) delete s.sceneSketches[Number(id)];
  });
}

/* ------------------------------------------------------------------------------------------------ stories */
export const STORY_SOURCES = { ai: 'AI generated', import: 'Uploaded' };
// Why a version was saved (the backend's names), and how the Version History says it.
export const VERSION_REASONS = {
  ai_generated: 'AI generated',
  user_uploaded: 'Uploaded',
  user_edit: 'Edited',
  ai_edit: 'AI edit',
  rollback: 'Restored',
};

// The project's stories, as a list. (The first version of this page kept one story per project as a plain object;
// such a story is turned into the first item of the list here, with its text as version 1.)
function storiesOf(s, projectId) {
  if (!s.stories) s.stories = {};
  const key = Number(projectId);
  let list = s.stories[key];
  if (list && !Array.isArray(list)) {
    if (!s.next.story) s.next.story = 1;
    const old = list;
    list = [
      {
        id: s.next.story++,
        title: old.title,
        content: old.content,
        source: old.source === 'import' ? 'import' : 'ai',
        model: old.model || '',
        fileName: old.fileName || '',
        settings: old.settings || null,
        createdAt: old.createdAt,
        updatedAt: old.updatedAt,
        versions: [{ no: 1, reason: old.source === 'import' ? 'user_uploaded' : 'ai_generated', title: old.title, content: old.content, at: old.updatedAt }],
      },
    ];
    s.stories[key] = list;
  }
  if (!list) {
    list = [];
    s.stories[key] = list;
  }
  return list;
}

const VERSION_NOTES = {
  user_edit: 'Edited in the Story Editor',
  ai_edit: 'Changed with AI Edit',
  ai_generated: 'Written again',
  rollback: 'Restored',
};

// The story's chat. A story saved before chats existed gets one made from its versions.
function chatOf(st) {
  if (Array.isArray(st.chat)) return st.chat;
  const chat = [];
  st.versions.forEach((v) => {
    const at = v.at || st.updatedAt;
    if (v.no === 1) {
      if (st.source === 'import') chat.push({ role: 'event', text: st.fileName ? `Imported from ${st.fileName}` : 'Imported', at });
      else if (st.settings?.prompt || st.settings?.plot) chat.push({ role: 'user', kind: 'brief', text: st.settings.plot || st.settings.prompt, at });
      chat.push({ role: 'ai', version: 1, at });
    } else {
      chat.push({ role: 'event', text: v.reason === 'rollback' ? `Version ${v.from} restored` : VERSION_NOTES[v.reason] || 'Saved', version: v.no, at });
    }
  });
  st.chat = chat.map((m, i) => ({ id: i + 1, ...m }));
  return st.chat;
}
// What a message may carry: reference images (a small JPEG preview, kept with the chat) and scripts (by name).
const MAX_IMAGE_CHARS = 450000;
function cleanAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 6)
    .map((a) => {
      if (a?.kind === 'image' && typeof a.src === 'string' && a.src.startsWith('data:image/') && a.src.length <= MAX_IMAGE_CHARS) {
        return { kind: 'image', name: String(a.name || 'image').slice(0, 120), src: a.src };
      }
      if (a?.kind === 'script') return { kind: 'script', name: String(a.name || 'script').slice(0, 120), words: Number(a.words) || 0 };
      return null;
    })
    .filter(Boolean);
}

function addMessages(st, messages, at) {
  const chat = chatOf(st);
  messages.forEach((m) => {
    const id = (chat[chat.length - 1]?.id || 0) + 1;
    const message = { id, role: m.role, at };
    if (m.role === 'user') {
      message.kind = m.kind === 'brief' ? 'brief' : 'message';
      message.text = String(m.text || '').trim();
      if (m.tags?.length) message.tags = m.tags.map(String).slice(0, 12);
      if (m.file) message.file = String(m.file);
      const attachments = cleanAttachments(m.attachments);
      if (attachments.length) message.attachments = attachments;
    } else if (m.role === 'ai') {
      message.version = Number(m.version);
    } else {
      message.role = 'event';
      message.text = String(m.text || '');
      if (m.version) message.version = Number(m.version);
    }
    chat.push(message);
  });
}
// What the chat list shows under a story's title: the last thing the creator said, or the last thing that happened.
function lastLine(st) {
  const chat = chatOf(st);
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i].role === 'user' || chat[i].role === 'event') return chat[i].text;
  }
  return '';
}

const words = (text) => (String(text || '').trim().match(/\S+/g) || []).length;
const storySummary = (st) => ({
  id: st.id,
  title: st.title,
  source: st.source,
  model: st.model,
  fileName: st.fileName,
  words: words(st.content),
  excerpt: st.content.slice(0, 220),
  versionCount: st.versions.length,
  messageCount: chatOf(st).filter((m) => m.role === 'user').length,
  oneClick: Boolean(st.settings?.oneClick),
  lastMessage: lastLine(st).slice(0, 160),
  createdAt: st.createdAt,
  updatedAt: st.updatedAt,
});

function findProject(s, projectId) {
  const project = s.projects.find((p) => p.id === Number(projectId));
  if (!project) throw fail('That project no longer exists.', 404);
  return project;
}
function findStory(s, projectId, storyId) {
  findProject(s, projectId);
  const story = storiesOf(s, projectId).find((st) => st.id === Number(storyId));
  if (!story) throw fail('That story no longer exists.', 404);
  return story;
}
function checkStory({ title, content }) {
  if (!clean(title)) throw fail('Give the story a title.', 422);
  if (typeof content !== 'string' || !content.trim()) throw fail('The story is empty.', 422);
}

/** The project's stories, newest first (without their full text and versions). */
export async function listProjectStories(projectId) {
  return demo((s) => {
    findProject(s, projectId);
    return [...storiesOf(s, projectId)].sort((a, b) => (b.createdAt === a.createdAt ? b.id - a.id : b.createdAt > a.createdAt ? 1 : -1)).map(storySummary);
  });
}

/** One story, with its full text, every saved version and its chat. */
export async function getProjectStory(projectId, storyId) {
  return demo((s) => {
    const story = findStory(s, projectId, storyId);
    chatOf(story);
    return story;
  });
}

/**
 * A new story for the project: { title, content, source: 'ai' | 'import', model, fileName, settings, chat }.
 * `chat` is what the creator sent to get it (user messages); Cinemor's answer (version 1) is added after it.
 * An imported story's chat starts with "Imported from <file>".
 */
export async function createProjectStory(projectId, story) {
  return demo((s) => {
    findProject(s, projectId);
    checkStory(story);
    if (!s.next.story) s.next.story = 1;
    const now = new Date().toISOString();
    const source = story.source === 'import' ? 'import' : 'ai';
    const title = clean(story.title);
    const content = story.content.trim();
    const created = {
      id: s.next.story++,
      title,
      content,
      source,
      model: story.model || '',
      fileName: story.fileName || '',
      settings: story.settings || null,
      createdAt: now,
      updatedAt: now,
      versions: [{ no: 1, reason: source === 'import' ? 'user_uploaded' : 'ai_generated', title, content, at: now }],
      chat: [],
    };
    const opening = source === 'import' ? [{ role: 'event', text: created.fileName ? `Imported from ${created.fileName}` : 'Imported' }] : (story.chat || []).filter((m) => m.role === 'user');
    addMessages(created, [...opening, { role: 'ai', version: 1 }], now);
    storiesOf(s, projectId).push(created);
    return created;
  });
}

/**
 * Save the title and text as a new version. reason: 'user_edit' (the default), 'ai_edit' or 'ai_generated'.
 * From the Story page's chat, `chat` holds what the creator sent; it goes into the chat with Cinemor's answer after it.
 * From anywhere else, the chat gets a line saying what happened (`note`, or a default for the reason).
 * `settings` (the brief it was written from) replaces the story's saved settings when given.
 */
export async function updateProjectStory(projectId, storyId, { title, content, reason = 'user_edit', chat, note, settings }) {
  return demo((s) => {
    const story = findStory(s, projectId, storyId);
    checkStory({ title, content });
    const now = new Date().toISOString();
    const why = ['ai_edit', 'ai_generated'].includes(reason) ? reason : 'user_edit';
    story.title = clean(title);
    story.content = content.trim();
    story.updatedAt = now;
    if (settings) story.settings = settings;
    const no = story.versions.length + 1;
    story.versions.push({ no, reason: why, title: story.title, content: story.content, at: now });
    if (chat) addMessages(story, [...chat.filter((m) => m.role === 'user'), { role: 'ai', version: no }], now);
    else addMessages(story, [{ role: 'event', text: note || VERSION_NOTES[why], version: no }], now);
    return story;
  });
}

/**
 * Add messages to a story's chat without a new version: e.g. reference images sent in the workshop, kept for the
 * Characters and Environment modules. `messages`: user messages and event lines (see the chat message shapes above).
 */
export async function addStoryMessages(projectId, storyId, messages) {
  return demo((s) => {
    const story = findStory(s, projectId, storyId);
    const now = new Date().toISOString();
    story.updatedAt = now;
    addMessages(story, messages.filter((m) => m.role === 'user' || m.role === 'event'), now);
    return story;
  });
}

/** Go back to an earlier version. Nothing is lost: it is saved again as the newest version ('rollback'). */
export async function restoreStoryVersion(projectId, storyId, versionNo) {
  return demo((s) => {
    const story = findStory(s, projectId, storyId);
    const version = story.versions.find((v) => v.no === Number(versionNo));
    if (!version) throw fail('That version no longer exists.', 404);
    const now = new Date().toISOString();
    story.title = version.title;
    story.content = version.content;
    story.updatedAt = now;
    const no = story.versions.length + 1;
    story.versions.push({ no, reason: 'rollback', title: version.title, content: version.content, at: now, from: version.no });
    addMessages(story, [{ role: 'event', text: `Version ${version.no} restored`, version: no }], now);
    return story;
  });
}

/** The settings the newest AI story of this project was written with (to start the next one from), or null. */
export async function latestStorySettings(projectId) {
  return demo((s) => {
    findProject(s, projectId);
    const ai = storiesOf(s, projectId).filter((st) => st.source === 'ai' && st.settings);
    return ai.length ? ai[ai.length - 1].settings : null;
  });
}

/* --------------------------------------------------------------------------------------------- storyboards */
// One storyboard per story: { storyId, storyVersion (the story version it was made from), source: 'generated' |
// 'import', fileName, board (the storyboard format, see storyboard.js), createdAt, updatedAt }.
const MAX_BOARD_CHARS = 1500000;

function boardsOf(s, projectId) {
  if (!s.storyboards) s.storyboards = {};
  if (!s.storyboards[Number(projectId)]) s.storyboards[Number(projectId)] = {};
  return s.storyboards[Number(projectId)];
}

/** The storyboards of a project, one line each: { storyId, storyTitle, scenes, characters, updatedAt, outdated }. */
export async function listStoryboards(projectId) {
  return demo((s) => {
    findProject(s, projectId);
    const stories = storiesOf(s, projectId);
    return Object.values(boardsOf(s, projectId))
      .filter((b) => stories.some((st) => st.id === b.storyId))
      .map((b) => {
        const story = stories.find((st) => st.id === b.storyId);
        return {
          storyId: b.storyId,
          storyTitle: story.title,
          scenes: b.board.scenes.length,
          characters: b.board.characters.length,
          updatedAt: b.updatedAt,
          outdated: story.versions.length > b.storyVersion,
        };
      })
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  });
}

/** A story's storyboard, or null when it has none yet. */
export async function getStoryboard(projectId, storyId) {
  return demo((s) => {
    findStory(s, projectId, storyId);
    return boardsOf(s, projectId)[Number(storyId)] || null;
  });
}

/**
 * Save a story's storyboard: { board, source: 'generated' | 'import', fileName }. The board must already be checked
 * (readStoryboard in storyboard.js). It is marked as made from the story's current version.
 */
export async function saveStoryboard(projectId, storyId, { board, source = 'generated', fileName = '' }) {
  return demo((s) => {
    const story = findStory(s, projectId, storyId);
    if (!board || !Array.isArray(board.scenes) || !board.scenes.length) throw fail('The storyboard has no scenes.', 422);
    if (JSON.stringify(board).length > MAX_BOARD_CHARS) throw fail('This storyboard is too large to keep here (over 1.5 MB).', 413);
    const boards = boardsOf(s, projectId);
    const now = new Date().toISOString();
    const saved = {
      storyId: story.id,
      storyVersion: story.versions.length,
      source: source === 'import' ? 'import' : 'generated',
      fileName: clean(fileName),
      board,
      createdAt: boards[story.id]?.createdAt || now,
      updatedAt: now,
    };
    boards[story.id] = saved;
    return saved;
  });
}

/** Change the text of one dialogue line (scene and line by position). Resolves the storyboard, as getStoryboard does. */
export async function updateStoryboardDialogue(projectId, storyId, sceneAt, lineAt, text) {
  const line = String(text || '').trim();
  if (!line) throw fail('The line cannot be empty.', 422);
  demo((s) => {
    const saved = boardsOf(s, projectId)[findStory(s, projectId, storyId).id];
    const target = saved?.board?.scenes?.[Number(sceneAt)]?.dialogues?.[Number(lineAt)];
    if (!target) throw fail('Dialogue line not found in this scene.', 404);
    target.line = line.slice(0, 2000);
    saved.updatedAt = new Date().toISOString();
  });
  return getStoryboard(projectId, storyId);
}

/* -------------------------------------------------------------------------------------- character studio */
// Per story, per character (by key, from the name): { key, name, profile, images: { master, uploaded, active },
// updatedAt }. profile: { style, style_notes, customization, identity, made_at }. master: { src, model, prompt,
// at }; uploaded: { src, name, at }. Images are JPEG data URLs.
const MAX_CHARACTER_IMAGE = 1200000;

// bucket: 'characterStudio' (characters) or 'locationStudio' (the Environment module's places); same shape
function studioOf(s, projectId, storyId, bucket = 'characterStudio') {
  if (!s[bucket]) s[bucket] = {};
  const p = Number(projectId);
  if (!s[bucket][p]) s[bucket][p] = {};
  if (!s[bucket][p][Number(storyId)]) s[bucket][p][Number(storyId)] = {};
  return s[bucket][p][Number(storyId)];
}

const cleanImage = (img, keys) => {
  if (!img || typeof img !== 'object') return null;
  if (typeof img.src !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(img.src)) throw fail('That image could not be saved.', 422);
  if (img.src.length > MAX_CHARACTER_IMAGE) throw fail('That image is too large to keep here.', 413);
  const out = { src: img.src, at: img.at || new Date().toISOString() };
  keys.forEach((k) => {
    if (img[k] !== undefined) out[k] = clean(String(img[k])).slice(0, 1000);
  });
  return out;
};

/** What has been saved for a story's characters: { [key]: record }. */
export async function getCharacterRecords(projectId, storyId, bucket = 'characterStudio') {
  return demo((s) => {
    findStory(s, projectId, storyId);
    return studioOf(s, projectId, storyId, bucket);
  });
}

/**
 * Save one character's profile and/or images: { name, profile, images: { master, uploaded, active } }.
 * Only the parts given change; images: null for one of them removes it.
 */
export async function saveCharacterRecord(projectId, storyId, key, { name, profile, images }, bucket = 'characterStudio') {
  return demo((s) => {
    findStory(s, projectId, storyId);
    const studio = studioOf(s, projectId, storyId, bucket);
    const k = clean(key);
    if (!k) throw fail('Unknown character.', 422);
    const record = studio[k] || { key: k, name: clean(name) || k, profile: null, images: { master: null, uploaded: null, active: 'master' } };
    if (name) record.name = clean(name);
    if (profile !== undefined) {
      if (profile && (typeof profile !== 'object' || typeof profile.identity !== 'object')) throw fail('The profile is not complete.', 422);
      record.profile = profile
        ? {
            style: clean(profile.style),
            style_notes: clean(profile.style_notes).slice(0, 1000),
            customization: clean(profile.customization).slice(0, 1000),
            identity: Object.fromEntries(Object.entries(profile.identity).map(([f, v]) => [f, clean(String(v ?? '')).slice(0, 200)])),
            made_at: profile.made_at || new Date().toISOString(),
          }
        : null;
    }
    if (images) {
      if ('master' in images) record.images.master = cleanImage(images.master, ['model', 'prompt']);
      if ('uploaded' in images) record.images.uploaded = cleanImage(images.uploaded, ['name']);
      if (images.active) record.images.active = images.active === 'uploaded' ? 'uploaded' : 'master';
    }
    record.updatedAt = new Date().toISOString();
    studio[k] = record;
    return record;
  });
}

/* ------------------------------------------------------------------------------------ environment studio */
// The story's places, kept exactly like characters: { key, name, profile, images: { master, uploaded, active } }.
export const getLocationRecords = (projectId, storyId) => getCharacterRecords(projectId, storyId, 'locationStudio');
export const saveLocationRecord = (projectId, storyId, key, patch) => saveCharacterRecord(projectId, storyId, key, patch, 'locationStudio');

/* ----------------------------------------------------------------------------------------- sketch studio */
// Per story, per scene number: { sketches: [{ id, src, model, prompt, at }] (newest first, at most
// MAX_SKETCHES), selected: id }. Images are JPEG data URLs, so the browser's storage fills up fast: a save that
// would not fit is refused with a clear message instead of being lost.
export const MAX_SKETCHES = 4;
const MAX_SKETCH_CHARS = 700000;

function sketchesOf(s, projectId, storyId) {
  if (!s.sceneSketches) s.sceneSketches = {};
  const p = Number(projectId);
  if (!s.sceneSketches[p]) s.sceneSketches[p] = {};
  if (!s.sceneSketches[p][Number(storyId)]) s.sceneSketches[p][Number(storyId)] = {};
  return s.sceneSketches[p][Number(storyId)];
}

// Save now, and say so if it does not fit (persist() keeps quiet about that, which is right for small data).
function persistOrFail(undo) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    undo();
    throw fail('There is no room left in this browser for more images. Delete some sketches and try again.', 507);
  }
}

/** Every scene's sketches for a story: { [sceneNo]: { sketches, selected } }. */
export async function getSceneSketches(projectId, storyId) {
  return demo((s) => {
    findStory(s, projectId, storyId);
    return sketchesOf(s, projectId, storyId);
  });
}

/** Add a sketch to a scene ({ src, model, prompt }); it becomes the selected one. Returns the scene's record. */
export async function addSceneSketch(projectId, storyId, sceneNo, { src, model = '', prompt = '' }) {
  await wait(LATENCY);
  const s = space();
  findStory(s, projectId, storyId);
  if (typeof src !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(src)) throw fail('That image could not be saved.', 422);
  if (src.length > MAX_SKETCH_CHARS) throw fail('That image is too large to keep here.', 413);
  const all = sketchesOf(s, projectId, storyId);
  const key = String(Number(sceneNo));
  const before = all[key] ? clone(all[key]) : undefined;
  const record = all[key] || { sketches: [], selected: null };
  const sketch = { id: `sk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, src, model: clean(model), prompt: clean(prompt).slice(0, 1000), at: new Date().toISOString() };
  record.sketches = [sketch, ...record.sketches].slice(0, MAX_SKETCHES);
  record.selected = sketch.id;
  all[key] = record;
  persistOrFail(() => {
    if (before) all[key] = before;
    else delete all[key];
  });
  return clone(record);
}

/** Choose which sketch is the scene's main one. */
export async function selectSceneSketch(projectId, storyId, sceneNo, sketchId) {
  return demo((s) => {
    const record = sketchesOf(s, projectId, storyId)[String(Number(sceneNo))];
    if (!record || !record.sketches.some((k) => k.id === sketchId)) throw fail('That sketch no longer exists.', 404);
    record.selected = sketchId;
    return record;
  });
}

/** Delete a sketch; if it was the selected one, the newest left takes its place. */
export async function deleteSceneSketch(projectId, storyId, sceneNo, sketchId) {
  return demo((s) => {
    const all = sketchesOf(s, projectId, storyId);
    const key = String(Number(sceneNo));
    const record = all[key];
    if (!record) throw fail('That sketch no longer exists.', 404);
    record.sketches = record.sketches.filter((k) => k.id !== sketchId);
    if (record.selected === sketchId) record.selected = record.sketches[0]?.id || null;
    return record;
  });
}

/* ============================================================================ the same steps as the backend */
// (individualApi.js picks these or individualBackend.js's; each does what the backend's route does, here)

const dataUrlBlob = (src) => {
  const [head, body] = src.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
};
const jsonBlob = (data) => new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

/** Write a new story with AI: { request (storyOptions.toRequest), settings, chat, meta: { oneClick, length, fromScript }, modelName }. */
export async function writeProjectStory(projectId, { request, settings, chat = [], meta = null, modelName = '' }) {
  const result = await generateStory(request);
  if (!result?.content?.trim()) throw fail('The AI returned an empty story. Please try again.', 502);
  return createProjectStory(projectId, { title: result.title || 'Untitled story', content: result.content, source: 'ai', model: modelName, settings: { ...(settings || {}), ...(meta || {}) }, chat });
}

/** Bring in a story the creator already has: { file } (TXT or DOCX), or { title, content, fileName }. */
export async function importProjectStory(projectId, { file = null, title = '', content = '', fileName = '', chat = [], meta = null }) {
  let text = content;
  let name = fileName;
  let heading = title;
  if (file && !text) {
    const read = await readStoryFile(file);
    text = read.content;
    name = read.fileName;
    heading = heading || read.title;
  }
  const created = await createProjectStory(projectId, { title: heading || 'Untitled story', content: text, source: 'import', fileName: name, settings: meta ? { ...meta } : null });
  if (chat.length) return addStoryMessages(projectId, created.id, chat);
  return created;
}

/** AI Edit as a preview: { previewId, title, content, instruction }. `draft` is what to rewrite: { title, content, model, language, extra }. */
export async function previewStoryEdit(projectId, storyId, instruction, draft = {}) {
  const story = await getProjectStory(projectId, storyId);
  const result = await editStory({ title: draft.title ?? story.title, content: draft.content ?? story.content, instruction, model: draft.model, language: draft.language || 'English', extra: draft.extra || null });
  if (!result?.content?.trim()) throw fail('The AI returned an empty story. Please try again.', 502);
  return { previewId: null, title: result.title || story.title, content: result.content, instruction: String(instruction).trim() };
}
export async function acceptStoryEdit(projectId, storyId, preview, { chat, note } = {}) {
  return updateProjectStory(projectId, storyId, { title: preview.title, content: preview.content, reason: 'ai_edit', chat, note });
}
export async function discardStoryEdit() {}
/** Asking for a change in a chat: rewrite, and keep it as the newest version. */
export async function rewriteProjectStory(projectId, storyId, { instruction, chat = [], settings = null, model, language, extra }) {
  const preview = await previewStoryEdit(projectId, storyId, instruction, { model, language, extra });
  return updateProjectStory(projectId, storyId, { title: preview.title, content: preview.content, reason: 'ai_edit', chat, settings });
}

export async function deleteProjectStory(projectId, storyId) {
  return demo((s) => {
    findStory(s, projectId, storyId);
    s.stories[Number(projectId)] = storiesOf(s, projectId).filter((st) => st.id !== Number(storyId));
  });
}

/** Break the story down (here: worked out from its text). */
export async function generateStoryboard(projectId, storyId) {
  const story = await getProjectStory(projectId, storyId);
  await wait(900);
  return saveStoryboard(projectId, storyId, { board: buildStoryboard(story, story.settings || {}), source: 'generated' });
}
export async function importStoryboard(projectId, storyId, file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw fail('That file is not valid JSON. Export a storyboard, or fill in the template, and try again.', 422);
  }
  const { board, error } = readStoryboard(data);
  if (error) throw fail(error, 422);
  return saveStoryboard(projectId, storyId, { board, source: 'import', fileName: file.name });
}
export async function exportStoryboard(projectId, storyId) {
  const saved = await getStoryboard(projectId, storyId);
  if (!saved) throw fail('This story has no storyboard yet.', 404);
  return jsonBlob(saved.board);
}
export const storyboardTemplate = async () => jsonBlob(TEMPLATE);

/* characters */
export async function listCharacters(projectId, storyId) {
  const [story, board] = await Promise.all([getProjectStory(projectId, storyId), getStoryboard(projectId, storyId)]);
  return charactersOf(story, board);
}
async function characterOf(projectId, storyId, key) {
  const c = (await listCharacters(projectId, storyId)).find((x) => x.key === key);
  if (!c) throw fail('This character is not in the story any more.', 404);
  return c;
}
export async function generateCharacterProfile(projectId, storyId, key, { style, styleNotes = '', customization = '' }) {
  const c = await characterOf(projectId, storyId, key);
  await wait(2200);
  return saveCharacterRecord(projectId, storyId, key, { name: c.name, profile: makeProfile(c, { style, styleNotes, customization }) });
}
export async function generateCharacterImage(projectId, storyId, key, { model, prompt = '', profile = null }) {
  const c = await characterOf(projectId, storyId, key);
  const records = await getCharacterRecords(projectId, storyId);
  const record = records[key];
  const used = profile || record?.profile || makeProfile(c);
  const src = await drawCharacterImage(c, used, { seed: c.name.length + (record?.images?.master ? 1 : 0) + prompt.length });
  return saveCharacterRecord(projectId, storyId, key, { name: c.name, ...(record?.profile ? {} : { profile: used }), images: { master: { src, model, prompt }, active: record?.images?.uploaded && record.images.active === 'uploaded' ? 'uploaded' : 'master' } });
}
export async function uploadCharacterImage(projectId, storyId, key, file) {
  const c = await characterOf(projectId, storyId, key);
  const src = await readImageFile(file);
  return saveCharacterRecord(projectId, storyId, key, { name: c.name, images: { uploaded: { src, name: file.name }, active: 'uploaded' } });
}
export async function setCharacterMainImage(projectId, storyId, key, which) {
  return saveCharacterRecord(projectId, storyId, key, { images: { active: which } });
}
export async function downloadCharacterImage(projectId, storyId, key, which) {
  const record = (await getCharacterRecords(projectId, storyId))[key];
  const image = record?.images?.[which === 'uploaded' ? 'uploaded' : 'master'];
  if (!image) throw fail('There is no image to save yet.', 404);
  return dataUrlBlob(image.src);
}

/* places */
export async function listLocations(projectId, storyId) {
  const [story, board] = await Promise.all([getProjectStory(projectId, storyId), getStoryboard(projectId, storyId)]);
  return locationsOf(story, board);
}
async function locationOf(projectId, storyId, key) {
  const l = (await listLocations(projectId, storyId)).find((x) => x.key === key);
  if (!l) throw fail('This place is not in the story any more.', 404);
  return l;
}
export async function generateLocationProfile(projectId, storyId, key, { style, styleNotes = '', customization = '' }) {
  const l = await locationOf(projectId, storyId, key);
  await wait(2200);
  return saveLocationRecord(projectId, storyId, key, { name: l.name, profile: { ...makeLocationProfile(l, { style, styleNotes, requirements: customization }) } });
}
export async function generateLocationImage(projectId, storyId, key, { model, prompt = '', profile = null }) {
  const l = await locationOf(projectId, storyId, key);
  const records = await getLocationRecords(projectId, storyId);
  const record = records[key];
  const used = profile || record?.profile || makeLocationProfile(l);
  const src = await drawLocationImage(l, used, { seed: l.name.length + (record?.images?.master ? 1 : 0) + prompt.length, prompt });
  return saveLocationRecord(projectId, storyId, key, { name: l.name, ...(record?.profile ? {} : { profile: used }), images: { master: { src, model, prompt }, active: record?.images?.uploaded && record.images.active === 'uploaded' ? 'uploaded' : 'master' } });
}
export async function uploadLocationImage(projectId, storyId, key, file) {
  const l = await locationOf(projectId, storyId, key);
  const src = await readImageFile(file);
  return saveLocationRecord(projectId, storyId, key, { name: l.name, images: { uploaded: { src, name: file.name }, active: 'uploaded' } });
}
export async function setLocationMainImage(projectId, storyId, key, which) {
  return saveLocationRecord(projectId, storyId, key, { images: { active: which } });
}
export async function downloadLocationImage(projectId, storyId, key, which) {
  const record = (await getLocationRecords(projectId, storyId))[key];
  const image = record?.images?.[which === 'uploaded' ? 'uploaded' : 'master'];
  if (!image) throw fail('There is no image to save yet.', 404);
  return dataUrlBlob(image.src);
}

/* sketches (scenes are numbered from 1, in storyboard order) */
export async function generateSceneSketch(projectId, storyId, sceneNo, { model, prompt = '' }) {
  const [story, board, all] = await Promise.all([getProjectStory(projectId, storyId), getStoryboard(projectId, storyId), getSceneSketches(projectId, storyId)]);
  const scene = scenesOfStory(story, board).find((sc) => sc.no === Number(sceneNo));
  if (!scene) throw fail('This scene is not in the story any more.', 404);
  const src = await drawSceneSketch(scene, { seed: (all[String(sceneNo)]?.sketches.length || 0) + 1 + prompt.length, prompt });
  return addSceneSketch(projectId, storyId, sceneNo, { src, model, prompt });
}

export async function uploadSceneSketch(projectId, storyId, sceneNo, file) {
  const src = await readImageFile(file);
  return addSceneSketch(projectId, storyId, sceneNo, { src, model: 'user_upload', prompt: '' });
}

export async function downloadSceneSketch(projectId, storyId, sceneNo, sketchId) {
  const record = (await getSceneSketches(projectId, storyId))[String(Number(sceneNo))];
  const sketch = record?.sketches.find((k) => k.id === sketchId);
  if (!sketch) throw fail('That sketch no longer exists.', 404);
  return dataUrlBlob(sketch.src);
}
