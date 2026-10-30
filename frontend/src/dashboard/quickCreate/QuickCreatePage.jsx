import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import { EDUCATIONAL, GENRES, LANGUAGES, POV_OPTIONS, STORY_FORMATS, STYLES, TONES, toRequest } from '../individual/storyOptions.js';
import timeAgo from '../timeAgo.js';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { IconBook, IconCheck, IconChevronDown, IconChevronRight, IconFilm, IconImage, IconPlay, IconPlus, IconSend, IconSparkles, IconTrash, IconUser } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import LogoPulse from './LogoPulse.jsx';
import {
  createAudio,
  createAvatarVideo,
  createPictures,
  createStory,
  deleteMany,
  download,
  editStory,
  fileUrl,
  getItem,
  getOptions,
  listItems,
  readAsDataUrl,
  showStoryVersion,
} from './quickCreateApi.js';
import q from './QuickCreate.module.css';

/* ------------------------------------------------------------------ icons only these pages use */
const svg = (children) =>
  function Icon(props) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        {children}
      </svg>
    );
  };
const IconPin = svg(
  <>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </>,
);
const IconMic = svg(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>,
);
const IconDownload = svg(<path d="M12 4v12M7 11l5 5 5-5M4 20h16" />);
const IconUpload = svg(<path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />);
const IconRatio = svg(<rect x="4" y="6" width="16" height="12" rx="2" />);
const IconSliders = svg(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
);
const IconGlobe = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
);
const IconRuler = svg(<path d="M4 17 17 4l3 3L7 20zM8 13l2 2M11 10l2 2M14 7l2 2" />);
const IconSun = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
const IconSpeed = svg(<path d="M12 14l4-4M4 18a9 9 0 1 1 16 0" />);
const IconSquareCheck = svg(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>,
);

/* ------------------------------------------------------------------ the six tools */
export const TOOLS = [
  { slug: 'character', kind: 'character', label: 'Character', hero: 'Create Character', text: 'A character, in any pose and any look', icon: IconUser, tone: q.toneCharacter, plural: 'Characters' },
  { slug: 'location', kind: 'location', label: 'Location', hero: 'Create Location', text: 'A place, from a palace hall to a forest', icon: IconPin, tone: q.toneLocation, plural: 'Locations' },
  { slug: 'image', kind: 'image', label: 'Image', hero: 'Create Image', text: 'Any picture from your words', icon: IconImage, tone: q.toneImage, plural: 'Images' },
  { slug: 'story', kind: 'story', label: 'Story', hero: 'Write a Story', text: 'A full story, changed only with AI edits', icon: IconBook, tone: q.toneStory, plural: 'Stories' },
  { slug: 'avatar-video', kind: 'avatar_video', label: 'Avatar', hero: 'Avatar Video', text: 'A picture that speaks your script', icon: IconFilm, tone: q.toneAvatar, plural: 'Avatar videos' },
  { slug: 'audio', kind: 'audio', label: 'Audio', hero: 'Create Audio', text: 'A voice for any text', icon: IconMic, tone: q.toneAudio, plural: 'Audio' },
];
const toolOf = (kind) => TOOLS.find((t) => t.kind === kind) || TOOLS[2];
const BASE = '/dashboard/quick-create';
export const toolPath = (tool, itemId) => `${BASE}/${tool.slug}${itemId ? `?item=${itemId}` : ''}`;

const PICTURE = {
  character: {
    label: 'Describe your character',
    placeholder: 'e.g. Draupadi, a young queen in a deep red silk saree, mid-dance in a palace courtyard, arms raised, proud eyes',
    ratio: '9:16',
    rows: [
      { key: 'pose', label: 'Pose', icon: IconUser, options: ['Any pose', 'Standing', 'In action', 'Sitting', 'Walking', 'Close-up of the face', 'Full body, side view'] },
      { key: 'style', label: 'Look', icon: IconSliders, options: ['Any look', 'Cinematic', 'Realistic', '3D animated', '2D animated', 'Anime', 'Watercolor', 'Comic book'] },
    ],
  },
  location: {
    label: 'Describe the place',
    placeholder: 'e.g. The royal hall of Hastinapur at dusk, tall carved pillars, oil lamps, silk curtains moving in the wind',
    ratio: '16:9',
    rows: [
      { key: 'time_of_day', label: 'Time of day', icon: IconSun, options: ['Any time', 'Dawn', 'Morning', 'Noon', 'Golden hour', 'Dusk', 'Night'] },
      { key: 'style', label: 'Look', icon: IconSliders, options: ['Any look', 'Cinematic', 'Realistic', '3D animated', '2D animated', 'Anime', 'Watercolor', 'Comic book'] },
    ],
  },
  image: {
    label: 'Describe your image',
    placeholder: 'e.g. A warrior princess on a palace balcony at sunset, wind in her hair, cinematic light',
    ratio: '16:9',
    rows: [{ key: 'style', label: 'Look', icon: IconSliders, options: ['Any look', 'Cinematic', 'Realistic', '3D animated', '2D animated', 'Anime', 'Watercolor', 'Comic book'] }],
  },
};
const RATIOS = { '16:9': 'Wide 16:9', '9:16': 'Tall 9:16', '1:1': 'Square 1:1', '4:3': 'Classic 4:3', '3:4': 'Portrait 3:4', '21:9': 'Cinema 21:9' };
const aspectOf = (ratio) => {
  const [w, h] = String(ratio || '1:1').split(':').map(Number);
  return w && h ? `${w} / ${h}` : '1 / 1';
};
const wordsOf = (text) => (String(text || '').trim().match(/\S+/g) || []).length;
const sameText = (a, b) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Quick Create (/dashboard/quick-create): six tools that each make one thing on their own, outside any project:
 * Character, Location, Image, Story, Avatar video and Audio. Each tool has its controls on the left and what it is
 * making on the right; everything made is also kept in the Library. Without `tool`, the page with the six tools.
 */
export default function QuickCreatePage({ tool: slug }) {
  const tool = TOOLS.find((t) => t.slug === slug);
  const { search } = useRouter();
  const itemId = Number(new URLSearchParams(search).get('item')) || null;
  useDocumentTitle(tool ? `${tool.hero} · Quick Create` : 'Quick Create');
  const options = useResource(getOptions, []);

  if (!tool) return <Hub />;
  if (options.error) return <Notice message={options.error.message} onRetry={options.reload} />;
  if (!options.data) return <p className={q.muted}>Loading…</p>;
  const props = { tool, options: options.data };
  if (PICTURE[tool.kind]) return <PictureTool key={tool.kind} {...props} />;
  if (tool.kind === 'story') return <StoryTool {...props} itemId={itemId} />;
  if (tool.kind === 'avatar_video') return <AvatarTool {...props} itemId={itemId} />;
  return <AudioTool {...props} />;
}

