import { IconBook, IconCamera, IconCheckCircle, IconClose, IconFilm, IconImage, IconInfo, IconLock, IconPencil, IconStoryboard, IconUser } from '../ui/DashIcons.jsx';

/**
 * The six stages of an organization project, in order (the backend's app/constants/workflow_stages.py), and where
 * each one's module page is. Each stage opens when the ones before it are approved.
 */
export const STAGES = [
  { key: 'story', label: 'Story', short: 'Story', icon: IconBook, page: 'story', text: 'Write or import the story the film is made from.' },
  { key: 'storyboard', label: 'Storyboard', short: 'Board', icon: IconStoryboard, page: 'storyboard', text: 'Turn the approved story into scenes, characters and places.' },
  { key: 'characters', label: 'Characters', short: 'Characters', icon: IconUser, page: 'characters', text: 'Give every character a profile and a look.' },
  { key: 'locations', label: 'Locations', short: 'Locations', icon: IconImage, page: 'environment', text: 'Give every place a profile and a look.' },
  { key: 'sketches', label: 'Sketches', short: 'Sketches', icon: IconCamera, page: 'sketches', text: 'A sketch for every scene, the first frame of its clip.' },
  { key: 'animation', label: 'AI Animation', short: 'Animation', icon: IconFilm, page: 'animation', text: 'Turn the scenes into clips and join them into the film.' },
];

export const stageMeta = (key) => STAGES.find((s) => s.key === key) || STAGES[0];

/** What a stage's state is called, and its colour (Pill tones). */
export const STATE = {
  locked: { label: 'Locked', tone: 'gray', icon: IconLock },
  open: { label: 'Open', tone: 'violet', icon: IconPencil },
  in_review: { label: 'In review', tone: 'blue', icon: IconInfo },
  changes_requested: { label: 'Changes asked', tone: 'red', icon: IconClose },
  approved: { label: 'Approved', tone: 'green', icon: IconCheckCircle },
};

/** What a submission's state is called. */
export const SUBMISSION = {
  pending: { label: 'In review', tone: 'blue' },
  approved: { label: 'Approved', tone: 'green' },
  changes_requested: { label: 'Changes asked', tone: 'red' },
  withdrawn: { label: 'Taken back', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const projectPath = (projectId) => `/employee/projects/${projectId}`;

/**
 * The module page of a stage. Every stage after Story works on the project's approved story.
 * (These are the creator's module pages, reused: /employee/projects/:id/storyboard/:storyId ...)
 */
export function modulePath(projectId, stageKey, storyId) {
  const meta = stageMeta(stageKey);
  if (meta.key === 'story') return storyId ? `${projectPath(projectId)}/story/${storyId}` : `${projectPath(projectId)}/story`;
  return `${projectPath(projectId)}/${meta.page}${storyId ? `/${storyId}` : ''}`;
}

/** Things this person can do now, across their projects (every story's open stages): the "Up next" list. */
export function upNext(projects, reviews = []) {
  const items = [];
  projects.forEach((p) => {
    const story = p.stages.find((s) => s.key === 'story');
    if (story?.canWork && p.stories.length === 0) {
      items.push({ key: `new-${p.id}`, kind: 'work', project: p, stage: story, title: 'Write the first story', to: modulePath(p.id, 'story') });
    }
    p.stories.forEach((st) => {
      st.stages.forEach((s) => {
        if (!s.canWork) return;
        const what = s.key === 'story' ? `the story “${st.title}”` : `the ${s.label} of “${st.title}”`;
        items.push({
          key: `w-${p.id}-${st.id}-${s.key}`,
          kind: s.status === 'changes_requested' ? 'fix' : 'work',
          project: p,
          stage: { ...s, requires: p.stages.find((x) => x.key === s.key)?.requires || [] },
          story: st,
          title: s.status === 'changes_requested' ? `Make the changes asked for ${what}` : `Work on ${what}`,
          to: modulePath(p.id, s.key, st.id),
        });
      });
    });
  });
  reviews
    .filter((r) => r.canAct)
    .forEach((r) => {
      items.push({
        key: `r-${r.id}`,
        kind: 'review',
        review: r,
        title: `Review ${r.submittedBy?.name || 'someone'}'s ${r.storyTitle ? (r.stage === 'story' ? `story “${r.storyTitle}”` : `${r.stageLabel} of “${r.storyTitle}”`) : r.stageLabel}`,
        to: `/employee/reviews?open=${r.id}`,
      });
    });
  const order = { fix: 0, review: 1, work: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind]);
}