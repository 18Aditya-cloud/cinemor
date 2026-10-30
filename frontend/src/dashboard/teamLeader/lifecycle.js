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

/*
 * The order projects are listed in: Ongoing first (the nearest deadline first), then Not started (the nearest start
 * first), then Completed and then Aborted (the most recently changed first). Days are "YYYY-MM-DD"; a project without
 * the date goes after the ones that have it.
 */
const RANK = { ongoing: 0, not_started: 1, completed: 2, aborted: 3 };
const dayValue = (day) => (/^\d{4}-\d{2}-\d{2}/.test(day || '') ? day.slice(0, 10) : '9999-99-99');
export function sortProjects(projects) {
  return [...projects].sort((a, b) => {
    const ra = RANK[a.lifecycle] ?? 1;
    const rb = RANK[b.lifecycle] ?? 1;
    if (ra !== rb) return ra - rb;
    if (a.lifecycle === 'ongoing') return dayValue(a.deadline).localeCompare(dayValue(b.deadline)) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (a.lifecycle === 'not_started') return dayValue(a.startDate).localeCompare(dayValue(b.startDate)) || dayValue(a.deadline).localeCompare(dayValue(b.deadline));
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}