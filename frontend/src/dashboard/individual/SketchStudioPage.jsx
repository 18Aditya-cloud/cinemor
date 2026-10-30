import { useEffect, useId, useMemo, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconBook, IconImage, IconSparkles, IconTrash } from '../ui/DashIcons.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import { PLACE_LABEL, placeKind, scenesOfStory, SKETCH_MODELS, timeOfDay } from './sketchStudio.js';
import { download } from './filmExport.js';
import {
  deleteSceneSketch,
  downloadSceneSketch,
  generateSceneSketch,
  getCharacterRecords,
  getProject,
  getProjectStory,
  getSceneSketches,
  getStoryboard,
  isLive,
  listProjectStories,
  listStoryboards,
  MAX_SKETCHES,
  selectSceneSketch,
  uploadSceneSketch,
} from './individualApi.js';
import ParticleForge from './ParticleForge.jsx';
import { IconArrowLeft } from './parts.jsx';
import { has, nice } from './storyboard.js';
import { IconExport, IconPin, IconUpload } from './StoryIcons.jsx';
import cs from './CharacterStudio.module.css';
import s from './SketchStudio.module.css';

/**
 * Sketch Studio (a Creative Module, "Layer by layer"): a sketch of every scene.
 *
 *   /dashboard/projects/:id/sketches                    picks a story
 *   /dashboard/projects/:id/sketches/:storyId           that story's scenes
 *   /dashboard/projects/:id/sketches/:storyId/:sceneNo  one scene's sketch workspace
 *
 * The workspace is laid out like a character's page: the scene on the left, the sketch in the middle, the sketches
 * made so far on the right. The backend makes the sketches with an image model (individualApi.js).
 * Shared pieces (cards, fields, the image frame and its "Generating" effect) come from CharacterStudio.module.css.
 */
const base = (projectId) => `/dashboard/projects/${projectId}/sketches`;

async function load(projectId) {
  const [project, stories, boards] = await Promise.all([getProject(projectId), listProjectStories(projectId), listStoryboards(projectId)]);
  return { project, stories, boards };
}

