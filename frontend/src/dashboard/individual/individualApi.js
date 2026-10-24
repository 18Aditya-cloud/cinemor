/**
 * Everything the individual dashboard (/dashboard) reads and writes. The pages call only this file.
 *
 *   - With a backend (VITE_API_URL set), every call goes to the Cinemor backend: individualBackend.js
 *     (routes in backend/services/story-service/app/api/routes/individual_routes.py, prefix /api/individual).
 *   - Without one (the hosted preview), the same calls run on a demo database in this browser: individualDemo.js.
 *
 * Both return the same shapes (camelCase), so the pages never need to know which one is in use. `isLive` says when
 * something only one of them can do matters to a page (for example, editing a profile's details by hand is only
 * possible in the demo; the backend makes profiles with AI).
 *
 * Scenes in the Sketch Studio are numbered from 1 in storyboard order here; the backend's own scene ids are looked up
 * when a sketch is made.
 */
import { isBackendConnected } from '../../services/api.js';
import * as demo from './individualDemo.js';
import * as live from './individualBackend.js';

export const isLive = isBackendConnected;
const pick = (name) => (isLive ? live[name] : demo[name]);
const route =
  (name) =>
  (...args) =>
    pick(name)(...args);

export { BUILD_MODES, MAX_SKETCHES, PROJECT_STATUSES, PROJECT_TYPES, STORY_SOURCES, VERSION_REASONS } from './individualDemo.js';

/** The demo database keeps each signed-in email's work apart (nothing to do with a backend). */
export const setDemoOwner = demo.setDemoOwner;

/* clients */
export const listClients = route('listClients');
export const getClient = route('getClient');
export const createClient = route('createClient');
export const updateClient = route('updateClient');
export const deleteClient = route('deleteClient');

/* projects */
export const listProjects = route('listProjects');
export const getProject = route('getProject');
export const createProject = route('createProject');
export const updateProject = route('updateProject');
export const setProjectStatus = route('setProjectStatus');
export const setProjectBuildMode = route('setProjectBuildMode');
export const deleteProject = route('deleteProject');

/* stories */
export const listProjectStories = route('listProjectStories');
export const getProjectStory = route('getProjectStory');
export const writeProjectStory = route('writeProjectStory');
export const importProjectStory = route('importProjectStory');
export const updateProjectStory = route('updateProjectStory');
export const previewStoryEdit = route('previewStoryEdit');
export const discardStoryEdit = route('discardStoryEdit');
export const rewriteProjectStory = route('rewriteProjectStory');
export const restoreStoryVersion = route('restoreStoryVersion');
export const deleteProjectStory = route('deleteProjectStory');
export const addStoryMessages = route('addStoryMessages');
export const latestStorySettings = route('latestStorySettings');
/** Accept an AI Edit preview (from previewStoryEdit): it becomes the story's newest version. */
export const acceptStoryEdit = (projectId, storyId, preview, options) => (isLive ? live.acceptStoryEdit(projectId, storyId, preview.previewId, options) : demo.acceptStoryEdit(projectId, storyId, preview, options));

/* storyboards */
export const listStoryboards = route('listStoryboards');
export const getStoryboard = route('getStoryboard');
export const generateStoryboard = route('generateStoryboard');
export const importStoryboard = route('importStoryboard');
export const exportStoryboard = route('exportStoryboard');
export const storyboardTemplate = route('storyboardTemplate');
export const updateStoryboardDialogue = route('updateStoryboardDialogue');
/** Delete the storyboard and everything made from it (the story stays). */
export const deleteStoryboard = route('deleteStoryboard');

/* characters */
export const listCharacters = route('listCharacters');
export const getCharacterRecords = route('getCharacterRecords');
export const generateCharacterProfile = route('generateCharacterProfile');
export const generateCharacterImage = route('generateCharacterImage');
export const uploadCharacterImage = route('uploadCharacterImage');
export const setCharacterMainImage = route('setCharacterMainImage');
export const downloadCharacterImage = route('downloadCharacterImage');
export const deleteCharacterImage = route('deleteCharacterImage');
/** Demo only: save details of a profile changed by hand. */
export const saveCharacterRecord = demo.saveCharacterRecord;

