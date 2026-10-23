import { IconCheckCircle, IconClose, IconInfo, IconPlay } from '../ui/DashIcons.jsx';

// How each project lifecycle state is shown on the Team Leader pages.
export const LIFECYCLE = {
  not_started: { label: 'Not started', tone: 'gray', icon: IconInfo },
  ongoing: { label: 'Ongoing', tone: 'amber', icon: IconPlay },
  completed: { label: 'Completed', tone: 'green', icon: IconCheckCircle },
  aborted: { label: 'Aborted', tone: 'red', icon: IconClose },
};
export const lifecycleOf = (state) => LIFECYCLE[state] || LIFECYCLE.not_started;

export const shortDate = (at) => (at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
export const initialsOf = (email) => (email || '?').split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';
