import { IconBook, IconCamera, IconFilm, IconImage, IconStoryboard, IconUser } from '../../ui/DashIcons.jsx';

/**
 * The six Cinemor features a job role can be given: one for each stage of an organization project (the backend's
 * app/constants/cinemor_features.py and workflow_stages.py). A role with a feature works on, or reviews, that stage.
 * `id` is what the backend sees, camelCase (see permissionsModel.js); `label` is what people see.
 */
export const FEATURES = [
  { id: 'storyCreation', label: 'Story Creation', color: '#3b82f6', icon: IconBook },
  { id: 'storyboardCreation', label: 'Storyboard Creation', color: '#a855f7', icon: IconStoryboard },
  { id: 'characterCreation', label: 'Character Creation', color: '#10b981', icon: IconUser },
  { id: 'sceneCreation', label: 'Location Creation', color: '#f97316', icon: IconImage },
  { id: 'shotCreation', label: 'Sketch Creation', color: '#ec4899', icon: IconCamera },
  { id: 'videoGeneration', label: 'AI Animation', color: '#6366f1', icon: IconFilm },
];

// every tool gets this colour in the table's column headings
export const TOOL_COLOR = '#0ea5e9';