/* places */
export const listLocations = route('listLocations');
export const getLocationRecords = route('getLocationRecords');
export const generateLocationProfile = route('generateLocationProfile');
export const generateLocationImage = route('generateLocationImage');
export const uploadLocationImage = route('uploadLocationImage');
export const setLocationMainImage = route('setLocationMainImage');
export const downloadLocationImage = route('downloadLocationImage');
export const deleteLocationImage = route('deleteLocationImage');
/** Demo only: save details of a profile changed by hand. */
export const saveLocationRecord = demo.saveLocationRecord;

/* sketches: scenes by number (1, 2, 3...) */
const sceneIdOf = async (projectId, storyId, sceneNo) => {
  const scene = (await live.listSketchScenes(projectId, storyId)).find((sc) => sc.no === Number(sceneNo));
  if (!scene) throw Object.assign(new Error('This scene is not in the storyboard any more.'), { status: 404 });
  return scene.id;
};
/** Every scene's sketches: { [sceneNo]: { sketches: [{ id, src, model, prompt, at }] (newest first), selected } }. */
export async function getSceneSketches(projectId, storyId) {
  if (!isLive) return demo.getSceneSketches(projectId, storyId);
  const scenes = await live.listSketchScenes(projectId, storyId);
  const byId = await live.getSceneSketches(projectId, storyId, scenes);
  return Object.fromEntries(scenes.map((sc) => [String(sc.no), byId[sc.id]]));
}
/** Make a new sketch of a scene; it becomes the main one. Resolves the scene's record. */
export async function generateSceneSketch(projectId, storyId, sceneNo, options) {
  if (!isLive) return demo.generateSceneSketch(projectId, storyId, sceneNo, options);
  return live.generateSceneSketch(projectId, storyId, await sceneIdOf(projectId, storyId, sceneNo), options);
}

/** Upload the creator's own image as a scene's sketch; it becomes the main one. Resolves the scene's record. */
export async function uploadSceneSketch(projectId, storyId, sceneNo, file) {
  if (!isLive) return demo.uploadSceneSketch(projectId, storyId, sceneNo, file);
  return live.uploadSceneSketch(projectId, storyId, await sceneIdOf(projectId, storyId, sceneNo), file);
}

export async function selectSceneSketch(projectId, storyId, sceneNo, sketchId) {
  if (!isLive) return demo.selectSceneSketch(projectId, storyId, sceneNo, sketchId);
  return live.selectSceneSketch(projectId, storyId, await sceneIdOf(projectId, storyId, sceneNo), sketchId);
}
export async function downloadSceneSketch(projectId, storyId, sceneNo, sketchId) {
  if (!isLive) return demo.downloadSceneSketch(projectId, storyId, sceneNo, sketchId);
  return live.downloadSceneSketch(projectId, storyId, await sceneIdOf(projectId, storyId, sceneNo), sketchId);
}
/** Delete one sketch of a scene. Resolves the scene's record. */
export async function deleteSceneSketch(projectId, storyId, sceneNo, sketchId) {
  if (!isLive) return demo.deleteSceneSketch(projectId, storyId, sceneNo, sketchId);
  return live.deleteSceneSketch(projectId, storyId, await sceneIdOf(projectId, storyId, sceneNo), sketchId);
}

/* AI animation (backend only) */
export const listAnimationScenes = live.listSketchScenes;
export const startAnimation = live.startAnimation;
export const getAnimationJob = live.getAnimationJob;
export const latestAnimationJob = live.latestAnimationJob;
export const listVideoClips = live.listVideoClips;
export const clipUrl = live.clipUrl;
export const assembleFilm = live.assembleFilm;
export const filmUrl = live.filmUrl;
export const downloadFilm = live.downloadFilm;
export const deleteVideoClip = live.deleteVideoClip;
export const deleteFilm = live.deleteFilm;