/* ------------------------------------------------------------------ the page with the six tools */
function Hub() {
  const recent = useResource(() => listItems('', 8), []);
  const viewer = useViewer(recent.data || [], () => recent.reload());
  return (
    <div className={q.page}>
      <div className={q.head}>
        <div>
          <p className={q.eyebrow}>Quick Create</p>
          <h1 className={q.title}>What do you want to make?</h1>
          <p className={q.sub}>Six tools that work on their own, without a project. Your projects stay exactly as they are.</p>
        </div>
      </div>
      <ul className={q.toolGrid}>
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.slug}>
              <Link to={toolPath(t)} className={cx(q.toolCard, t.tone)}>
                <span className={q.toolGlow} aria-hidden="true" />
                <span className={q.toolIcon} aria-hidden="true">
                  <Icon width={24} height={24} />
                </span>
                <span className={q.toolName}>{t.kind === 'avatar_video' ? 'Avatar video' : t.label}</span>
                <span className={q.toolText}>{t.text}</span>
                <span className={q.toolGo}>
                  Start <IconChevronRight width={15} height={15} aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <section className={q.card} aria-labelledby="qc-recent">
        <div className={q.cardHead}>
          <div>
            <h2 id="qc-recent" className={q.cardTitle}>
              Your library
            </h2>
            <p className={q.muted}>Everything you made with these tools. Click one to open it.</p>
          </div>
          <Link to="/dashboard/library" className={q.more}>
            Open library <IconChevronRight width={15} height={15} />
          </Link>
        </div>
        {recent.error && <Notice message={recent.error.message} onRetry={recent.reload} />}
        {recent.data && recent.data.length === 0 && <p className={q.muted}>Nothing yet. Pick a tool above to make your first one.</p>}
        {recent.data && recent.data.length > 0 && (
          <ul className={q.libGrid}>
            {recent.data.map((item) => (
              <li key={item.id}>
                <LibraryCard item={item} onOpen={() => viewer.open(item.id)} />
              </li>
            ))}
          </ul>
        )}
        <RetentionNote />
      </section>
      {viewer.modal}
    </div>
  );
}

/* ================================================================== the workspace: controls left, results right */
function Workspace({ tool, onSubmit, controls, canvas }) {
  return (
    <div className={cx(q.ws, tool.tone)}>
      <form className={q.panel} onSubmit={onSubmit} noValidate aria-label={`${tool.hero} settings`}>
        <ToolTabs current={tool} />
        <Hero tool={tool} />
        {controls}
      </form>
      {canvas}
    </div>
  );
}

