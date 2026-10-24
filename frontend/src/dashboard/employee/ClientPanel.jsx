import { useId, useState } from 'react';
import cx from '../../utils/cx.js';
import { Thread } from '../client/ClientParts.jsx';
import c from '../client/Client.module.css';
import useResource from '../hooks/useResource.js';
import Button from '../ui/Button.jsx';
import { IconSend } from '../ui/DashIcons.jsx';
import Pill from '../ui/Pill.jsx';
import { useToast } from '../ui/Toast.jsx';
import { getClientComments, replyToClient } from './employeeApi.js';
import e from './Employee.module.css';

/**
 * The Team Leader's side of the client portal, on the project page: whether the client is on the portal, what they
 * decided about each film, and the conversation, with a box to answer.
 */
export default function ClientPanel({ project }) {
  const toast = useToast();
  const uid = useId();
  const { data, error, reload } = useResource(() => getClientComments(project.id), [project.id]);
  const [text, setText] = useState('');
  const [about, setAbout] = useState('');
  const [sending, setSending] = useState(false);
  const titleOf = (id) => project.stories.find((s) => s.id === id)?.title || 'A story';

  const send = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await replyToClient(project.id, text.trim(), about || null);
      setText('');
      toast('Reply sent to the client.');
      reload();
    } catch (err) {
      toast(err.message || 'The reply could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={cx(e.card, e.railCard)} aria-labelledby={`${uid}-title`}>
      <div className={e.cardHead} style={{ marginBottom: 8 }}>
        <h2 id={`${uid}-title`} className={e.cardTitle}>
          Client
        </h2>
        {data && <Pill tone={data.client.onPortal ? 'green' : 'gray'}>{data.client.onPortal ? 'On the portal' : 'Not on the portal'}</Pill>}
      </div>
      {error && <p className={e.empty}>{error.message || 'The client messages could not be loaded.'}</p>}
      {data && (
        <>
          <p className={e.small} style={{ marginBottom: 10 }}>
            {data.client.name || 'No client'}
            {data.client.email ? ` (${data.client.email})` : ''}
            {!data.client.onPortal && data.client.name ? '. The organization admin can invite them from the Clients page.' : ''}
          </p>
          {data.decisions.length > 0 && (
            <ul className={c.updates} style={{ marginBottom: 12 }}>
              {data.decisions.map((d) => (
                <li key={d.storyId} className={c.update}>
                  <span className={c.dot} style={{ background: d.decision === 'approved' ? 'var(--d-success-fg)' : 'var(--d-warn-fg)' }} aria-hidden="true" />
                  <span>
                    <b>{titleOf(d.storyId)}</b>: {d.decision === 'approved' ? 'film approved' : 'changes asked'}
                    {d.comment ? ` (“${d.comment}”)` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Thread comments={data.comments} side="team" empty="The client has not written yet." />
          {project.isTeamLeader && data.client.onPortal && (
            <form className={c.compose} onSubmit={send}>
              <label htmlFor={`${uid}-text`} className="cm-sr-only">
                Reply to the client
              </label>
              <textarea id={`${uid}-text`} className={c.textarea} value={text} onChange={(ev) => setText(ev.target.value)} maxLength={4000} placeholder="Reply to the client…" />
              <div className={c.composeFoot}>
                {project.stories.length > 0 ? (
                  <select className={c.select} value={about} onChange={(ev) => setAbout(ev.target.value)} aria-label="About">
                    <option value="">The whole project</option>
                    {project.stories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span />
                )}
                <Button type="submit" icon={IconSend} loading={sending} disabled={!text.trim()}>
                  Reply
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
