/**
 * The stages a Cinemor project moves through, in order. A project has a `stage` (one of these ids) and a `status`
 * ('ongoing' or 'delivered'). A project that comes back without a stage is treated as being at the first one.
 */
export const PROJECT_STAGES = [
  { id: 'story', label: 'Story' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'characters', label: 'Characters' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'shots', label: 'Shots' },
  { id: 'video', label: 'Video' },
];

export const stageIndex = (id) => Math.max(0, PROJECT_STAGES.findIndex((s) => s.id === id));