function ToolTabs({ current }) {
  return (
    <nav className={q.seg} aria-label="Quick Create tools">
      {TOOLS.map((t) => (
        <Link key={t.slug} to={toolPath(t)} className={cx(q.segItem, t.slug === current.slug && q.segOn)} aria-current={t.slug === current.slug ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function Hero({ tool }) {
  const Icon = tool.icon;
  return (
    <div className={q.hero}>
      <span className={q.heroIcon} aria-hidden="true">
        <Icon width={24} height={24} />
      </span>
      <h1 className={q.heroTitle}>{tool.hero}</h1>
      <Link to="/dashboard/library" className={q.heroLink}>
        Library <IconChevronRight width={14} height={14} />
      </Link>
    </div>
  );
}

/** A setting as one row (icon, name, value); the choice opens the browser's own list. */
function RowSelect({ icon: Icon, label, value, options, onChange, disabled, wide }) {
  const id = useId();
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <div className={cx(q.rowc, wide && q.rowWide)}>
      <span className={q.rowIcon} aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
      <span className={q.rowText}>
        <label htmlFor={id} className={q.rowLabel}>
          {label}
        </label>
        <b className={q.rowValue}>{current ? current.label : '—'}</b>
      </span>
      <IconChevronDown width={16} height={16} className={q.rowChev} aria-hidden="true" />
      <select id={id} className={q.rowNative} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PromptBox({ id, label, value, onChange, max, placeholder, rows = 5, disabled, top, foot }) {
  return (
    <div className={q.prompt}>
      <label htmlFor={id} className={q.promptLabel}>
        {label}
      </label>
      {top}
      <textarea id={id} className={q.promptArea} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} disabled={disabled} />
      <div className={q.promptFoot}>
        <button type="button" className={q.iconBtn} onClick={() => onChange('')} disabled={disabled || !value} aria-label="Clear the text" title="Clear">
          <IconTrash width={16} height={16} />
        </button>
        <span className={q.promptCount}>{max ? `${value.length.toLocaleString('en-IN')} / ${max.toLocaleString('en-IN')}` : ''}</span>
        {foot}
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange, disabled }) {
  return (
    <button type="button" className={q.toggleRow} role="switch" aria-checked={on} onClick={() => onChange(!on)} disabled={disabled}>
      <span>{label}</span>
      <span className={cx(q.switch, on && q.switchOn)} aria-hidden="true" />
    </button>
  );
}

function GenerateBar({ busy, count, setCount, max, label = 'Generate' }) {
  return (
    <div className={q.genBar}>
      {setCount && (
        <div className={q.stepper} role="group" aria-label="How many">
          <button type="button" onClick={() => setCount(Math.max(1, count - 1))} disabled={busy || count <= 1} aria-label="Fewer">
            −
          </button>
          <span>
            {count}
            <span className={q.muted}> / {max}</span>
          </span>
          <button type="button" onClick={() => setCount(Math.min(max, count + 1))} disabled={busy || count >= max} aria-label="More">
            +
          </button>
        </div>
      )}
      <button type="submit" className={q.generate} disabled={busy}>
        {busy ? <span className={q.spin} aria-hidden="true" /> : <IconSparkles width={18} height={18} aria-hidden="true" />}
        {busy ? 'Generating…' : label}
      </button>
    </div>
  );
}

function FormError({ text }) {
  if (!text) return null;
  return (
    <p className={q.error} role="alert">
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ the right side */
/** Selecting several things and deleting them at once. */
function useSelection(onDeleted) {
  const toast = useToast();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [asking, setAsking] = useState(false);
  const toggle = (id) =>
    setPicked((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stop = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const modal = (
    <ConfirmModal
      open={asking}
      title={`Delete ${picked.size} ${picked.size === 1 ? 'item' : 'items'}?`}
      text="They are deleted from your library too. This cannot be undone."
      confirmLabel="Delete"
      onConfirm={async () => {
        const ids = [...picked];
        const n = await deleteMany(ids);
        onDeleted(ids);
        toast(n === 1 ? 'Deleted' : `${n} deleted`);
        setAsking(false);
        stop();
      }}
      onClose={() => setAsking(false)}
    />
  );
  return { selecting, setSelecting, picked, toggle, setPicked, stop, ask: () => setAsking(true), modal };
}

function Canvas({ tool, title, count, sel, allIds = [], children, extra }) {
  return (
    <section className={q.canvas} aria-label={title}>
      <div className={q.toolbar}>
        <span className={q.canvasTitle}>
          <tool.icon width={15} height={15} aria-hidden="true" />
          {title}
          {count ? <span className={q.canvasCount}>{count}</span> : null}
        </span>
        <span className={q.grow} />
        {extra}
        {sel && allIds.length > 0 && !sel.selecting && (
          <button type="button" className={q.tbBtn} onClick={() => sel.setSelecting(true)}>
            <IconSquareCheck width={16} height={16} aria-hidden="true" /> Select
          </button>
        )}
        {sel?.selecting && (
          <>
            <button type="button" className={q.tbBtn} onClick={() => sel.setPicked(sel.picked.size === allIds.length ? new Set() : new Set(allIds))}>
              {sel.picked.size === allIds.length ? 'Clear' : 'Select all'}
            </button>
            <button type="button" className={cx(q.tbBtn, q.tbDanger)} onClick={sel.ask} disabled={!sel.picked.size}>
              <IconTrash width={15} height={15} aria-hidden="true" /> Delete{sel.picked.size ? ` (${sel.picked.size})` : ''}
            </button>
            <button type="button" className={q.tbBtn} onClick={sel.stop}>
              Cancel
            </button>
          </>
        )}
        <Link to="/dashboard/library" className={q.tbBtn} aria-label="Open the library">
          Library
        </Link>
      </div>
      <div className={q.canvasBody}>{children}</div>
      {sel?.modal}
    </section>
  );
}

function Empty({ tool, text }) {
  const Icon = tool.icon;
  return (
    <div className={q.emptyState}>
      <span className={q.emptyIcon} aria-hidden="true">
        <Icon width={34} height={34} />
      </span>
      <p className={q.emptyTitle}>Nothing here yet</p>
      <p className={q.muted}>{text}</p>
    </div>
  );
}

/** A tick box in the corner of a result while selecting. */
function Pick({ sel, id, label }) {
  if (!sel?.selecting) return null;
  return (
    <label className={q.pick}>
      <input type="checkbox" checked={sel.picked.has(id)} onChange={() => sel.toggle(id)} aria-label={`Select ${label}`} />
      <span aria-hidden="true">
        <IconCheck width={14} height={14} />
      </span>
    </label>
  );
}

/** A saved file (picture, video or audio), fetched with the sign-in. */
function Media({ item, source = false, className, onReady }) {
  const [url, setUrl] = useState(null);
  const ready = source ? item.hasSource : item.hasFile;
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!ready) return undefined;
    fileUrl(item.id, { source })
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, ready, source]);
  useEffect(() => {
    if (url && onReady) onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  if (!url) return <div className={cx(q.mediaEmpty, className)} />;
  const mime = source ? 'image/' : item.mime;
  if (mime.startsWith('video/')) return <video className={cx(q.media, className)} src={url} controls playsInline preload="metadata" />;
  if (mime.startsWith('audio/')) return <audio className={q.audioEl} src={url} controls preload="metadata" />;
  return <img className={cx(q.media, className)} src={url} alt={item.title} />;
}

/** Shows the beating logo over a fresh result until it has loaded, then lets it fade. */
function useReveal(fresh) {
  const [loaded, setLoaded] = useState(!fresh);
  const [gone, setGone] = useState(!fresh);
  useEffect(() => {
    if (!loaded || gone) return undefined;
    const t = setTimeout(() => setGone(true), 1100);
    return () => clearTimeout(t);
  }, [loaded, gone]);
  return { overlay: gone ? null : <LogoPulse done={loaded} />, onReady: () => setLoaded(true) };
}

/* ================================================================== character / location / image */
function PictureTool({ tool, options }) {
  const uid = useId();
  const toast = useToast();
  const conf = PICTURE[tool.kind];
  const refInput = useRef(null);
  const models = options.pictureModels.map((m) => ({ value: m.id, label: m.name }));
  const [model, setModel] = useState(() => (models.find((m) => m.value === 'openai/gpt-image-2.5-flare') || models[0])?.value || '');
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState(conf.ratio);
  const [details, setDetails] = useState(() => Object.fromEntries(conf.rows.map((r) => [r.key, r.options[0]])));
  const [improve, setImprove] = useState(true);
  const [refs, setRefs] = useState([]); // [{ name, url }]
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // the current generation: a new prompt starts a new one (the old results stay in the Library)
  const [run, setRun] = useState({ prompt: '', items: [], pending: 0, ratio: conf.ratio });
  const [fresh, setFresh] = useState(() => new Set());
  const sel = useSelection((ids) => setRun((r) => ({ ...r, items: r.items.filter((x) => !ids.includes(x.id)) })));
  const maxImages = options.limits.images || 4;

  const addRefs = async (files) => {
    setError('');
    const list = [...files].slice(0, 4 - refs.length);
    try {
      const read = await Promise.all(
        list.map(async (f) => {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) throw new Error('Reference pictures must be PNG, JPEG or WEBP.');
          if (f.size > 8 * 1024 * 1024) throw new Error('A reference picture is too large (8 MB at most).');
          return { name: f.name, url: await readAsDataUrl(f) };
        }),
      );
      setRefs((cur) => [...cur, ...read].slice(0, 4));
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) return setError('Describe what you want to see.');
    setError('');
    setBusy(true);
    sel.stop();
    const same = run.items.length > 0 && sameText(prompt, run.prompt);
    setRun((r) => (same ? { ...r, pending: count, ratio } : { prompt, items: [], pending: count, ratio }));
    const chosen = Object.fromEntries(Object.entries(details).filter(([k, v]) => v !== conf.rows.find((r) => r.key === k)?.options[0]));
    try {
      const items = await createPictures({ kind: tool.kind, model, prompt, ratio, count, details: chosen, improve, references: refs.map((r) => r.url) });
      setFresh(new Set(items.map((i) => i.id)));
      setRun((r) => ({ ...r, prompt, items: [...items, ...r.items], pending: 0 }));
    } catch (err) {
      setError(err.message);
      setRun((r) => ({ ...r, pending: 0 }));
      toast(err.message, 'error');
    }
    setBusy(false);
    return undefined;
  };

  const controls = (
    <>
      <RowSelect icon={IconSparkles} label="Model" value={model} options={models} onChange={setModel} disabled={busy} wide />
      <PromptBox
        id={`${uid}-prompt`}
        label={conf.label}
        value={prompt}
        onChange={setPrompt}
        max={options.limits.prompt || 2000}
        placeholder={conf.placeholder}
        disabled={busy}
        top={
          <div className={q.refs}>
            {refs.length > 0 ? (
              <ul className={q.refList}>
                {refs.map((r, i) => (
                  <li key={r.url.slice(-24)}>
                    <img src={r.url} alt={r.name} />
                    <button type="button" onClick={() => setRefs((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${r.name}`} disabled={busy}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className={q.refIcon} aria-hidden="true">
                <IconUpload width={18} height={18} />
              </span>
            )}
            <button type="button" className={q.refAdd} onClick={() => refInput.current?.click()} disabled={busy || refs.length >= 4}>
              <b>Add reference pictures</b> <span className={q.optional}>Optional</span>
              <span className={q.refHint}>The same face, clothes or style · {refs.length}/4</span>
            </button>
            <input
              ref={refInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                addRefs(e.target.files || []);
                e.target.value = '';
              }}
            />
          </div>
        }
        foot={<Toggle label="Improve prompt" on={improve} onChange={setImprove} disabled={busy} />}
      />
      <div className={q.rows}>
        <RowSelect icon={IconRatio} label="Ratio" value={ratio} options={options.ratios.map((r) => ({ value: r, label: RATIOS[r] || r }))} onChange={setRatio} disabled={busy} />
        {conf.rows.map((r) => (
          <RowSelect key={r.key} icon={r.icon} label={r.label} value={details[r.key]} options={r.options.map((o) => ({ value: o, label: o }))} onChange={(v) => setDetails((d) => ({ ...d, [r.key]: v }))} disabled={busy} />
        ))}
      </div>
      <FormError text={error} />
      <GenerateBar busy={busy} count={count} setCount={setCount} max={maxImages} />
    </>
  );

  const ids = run.items.map((x) => x.id);
  const canvas = (
    <Canvas tool={tool} title={tool.plural} count={run.items.length} sel={sel} allIds={ids}>
      {run.items.length === 0 && !run.pending ? (
        <Empty tool={tool} text={`Your ${tool.label.toLowerCase()} pictures will show up here.`} />
      ) : (
        <ul className={q.grid}>
          {Array.from({ length: run.pending }, (_, i) => (
            <li key={`wait-${i}`} className={q.cell} style={{ aspectRatio: aspectOf(run.ratio) }}>
              <LogoPulse />
            </li>
          ))}
          {run.items.map((item) => (
            <li key={item.id}>
              <PictureCard item={item} fresh={fresh.has(item.id)} sel={sel} onDelete={() => sel.setPicked(new Set([item.id])) || sel.ask()} />
            </li>
          ))}
        </ul>
      )}
    </Canvas>
  );
  return <Workspace tool={tool} onSubmit={submit} controls={controls} canvas={canvas} />;
}

function PictureCard({ item, fresh, sel, onDelete }) {
  const { overlay, onReady } = useReveal(fresh);
  return (
    <div className={cx(q.cell, sel?.picked.has(item.id) && q.cellPicked)} style={{ aspectRatio: aspectOf(item.settings.aspect_ratio) }}>
      <Media item={item} onReady={onReady} />
      {overlay}
      <Pick sel={sel} id={item.id} label={item.title} />
      {!sel?.selecting && (
        <div className={q.cellActions}>
          <button type="button" className={q.round} onClick={() => download(item)} aria-label="Download">
            <IconDownload width={16} height={16} />
          </button>
          <button type="button" className={q.round} onClick={onDelete} aria-label="Delete">
            <IconTrash width={15} height={15} />
          </button>
        </div>
      )}
      <span className={q.cellMeta}>
        {item.settings.aspect_ratio} · {timeAgo(item.createdAt)}
      </span>
    </div>
  );
}

/* ================================================================== story */
const LENGTHS = [300, 500, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000];
const STORY_START = {
  model: '',
  language: 'English',
  pointOfView: 'first_person',
  storyFormat: 'prose_narrative',
  genre: [],
  style: [],
  tone: [],
  wordCount: 1000,
  targetAudience: '',
  subject: '',
  gradeLevel: '',
  educationalObjective: '',
  learningPoints: [],
  setting: '',
  characters: [],
  additionalDetails: '',
};

function StoryTool({ tool, options, itemId }) {
  const uid = useId();
  const toast = useToast();
  const { navigate } = useRouter();
  const models = options.storyModels.map((m) => ({ value: m.id, label: m.name }));
  const [settings, setSettings] = useState(() => ({ ...STORY_START, model: models[0]?.value || '' }));
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const [idea, setIdea] = useState('');
  const [more, setMore] = useState(false);
  const [story, setStory] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('');
  const sel = useSelection(() => {
    setStory(null);
    navigate(toolPath(tool), { replace: true });
  });

  useEffect(() => {
    if (!itemId) return;
    if (story?.id === itemId) return;
    getItem(itemId)
      .then((s) => {
        setStory(s);
        setFresh(false);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const versions = story?.content.versions || [];
  const current = versions.find((v) => v.no === story?.content.current) || versions[versions.length - 1];
  const toggle = (key, value) => set({ [key]: settings[key].includes(value) ? settings[key].filter((v) => v !== value) : [...settings[key], value] });

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    let body;
    try {
      body = toRequest(settings, idea);
    } catch (err) {
      return setError(err.message.replace('in the message box', 'in “Your idea”'));
    }
    setBusy('write');
    setStory(null); // a new idea: the old story leaves this panel (it stays in the Library)
    try {
      const made = await createStory(body);
      setStory(made);
      setFresh(true);
      navigate(toolPath(tool, made.id), { replace: true });
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
    setBusy('');
    return undefined;
  };

  const edit = async () => {
    if (!instruction.trim() || !story) return;
    setBusy('edit');
    setError('');
    try {
      setStory(await editStory(story.id, instruction));
      setInstruction('');
      setFresh(true);
      toast('Changed. Kept as a new version.');
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  };

  const pick = async (no) => {
    try {
      setStory(await showStoryVersion(story.id, no));
      setFresh(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const exportText = () => {
    const blob = new Blob([`${current.title}\n\n${current.content}\n`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'story'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const off = Boolean(busy);
  const educational = settings.genre.includes(EDUCATIONAL);
  const controls = (
    <>
      <RowSelect icon={IconSparkles} label="Model" value={settings.model} options={models} onChange={(v) => set({ model: v })} disabled={off} wide />
      <PromptBox id={`${uid}-idea`} label="Your idea" value={idea} onChange={setIdea} max={10000} rows={4} placeholder="e.g. Draupadi’s swayamvar, told from her own eyes, the day Arjuna wins the contest in disguise." disabled={off} />
      <div className={q.rows}>
        <RowSelect icon={IconGlobe} label="Language" value={settings.language} options={LANGUAGES.map((l) => ({ value: l, label: l }))} onChange={(v) => set({ language: v })} disabled={off} />
        <RowSelect icon={IconUser} label="Point of view" value={settings.pointOfView} options={POV_OPTIONS} onChange={(v) => set({ pointOfView: v })} disabled={off} />
        <RowSelect icon={IconBook} label="Format" value={settings.storyFormat} options={STORY_FORMATS} onChange={(v) => set({ storyFormat: v })} disabled={off} />
        <RowSelect icon={IconRuler} label="Length" value={settings.wordCount} options={LENGTHS.map((n) => ({ value: n, label: `${n.toLocaleString('en-IN')} words` }))} onChange={(v) => set({ wordCount: Number(v) })} disabled={off} />
      </div>
      <button type="button" className={cx(q.rowc, q.rowWide, q.moreBtn)} onClick={() => setMore((v) => !v)} aria-expanded={more}>
        <span className={q.rowIcon} aria-hidden="true">
          <IconSliders width={18} height={18} />
        </span>
        <span className={q.rowText}>
          <span className={q.rowLabel}>More options</span>
          <b className={q.rowValue}>{[settings.genre.length && settings.genre.join(', '), settings.tone.length && settings.tone.join(', ')].filter(Boolean).join(' · ') || 'Genre, tone, style, audience, characters'}</b>
        </span>
        <IconChevronDown width={16} height={16} className={cx(q.rowChev, more && q.flip)} aria-hidden="true" />
      </button>
      {more && (
        <div className={q.moreBox}>
          <ChipGroup label="Genre" options={GENRES} picked={settings.genre} onToggle={(v) => toggle('genre', v)} disabled={off} />
          <ChipGroup label="Tone" options={TONES} picked={settings.tone} onToggle={(v) => toggle('tone', v)} disabled={off} />
          <ChipGroup label="Style" options={STYLES} picked={settings.style} onToggle={(v) => toggle('style', v)} disabled={off} />
          <Field id={`${uid}-aud`} label="Target audience" value={settings.targetAudience} onChange={(v) => set({ targetAudience: v })} max={200} placeholder="e.g. Young adults" disabled={off} />
          {educational && (
            <>
              <Field id={`${uid}-sub`} label="Subject" value={settings.subject} onChange={(v) => set({ subject: v })} max={200} disabled={off} />
              <Field id={`${uid}-grade`} label="Grade level" value={settings.gradeLevel} onChange={(v) => set({ gradeLevel: v })} max={100} disabled={off} />
              <Field id={`${uid}-obj`} label="Educational objective" value={settings.educationalObjective} onChange={(v) => set({ educationalObjective: v })} max={2000} area disabled={off} />
              <Field
                id={`${uid}-lp`}
                label="Learning points (one per line)"
                value={settings.learningPoints.join('\n')}
                onChange={(v) => set({ learningPoints: v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20) })}
                area
                disabled={off}
              />
            </>
          )}
          <Field id={`${uid}-set`} label="Setting" value={settings.setting} onChange={(v) => set({ setting: v })} max={2000} area placeholder="Where and when the story happens" disabled={off} />
          <Characters list={settings.characters} onChange={(c) => set({ characters: c })} disabled={off} />
          <Field id={`${uid}-add`} label="Additional details" value={settings.additionalDetails} onChange={(v) => set({ additionalDetails: v })} max={5000} area disabled={off} />
        </div>
      )}
      <FormError text={!story ? error : ''} />
      <GenerateBar busy={busy === 'write'} />
    </>
  );

  const canvas = (
    <Canvas
      tool={tool}
      title={tool.plural}
      sel={story ? sel : null}
      allIds={story ? [story.id] : []}
      extra={
        story &&
        current && (
          <>
            {versions.length > 1 && (
              <select className={q.tbSelect} aria-label="Version" value={current.no} onChange={(e) => pick(Number(e.target.value))} disabled={off}>
                {versions.map((v) => (
                  <option key={v.no} value={v.no}>
                    Version {v.no}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className={q.tbBtn} onClick={exportText}>
              <IconDownload width={15} height={15} aria-hidden="true" /> Export
            </button>
          </>
        )
      }
    >
      {!story && busy !== 'write' && <Empty tool={tool} text="Your story will show up here. You change it only by asking the AI." />}
      {busy === 'write' && (
        <div className={cx(q.doc, q.docWait)}>
          <LogoPulse />
        </div>
      )}
      {story && current && (
        <>
          <StoryDoc key={`${story.id}-${current.no}`} story={story} current={current} versions={versions} fresh={fresh} editing={busy === 'edit'} sel={sel} />
          <div className={q.editDock}>
            <IconSparkles width={18} height={18} aria-hidden="true" className={q.editIcon} />
            <input
              className={q.editInput}
              aria-label="Ask AI to change the story"
              placeholder="Ask AI to change it… “make the ending dramatic”"
              value={instruction}
              maxLength={options.limits.instruction || 2000}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  edit();
                }
              }}
              disabled={off}
            />
            <button type="button" className={q.generateSm} onClick={edit} disabled={off || !instruction.trim()}>
              {busy === 'edit' ? <span className={q.spin} aria-hidden="true" /> : <IconSend width={15} height={15} aria-hidden="true" />}
              Edit with AI
            </button>
          </div>
          <FormError text={error} />
        </>
      )}
    </Canvas>
  );
  return <Workspace tool={tool} onSubmit={submit} controls={controls} canvas={canvas} />;
}

function StoryDoc({ story, current, versions, fresh, editing, sel }) {
  const { overlay, onReady } = useReveal(fresh);
  useEffect(() => onReady(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <article className={cx(q.doc, sel?.picked.has(story.id) && q.cellPicked)} aria-label={current.title}>
      <Pick sel={sel} id={story.id} label={current.title} />
      <span className={q.docBadge}>
        Version {current.no} of {versions.length}
        {current.instruction ? ` · AI edit: “${current.instruction.slice(0, 48)}”` : ''}
      </span>
      <h2 className={q.docTitle}>{current.title}</h2>
      <p className={q.muted}>
        {wordsOf(current.content).toLocaleString('en-IN')} words · {Math.max(1, Math.round(wordsOf(current.content) / 200))} min read
      </p>
      <div className={q.docText}>
        {current.content.split(/\n{2,}/).map((para, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <p key={i}>{para}</p>
        ))}
      </div>
      {editing ? <LogoPulse /> : overlay}
    </article>
  );
}

function ChipGroup({ label, options, picked, onToggle, disabled }) {
  return (
    <div className={q.field} role="group" aria-label={label}>
      <p className={q.fieldLabel}>{label}</p>
      <div className={q.chips}>
        {options.map((o) => (
          <button key={o} type="button" className={cx(q.chip, picked.includes(o) && q.chipOn)} aria-pressed={picked.includes(o)} onClick={() => onToggle(o)} disabled={disabled}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, max, area, placeholder, disabled }) {
  return (
    <div className={q.field}>
      <label htmlFor={id} className={q.fieldLabel}>
        {label}
      </label>
      {area ? (
        <textarea id={id} className={q.input} rows={3} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      ) : (
        <input id={id} className={q.input} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      )}
    </div>
  );
}

function Characters({ list, onChange, disabled }) {
  const [draft, setDraft] = useState({ name: '', role: '', details: '' });
  const ok = draft.name.trim() && draft.role.trim() && draft.details.trim();
  return (
    <div className={q.field}>
      <p className={q.fieldLabel}>Characters</p>
      {list.length > 0 && (
        <ul className={q.charList}>
          {list.map((c, i) => (
            <li key={`${c.name}-${i}`}>
              <b>{c.name}</b> <span className={q.muted}>({c.role})</span>
              <button type="button" className={q.iconBtn} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove ${c.name}`} disabled={disabled}>
                <IconTrash width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={q.charDraft}>
        <input className={q.input} aria-label="Character name" placeholder="Name" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={disabled} />
        <input className={q.input} aria-label="Role" placeholder="Role" value={draft.role} maxLength={100} onChange={(e) => setDraft({ ...draft, role: e.target.value })} disabled={disabled} />
      </div>
      <input className={q.input} aria-label="Character details" placeholder="Details" value={draft.details} maxLength={2000} onChange={(e) => setDraft({ ...draft, details: e.target.value })} disabled={disabled} />
      <button
        type="button"
        className={q.addBtn}
        disabled={disabled || !ok}
        onClick={() => {
          onChange([...list, { name: draft.name.trim(), role: draft.role.trim(), details: draft.details.trim() }]);
          setDraft({ name: '', role: '', details: '' });
        }}
      >
        <IconPlus width={14} height={14} /> Add character
      </button>
    </div>
  );
}

/* ================================================================== avatar video */
const VOICE_STYLES = ['Natural', 'Warm, female voice', 'Warm, male voice', 'Calm storyteller', 'Energetic, smiling', 'Serious news anchor', 'Soft and gentle'];

function AvatarTool({ tool, options, itemId }) {
  const uid = useId();
  const toast = useToast();
  const { navigate } = useRouter();
  const fileRef = useRef(null);
  const models = options.videoModels.map((m) => ({ value: m.id, label: m.name }));
  const [model, setModel] = useState(options.defaultVideoModel || models[0]?.value || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [script, setScript] = useState('');
  const [ratio, setRatio] = useState('9:16');
  const [language, setLanguage] = useState('Hindi');
  const [voice, setVoice] = useState(VOICE_STYLES[0]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState({ script: '', items: [] });
  const sel = useSelection((ids) => setRun((r) => ({ ...r, items: r.items.filter((x) => !ids.includes(x.id)) })));
  const words = wordsOf(script);
  const parts = words ? Math.max(1, Math.ceil(words / 40)) : 0;

  useEffect(() => {
    if (!itemId || run.items.some((x) => x.id === itemId)) return;
    getItem(itemId)
      .then((v) => setRun({ script: v.prompt, items: [v] }))
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // read the videos still being made again every few seconds
  const working = run.items.filter((x) => x.status === 'working').map((x) => x.id);
  useEffect(() => {
    if (!working.length) return undefined;
    const timer = setInterval(async () => {
      const fresh = await Promise.all(working.map((id) => getItem(id).catch(() => null)));
      setRun((r) => ({ ...r, items: r.items.map((x) => fresh.find((f) => f?.id === x.id) || x) }));
      if (fresh.some((f) => f?.status === 'done')) toast('Your video is ready');
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working.join(',')]);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const choose = (f) => {
    setError('');
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return setError('Choose a PNG, JPEG or WEBP picture.');
    if (f.size > (options.limits.upload_bytes || 10485760)) return setError('The picture is too large (10 MB at most).');
    setFile(f);
    setPreview(URL.createObjectURL(f));
    return undefined;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!file) return setError('Upload the avatar picture.');
    if (!script.trim()) return setError('Write what the avatar should say.');
    if (!consent) return setError('Please confirm that you may use this picture.');
    setBusy(true);
    sel.stop();
    try {
      const made = await createAvatarVideo({ file, script, model, ratio, language, voiceStyle: voice === 'Natural' ? '' : voice, consent });
      setRun((r) => (sameText(script, r.script) ? { ...r, items: [made, ...r.items] } : { script, items: [made] }));
      navigate(toolPath(tool, made.id), { replace: true });
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
    setBusy(false);
    return undefined;
  };

  const controls = (
    <>
      <RowSelect icon={IconSparkles} label="Model" value={model} options={models} onChange={setModel} disabled={busy} wide />
      <PromptBox
        id={`${uid}-script`}
        label="Script"
        value={script}
        onChange={setScript}
        max={options.limits.script || 4000}
        rows={5}
        placeholder="What the avatar says. A long script is fine: it is made in parts and joined into one video."
        disabled={busy}
        top={
          <div className={q.refs}>
            {preview ? <img src={preview} alt="" className={q.avatarThumb} /> : (
              <span className={q.refIcon} aria-hidden="true">
                <IconUser width={20} height={20} />
              </span>
            )}
            <button type="button" className={q.refAdd} onClick={() => fileRef.current?.click()} disabled={busy}>
              <b>{file ? file.name : 'Upload the avatar picture'}</b>
              <span className={q.refHint}>{file ? 'Change picture' : 'One clear face, looking at the camera · PNG, JPEG, WEBP'}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => choose(e.target.files?.[0])} />
          </div>
        }
        foot={<span className={q.promptHint}>{words ? `${words.toLocaleString('en-IN')} words · ${parts} ${parts === 1 ? 'part' : 'parts'}` : ''}</span>}
      />
      <div className={q.rows}>
        <RowSelect icon={IconRatio} label="Ratio" value={ratio} options={['9:16', '16:9', '1:1'].map((r) => ({ value: r, label: RATIOS[r] }))} onChange={setRatio} disabled={busy} />
        <RowSelect icon={IconGlobe} label="Language" value={language} options={LANGUAGES.map((l) => ({ value: l, label: l }))} onChange={setLanguage} disabled={busy} />
        <RowSelect icon={IconMic} label="Voice" value={voice} options={VOICE_STYLES.map((v) => ({ value: v, label: v }))} onChange={setVoice} disabled={busy} wide />
      </div>
      <label className={q.consent}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
        <span>I own this picture or have the person’s permission. No public figures or children.</span>
      </label>
      <FormError text={error} />
      <GenerateBar busy={busy} />
    </>
  );

  const canvas = (
    <Canvas tool={tool} title={tool.plural} count={run.items.length} sel={sel} allIds={run.items.filter((x) => x.status !== 'working').map((x) => x.id)}>
      {run.items.length === 0 ? (
        <Empty tool={tool} text="Your video will show up here. You can leave the page while it is made." />
      ) : (
        <ul className={q.videoGrid}>
          {run.items.map((v) => (
            <li key={v.id}>
              <VideoCard item={v} sel={sel} />
            </li>
          ))}
        </ul>
      )}
    </Canvas>
  );
  return <Workspace tool={tool} onSubmit={submit} controls={controls} canvas={canvas} />;
}

function VideoCard({ item, sel }) {
  const { overlay, onReady } = useReveal(item.status !== 'done' || undefined);
  const parts = item.content.parts || [];
  const made = parts.filter((p) => p.status === 'done').length;
  const label = item.content.stage === 'joining' ? 'Joining the parts' : parts.length > 1 ? `Making part ${Math.min(made + 1, parts.length)} of ${parts.length}` : 'Making the video';
  return (
    <div className={cx(q.cell, q.videoCell, sel?.picked.has(item.id) && q.cellPicked)} style={{ aspectRatio: aspectOf(item.settings.aspect_ratio) }}>
      {item.status === 'done' && <Media item={item} onReady={onReady} />}
      {item.status === 'working' && (
        <>
          <Media item={item} source className={q.dim} />
          <LogoPulse label={label} />
        </>
      )}
      {item.status === 'done' && overlay}
      {item.status === 'failed' && (
        <div className={q.failed}>
          <b>This video could not be made</b>
          <p>{item.error}</p>
        </div>
      )}
      <Pick sel={sel} id={item.id} label={item.title} />
      {item.status === 'done' && !sel?.selecting && (
        <div className={q.cellActions}>
          <button type="button" className={q.round} onClick={() => download(item)} aria-label="Download">
            <IconDownload width={16} height={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== audio */
const MANNERS = ['Natural', 'Calm storyteller', 'Warm and friendly', 'Excited', 'Whisper', 'News anchor', 'Sad', 'Angry'];
const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25, 1.5];

// Voices that carry their locale (Microsoft MAI-Voice: "hi-IN-Kavya:MAI-Voice-2.1"): the voice decides the language,
// so the voices of the chosen language come first and read as "Kavya, Hindi (India)".
const LOCALE_NAMES = { 'hi-IN': 'Hindi (India)', 'en-IN': 'English (India)', 'en-US': 'English (US)', 'en-GB': 'English (UK)', 'en-AU': 'English (Australia)', 'es-MX': 'Spanish (Mexico)', 'es-ES': 'Spanish (Spain)', 'fr-FR': 'French', 'de-DE': 'German', 'it-IT': 'Italian', 'pt-BR': 'Portuguese (Brazil)', 'ja-JP': 'Japanese', 'ko-KR': 'Korean', 'zh-CN': 'Chinese' };
const LOCALES_OF = { Hindi: ['hi-IN'], Hinglish: ['hi-IN', 'en-IN'], English: ['en-IN', 'en-US', 'en-GB', 'en-AU'], Spanish: ['es-MX', 'es-ES'], French: ['fr-FR'], Japanese: ['ja-JP'] };
const localeOf = (voice) => /^([a-z]{2}-[A-Z]{2})-/.exec(voice)?.[1] || '';
const voiceLabel = (voice) => {
  const m = /^([a-z]{2}-[A-Z]{2})-([^:]+)/.exec(voice);
  if (m) return `${m[2]}, ${LOCALE_NAMES[m[1]] || m[1]}`;
  return voice.charAt(0).toUpperCase() + voice.slice(1).replace(/_/g, ' ');
};
function voicesFor(model, language) {
  const voices = model?.voices || [];
  if (!model?.language_from_voice) return voices;
  const wanted = LOCALES_OF[language] || [];
  const rank = (v) => {
    const i = wanted.indexOf(localeOf(v));
    return i === -1 ? wanted.length : i;
  };
  return [...voices].sort((a, b) => rank(a) - rank(b));
}

function AudioTool({ tool, options }) {
  const uid = useId();
  const toast = useToast();
  const models = options.audioModels;
  const [modelId, setModelId] = useState(models[0]?.id || '');
  const model = models.find((m) => m.id === modelId);
  const [voice, setVoice] = useState(models[0]?.voices[0] || '');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('Hindi');
  const [manner, setManner] = useState(MANNERS[0]);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState({ text: '', items: [], pending: false });
  const [fresh, setFresh] = useState(null);
  const sel = useSelection((ids) => setRun((r) => ({ ...r, items: r.items.filter((x) => !ids.includes(x.id)) })));

  const pickModel = (id) => {
    setModelId(id);
    const m = models.find((x) => x.id === id);
    if (m && !m.voices.includes(voice)) setVoice(voicesFor(m, language)[0] || '');
  };
  // a voice that carries its language: choosing a language picks that language's first voice
  const pickLanguage = (value) => {
    setLanguage(value);
    if (model?.language_from_voice && !(LOCALES_OF[value] || []).includes(localeOf(voice))) {
      const first = voicesFor(model, value)[0];
      if (first && (LOCALES_OF[value] || []).includes(localeOf(first))) setVoice(first);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!text.trim()) return setError('Write the text to be spoken.');
    setBusy(true);
    sel.stop();
    const same = run.items.length > 0 && sameText(text, run.text);
    setRun((r) => (same ? { ...r, pending: true } : { text, items: [], pending: true }));
    try {
      const made = await createAudio({ model: modelId, voice, text, instructions: model?.instructions && manner !== 'Natural' ? manner : '', speed: model?.speed ? speed : 1, language });
      setFresh(made.id);
      setRun((r) => ({ ...r, text, items: [made, ...r.items], pending: false }));
    } catch (err) {
      setError(err.message);
      setRun((r) => ({ ...r, pending: false }));
      toast(err.message, 'error');
    }
    setBusy(false);
    return undefined;
  };

  if (!models.length) return <Notice message="No voice model is available right now. Please try again later." />;

  const controls = (
    <>
      <RowSelect icon={IconSparkles} label="Model" value={modelId} options={models.map((m) => ({ value: m.id, label: m.name }))} onChange={pickModel} disabled={busy} wide />
      <PromptBox id={`${uid}-text`} label="Text" value={text} onChange={setText} max={options.limits.audio_text || 5000} rows={6} placeholder="The words to be spoken." disabled={busy} />
      <div className={q.rows}>
        <RowSelect icon={IconUser} label="Voice" value={voice} options={voicesFor(model, language).map((v) => ({ value: v, label: voiceLabel(v) }))} onChange={setVoice} disabled={busy} />
        <RowSelect icon={IconGlobe} label="Language" value={language} options={LANGUAGES.map((l) => ({ value: l, label: l }))} onChange={pickLanguage} disabled={busy} />
        {model?.instructions && <RowSelect icon={IconSliders} label="How it sounds" value={manner} options={MANNERS.map((m) => ({ value: m, label: m }))} onChange={setManner} disabled={busy} />}
        {model?.speed && <RowSelect icon={IconSpeed} label="Speed" value={speed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} onChange={(v) => setSpeed(Number(v))} disabled={busy} />}
      </div>
      <FormError text={error} />
      <GenerateBar busy={busy} />
    </>
  );

  const ids = run.items.map((x) => x.id);
  const canvas = (
    <Canvas tool={tool} title={tool.plural} count={run.items.length} sel={sel} allIds={ids}>
      {run.items.length === 0 && !run.pending ? (
        <Empty tool={tool} text="Your audio will show up here." />
      ) : (
        <ul className={q.audioList}>
          {run.pending && (
            <li className={cx(q.audioRow, q.audioWait)}>
              <LogoPulse />
            </li>
          )}
          {run.items.map((item) => (
            <li key={item.id}>
              <AudioRow item={item} fresh={fresh === item.id} sel={sel} />
            </li>
          ))}
        </ul>
      )}
    </Canvas>
  );
  return <Workspace tool={tool} onSubmit={submit} controls={controls} canvas={canvas} />;
}

function AudioRow({ item, fresh, sel }) {
  const { overlay, onReady } = useReveal(fresh);
  return (
    <div className={cx(q.audioRow, sel?.picked.has(item.id) && q.cellPicked)}>
      <Pick sel={sel} id={item.id} label={item.title} />
      <span className={q.audioIcon} aria-hidden="true">
        <IconMic width={20} height={20} />
      </span>
      <div className={q.audioBody}>
        <b className={q.audioTitle}>{item.title}</b>
        <span className={q.muted}>
          {item.settings.voice}
          {item.settings.language ? ` · ${item.settings.language}` : ''} · {timeAgo(item.createdAt)}
        </span>
        <Media item={item} onReady={onReady} />
      </div>
      {!sel?.selecting && (
        <button type="button" className={q.round} onClick={() => download(item)} aria-label="Download">
          <IconDownload width={16} height={16} />
        </button>
      )}
      {overlay}
    </div>
  );
}

/* ================================================================== the library */
const FILTERS = [
  { key: '', label: 'All' },
  { key: 'character', label: 'Characters' },
  { key: 'location', label: 'Locations' },
  { key: 'image', label: 'Images' },
  { key: 'story', label: 'Stories' },
  { key: 'avatar_video', label: 'Avatar videos' },
  { key: 'audio', label: 'Audio' },
];

/** The Library (/dashboard/library): everything made with Quick Create. Select several and delete them at once. */
export function LibraryPage() {
  useDocumentTitle('Library');
  const [filter, setFilter] = useState('');
  const items = useResource(() => listItems(filter, 200), [filter]);
  const sel = useSelection(() => items.reload());
  const list = items.data || [];
  const ids = list.filter((x) => x.status !== 'working').map((x) => x.id);
  const viewer = useViewer(list, () => items.reload());
  return (
    <div className={q.page}>
      <div className={q.head}>
        <div>
          <p className={q.eyebrow}>Quick Create</p>
          <h1 className={q.title}>Library</h1>
          <p className={q.sub}>Everything you made with the Quick Create tools. Click anything to open it, download it or delete it.</p>
          <RetentionNote />
        </div>
        <Link to={BASE} className={q.newBtn}>
          <IconSparkles width={16} height={16} /> Generate something
        </Link>
      </div>
      <div className={q.libBar}>
        <div className={q.filters} role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={cx(q.chip, filter === f.key && q.chipOn)}
              aria-pressed={filter === f.key}
              onClick={() => {
                sel.stop();
                setFilter(f.key);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={q.row}>
          {!sel.selecting && ids.length > 0 && (
            <button type="button" className={q.tbBtn} onClick={() => sel.setSelecting(true)}>
              <IconSquareCheck width={16} height={16} aria-hidden="true" /> Select
            </button>
          )}
          {sel.selecting && (
            <>
              <button type="button" className={q.tbBtn} onClick={() => sel.setPicked(sel.picked.size === ids.length ? new Set() : new Set(ids))}>
                {sel.picked.size === ids.length ? 'Clear' : 'Select all'}
              </button>
              <button type="button" className={cx(q.tbBtn, q.tbDanger)} onClick={sel.ask} disabled={!sel.picked.size}>
                <IconTrash width={15} height={15} aria-hidden="true" /> Delete{sel.picked.size ? ` (${sel.picked.size})` : ''}
              </button>
              <button type="button" className={q.tbBtn} onClick={sel.stop}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      {items.error && <Notice message={items.error.message} onRetry={items.reload} />}
      {items.data && list.length === 0 && (
        <div className={q.card}>
          <p className={q.muted} style={{ textAlign: 'center', padding: '24px 0' }}>
            Nothing here yet. Generate something with a Quick Create tool and it is kept here.
          </p>
        </div>
      )}
      {list.length > 0 && (
        <ul className={q.libGrid}>
          {list.map((item) => (
            <li key={item.id}>
              <LibraryCard item={item} sel={sel} onOpen={() => viewer.open(item.id)} />
            </li>
          ))}
        </ul>
      )}
      {sel.modal}
      {viewer.modal}
    </div>
  );
}

const RETENTION_DAYS = 30;
const DAY = 86400000;
const daysLeft = (item) => (item.expiresAt ? Math.max(0, Math.ceil((item.expiresAt - Date.now()) / DAY)) : null);
const leftText = (n) => (n === null ? '' : n <= 0 ? 'Deletes today' : n === 1 ? 'Deletes tomorrow' : `${n} days left`);

/** The small note that the Library keeps things for 30 days. */
function RetentionNote() {
  return (
    <p className={q.retention}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      Everything here is kept for {RETENTION_DAYS} days, then deleted automatically. Download what you want to keep.
    </p>
  );
}

/* ------------------------------------------------------------------ opening one thing on the screen */
/** A full-screen viewer for the Library's items: arrows (← →) move through the list, Esc closes. */
function useViewer(list, onDeleted) {
  const [openId, setOpenId] = useState(null);
  const at = list.findIndex((x) => x.id === openId);
  const item = at >= 0 ? list[at] : null;
  const close = useCallback(() => setOpenId(null), []);
  const move = useCallback((step) => {
    if (at < 0 || !list.length) return;
    setOpenId(list[(at + step + list.length) % list.length].id);
  }, [at, list]);
  const modal = item ? <Viewer item={item} position={at + 1} total={list.length} onClose={close} onMove={move} onDeleted={() => { close(); onDeleted(item); }} /> : null;
  return { open: setOpenId, modal };
}

function Viewer({ item, position, total, onClose, onMove, onDeleted }) {
  const toast = useToast();
  const tool = toolOf(item.kind);
  const closeRef = useRef(null);
  const [asking, setAsking] = useState(false);
  const left = daysLeft(item);
  const story = item.kind === 'story' ? (item.content.versions || []).find((v) => v.no === item.content.current) || (item.content.versions || []).at(-1) : null;

  useEffect(() => {
    const back = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (asking) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && total > 1) onMove(1);
      if (e.key === 'ArrowLeft' && total > 1) onMove(-1);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (back && typeof back.focus === 'function') back.focus();
    };
  }, [onClose, onMove, total, asking]);

  const details = [
    tool.kind === 'avatar_video' ? 'Avatar video' : tool.label,
    item.settings.aspect_ratio,
    item.settings.voice && `Voice: ${item.settings.voice}`,
    item.settings.language,
    item.createdAt && `Made ${timeAgo(item.createdAt)}`,
  ].filter(Boolean);

  return createPortal(
    <div className={cx(q.viewer, tool.tone)} role="dialog" aria-modal="true" aria-label={item.title || tool.label} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={q.viewerBar}>
        <span className={q.viewerCount}>
          {position} / {total}
        </span>
        <span className={q.grow} />
        {item.hasFile && (
          <button type="button" className={q.viewerBtn} onClick={() => download(item)}>
            <IconDownload width={16} height={16} aria-hidden="true" /> Download
          </button>
        )}
        {['story', 'avatar_video'].includes(item.kind) && (
          <Link to={toolPath(tool, item.id)} className={q.viewerBtn}>
            Open in {tool.kind === 'avatar_video' ? 'Avatar video' : tool.label} <IconChevronRight width={15} height={15} aria-hidden="true" />
          </Link>
        )}
        {item.status !== 'working' && (
          <button type="button" className={cx(q.viewerBtn, q.viewerDanger)} onClick={() => setAsking(true)}>
            <IconTrash width={15} height={15} aria-hidden="true" /> Delete
          </button>
        )}
        <button ref={closeRef} type="button" className={q.viewerClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={q.viewerStage} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {total > 1 && (
          <button type="button" className={cx(q.viewerArrow, q.viewerPrev)} onClick={() => onMove(-1)} aria-label="Previous">
            ‹
          </button>
        )}
        <div className={q.viewerContent} key={item.id}>
          {['character', 'location', 'image'].includes(item.kind) && <Media item={item} className={q.viewerMedia} />}
          {item.kind === 'avatar_video' &&
            (item.status === 'done' ? (
              <Media item={item} className={q.viewerMedia} />
            ) : item.status === 'failed' ? (
              <div className={q.viewerText}>
                <b>This video could not be made.</b>
                <p>{item.error}</p>
              </div>
            ) : (
              <div className={q.viewerWait}>
                <LogoPulse label="Still being made" />
              </div>
            ))}
          {item.kind === 'audio' && (
            <div className={q.viewerAudio}>
              <span className={q.audioIcon} aria-hidden="true">
                <IconMic width={30} height={30} />
              </span>
              <Media item={item} />
            </div>
          )}
          {story && (
            <article className={q.viewerText}>
              <h2 className={q.docTitle}>{story.title}</h2>
              {story.content.split(/\n{2,}/).map((para, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <p key={i}>{para}</p>
              ))}
            </article>
          )}
        </div>
        {total > 1 && (
          <button type="button" className={cx(q.viewerArrow, q.viewerNext)} onClick={() => onMove(1)} aria-label="Next">
            ›
          </button>
        )}
      </div>

      <div className={q.viewerInfo}>
        <p className={q.viewerTitle}>{item.title || tool.label}</p>
        {item.prompt && item.prompt.trim() !== (item.title || '').trim() && item.kind !== 'story' && item.kind !== 'audio' && <p className={q.viewerPrompt}>“{item.prompt.length > 400 ? `${item.prompt.slice(0, 400)}…` : item.prompt}”</p>}
        <p className={q.viewerMeta}>
          {details.join(' · ')}
          {left !== null && <span className={cx(q.viewerLeft, left <= 3 && q.soon)}>{leftText(left)}</span>}
        </p>
      </div>

      <ConfirmModal
        open={asking}
        title="Delete this?"
        text="It is deleted from your Library for good. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteMany([item.id]);
          toast('Deleted');
          setAsking(false);
          onDeleted();
        }}
        onClose={() => setAsking(false)}
      />
    </div>,
    document.body,
  );
}

function LibraryCard({ item, sel, onOpen }) {
  const tool = toolOf(item.kind);
  const Icon = tool.icon;
  const left = daysLeft(item);
  const story = item.kind === 'story' ? (item.content.versions || []).find((v) => v.no === item.content.current) : null;
  // (a video shows its picture here; it plays in the viewer)
  const visual =
    item.kind === 'avatar_video' ? (
      <>
        <Media item={item} source />
        {item.status === 'done' && (
          <span className={q.libPlay} aria-hidden="true">
            <IconPlay width={18} height={18} />
          </span>
        )}
      </>
    ) : ['character', 'location', 'image'].includes(item.kind) ? (
      <Media item={item} />
    ) : null;
  const body = (
    <>
      <div className={q.libVisual}>
        {visual || (
          <div className={q.libText}>
            {story ? <p>{story.content.slice(0, 220)}</p> : <Icon width={34} height={34} />}
          </div>
        )}
        <span className={q.libKind}>{tool.kind === 'avatar_video' ? 'Avatar video' : tool.label}</span>
        {item.status === 'working' && <span className={q.libState}>Making…</span>}
        {item.status === 'failed' && <span className={cx(q.libState, q.libFailed)}>Failed</span>}
      </div>
      <p className={q.libTitle}>{item.title || tool.label}</p>
      <p className={q.libMeta}>
        <span>{timeAgo(item.createdAt)}</span>
        {left !== null && <span className={cx(q.libLeft, left <= 3 && q.soon)}>{leftText(left)}</span>}
      </p>
    </>
  );
  return (
    <div className={cx(q.libCard, tool.tone, sel?.picked.has(item.id) && q.libPicked)}>
      <Pick sel={item.status === 'working' ? null : sel} id={item.id} label={item.title} />
      <button
        type="button"
        className={q.libOpen}
        onClick={() => (sel?.selecting ? item.status !== 'working' && sel.toggle(item.id) : onOpen?.())}
        aria-label={sel?.selecting ? `Select ${item.title || tool.label}` : `Open ${item.title || tool.label}`}
      >
        {body}
      </button>
      {item.kind === 'audio' && <Media item={item} />}
      {item.hasFile && sel && !sel.selecting && (
        <button type="button" className={q.libDownload} onClick={() => download(item)}>
          <IconDownload width={15} height={15} /> Download
        </button>
      )}
    </div>
  );
}