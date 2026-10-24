import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import pages from '../pages/pages.module.css';
import { IconMail } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { getProject, listProjects } from './clientApi.js';
import { Conversation } from './ClientProjectPage.jsx';
import c from './Client.module.css';

/** The conversations with the studio, one per project. */
export default function ClientMessagesPage() {
  useDocumentTitle('Messages');
  const list = useResource(listProjects, []);
  const [chosen, setChosen] = useState(null);
  const projects = list.data || [];
  const currentId = chosen || projects[0]?.id || null;
  const one = useResource(() => (currentId ? getProject(currentId) : Promise.resolve(null)), [currentId]);

  return (
    <div className={pages.page}>
      <div className={c.headRow}>
        <div>
          <h1 className={c.pageTitle}>Messages</h1>
          <p className={c.lead}>Talk to the Team Leader of each project. They get a notification when you write.</p>
        </div>
        <RefreshButton
          onClick={() => {
            list.reload();
            one.reload();
          }}
          loading={list.loading || one.loading}
        />
      </div>
      {list.error && <Notice message={list.error.message || 'Your projects could not be loaded.'} onRetry={list.reload} />}
      {list.data && projects.length === 0 && <EmptyState icon={IconMail} title="No conversations yet" text="Each project you have with the studio gets its own conversation here." />}
      {projects.length > 0 && (
        <div className={c.split}>
          <nav className={c.card} aria-label="Projects">
            <ul className={c.pickList}>
              {projects.map((p) => (
                <li key={p.id}>
                  <button type="button" className={cx(c.pick, p.id === currentId && c.pickOn)} aria-current={p.id === currentId || undefined} onClick={() => setChosen(p.id)}>
                    <b>{p.title}</b>
                    <span className={c.small}>{p.teamLeader ? p.teamLeader.name : p.studio}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div style={{ minWidth: 0 }}>
            {one.error && <Notice message={one.error.message || 'The conversation could not be loaded.'} onRetry={one.reload} />}
            {one.data && one.data.id === currentId && <Conversation project={one.data} story={null} onSent={one.reload} />}
          </div>
        </div>
      )}
    </div>
  );
}
