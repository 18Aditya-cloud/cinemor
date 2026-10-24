import { useEffect, useId, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import { listModels } from '../../services/storyApi.js';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconCheck, IconChevronDown, IconClose, IconPencil, IconPlus, IconSparkles, IconTrash, IconWand } from '../ui/DashIcons.jsx';
import Modal from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import CinemorOrb from './CinemorOrb.jsx';
import { deleteProjectStory, getProject, getProjectStory, importProjectStory, latestStorySettings, listProjectStories, restoreStoryVersion, rewriteProjectStory, STORY_SOURCES, writeProjectStory } from './individualApi.js';
import { IconArrowLeft } from './parts.jsx';
import CreativeDirection from './StoryConfig.jsx';
import { IconArrowUp, IconBookOpen, IconChats, IconDocument, IconExport, IconPaperclip, IconRestore, IconUpload } from './StoryIcons.jsx';
import { IMPORT_ACCEPT, readStoryFile } from './storyImport.js';
import { briefFrom, briefTags, LIMITS, toRequest, wordsIn } from './storyOptions.js';
import s from './StoryPage.module.css';

const load = (projectId) => Promise.all([getProject(projectId), listModels(), latestStorySettings(projectId)]);
const storyBase = (projectId) => `/dashboard/projects/${projectId}/story`;
const editorPath = (projectId, storyId) => `/dashboard/projects/${projectId}/stories/${storyId}/edit`;
const byLatest = (list) => [...list].sort((a, b) => (a.updatedAt === b.updatedAt ? b.id - a.id : a.updatedAt < b.updatedAt ? 1 : -1));

/**
 * The Story page of a project. Its addresses:
 *   /dashboard/projects/:id/story            choose "Create with AI" or "Import existing story", and the project's story chats
 *   /dashboard/projects/:id/story/new        a new chat: Creative Direction on the left, the chat on the right
 *   /dashboard/projects/:id/story/import     import a TXT / DOCX story
 *   /dashboard/projects/:id/story/:storyId   one story's chat, opened again with everything said in it
 *
 * Every story has its own chat. The first message (the story idea) writes the story, shaped by the Creative Direction
 * (genre, style, tone, length, audience, educational fields, setting, characters, extra details); every message after
 * that asks Cinemor to change it. Each answer is saved as a new version of the story, and the
 * whole chat is saved with it (see individualApi.js), so it can be continued later from "Chats".
 */
