/**
 * The client portal's calls to the backend (/api/client/..., backend file app/api/routes/client_portal_routes.py).
 * Everything comes back camelCase. Images, sketches and films are behind the sign-in, so they are fetched with the
 * token and shown from object URLs (one per file, kept until the page is left).
 */
import { request } from '../../services/api.js';

const C = '/api/client';

const step = (s) => ({ key: s.key, label: s.label, status: s.status, doneAt: s.done_at || null }); // status: done | working | waiting | for_you | changes_asked
const film = (f) => ({ state: f.state, jobId: f.job_id || null, readyAt: f.ready_at || null, comment: f.comment || '', decidedAt: f.decided_at || null }); // state: not_ready | waiting_for_you | approved | changes_asked

const story = (s) => ({
  id: s.id,
  title: s.title || 'Untitled story',
  steps: (s.steps || []).map(step),
  doneCount: s.done_count || 0,
  film: film(s.film || { state: 'not_ready' }),
  content: s.content ?? null,
  scenes: s.scenes ? s.scenes.map((x) => ({ no: x.no, title: x.title, summary: x.summary || '', place: x.place || '', characters: x.characters || [] })) : null,
  characters: s.characters ? s.characters.map((x) => ({ id: x.id, name: x.name, role: x.role || '', image: x.image || null })) : null,
  places: s.places ? s.places.map((x) => ({ id: x.id, name: x.name, role: x.role || '', image: x.image || null })) : null,
  sketches: s.sketches ? s.sketches.map((x) => ({ no: x.no, sceneId: x.scene_id, title: x.title, sketchId: x.sketch_id || null })) : null,
});

export const comment = (c) => ({ id: c.id, side: c.side, author: c.author, storyId: c.story_id || null, story: c.story || '', body: c.body, at: c.at });

const project = (p) => ({
  id: p.id,
  title: p.title,
  description: p.description || '',
  studio: p.studio,
  teamLeader: p.team_leader ? { name: p.team_leader.name, email: p.team_leader.email } : null,
  startDate: p.start_date || null,
  deadline: p.deadline || null,
  status: p.status, // pending | started | completed | aborted
  delayedDays: p.delayed_days || 0,
  storyCount: p.story_count || 0,
  progress: p.progress || 0,
  waitingForYou: p.waiting_for_you || 0,
  stories: (p.stories || []).map(story),
  comments: p.comments ? p.comments.map(comment) : null,
});

export async function getOverview() {
  const d = await request(`${C}/overview`);
  return {
    name: d.name,
    projects: (d.projects || []).map(project),
    counts: d.counts || { ongoing: 0, completed: 0, ready: 0 },
    nextDeadline: d.next_deadline || null,
    ready: (d.ready || []).map((r) => ({ kind: r.kind, projectId: r.project_id, project: r.project, storyId: r.story_id, story: r.story, jobId: r.job_id || null, at: r.at })),
    updates: (d.updates || []).map((u) => ({ kind: u.kind, stage: u.stage || null, text: u.text, story: u.story || '', projectId: u.project_id, project: u.project, at: u.at })),
  };
}
export const listProjects = async () => (await request(`${C}/projects`)).map(project);
export const getProject = async (id) => project(await request(`${C}/projects/${Number(id)}`));
export const listComments = async (id) => (await request(`${C}/projects/${Number(id)}/comments`)).map(comment);
export const addComment = async (id, body, storyId = null) => comment(await request(`${C}/projects/${Number(id)}/comments`, { method: 'POST', body: { body, story_id: storyId ? Number(storyId) : null } }));
/** decision: 'approve' | 'changes'. Resolves the project again. */
export const decideFilm = async (projectId, storyId, decision, text = '') =>
  project(await request(`${C}/projects/${Number(projectId)}/stories/${Number(storyId)}/film`, { method: 'POST', body: { decision, comment: text || null } }));

/* ------------------------------------------------------------------------------------------- the files */
const W = (projectId, storyId) => `${C}/projects/${Number(projectId)}/work/stories/${Number(storyId)}`;
export const characterImagePath = (projectId, storyId, id, type) => `${W(projectId, storyId)}/characters/${Number(id)}/master-image/preview?image_type=${type}`;
export const placeImagePath = (projectId, storyId, id, type) => `${W(projectId, storyId)}/locations/${Number(id)}/master-image/preview?image_type=${type}`;
export const sketchPath = (projectId, storyId, sceneId, sketchId) => `${W(projectId, storyId)}/scenes/${Number(sceneId)}/sketches/${Number(sketchId)}/preview`;
export const filmPath = (projectId, storyId, jobId) => `${W(projectId, storyId)}/video-generation/${Number(jobId)}/download`;

const urls = new Map();
/** An object URL for a file of the project (null when it is not there). */
export async function fileUrl(path) {
  if (urls.has(path)) return urls.get(path);
  try {
    const blob = await request(path, { as: 'blob' });
    const url = URL.createObjectURL(blob);
    urls.set(path, url);
    return url;
  } catch {
    return null;
  }
}
/** The file itself (Blob), to save. */
export const fileBlob = (path) => request(path, { as: 'blob' });