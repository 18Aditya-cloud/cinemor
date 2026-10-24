import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import pages from '../pages/pages.module.css';
import Button from '../ui/Button.jsx';
import { IconCloud, IconFilm } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import { fileBlob, filmPath, listProjects } from './clientApi.js';
import { dateText, FilmPill } from './ClientParts.jsx';
import c from './Client.module.css';

const fileName = (text) => `${(text || 'film').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'film'}.mp4`;

/** Every finished film of the client's projects, to save. */
export default function ClientDownloadsPage() {
  useDocumentTitle('Downloads');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(listProjects, []);
  const [busy, setBusy] = useState(null);
  const films = [];
  (data || []).forEach((p) =>
    p.stories.forEach((s) => {
      if (s.film.state !== 'not_ready' && s.film.jobId) films.push({ project: p, story: s });
    }),
  );

  const save = async ({ project, story }) => {
    setBusy(story.id);
    try {
      const blob = await fileBlob(filmPath(project.id, story.id, story.film.jobId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(`${project.title} ${story.title}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      toast(e.message || 'The film could not be downloaded.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={pages.page}>
      <div className={c.headRow}>
        <div>
          <h1 className={c.pageTitle}>Downloads</h1>
          <p className={c.lead}>The finished films of your projects. Save a copy to share or keep.</p>
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>
      {error && <Notice message={error.message || 'Your films could not be loaded.'} onRetry={reload} />}
      {data && films.length === 0 && <EmptyState icon={IconFilm} title="No films yet" text="When the studio finishes a film, you can download it here." />}
      {films.length > 0 && (
        <ul className={c.files}>
          {films.map((f) => (
            <li key={f.story.id} className={cx(c.card, c.file)}>
              <span className={c.fileIcon} aria-hidden="true">
                <IconFilm width={20} height={20} />
              </span>
              <span>
                <b>{f.story.title}</b>
                <span className={c.meta}>
                  <Link to={`/client/projects/${f.project.id}?story=${f.story.id}`} className={c.small}>
                    {f.project.title}
                  </Link>
                  {f.story.film.readyAt && <span className={c.small}>Ready {dateText(f.story.film.readyAt)}</span>}
                  <FilmPill film={f.story.film} />
                </span>
              </span>
              <Button variant="secondary" icon={IconCloud} loading={busy === f.story.id} disabled={busy !== null && busy !== f.story.id} onClick={() => save(f)}>
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