export default function StoryPage({ projectId, view = 'home', storyId = null }) {
  const { data, error, reload } = useResource(() => load(projectId), [projectId]);
  const [project, models, lastSettings] = data ?? [null, [], null];
  useDocumentTitle(project ? `Story: ${project.title}` : 'Story');
  const back = `/dashboard/projects/${projectId}`;

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

  const head = (compact) => (
    <div className={cx(s.pageHead, compact && s.pageHeadCompact)}>
      <Link to={back} className={s.back}>
        <IconArrowLeft width={16} height={16} /> Back to Project
      </Link>
      <div className={s.titleRow}>
        <h1 className={s.pageTitle}>Story</h1>
        <p className={s.pageSub}>{project.title}</p>
      </div>
    </div>
  );

  if (view === 'new' || view === 'chat') {
    return (
      <div className={s.page}>
        {head(true)}
        <Studio project={project} models={models} lastSettings={lastSettings} storyId={view === 'chat' ? storyId : null} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      {head(false)}
      <Choice projectId={projectId} mode={view === 'import' ? 'import' : null} />
      {view === 'import' ? <ImportPanel projectId={projectId} /> : <RecentChats projectId={projectId} />}
    </div>
  );
}

/* ====================================================================================== the choice */
function Choice({ projectId, mode }) {
  const { navigate } = useRouter();
  return (
    <section className={s.choose} aria-labelledby="story-choose">
      <div className={s.chooseHead}>
        <span className={s.chooseIcon} aria-hidden="true">
          <IconWand width={20} height={20} />
        </span>
        <div>
          <h2 id="story-choose" className={s.chooseTitle}>
            Create your story
          </h2>
          <p className={s.chooseSub}>Write a new story with AI, or bring in one you already have.</p>
        </div>
      </div>
      <div className={s.options} role="group" aria-labelledby="story-choose">
        <ModeCard icon={IconSparkles} title="Create with AI" text="Describe your idea and Cinemor writes the complete story." on={mode === 'ai'} onClick={() => navigate(`${storyBase(projectId)}/new`)} />
        <ModeCard
          icon={IconUpload}
          title="Import existing story"
          text="Upload a story you have already written, as a TXT or DOCX file."
          on={mode === 'import'}
          onClick={() => navigate(`${storyBase(projectId)}/import`)}
        />
      </div>
    </section>
  );
}

function ModeCard({ icon: Icon, title, text, on, onClick }) {
  return (
    <button type="button" className={cx(s.option, on && s.optionOn)} aria-pressed={on} onClick={onClick}>
      <span className={s.optionIcon} aria-hidden="true">
        <Icon width={20} height={20} />
      </span>
      <span className={s.optionText}>
        <span className={s.optionTitle}>{title}</span>
        <span className={s.optionSub}>{text}</span>
      </span>
      <span className={s.optionCheck} aria-hidden="true">
        {on && <IconCheck width={14} height={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

/* ====================================================================================== the project's chats */
function RecentChats({ projectId }) {
  const { navigate } = useRouter();
  const toast = useToast();
  const { data: chats, error, reload } = useResource(() => listProjectStories(projectId), [projectId]);
  const remove = async (chat) => {
    await deleteProjectStory(projectId, chat.id);
    toast('Chat deleted');
    await reload();
  };
  return (
    <section className={s.recent} aria-labelledby="story-chats">
      <div className={s.chooseHead}>
        <span className={cx(s.chooseIcon, s.chooseIconQuiet)} aria-hidden="true">
          <IconChats width={20} height={20} />
        </span>
        <div>
          <h2 id="story-chats" className={s.chooseTitle}>
            Story chats
          </h2>
          <p className={s.chooseSub}>Every story keeps its own chat. Open one to carry on where you left off.</p>
        </div>
      </div>
      {error ? (
        <Notice message={error.message} onRetry={reload} />
      ) : !chats ? (
        <p className={s.muted}>Loading chats...</p>
      ) : chats.length === 0 ? (
        <p className={s.emptyChats}>No chats yet. Create a story with AI or import one, and its chat is saved here.</p>
      ) : (
        <ChatList chats={chats} onOpen={(id) => navigate(`${storyBase(projectId)}/${id}`)} onDelete={remove} />
      )}
    </section>
  );
}

/**
 * The story chats, newest first. With `onDelete`, each has a delete button; deleting asks first, right in the list
 * (the chat's story goes too: its versions, and everything made from it).
 */
function ChatList({ chats, currentId, onOpen, onDelete }) {
  const [asking, setAsking] = useState(null); // the chat whose delete is being confirmed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async (chat) => {
    setBusy(true);
    setError('');
    try {
      await onDelete(chat);
      setAsking(null);
    } catch (err) {
      setError(err.message || 'The chat could not be deleted. Please try again.');
    }
    setBusy(false);
  };
  return (
    <ul className={s.chatList} aria-label="Story chats">
      {byLatest(chats).map((chat) => {
        const current = chat.id === currentId;
        if (asking === chat.id) {
          return (
            <li key={chat.id} className={s.chatConfirm} role="group" aria-label={`Delete ${chat.title}?`}>
              <p className={s.chatConfirmTitle}>Delete “{chat.title}”?</p>
              <p className={s.chatConfirmText}>The story, all its versions and this chat are deleted, with anything made from it (its storyboard, characters, sketches and clips). This cannot be undone.</p>
              {error && (
                <p className={s.chatConfirmError} role="alert">
                  {error}
                </p>
              )}
              <span className={s.chatConfirmActions}>
                <Button variant="secondary" onClick={() => setAsking(null)} disabled={busy}>
                  Keep it
                </Button>
                <Button variant="danger" icon={IconTrash} onClick={() => confirm(chat)} loading={busy}>
                  Delete chat
                </Button>
              </span>
            </li>
          );
        }
        return (
          <li key={chat.id} className={s.chatRow}>
            <button type="button" className={cx(s.chatItem, current && s.chatItemOn)} aria-current={current || undefined} onClick={() => onOpen(chat.id)}>
              <span className={s.chatItemTop}>
                <span className={s.chatItemTitle}>{chat.title}</span>
                <span className={s.chatItemTime}>{timeAgo(chat.updatedAt)}</span>
              </span>
              {chat.lastMessage && <span className={s.chatItemLast}>{chat.lastMessage}</span>}
              <span className={s.chatItemMeta}>
                <span className={cx(s.sourceTag, chat.source === 'import' && s.sourceTagImport)}>{STORY_SOURCES[chat.source]}</span>
                <span>
                  {chat.messageCount} {chat.messageCount === 1 ? 'message' : 'messages'}
                </span>
                <span>
                  {chat.versionCount} {chat.versionCount === 1 ? 'version' : 'versions'}
                </span>
              </span>
            </button>
            {onDelete && (
              <button
                type="button"
                className={s.chatDelete}
                aria-label={`Delete chat ${chat.title}`}
                title="Delete chat"
                onClick={() => {
                  setError('');
                  setAsking(chat.id);
                }}
              >
                <IconTrash width={15} height={15} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ====================================================================================== brief + chat */
function Studio({ project, models, lastSettings, storyId }) {
  const uid = useId();
  const toast = useToast();
  const { navigate } = useRouter();
  const base = storyBase(project.id);
  const firstModel = models[0]?.id || '';
  const fresh = () => ({ ...briefFrom(lastSettings, { keepText: false }), model: models.some((m) => m.id === lastSettings?.model) ? lastSettings.model : firstModel });

  const [settings, setSettings] = useState(fresh);
  const [story, setStory] = useState(null); // the open chat's story (with its chat), or null for a new chat
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [attached, setAttached] = useState(null); // { name, content }
  const [busy, setBusy] = useState(null); // null | 'write' | 'rewrite'
  const [pending, setPending] = useState(null); // the message being answered (shown until the answer is saved)
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null); // null | 'history'
  const [briefOpen, setBriefOpen] = useState(!storyId); // (phones: Creative Direction folds away once a chat is open)
  const bodyRef = useRef(null);
  const briefRef = useRef(null);
  const fileRef = useRef(null);

  // open the chat in the address (or start a new one)
  useEffect(() => {
    let live = true;
    setError('');
    setLoadError('');
    briefRef.current?.scrollTo(0, 0);
    if (!storyId) {
      // a new chat: genre, style, tone, length, audience and the model stay; the story's own details are cleared
      setStory(null);
      setSettings((current) => ({ ...briefFrom(current, { keepText: false }), model: current.model || firstModel }));
      setBriefOpen(true);
      return undefined;
    }
    if (story?.id === storyId) return undefined; // just created here
    setStory(null);
    getProjectStory(project.id, storyId).then(
      (loaded) => {
        if (!live) return;
        setStory(loaded);
        const brief = briefFrom(loaded.settings);
        setSettings({ ...brief, model: models.some((m) => m.id === brief.model) ? brief.model : firstModel });
        setBriefOpen(false);
      },
      (err) => live && setLoadError(err.message),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, project.id]);

  // the model: keep the chosen one if it exists, otherwise the first one offered
  useEffect(() => {
    if (!models.length) return;
    setSettings((current) => (models.some((m) => m.id === current.model) ? current : { ...current, model: models[0].id }));
  }, [models]);

  // While Cinemor works, the bottom of the chat stays in view. When an answer arrives (or a chat is opened), the newest
  // answer is shown from its beginning, with the message that asked for it just above when there is room.
  const chatLength = story?.chat?.length || 0;
  const seen = useRef(null);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const smooth = seen.current === story?.id ? 'smooth' : 'auto';
    seen.current = story?.id;
    if (busy) {
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
      return;
    }
    const items = body.querySelectorAll('[data-role]');
    const last = items[items.length - 1];
    if (!last) return;
    const before = last.previousElementSibling;
    const target = last.dataset.role === 'ai' && before?.dataset.role === 'user' && last.offsetTop - before.offsetTop < body.clientHeight * 0.4 ? before : last;
    body.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: smooth });
  }, [chatLength, busy, story?.id]);

  // on phones the chat sits under the brief: bring it into view when Cinemor starts writing, and fold the brief
  const chatRef = useRef(null);
  useEffect(() => {
    if (busy && window.matchMedia('(max-width: 1000px)').matches) {
      setBriefOpen(false);
      requestAnimationFrame(() => chatRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  }, [busy]);

  const change = (patch) => setSettings((current) => ({ ...current, ...patch }));
  const modelName = models.find((m) => m.id === settings.model)?.name || 'AI';

  /** Write the story of a new chat from the story idea (the message) and the Creative Direction. */
  const write = async (userMessage, idea) => {
    let request;
    try {
      if (!settings.model) throw new Error('Choose an AI model first.');
      request = toRequest(settings, idea);
    } catch (err) {
      setError(err.message);
      return false;
    }
    setError('');
    setPending(userMessage);
    setBusy('write');
    try {
      const created = await writeProjectStory(project.id, { request, settings, chat: [userMessage], modelName });
      setStory(created);
      navigate(`${base}/${created.id}`, { replace: true });
      toast('Story saved to the project');
      setPending(null);
      setBusy(null);
      return true;
    } catch (err) {
      setError(err.message || 'The story could not be written. Please try again.');
      setPending(null);
      setBusy(null);
      return false;
    }
  };

  // the chat box: before there is a story it writes one; after that it asks for changes
  const send = async () => {
    if (busy) return;
    const text = message.trim();
    if (!text && !attached) {
      setError(story ? 'Write what you would like to change.' : 'Describe your story idea in the message box.');
      return;
    }
    const withFile = attached ? `${text}${text ? '\n\n' : ''}Use this material:\n${attached.content}` : text;
    const userMessage = { role: 'user', kind: 'message', text: text || `Use ${attached.name}`, file: attached?.name, tags: story ? undefined : briefTags(settings) };
    const restore = { message, attached };
    setMessage('');
    setAttached(null);
    let ok;
    if (!story) {
      ok = await write(userMessage, withFile);
    } else {
      setError('');
      setPending(userMessage);
      setBusy('rewrite');
      try {
        // the rewrite keeps to the Creative Direction as it is now
        const extra = toRequest(settings, withFile);
        setStory(await rewriteProjectStory(project.id, story.id, { instruction: withFile, chat: [userMessage], settings, model: settings.model, language: settings.language, extra }));
        ok = true;
      } catch (err) {
        setError(err.message || 'The story could not be changed. Please try again.');
        ok = false;
      }
      setPending(null);
      setBusy(null);
    }
    if (!ok) {
      // give the message back so it can be sent again
      setMessage(restore.message);
      setAttached(restore.attached);
    }
  };

  const attach = async (file) => {
    if (!file) return;
    try {
      const read = await readStoryFile(file);
      setAttached({ name: read.fileName, content: read.content });
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreVersion = async (no) => {
    try {
      setStory(await restoreStoryVersion(project.id, story.id, no));
      toast(`Version ${no} restored`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const latestNo = story?.versions.length || 0;
  // The current version is always shown in full. A version saved outside the chat (the Story Editor, a restore, or any
  // change when the chat was rebuilt on another device, e.g. a reviewer's) has only a line in the chat; its text is
  // added under that line, so opening a story shows its newest version and the older ones stay above in the chat.
  const chat = story?.chat || [];
  const messages =
    !latestNo || chat.some((m) => m.role === 'ai' && m.version === latestNo)
      ? chat
      : (() => {
          const current = { id: 'current-version', role: 'ai', version: latestNo, at: story.versions[latestNo - 1]?.at };
          const line = chat.findIndex((m) => m.role === 'event' && m.version === latestNo);
          return line === -1 ? [...chat, current] : [...chat.slice(0, line + 1), current, ...chat.slice(line + 1)];
        })();
  const talking = messages.length > 0 || Boolean(pending);

  return (
    <div className={s.studio}>
      {/* ---------------------------------------------------------------- the brief */}
      <section className={cx(s.brief, briefOpen && s.briefOpen)} aria-labelledby={`${uid}-brief`}>
        <button type="button" className={s.briefToggle} aria-expanded={briefOpen} onClick={() => setBriefOpen((o) => !o)}>
          <span className={s.briefIcon} aria-hidden="true">
            <IconBookOpen width={19} height={19} />
          </span>
          <span className={s.briefHeading}>
            <span id={`${uid}-brief`} className={s.briefTitle}>
              Creative Direction
            </span>
            <span className={s.briefSub}>Select the genre, style, and tone.</span>
          </span>
          <span className={s.briefToggleHint}>{briefOpen ? 'Hide' : 'Show'}</span>
          <IconChevronDown width={18} height={18} className={s.briefChevron} aria-hidden="true" />
        </button>
        <div ref={briefRef} className={s.briefBody}>
          <CreativeDirection settings={settings} onChange={change} disabled={Boolean(busy)} />
        </div>
      </section>

      {/* ---------------------------------------------------------------- the chat */}
      <section ref={chatRef} className={s.chat} aria-label="Story chat">
        <div className={s.chatHead}>
          <label className={s.modelPick}>
            <span className="cm-sr-only">AI model</span>
            <select value={settings.model} onChange={(event) => change({ model: event.target.value })} disabled={Boolean(busy)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <IconChevronDown width={16} height={16} aria-hidden="true" />
          </label>
          <p className={s.chatTitle} title={story?.title}>
            {story ? story.title : storyId && !loadError ? 'Opening chat...' : 'New story'}
          </p>
          <div className={s.chatActions}>
            <button type="button" className={s.pill} onClick={() => setPanel('history')} disabled={Boolean(busy)} aria-label="Chats">
              <IconChats width={16} height={16} /> <span className={s.pillText}>Chats</span>
            </button>
            <button type="button" className={s.pill} onClick={() => navigate(`${base}/new`)} disabled={Boolean(busy) || !storyId} aria-label="New chat">
              <IconPlus width={16} height={16} /> <span className={s.pillText}>New chat</span>
            </button>
            {story && (
              <>
                <button type="button" className={s.pill} onClick={() => navigate(editorPath(project.id, story.id))} disabled={Boolean(busy)} aria-label="Edit Story">
                  <IconPencil width={16} height={16} /> <span className={s.pillText}>Edit</span>
                </button>
                <button type="button" className={s.pill} onClick={() => exportStory(story)} aria-label="Export">
                  <IconExport width={16} height={16} /> <span className={s.pillText}>Export</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div ref={bodyRef} className={s.chatBody} aria-live="polite">
          {loadError ? (
            <div className={s.chatNotice}>
              <Notice message={loadError} />
              <Button variant="secondary" icon={IconPlus} onClick={() => navigate(`${base}/new`)}>
                Start a new chat
              </Button>
            </div>
          ) : storyId && !story ? (
            <p className={cx(s.muted, s.chatLoading)}>Opening chat...</p>
          ) : !talking ? (
            <div className={s.hero}>
              <CinemorOrb className={s.orb} />
              <h2 className={s.heroTitle}>Ready to create your story?</h2>
              <p className={s.heroText}>Choose the creative direction, then describe your story idea below. Everything you say here is saved with the story.</p>
            </div>
          ) : (
            <ol className={s.thread} aria-label="Chat messages">
              {messages.map((m) => (
                <li key={m.id} className={s.threadItem} data-role={m.role}>
                  {m.role === 'user' ? (
                    <UserMessage message={m} />
                  ) : m.role === 'ai' ? (
                    <AiMessage key={m.version === latestNo ? 'current' : 'older'} story={story} message={m} latest={m.version === latestNo} onEdit={() => navigate(editorPath(project.id, story.id))} onExport={() => exportStory(story)} onRestore={() => restoreVersion(m.version)} />
                  ) : (
                    <EventLine message={m} />
                  )}
                </li>
              ))}
              {pending && (
                <li className={s.threadItem}>
                  <UserMessage message={pending} />
                </li>
              )}
              {busy && (
                <li className={s.threadItem}>
                  <div className={s.aiRow}>
                    <CinemorOrb size="sm" busy />
                    <div className={s.aiBody}>
                      <p className={s.aiName}>Cinemor AI</p>
                      <p className={s.aiStatus} role="status">
                        {busy === 'rewrite' ? 'Rewriting your story' : 'Building your story'}
                        <span className={s.dots} aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </p>
                    </div>
                  </div>
                </li>
              )}
            </ol>
          )}
        </div>

        <div className={s.composerWrap}>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <form
            className={cx(s.composer, busy && s.composerBusy)}
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            {attached && (
              <span className={s.attachChip}>
                <IconDocument width={15} height={15} />
                <span className={s.attachName}>{attached.name}</span>
                <span className={s.attachMeta}>{wordsIn(attached.content).toLocaleString('en-IN')} words</span>
                <button type="button" onClick={() => setAttached(null)} aria-label={`Remove ${attached.name}`}>
                  <IconClose width={14} height={14} />
                </button>
              </span>
            )}
            <div className={s.composerRow}>
              <button type="button" className={s.attach} onClick={() => fileRef.current?.click()} disabled={Boolean(busy)} aria-label="Attach a document" title="Attach a TXT or DOCX document">
                <IconPaperclip width={19} height={19} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={IMPORT_ACCEPT}
                hidden
                data-testid="chat-file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  attach(file);
                }}
              />
              <label htmlFor={`${uid}-message`} className="cm-sr-only">
                Message
              </label>
              <textarea
                id={`${uid}-message`}
                className={s.message}
                rows={1}
                maxLength={LIMITS.message}
                placeholder={story ? 'Ask for changes...' : 'Send a message...'}
                value={message}
                disabled={Boolean(busy)}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <button type="submit" className={s.send} disabled={Boolean(busy)} aria-label="Send">
                {busy ? <span className={s.sendSpinner} aria-hidden="true" /> : <IconArrowUp width={19} height={19} />}
              </button>
            </div>
          </form>
          <p className={s.hint}>{story ? 'e.g. "Make the ending more hopeful". Each answer is saved as a new version.' : 'Enter to send, Shift + Enter for a new line.'}</p>
        </div>
      </section>

      <HistoryPanel
        open={panel === 'history'}
        projectId={project.id}
        currentId={story?.id}
        onClose={() => setPanel(null)}
        onOpen={(id) => {
          setPanel(null);
          navigate(`${base}/${id}`);
        }}
        onNew={() => {
          setPanel(null);
          navigate(`${base}/new`);
        }}
        onDeleted={(id) => {
          // the open chat was deleted: start a new one
          if (id === story?.id) {
            setPanel(null);
            navigate(`${base}/new`, { replace: true });
          }
        }}
        onImport={() => {
          setPanel(null);
          navigate(`${base}/import`);
        }}
      />
    </div>
  );
}

function exportStory(story) {
  const text = `${story.title}\n\n${story.content}\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${story.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'story'}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Chats": the project's story chats, newest activity first. */
function HistoryPanel({ open, projectId, currentId, onClose, onOpen, onNew, onImport, onDeleted }) {
  const toast = useToast();
  const [chats, setChats] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setError('');
    listProjectStories(projectId).then(
      (list) => live && setChats(list),
      (err) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, [open, projectId]);

  return (
    <Modal open={open} onClose={onClose} side title="Chats" subtitle="Every story keeps its own chat. Pick one to carry on.">
      <div className={s.history}>
        <div className={s.historyActions}>
          <Button icon={IconPlus} onClick={onNew}>
            New chat
          </Button>
          <Button variant="secondary" icon={IconUpload} onClick={onImport}>
            Import a story
          </Button>
        </div>
        {error ? (
          <Notice message={error} />
        ) : !chats ? (
          <p className={s.muted}>Loading chats...</p>
        ) : chats.length === 0 ? (
          <p className={s.emptyChats}>No chats yet. Your first story starts one.</p>
        ) : (
          <ChatList
            chats={chats}
            currentId={currentId}
            onOpen={onOpen}
            onDelete={async (chat) => {
              await deleteProjectStory(projectId, chat.id);
              setChats((list) => list.filter((c) => c.id !== chat.id));
              toast('Chat deleted');
              onDeleted?.(chat.id);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------------------------- chat messages */
function UserMessage({ message }) {
  const [more, setMore] = useState(false);
  const long = message.text.length > 420;
  return (
    <div className={s.userRow}>
      <div className={s.bubble}>
        {message.kind === 'brief' && <span className={s.bubbleLabel}>Story brief</span>}
        <p className={cx(s.bubbleText, long && !more && s.bubbleClamp)}>{message.text}</p>
        {long && (
          <button type="button" className={s.moreButton} onClick={() => setMore((m) => !m)}>
            {more ? 'Show less' : 'Show more'}
          </button>
        )}
        {(message.tags?.length > 0 || message.file) && (
          <span className={s.bubbleTags}>
            {message.file && (
              <span className={s.bubbleTag}>
                <IconDocument width={12} height={12} /> {message.file}
              </span>
            )}
            {message.tags?.map((tag) => (
              <span key={tag} className={s.bubbleTag}>
                {tag}
              </span>
            ))}
          </span>
        )}
      </div>
      <span className={s.you} aria-hidden="true">
        You
      </span>
    </div>
  );
}

const ANSWER_LINES = {
  ai_generated: (first) => (first ? 'Here is your story.' : 'Here is the story, written again from the brief.'),
  ai_edit: () => 'Here is the story with your changes.',
  user_uploaded: () => 'Here is the story you imported. Ask for any changes.',
  user_edit: () => 'Here is the story as it was edited in the Story Editor.',
  rollback: () => 'Here is the version you restored.',
};

function AiMessage({ story, message, latest, onEdit, onExport, onRestore }) {
  const version = story.versions.find((v) => v.no === message.version);
  // the current version is shown in full, older ones folded (the parent remounts this when that changes)
  const [open, setOpen] = useState(latest);
  if (!version) return null;
  const line = (ANSWER_LINES[version.reason] || (() => 'Here is the story.'))(version.no === 1);
  return (
    <div className={s.aiRow}>
      <CinemorOrb size="sm" />
      <div className={s.aiBody}>
        <p className={s.aiName}>
          Cinemor AI <span className={s.aiTime}>{timeAgo(message.at)}</span>
        </p>
        <p className={s.aiStatus}>{line}</p>
        <article className={s.answer} aria-label={`Version ${version.no}: ${version.title}`}>
          <div className={s.answerHead}>
            <h3 className={s.answerTitle}>{version.title}</h3>
            <span className={cx(s.versionTag, latest && s.versionTagNow)}>{latest ? `Version ${version.no} · current` : `Version ${version.no}`}</span>
          </div>
          <div className={cx(s.answerText, !open && s.answerTextShut)}>
            {version.content.split(/\n{2,}/).map((para, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <p key={i}>{para}</p>
            ))}
          </div>
          <footer className={s.storyFoot}>
            <span className={s.wordCount}>{wordsIn(version.content).toLocaleString('en-IN')} words</span>
            <div className={s.storyActions}>
              <button type="button" className={s.textButton} onClick={() => setOpen((o) => !o)}>
                {open ? 'Show less' : 'Show full story'}
              </button>
              {latest ? (
                <>
                  <Button variant="secondary" icon={IconExport} onClick={onExport}>
                    Export
                  </Button>
                  <Button icon={IconPencil} onClick={onEdit}>
                    Edit Story
                  </Button>
                </>
              ) : (
                <Button variant="secondary" icon={IconRestore} onClick={onRestore}>
                  Restore this version
                </Button>
              )}
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}

function EventLine({ message }) {
  return (
    <p className={s.event}>
      <span>
        {message.text}
        {message.version ? ` · version ${message.version}` : ''}
        <span className={s.eventTime}> · {timeAgo(message.at)}</span>
      </span>
    </p>
  );
}

/* ====================================================================================== Import */
const sizeOf = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function ImportPanel({ projectId }) {
  const uid = useId();
  const toast = useToast();
  const { navigate } = useRouter();
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [file, setFile] = useState(null);
  const [read, setRead] = useState(null); // the file's text once read: { title, content, fileName }
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const panelRef = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  // read the file as soon as it is chosen, so problems show straight away
  const choose = async (picked) => {
    setError('');
    setFile(picked);
    setRead(null);
    if (!picked) return;
    try {
      const result = await readStoryFile(picked);
      setRead(result);
      if (!titleTouched || !title.trim()) setTitle(result.title);
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return setError('Choose your story document first.');
    if (!read) return setError(error || 'That file could not be read. Choose another one.');
    if (!title.trim()) return setError('Give the story a title.');
    setBusy(true);
    try {
      const created = await importProjectStory(projectId, { file, title: title.trim(), content: read.content, fileName: read.fileName });
      toast('Story imported');
      // the story opens in its own chat, where changes can be asked for (or it can be opened in the editor)
      navigate(`${storyBase(projectId)}/${created.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    return undefined;
  };

  return (
    <section ref={panelRef} className={s.importPanel} aria-labelledby={`${uid}-title`}>
      <div className={s.chooseHead}>
        <span className={s.chooseIcon} aria-hidden="true">
          <IconUpload width={20} height={20} />
        </span>
        <div>
          <h2 id={`${uid}-title`} className={s.chooseTitle}>
            Import existing story
          </h2>
          <p className={s.chooseSub}>Upload your story document. It opens in its own chat, where you can ask Cinemor for changes or edit it yourself.</p>
        </div>
      </div>
      <form className={s.importForm} onSubmit={submit} noValidate>
        <label className={s.label} htmlFor={`${uid}-story-title`}>
          Story title
        </label>
        <input
          id={`${uid}-story-title`}
          className={s.titleInput}
          placeholder="Enter story title (or take it from the file name)"
          value={title}
          maxLength={200}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleTouched(true);
            setError('');
          }}
        />

        <span className={s.label} id={`${uid}-doc`}>
          Story document
        </span>
        <div
          className={cx(s.drop, dragging && s.dropOn, read && s.dropDone)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files?.[0] || null);
          }}
        >
          {file ? (
            <div className={s.fileRow}>
              <span className={s.fileIcon} aria-hidden="true">
                <IconDocument width={26} height={26} strokeWidth={1.7} />
              </span>
              <span className={s.fileText}>
                <span className={s.fileName}>{file.name}</span>
                <span className={s.fileMeta}>{read ? `${sizeOf(file.size)}, ${wordsIn(read.content).toLocaleString('en-IN')} words` : error ? "Couldn't be read" : 'Reading...'}</span>
              </span>
              <button type="button" className={s.fileRemove} onClick={() => choose(null)} aria-label={`Remove ${file.name}`}>
                <IconClose width={16} height={16} />
              </button>
            </div>
          ) : (
            <>
              <span className={s.dropIcon} aria-hidden="true">
                <IconDocument width={26} height={26} strokeWidth={1.7} />
              </span>
              <p className={s.dropTitle}>Select your story document</p>
              <p className={s.dropSub}>Drop it here, or choose it. TXT or DOCX, up to 5 MB.</p>
              <Button variant="secondary" icon={IconUpload} onClick={() => fileInput.current?.click()} aria-describedby={`${uid}-doc`}>
                Choose File
              </Button>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={IMPORT_ACCEPT}
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0] || null;
              event.target.value = '';
              choose(picked);
            }}
          />
        </div>
        {read && (
          <div className={s.previewBox} aria-label="Preview of the story">
            <p className={s.previewLabel}>Preview</p>
            <p className={s.previewText}>
              {read.content.slice(0, 600)}
              {read.content.length > 600 ? '...' : ''}
            </p>
          </div>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.importFoot}>
          <Button variant="secondary" onClick={() => navigate(storyBase(projectId))} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={IconUpload} loading={busy} disabled={!read}>
            Import Story
          </Button>
        </div>
      </form>
    </section>
  );
}
