import { useEffect, useId, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import pages from '../pages/pages.module.css';
import Button from '../ui/Button.jsx';
import { IconCheck, IconChevronLeft, IconImage, IconPlay, IconSend } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import { addComment, characterImagePath, decideFilm, filmPath, getProject, placeImagePath, sketchPath } from './clientApi.js';
import { AuthImage, dateText, FilmPill, ProjectPill, STEP_WORDS, Thread, useFileUrl } from './ClientParts.jsx';
import c from './Client.module.css';

/**
 * One project, for the client: the story tabs, each story's film (watch, approve or ask for changes), where the
 * story stands, the approved story text, storyboard with sketches, characters and places, and the conversation
 * with the Team Leader. Parts the studio has not approved yet are not shown.
 */
export default function ClientProjectPage({ projectId }) {
  const { search, navigate } = useRouter();
  const { data: project, loading, error, reload } = useResource(() => getProject(projectId), [projectId]);
  useDocumentTitle(project ? project.title : 'Project');
  const wanted = Number(new URLSearchParams(search).get('story')) || null;
  const stories = project?.stories || [];
  const story = stories.find((s) => s.id === wanted) || stories[0] || null;

  const pick = (id) => navigate(`/client/projects/${projectId}?story=${id}`, { replace: true });

  return (
    <div className={pages.page}>
      <Link to="/client/projects" className={c.back}>
        <IconChevronLeft width={16} height={16} />
        My Projects
      </Link>
      <div className={c.headRow}>
        <div>
          <h1 className={c.pageTitle}>{project ? project.title : 'Project'}</h1>
          {project && (
            <div className={c.meta} style={{ marginTop: 10 }}>
              <ProjectPill project={project} />
              <span className={c.small}>
                {project.studio}
                {project.teamLeader ? `, Team Leader ${project.teamLeader.name}` : ''}
                {project.deadline ? `, due ${dateText(project.deadline)}` : ''}
              </span>
            </div>
          )}
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </div>

      {error && <Notice message={error.status === 404 ? 'This project is not in your portal.' : error.message || 'The project could not be loaded.'} onRetry={error.status === 404 ? undefined : reload} />}

      {project && stories.length === 0 && (
        <div className={cx(c.card, c.pad)}>
          <p className={c.empty}>The studio has not started a story for this project yet. You will see it here as soon as it is ready.</p>
        </div>
      )}

      {project && story && (
        <>
          {stories.length > 1 && (
            <div className={c.tabs} role="tablist" aria-label="Stories">
              {stories.map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === story.id} className={cx(c.tab, s.id === story.id && c.tabOn)} onClick={() => pick(s.id)}>
                  {s.title}
                </button>
              ))}
            </div>
          )}
          <StoryView key={story.id} project={project} story={story} onChanged={reload} />
        </>
      )}

      {project && <Conversation project={project} story={story} onSent={reload} />}
    </div>
  );
}

