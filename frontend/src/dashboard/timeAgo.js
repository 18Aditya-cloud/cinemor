// "just now", "5 min ago", "2 h ago", "3 d ago", or the date for anything older. `at` is a number (ms) or an ISO date string.
export default function timeAgo(at, now = Date.now()) {
  const time = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(time)) return '';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