export default function SketchStudioPage({ projectId, storyId = null, sceneNo = null }) {
  const { navigate } = useRouter();
  const { data, error, reload } = useResource(() => load(projectId), [projectId]);
  useDocumentTitle(data ? `Sketch: ${data.project.title}` : 'Sketch');
  const back = `/dashboard/projects/${projectId}`;

  const chosen = data && (data.stories.find((st) => st.id === storyId) ? storyId : data.boards[0]?.storyId ?? data.stories[0]?.id ?? null);
  useEffect(() => {
    if (data && chosen && chosen !== storyId) navigate(`${base(projectId)}/${chosen}`, { replace: true });
  }, [data, chosen, storyId, projectId, navigate]);

  if (!data) {
    return (
      <div className={cs.page} aria-busy={!error}>
        <Link to={back} className={cs.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        {error && <Notice message={error.message} onRetry={reload} />}
      </div>
    );
  }

  const head = (
    <div className={cs.pageHead}>
      {sceneNo ? (
        <Link to={`${base(projectId)}/${chosen}`} className={cs.back}>
          <IconArrowLeft width={16} height={16} /> All scenes
        </Link>
      ) : (
        <Link to={back} className={cs.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
      )}
      {!sceneNo && (
        <div className={cs.titleRow}>
          <h1 className={cs.pageTitle}>Sketch Studio</h1>
          <p className={cs.pageSub}>{data.project.title}</p>
        </div>
      )}
    </div>
  );

  if (data.stories.length === 0) {
    return (
      <div className={cs.page}>
        {head}
        <section className={cs.empty}>
          <span className={cs.emptyIcon} aria-hidden="true">
            <IconBook width={22} height={22} />
          </span>
          <h2 className={cs.emptyTitle}>Write a story first</h2>
          <p className={cs.emptyText}>Scenes come from a story. Create one with AI or import yours, then come back here.</p>
          <Button onClick={() => navigate(`/dashboard/projects/${projectId}/story`)}>Open Story</Button>
        </section>
      </div>
    );
  }

  return (
    <div className={cs.page}>
      {head}
      {chosen && (
        <Studio
          key={chosen}
          projectId={projectId}
          stories={data.stories}
          boards={data.boards}
          storyId={chosen}
          sceneNo={sceneNo}
          onPickStory={(id) => navigate(`${base(projectId)}/${id}`)}
          onOpen={(no) => navigate(`${base(projectId)}/${chosen}/${no}`)}
        />
      )}
    </div>
  );
}

/* ====================================================================================== one story */
function Studio({ projectId, stories, boards, storyId, sceneNo, onPickStory, onOpen }) {
  const { navigate } = useRouter();
  const { data, error, reload } = useResource(
    () => Promise.all([getProjectStory(projectId, storyId), getStoryboard(projectId, storyId), getSceneSketches(projectId, storyId), getCharacterRecords(projectId, storyId)]),
    [projectId, storyId],
  );
  const [sketches, setSketches] = useState(null);
  const story = data?.[0];
  const board = data?.[1];
  // (with the backend, sketches need the storyboard's scenes)
  const scenes = useMemo(() => (story && (board || !isLive) ? scenesOfStory(story, board) : []), [story, board]);
  const saved = sketches || data?.[2] || {};

  if (!data) return error ? <Notice message={error.message} onRetry={reload} /> : <div className={cs.loading} aria-busy="true" />;
  const onSaved = (no, record) => setSketches((r) => ({ ...(r || data[2]), [no]: record }));

  if (sceneNo) {
    const scene = scenes.find((sc) => sc.no === sceneNo);
    if (!scene) {
      return (
        <section className={cs.empty}>
          <h2 className={cs.emptyTitle}>This scene is not in the story</h2>
          <p className={cs.emptyText}>The story or its storyboard may have changed.</p>
          <Button onClick={() => navigate(`${base(projectId)}/${storyId}`)}>See all scenes</Button>
        </section>
      );
    }
    return (
      <Workspace
        key={sceneNo}
        projectId={projectId}
        storyId={storyId}
        scene={scene}
        scenes={scenes}
        record={saved[sceneNo]}
        records={saved}
        characters={data[3]}
        onOpen={onOpen}
        onSaved={(record) => onSaved(sceneNo, record)}
      />
    );
  }

  const done = scenes.filter((sc) => saved[sc.no]?.sketches?.length).length;
  return (
    <>
      <StoryPicker stories={stories} boards={boards} chosen={storyId} onPick={onPickStory} />
      {!board && isLive && (
        <section className={cs.empty}>
          <h2 className={cs.emptyTitle}>Make a storyboard first</h2>
          <p className={cs.emptyText}>Sketches are made from the storyboard’s scenes. Make one for this story, and its scenes appear here.</p>
          <Button onClick={() => navigate(`/dashboard/projects/${projectId}/storyboard/${storyId}`)}>Open Storyboard</Button>
        </section>
      )}
      {!board && !isLive && (
        <div className={cs.hint} role="note">
          <span>These scenes were worked out from the story. Make a storyboard first for better scene details.</span>
          <button type="button" className={cs.linkButton} onClick={() => navigate(`/dashboard/projects/${projectId}/storyboard/${storyId}`)}>
            Open Storyboard
          </button>
        </div>
      )}
      <section className={cs.castSection} aria-labelledby="sk-scenes">
        <div className={cs.sectionHead}>
          <h2 id="sk-scenes" className={cs.sectionTitle}>
            Scenes <span className={cs.count}>{scenes.length}</span>
          </h2>
          {scenes.length > 0 && (
            <p className={cs.sectionSub}>
              {done} of {scenes.length} sketched
            </p>
          )}
        </div>
        <ul className={s.sceneGrid} aria-label="Scenes">
          {scenes.map((sc) => {
            const main = mainSketch(saved[sc.no]);
            const count = saved[sc.no]?.sketches?.length || 0;
            return (
              <li key={sc.no}>
                <button type="button" className={s.sceneCard} onClick={() => onOpen(sc.no)} aria-label={`Open scene ${sc.no}: ${sc.title}`}>
                  <span className={s.sceneThumb}>
                    {main ? (
                      <img src={main.src} alt="" />
                    ) : (
                      <span className={s.thumbEmpty}>
                        <IconImage width={22} height={22} aria-hidden="true" />
                      </span>
                    )}
                    <span className={s.sceneNoTag}>Scene {sc.no}</span>
                  </span>
                  <span className={s.sceneBody}>
                    <span className={s.sceneName}>{sc.title}</span>
                    {has(sc.visual_description || sc.summary) && <span className={s.sceneText}>{sc.visual_description || sc.summary}</span>}
                    <span className={s.sceneFoot}>
                      <span className={s.placeChip}>
                        <IconPin width={13} height={13} aria-hidden="true" />
                        {has(sc.location) ? sc.location : PLACE_LABEL[placeKind(sc)]}
                      </span>
                      <span className={cx(s.sketchCount, count > 0 && s.sketchCountOn)}>{count ? `${count} ${count === 1 ? 'sketch' : 'sketches'}` : 'No sketch yet'}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

const mainSketch = (record) => (record?.sketches?.length ? record.sketches.find((k) => k.id === record.selected) || record.sketches[0] : null);

function StoryPicker({ stories, boards, chosen, onPick }) {
  const uid = useId();
  return (
    <section className={cs.picker} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className={cs.sectionLabel}>
        Story <span className={cs.count}>{stories.length}</span>
      </h2>
      <div className={cs.storyList} role="radiogroup" aria-labelledby={`${uid}-h`}>
        {stories.map((st) => {
          const board = boards.find((b) => b.storyId === st.id);
          const on = st.id === chosen;
          return (
            <button key={st.id} type="button" role="radio" aria-checked={on} className={cx(cs.storyCard, on && cs.storyCardOn)} onClick={() => onPick(st.id)}>
              <span className={cs.storyIcon} aria-hidden="true">
                <IconBook width={17} height={17} />
              </span>
              <span className={cs.storyText}>
                <span className={cs.storyName}>{st.title}</span>
                <span className={cs.storyMeta}>{board ? `${board.scenes} scenes in the storyboard` : 'No storyboard yet'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ====================================================================================== one scene */
const STEPS = ['Reading the scene', 'Setting the place', 'Adding light and colour', 'Final touches'];
const RUN_TIME = 7600;
const HINTS = ['The sketch follows the scene’s place, mood and time of day.', 'Tip: add “at night” or “with a river” to change the sketch.', 'Pick the sketch you like best on the right: it becomes the scene’s main one.'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileName = (scene, type) => `Scene ${scene.no} - ${scene.title.replace(/[\\/:*?"<>|…]+/g, '').trim().slice(0, 60) || 'sketch'}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// quick additions for the sketch's own directions
const EXTRA_IDEAS = ['Close-up', 'Wide shot', 'Low angle', 'Golden hour light', 'Moonlit night', 'More dramatic'];

function Workspace({ projectId, storyId, scene, scenes, record, records, characters, onOpen, onSaved }) {
  const toast = useToast();
  const uid = useId();
  const sketches = record?.sketches || [];
  const [viewing, setViewing] = useState(record?.selected || sketches[0]?.id || null);
  // the model of the last generated sketch (an uploaded image has no model), else the first one
  const [model, setModel] = useState(sketches.find((k) => SKETCH_MODELS.some((m) => m.id === k.model))?.model || SKETCH_MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [run, setRun] = useState(null); // { step, started, done }
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState('');
  const shown = sketches.find((k) => k.id === viewing) || mainSketch(record);
  const busy = Boolean(run);
  const pct = useRunPercent(run);
  const index = scenes.findIndex((sc) => sc.no === scene.no);
  const kind = placeKind(scene);
  const time = timeOfDay(scene);

  const generate = async () => {
    setError('');
    const started = performance.now();
    setRun({ step: 0, started, done: false });
    try {
      const job = generateSceneSketch(projectId, storyId, scene.no, { model, prompt });
      job.catch(() => {});
      for (let i = 1; i < STEPS.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await wait(Math.max(0, started + (RUN_TIME * i) / STEPS.length - performance.now()));
        setRun((r) => ({ ...r, step: i }));
      }
      await wait(Math.max(0, started + RUN_TIME - performance.now()));
      const saved = await job;
      onSaved(saved);
      setViewing(saved.selected);
      setRun((r) => ({ ...r, done: true }));
      await wait(800);
      setReveal((n) => n + 1);
      toast('Sketch ready');
    } catch (err) {
      setError(err.message || 'The sketch could not be made. Please try again.');
    } finally {
      setRun(null);
    }
  };

  const choose = async (id) => {
    setViewing(id);
    if (record?.selected === id) return;
    try {
      onSaved(await selectSceneSketch(projectId, storyId, scene.no, id));
    } catch (err) {
      setError(err.message);
    }
  };
  const [asking, setAsking] = useState(null); // the sketch whose delete is being confirmed: { id, label, main }
  // (ConfirmModal shows the error if the delete is refused)
  const remove = async (id) => {
    const saved = await deleteSceneSketch(projectId, storyId, scene.no, id);
    onSaved(saved);
    if (viewing === id) setViewing(saved.selected);
    toast('Sketch deleted');
  };
  // the creator's own image: it becomes the scene's main sketch
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const saved = await uploadSceneSketch(projectId, storyId, scene.no, file);
      onSaved(saved);
      setViewing(saved.selected);
      setReveal((n) => n + 1);
      toast('Image uploaded and set as the main sketch');
    } catch (err) {
      setError(err.message || 'The image could not be uploaded. Please try again.');
    }
    setUploading(false);
  };
  const recordOf = (name) => Object.values(characters || {}).find((r) => String(r?.name || '').toLowerCase() === name.toLowerCase());
  const present = scene.characters_present.map((name) => ({ name, record: recordOf(name) }));
  return (
    <div className={cs.detail}>
      {/* every scene of the story, to jump between them */}
      <div className={cs.castBar}>
        <h1 className={cs.srOnly}>
          Scene {scene.no}: {scene.title}
        </h1>
        <nav className={s.sceneStrip} aria-label="Scenes">
          {scenes.map((sc) => {
            const main = mainSketch(records[sc.no]);
            const on = sc.no === scene.no;
            return (
              <button key={sc.no} type="button" className={cx(s.stripItem, on && s.stripItemOn)} onClick={() => !on && onOpen(sc.no)} aria-label={on ? `Scene ${sc.no} (open)` : `Open scene ${sc.no}`} aria-current={on ? 'page' : undefined} title={sc.title}>
                {main ? <img src={main.src} alt="" /> : null}
                <span>{sc.no}</span>
              </button>
            );
          })}
        </nav>
        <p className={cs.position}>
          Scene {index + 1} of {scenes.length}
        </p>
      </div>

      <div className={s.workbench}>
        {/* ---------------------------------------------------------------- left: the scene */}
        <section className={cx(cs.card, s.sceneCardSide)} aria-labelledby={`${uid}-scene`}>
          <p className={s.kicker}>Scene {scene.no}</p>
          <h2 id={`${uid}-scene`} className={s.sceneTitle}>
            {scene.title}
          </h2>
          {has(scene.summary) && <p className={s.summary}>{scene.summary}</p>}
          <ul className={s.facts} aria-label="About this scene">
            <li className={s.fact}>
              <IconPin width={14} height={14} aria-hidden="true" />
              {has(scene.location) ? scene.location : PLACE_LABEL[kind]}
            </li>
            <li className={s.fact}>{nice(time)}</li>
            {has(scene.emotion) && <li className={s.fact}>Mood: {nice(scene.emotion)}</li>}
          </ul>
          {present.length > 0 && (
            <div className={s.block}>
              <h3 className={s.blockLabel}>In this scene</h3>
              <ul className={s.people}>
                {present.map((p) => {
                  const img = p.record?.images && (p.record.images.active === 'uploaded' ? p.record.images.uploaded || p.record.images.master : p.record.images.master || p.record.images.uploaded);
                  return (
                    <li key={p.name} className={s.person}>
                      <span className={s.personAvatar} aria-hidden="true">
                        {img ? <img src={img.src} alt="" /> : initials(p.name)}
                      </span>
                      {p.name}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {[
            ['What we see', scene.visual_description],
            ['What happens', scene.primary_action],
            ['Camera', scene.camera_suggestion],
          ]
            .filter(([, v]) => has(v))
            .map(([label, v]) => (
              <div key={label} className={s.block}>
                <h3 className={s.blockLabel}>{label}</h3>
                <p className={s.blockText}>{v}</p>
              </div>
            ))}
        </section>

        {/* ---------------------------------------------------------------- middle: the sketch */}
        <section className={cx(cs.card, s.sketchCard)} aria-labelledby={`${uid}-sketch`}>
          <div className={cs.cardTop}>
            <h2 id={`${uid}-sketch`} className={cs.cardTitle}>
              Scene sketch
            </h2>
            {shown && !busy && shown.id === record?.selected && <span className={cx(cs.pill, cs.pillReady)}>Main sketch</span>}
          </div>
          <div className={cx(cs.stageWrap, s.stageWrap, busy && cs.stageBusy)}>
            {busy && <span className={cs.edgeGlow} aria-hidden="true" />}
            <div className={cx(cs.stage, s.stage)}>
              {shown && !busy ? (
                <img key={`${shown.id}-${reveal}`} className={cx(cs.photo, s.photo, reveal > 0 && cs.photoReveal)} src={shown.src} alt={`Sketch of scene ${scene.no}`} />
              ) : !busy ? (
                <div className={cs.placeholder}>
                  <span className={cx(cs.placeholderMark, s.placeholderMark)} aria-hidden="true">
                    <IconImage width={26} height={26} />
                  </span>
                  <p>No sketch yet. Generate one below.</p>
                </div>
              ) : null}
              {busy && <ParticleForge shape="scene" started={run.started} duration={RUN_TIME} done={run.done} pct={pct} hint={HINTS[run.step % HINTS.length]} />}
              {!busy && (
                <div className={cs.stageTools}>
                  <button
                    type="button"
                    className={cs.toolButton}
                    onClick={() => downloadSceneSketch(projectId, storyId, scene.no, shown.id).then((blob) => download(blob, fileName(scene, blob.type)), (err) => setError(err.message))}
                    disabled={!shown}
                    aria-label="Download sketch"
                    title="Download sketch"
                  >
                    <IconExport width={16} height={16} />
                  </button>
                  <button type="button" className={cs.toolButton} onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Upload your image" title="Upload your image">
                    <IconUpload width={16} height={16} />
                  </button>
                </div>
              )}
            </div>
            {busy && <span className={cx(cs.edgeLight, run.done && cs.edgeDone)} aria-hidden="true" />}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={cs.fileInput}
            data-testid="sketch-upload"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              upload(file);
            }}
          />
          {busy ? (
            <RunProgress run={run} pct={pct} />
          ) : (
            shown && (
              <div className={cs.imageMetaRow}>
                <p className={cs.imageMeta}>
                  {shown.uploaded || shown.model === 'user_upload'
                    ? `Your image${shown.at ? `, uploaded ${timeAgo(shown.at)}` : ''}`
                    : `Made ${shown.at ? `${timeAgo(shown.at)} ` : ''}with ${SKETCH_MODELS.find((m) => m.id === shown.model)?.name || 'Cinemor'}`}
                  {shown.prompt ? `: “${shown.prompt}”` : ''}
                </p>
              </div>
            )
          )}
          {error && (
            <p className={cs.error} role="alert">
              {error}
            </p>
          )}
          {/* the person's own directions for this sketch, added to the scene's description */}
          <div className={s.extra}>
            <div className={s.extraHead}>
              <label htmlFor={`${uid}-extra`} className={s.extraLabel}>
                How should the sketch look? <span className={s.extraOptional}>Optional</span>
              </label>
              <span className={s.extraCount}>{prompt.length} / 1000</span>
            </div>
            <textarea
              id={`${uid}-extra`}
              className={s.extraArea}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Close-up on Sita’s face, soft moonlight, tears catching the light, shallow depth of field"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !busy) generate();
              }}
              disabled={busy}
            />
            <div className={s.extraChips}>
              {EXTRA_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  className={s.extraChip}
                  onClick={() => setPrompt((cur) => (cur.trim() ? `${cur.trim().replace(/[.,]$/, '')}, ${idea.toLowerCase()}` : idea).slice(0, 1000))}
                  disabled={busy}
                >
                  + {idea}
                </button>
              ))}
            </div>
          </div>
          <div className={cx(cs.genBar, s.genBarNoPrompt)}>
            <select className={cx(cs.input, cs.genModel)} aria-label="Image model" value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
              {SKETCH_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button icon={IconSparkles} onClick={generate} disabled={busy}>
              {sketches.length ? 'Generate again' : 'Generate sketch'}
            </Button>
          </div>
          <div className={s.uploadRow}>
            <span>Have your own sketch or image?</span>
            <Button variant="secondary" icon={IconUpload} onClick={() => fileRef.current?.click()} loading={uploading} disabled={busy}>
              Upload your image
            </Button>
          </div>
        </section>

        {/* ---------------------------------------------------------------- right: the sketches so far */}
        <section className={cx(cs.card, s.historyCard)} aria-labelledby={`${uid}-made`}>
          <div>
            <h2 id={`${uid}-made`} className={cs.cardTitle}>
              Sketches <span className={cs.count}>{sketches.length}</span>
            </h2>
            <p className={cs.cardSub}>{isLive ? 'Click one to see it; it becomes the scene’s main sketch.' : `Click one to see it; it becomes the scene’s main sketch. The last ${MAX_SKETCHES} are kept.`}</p>
          </div>
          {sketches.length === 0 ? (
            <p className={s.historyEmpty}>Sketches you generate for this scene appear here.</p>
          ) : (
            <ul className={s.history} aria-label="Sketches of this scene">
              {sketches.map((k, n) => {
                const on = k.id === shown?.id;
                const main = k.id === record?.selected;
                return (
                  <li key={k.id} className={cx(s.historyItem, on && s.historyItemOn)}>
                    <button type="button" className={s.historyPick} onClick={() => choose(k.id)} disabled={busy} aria-pressed={on} aria-label={`Sketch ${sketches.length - n}${main ? ', main sketch' : ''}`}>
                      <img src={k.src} alt="" />
                      <span className={s.historyText}>
                        <span className={s.historyName}>
                          Sketch {sketches.length - n}
                          {main && <span className={s.mainBadge}>Main</span>}
                        </span>
                        <span className={s.historyMeta}>
                          {[k.uploaded || k.model === 'user_upload' ? 'Your image' : SKETCH_MODELS.find((m) => m.id === k.model)?.name || 'Cinemor', k.at && timeAgo(k.at)].filter(Boolean).join(', ')}
                        </span>
                      </span>
                    </button>
                    <button type="button" className={s.historyDelete} onClick={() => setAsking({ id: k.id, label: `Sketch ${sketches.length - n}`, main })} disabled={busy} aria-label={`Delete sketch ${sketches.length - n}`} title="Delete sketch">
                      <IconTrash width={15} height={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <ConfirmModal
        open={Boolean(asking)}
        title="Delete this sketch?"
        text={asking ? `${asking.label} of scene ${scene.no} will be deleted for good.${asking.main && sketches.length > 1 ? ' The newest other sketch becomes the main one.' : ''} This cannot be undone.` : ''}
        confirmLabel="Delete Sketch"
        onClose={() => setAsking(null)}
        onConfirm={() => remove(asking.id)}
      />
    </div>
  );
}


/** How far along the run is (0..100): it eases towards the end and only shows 100 once the sketch is ready. */
function useRunPercent(run) {
  const [pct, setPct] = useState(0);
  const started = run?.started;
  const done = run?.done;
  const frameRef = useRef(0);
  useEffect(() => {
    if (!started) {
      setPct(0);
      return undefined;
    }
    const tick = () => {
      const t = (performance.now() - started) / RUN_TIME;
      setPct(done ? 100 : Math.min(97, Math.round(100 * (1 - (1 - Math.min(1, t)) ** 1.6))));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [started, done]);
  return pct;
}

function RunProgress({ run, pct }) {
  return (
    <div className={cx(cs.progress, run.done && cs.progressDone)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Making the sketch">
      <span className={cs.progressLabel}>{run.done ? 'The sketch is ready' : `${STEPS[run.step]}…`}</span>
      <span className={cs.progressPct}>{pct}%</span>
    </div>
  );
}