function StoryView({ project, story, onChanged }) {
  const [open, setOpen] = useState(false);
  const sketchOf = (no) => story.sketches?.find((s) => s.no === no) || null;
  const cast = [...(story.characters || []).map((x) => ({ ...x, kind: 'character' })), ...(story.places || []).map((x) => ({ ...x, kind: 'place' }))];
  const paragraphs = (story.content || '').split(/\n{2,}|\r\n\r\n/).filter((p) => p.trim());

  return (
    <>
      <div className={c.hero}>
        <FilmPlayer project={project} story={story} />
        <section className={cx(c.card, c.pad)} aria-labelledby="stands-title">
          <div className={c.rowHead}>
            <h2 id="stands-title" className={c.h2} style={{ margin: 0 }}>
              Where it stands
            </h2>
            <FilmPill film={story.film} />
          </div>
          <ol className={c.timeline}>
            {story.steps.map((s, i) => (
              <li key={s.key} className={c.stepRow}>
                <span className={cx(c.stepDot, s.status === 'done' && c.stepDone, s.status === 'working' && c.stepWorking, (s.status === 'for_you' || s.status === 'changes_asked') && c.stepForYou)} aria-hidden="true">
                  {s.status === 'done' ? <IconCheck width={14} height={14} /> : i + 1}
                </span>
                <span>{s.label}</span>
                <span className={c.small}>{s.status === 'done' && s.doneAt ? dateText(s.doneAt) : STEP_WORDS[s.status]}</span>
              </li>
            ))}
          </ol>
          <FilmDecision project={project} story={story} onChanged={onChanged} />
        </section>
      </div>

      <section className={cx(c.card, c.pad, c.section)} aria-labelledby="story-title">
        <div className={c.rowHead}>
          <h2 id="story-title" className={c.h2} style={{ margin: 0 }}>
            The story
          </h2>
          {story.content && paragraphs.length > 2 && (
            <button type="button" className={c.linkButton} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? 'Show less' : 'Read all of it'}
            </button>
          )}
        </div>
        {story.content ? (
          <div className={cx(c.storyText, !open && paragraphs.length > 2 && c.storyShut)}>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className={c.empty}>The studio is still writing the story. You can read it here once it is approved.</p>
        )}
      </section>

      <section className={c.section} aria-labelledby="board-title">
        <div className={c.rowHead}>
          <h2 id="board-title" className={c.h2} style={{ margin: 0 }}>
            Storyboard
          </h2>
          {story.scenes && <span className={c.small}>{story.scenes.length === 1 ? '1 scene' : `${story.scenes.length} scenes`}</span>}
        </div>
        {story.scenes ? (
          <ul className={c.scenes}>
            {story.scenes.map((sc) => {
              const sk = sketchOf(sc.no);
              return (
                <li key={sc.no} className={cx(c.card, c.scene)}>
                  <div className={c.sceneArt}>
                    <AuthImage
                      path={sk?.sketchId ? sketchPath(project.id, story.id, sk.sceneId, sk.sketchId) : null}
                      alt={`Sketch of scene ${sc.no}`}
                      fallback={<IconImage width={26} height={26} aria-hidden="true" />}
                    />
                  </div>
                  <div className={c.sceneBody}>
                    <b>
                      {sc.no}. {sc.title}
                    </b>
                    {sc.place && <span className={c.small}>{sc.place}</span>}
                    {sc.summary && <span>{sc.summary.length > 160 ? `${sc.summary.slice(0, 160)}…` : sc.summary}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={cx(c.card, c.pad)}>
            <p className={c.empty}>The storyboard is not ready yet.</p>
          </div>
        )}
      </section>

      <section className={c.section} aria-labelledby="cast-title">
        <h2 id="cast-title" className={c.h2}>
          Characters and places
        </h2>
        {cast.length ? (
          <ul className={c.cast}>
            {cast.map((x) => (
              <li key={`${x.kind}-${x.id}`} className={cx(c.card, c.castItem)}>
                <span className={c.castArt}>
                  <AuthImage
                    path={x.image ? (x.kind === 'character' ? characterImagePath : placeImagePath)(project.id, story.id, x.id, x.image) : null}
                    alt={x.name}
                    fallback={<span aria-hidden="true">{(x.name || '?').slice(0, 1).toUpperCase()}</span>}
                  />
                </span>
                <b>{x.name}</b>
                <span className={c.small}>{x.kind === 'place' ? 'Place' : x.role || 'Character'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={cx(c.card, c.pad)}>
            <p className={c.empty}>The characters and places show here once the studio approves them.</p>
          </div>
        )}
      </section>
    </>
  );
}

function FilmPlayer({ project, story }) {
  const [play, setPlay] = useState(false);
  const ready = story.film.state !== 'not_ready' && story.film.jobId;
  const url = useFileUrl(play && ready ? filmPath(project.id, story.id, story.film.jobId) : null);

  if (!ready) {
    return (
      <div className={c.player}>
        <p className={c.playerNote}>The film of “{story.title}” is being made. It shows up here as soon as the studio approves it.</p>
      </div>
    );
  }
  if (play && url) {
    return (
      <div className={c.player}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls autoPlay playsInline aria-label={`Film of ${story.title}`} />
      </div>
    );
  }
  return (
    <div className={c.player}>
      {play && url === null ? (
        <p className={c.playerNote}>The film could not be opened. Try again in a moment.</p>
      ) : (
        <button type="button" className={c.playButton} onClick={() => setPlay(true)} aria-busy={play || undefined}>
          <span className={c.playDisc}>
            <IconPlay width={24} height={24} />
          </span>
          {play ? 'Opening the film…' : `Watch “${story.title}”`}
        </button>
      )}
    </div>
  );
}

function FilmDecision({ project, story, onChanged }) {
  const toast = useToast();
  const uid = useId();
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const film = story.film;

  const decide = async (decision) => {
    if (decision === 'changes' && !text.trim()) {
      toast('Say what should change first.', 'error');
      return;
    }
    setBusy(decision);
    try {
      await decideFilm(project.id, story.id, decision, decision === 'changes' ? text.trim() : '');
      toast(decision === 'approve' ? 'Film approved. The studio has been told.' : 'Changes sent to the studio.');
      setAsking(false);
      setText('');
      onChanged();
    } catch (error) {
      toast(error.message || 'That did not work. Try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  if (film.state === 'not_ready') return <p className={c.callout}>You will be able to watch and approve the film here once it is ready.</p>;
  if (film.state === 'approved') return <p className={cx(c.callout, c.calloutOk)}>You approved this film{film.decidedAt ? ` on ${dateText(film.decidedAt)}` : ''}.</p>;
  if (film.state === 'changes_asked')
    return (
      <p className={cx(c.callout, c.calloutWarn)}>
        You asked for changes{film.decidedAt ? ` on ${dateText(film.decidedAt)}` : ''}: “{film.comment}” The studio is working on them, and the new film comes back here.
      </p>
    );

  return (
    <div className={c.compose}>
      <p className={c.callout}>The film is ready. Watch it, then approve it or tell the studio what to change.</p>
      {asking && (
        <>
          <label htmlFor={`${uid}-changes`} className={c.small}>
            What should change?
          </label>
          <textarea id={`${uid}-changes`} className={c.textarea} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="For example: the ending feels rushed, hold the last shot longer." autoFocus />
        </>
      )}
      <div className={c.actions}>
        {asking ? (
          <>
            <Button variant="primary" icon={IconSend} loading={busy === 'changes'} disabled={!!busy} onClick={() => decide('changes')}>
              Send changes
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" icon={IconCheck} loading={busy === 'approve'} disabled={!!busy} onClick={() => decide('approve')}>
              Approve film
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => setAsking(true)}>
              Ask for changes
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** The project's conversation with the Team Leader (all stories), with a box to write. */
export function Conversation({ project, story, onSent }) {
  const toast = useToast();
  const uid = useId();
  const [text, setText] = useState('');
  const [about, setAbout] = useState(story ? String(story.id) : '');
  const [sending, setSending] = useState(false);
  useEffect(() => setAbout(story ? String(story.id) : ''), [story]);

  const send = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await addComment(project.id, text.trim(), about || null);
      setText('');
      toast('Message sent.');
      onSent();
    } catch (error) {
      toast(error.message || 'The message could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={cx(c.card, c.pad, c.section)} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className={c.h2}>
        Messages with {project.teamLeader ? project.teamLeader.name : 'the studio'}
      </h2>
      <Thread comments={project.comments || []} empty="No messages yet. Ask a question or leave a note for the studio." />
      <form className={c.compose} onSubmit={send}>
        <label htmlFor={`${uid}-text`} className="cm-sr-only">
          Your message
        </label>
        <textarea id={`${uid}-text`} className={c.textarea} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Write to the studio…" />
        <div className={c.composeFoot}>
          {project.stories.length > 0 ? (
            <label className={c.small}>
              About{' '}
              <select className={c.select} value={about} onChange={(e) => setAbout(e.target.value)}>
                <option value="">The whole project</option>
                {project.stories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span />
          )}
          <Button type="submit" variant="primary" icon={IconSend} loading={sending} disabled={!text.trim()}>
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}
