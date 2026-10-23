import { useEffect, useId, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import { AI_EDIT_LIMIT, listModels } from '../../services/storyApi.js';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconBook, IconCheck, IconClose, IconInfo, IconSparkles } from '../ui/DashIcons.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import CinemorOrb from './CinemorOrb.jsx';
import { acceptStoryEdit, discardStoryEdit, getProject, getProjectStory, isLive, previewStoryEdit, restoreStoryVersion, STORY_SOURCES, updateProjectStory, VERSION_REASONS } from './individualApi.js';
import { IconArrowLeft, IconSave } from './parts.jsx';
import { IconChats, IconRestore } from './StoryIcons.jsx';
import { wordsIn } from './storyOptions.js';
import s from './StoryEditor.module.css';

const load = (projectId, storyId) => Promise.all([getProject(projectId), getProjectStory(projectId, storyId), listModels()]);
const when = (at) => (at ? new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-');

/**
 * The Story Editor (/dashboard/projects/:id/stories/:storyId/edit): edit a story's title and text, ask the AI to
 * change it (the change is shown as a preview and only saved when accepted), and go back to any earlier version.
 * Every save adds a version; nothing is ever overwritten, so restoring is always possible. What is done here also
 * shows up in the story's chat on the Story page ("Open Chat").
 */
export default function StoryEditorPage({ projectId, storyId }) {
  const { data, error, reload } = useResource(() => load(projectId, storyId), [projectId, storyId]);
  const back = `/dashboard/projects/${projectId}`;
  const [project, loaded, models] = data ?? [];
  useDocumentTitle(loaded ? `Edit: ${loaded.title}` : 'Story Editor');

  if (!data) {
    return (
      <div className={s.page} aria-busy={!error}>
        <Link to={back} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        {error && <Notice message={error.message} onRetry={reload} />}
      </div>
    );
  }
  return <Editor key={loaded.id} project={project} initial={loaded} models={models} back={back} />;
}

function Editor({ project, initial, models, back }) {
  const uid = useId();
  const toast = useToast();
  const { navigate } = useRouter();
  const [story, setStory] = useState(initial); // what is saved
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [restoring, setRestoring] = useState(null); // the version asked to be restored
  const dirty = title.trim() !== story.title || content.trim() !== story.content;
  const current = story.versions[story.versions.length - 1];

  // leaving the page (closing the tab, reloading) with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const take = (saved) => {
    setStory(saved);
    setTitle(saved.title);
    setContent(saved.content);
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaveError('');
    if (!title.trim()) return setSaveError('Give the story a title.');
    if (!content.trim()) return setSaveError('The story is empty.');
    setSaving(true);
    try {
      take(await updateProjectStory(project.id, story.id, { title, content, reason: 'user_edit' }));
      toast('Changes saved');
    } catch (err) {
      setSaveError(err.message);
    }
    setSaving(false);
    return undefined;
  };

  const words = wordsIn(content);

  return (
    <div className={s.page}>
      <div className={s.head}>
        <Link to={back} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        <div className={s.headRow}>
          <div className={s.headText}>
            <h1 className={s.title}>Story Editor</h1>
            <p className={s.sub}>Edit your story, use AI to suggest changes, and manage previous versions.</p>
          </div>
          <div className={s.headActions}>
            {dirty && <span className={s.unsaved}>Unsaved changes</span>}
            <Button variant="secondary" icon={IconChats} onClick={() => navigate(`/dashboard/projects/${project.id}/story/${story.id}`)} disabled={dirty} title={dirty ? 'Save or discard your changes first' : undefined}>
              Open Chat
            </Button>
            <Button icon={IconSave} onClick={save} loading={saving} disabled={!dirty}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      <div className={s.layout}>
        <div className={s.main}>
          <section className={s.card} aria-labelledby={`${uid}-story`}>
            <div className={s.cardHead}>
              <span className={s.tile} aria-hidden="true">
                <IconBook width={20} height={20} />
              </span>
              <div>
                <h2 id={`${uid}-story`} className={s.cardTitle}>
                  Story
                </h2>
                <p className={s.cardSub}>{project.title}</p>
              </div>
            </div>
            <label className={s.label} htmlFor={`${uid}-title`}>
              Story Title
            </label>
            <input
              id={`${uid}-title`}
              className={s.input}
              value={title}
              maxLength={200}
              onChange={(event) => {
                setTitle(event.target.value);
                setSaveError('');
              }}
            />
            <label className={s.label} htmlFor={`${uid}-content`}>
              Story Content
            </label>
            <textarea
              id={`${uid}-content`}
              className={cx(s.input, s.content)}
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setSaveError('');
              }}
              onKeyDown={(event) => {
                if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  save();
                }
              }}
            />
            {saveError && (
              <p className={s.error} role="alert">
                {saveError}
              </p>
            )}
            <div className={s.cardFoot}>
              <span className={s.muted}>
                {words.toLocaleString('en-IN')} words{dirty ? ' · not saved yet' : ''}
              </span>
              <div className={s.footActions}>
                {dirty && (
                  <Button variant="secondary" onClick={() => take(story)} disabled={saving}>
                    Discard
                  </Button>
                )}
                <Button icon={IconSave} onClick={save} loading={saving} disabled={!dirty}>
                  Save Changes
                </Button>
              </div>
            </div>
          </section>

          <AiEdit project={project} story={story} title={title} content={content} models={models} dirty={dirty} onAccepted={take} />
        </div>

        <aside className={s.side} aria-label="Versions and story information">
          <section className={s.card} aria-labelledby={`${uid}-versions`}>
            <h2 id={`${uid}-versions`} className={s.cardTitle}>
              Version History
            </h2>
            <p className={s.cardSub}>Every save is kept. Restore any of them.</p>
            <ol className={s.versions}>
              {[...story.versions].reverse().map((v) => {
                const isCurrent = v.no === current.no;
                return (
                  <li key={v.no} className={cx(s.version, isCurrent && s.versionNow)}>
                    <div className={s.versionTop}>
                      <span className={s.versionNo}>Version {v.no}</span>
                      <span className={cx(s.reason, s[`reason_${v.reason}`])}>{VERSION_REASONS[v.reason] || v.reason}</span>
                    </div>
                    <p className={s.versionMeta}>
                      {timeAgo(v.at)}
                      {v.from ? ` · from version ${v.from}` : ''} · {wordsIn(v.content).toLocaleString('en-IN')} words
                    </p>
                    {isCurrent ? (
                      <span className={s.currentTag}>
                        <IconCheck width={14} height={14} strokeWidth={3} /> Current
                      </span>
                    ) : (
                      <button type="button" className={s.restore} onClick={() => setRestoring(v)}>
                        <IconRestore width={15} height={15} /> Restore Version
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className={s.card} aria-labelledby={`${uid}-info`}>
            <h2 id={`${uid}-info`} className={s.cardTitle}>
              Story Information
            </h2>
            <dl className={s.info}>
              <Info label="Story ID" value={`#${story.id}`} />
              <Info label="Source" value={STORY_SOURCES[story.source]} />
              {story.fileName && <Info label="File" value={story.fileName} />}
              {story.model && <Info label="AI model" value={story.model} />}
              <Info label="Created" value={when(story.createdAt)} />
              <Info label="Last saved" value={when(story.updatedAt)} />
              <Info label="Words" value={wordsIn(story.content).toLocaleString('en-IN')} />
              <Info label="Versions" value={story.versions.length} />
            </dl>
          </section>
        </aside>
      </div>

      <RestoreModal
        version={restoring}
        dirty={dirty}
        next={story.versions.length + 1}
        onClose={() => setRestoring(null)}
        onConfirm={async () => {
          take(await restoreStoryVersion(project.id, story.id, restoring.no));
          toast(`Version ${restoring.no} restored`);
        }}
      />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className={s.infoRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** "Restore version N?" The current text is not lost: restoring adds a new version. */
function RestoreModal({ version, dirty, next, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(version);
  if (version && version !== shown) setShown(version);
  useEffect(() => {
    if (version) {
      setBusy(false);
      setError('');
    }
  }, [version]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(version)} onClose={onClose} icon={IconRestore} title={`Restore version ${shown?.no ?? ''}?`}>
      <div className={s.modalBody}>
        <p>
          The story goes back to version {shown?.no}. It is saved as version {next}, so the current text stays in the history.
        </p>
        {dirty && <p className={s.warn}>Your unsaved changes will be lost.</p>}
        {shown && (
          <div className={s.modalPreview}>
            <p className={s.previewTitle}>{shown.title}</p>
            <p className={s.previewText}>{shown.content.slice(0, 400)}{shown.content.length > 400 ? '...' : ''}</p>
          </div>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button icon={IconRestore} onClick={confirm} loading={busy} data-autofocus>
            Restore Version
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

/* ====================================================================================== AI Edit */
const SUGGESTIONS = ['Make it more suspenseful', 'Shorten it', 'Add more dialogue', 'Make the ending happier', 'Simplify the language for children'];

/**
 * Ask the AI to change the story. It rewrites what is in the editor now (saved or not); the result is shown as a
 * preview, and only "Accept" replaces the story (saved as a new 'AI edit' version).
 */
function AiEdit({ project, story, title, content, models, dirty, onAccepted }) {
  const uid = useId();
  const toast = useToast();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { title, content, instruction }
  const [accepting, setAccepting] = useState(false);
  const model = (models.find((m) => m.id === story.settings?.model) || models[0])?.id;
  const tooLong = !isLive && title.length + content.length + instruction.length + 300 > AI_EDIT_LIMIT;

  const generate = async (event) => {
    event?.preventDefault();
    setError('');
    const ask = instruction.trim();
    if (!ask) return setError('Write what the AI should change.');
    if (!content.trim()) return setError('The story is empty.');
    if (!model && !isLive) return setError('No AI model is available right now.');
    // the backend edits the saved story, so unsaved changes are saved first
    if (isLive && dirty) return setError('Save your changes first: AI Edit works on the saved story.');
    setBusy(true);
    if (preview) discardStoryEdit(project.id, preview.previewId).catch(() => {});
    setPreview(null);
    try {
      setPreview(await previewStoryEdit(project.id, story.id, ask, { title, content, model, language: story.settings?.language || 'English' }));
    } catch (err) {
      setError(err.message || 'The AI edit could not be made. Please try again.');
    }
    setBusy(false);
    return undefined;
  };

  const accept = async () => {
    setAccepting(true);
    try {
      onAccepted(await acceptStoryEdit(project.id, story.id, preview, { note: `AI Edit in the Story Editor: “${preview.instruction}”` }));
      setPreview(null);
      setInstruction('');
      toast('AI edit accepted and saved');
    } catch (err) {
      setError(err.message);
    }
    setAccepting(false);
  };

  return (
    <section className={cx(s.card, s.aiCard)} aria-labelledby={`${uid}-ai`}>
      <div className={s.cardHead}>
        <span className={cx(s.tile, s.tileAi)} aria-hidden="true">
          <IconSparkles width={20} height={20} />
        </span>
        <div>
          <h2 id={`${uid}-ai`} className={s.cardTitle}>
            AI Edit
          </h2>
          <p className={s.cardSub}>Ask AI to modify the current story. Your story is not changed until you accept the preview.</p>
        </div>
      </div>

      <form className={s.aiForm} onSubmit={generate}>
        <label className={s.label} htmlFor={`${uid}-instruction`}>
          Editing Instruction
        </label>
        <textarea
          id={`${uid}-instruction`}
          className={cx(s.input, s.instruction)}
          rows={3}
          maxLength={1000}
          placeholder="e.g. Make the story more suspenseful, and give the ending a twist."
          value={instruction}
          disabled={busy}
          onChange={(event) => {
            setInstruction(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) generate(event);
          }}
        />
        <div className={s.suggestions} aria-label="Suggestions">
          {SUGGESTIONS.map((text) => (
            <button key={text} type="button" className={s.suggestion} disabled={busy} onClick={() => setInstruction(text)}>
              {text}
            </button>
          ))}
        </div>
        {dirty && !busy && !preview && (
          <p className={s.note}>
            <IconInfo width={15} height={15} aria-hidden="true" /> {isLive ? 'Save your changes first: the AI works on the saved story.' : 'The AI works on the text in the editor, including your unsaved changes.'}
          </p>
        )}
        {tooLong && !preview && <p className={s.note}>This story may be too long for AI Edit. Shorter stories work best.</p>}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.aiFoot}>
          <Button type="submit" icon={IconSparkles} loading={busy} disabled={!instruction.trim()}>
            Generate AI Edit
          </Button>
        </div>
      </form>

      {busy && (
        <div className={s.aiWorking} role="status">
          <CinemorOrb size="sm" busy />
          <span>
            Cinemor is editing your story
            <span className={s.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </span>
        </div>
      )}

      {preview && (
        <div className={s.preview} aria-label="AI edit preview">
          <div className={s.previewHead}>
            <span className={s.previewBadge}>Preview</span>
            <span className={s.muted}>&ldquo;{preview.instruction}&rdquo;</span>
          </div>
          <p className={s.previewTitle}>{preview.title}</p>
          <div className={s.previewBody} tabIndex={0} aria-label="Edited story">
            {preview.content}
          </div>
          <div className={s.previewFoot}>
            <span className={s.muted}>
              {wordsIn(preview.content).toLocaleString('en-IN')} words (now {wordsIn(content).toLocaleString('en-IN')})
            </span>
            <div className={s.footActions}>
              <Button
                variant="secondary"
                icon={IconClose}
                onClick={() => {
                  discardStoryEdit(project.id, preview.previewId).catch(() => {});
                  setPreview(null);
                }}
                disabled={accepting}
              >
                Discard
              </Button>
              <Button icon={IconCheck} onClick={accept} loading={accepting}>
                Accept Edit
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
