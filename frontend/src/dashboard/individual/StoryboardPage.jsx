import { useEffect, useId, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import { listModels } from '../../services/storyApi.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconBook, IconCube, IconPencil, IconRefresh, IconTrash, IconUsers } from '../ui/DashIcons.jsx';
import Modal from '../ui/Modal.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import CinemorOrb from './CinemorOrb.jsx';
import { download } from './filmExport.js';
import { deleteStoryboard, exportStoryboard, generateStoryboard, getProject, getProjectStory, getStoryboard, importStoryboard, isLive, listProjectStories, listStoryboards, storyboardTemplate, updateStoryboardDialogue, updateStoryboardScene } from './individualApi.js';
import { sceneCount } from './oneClick.js';
import { IconArrowLeft } from './parts.jsx';
import { countsOf, findCharacter, fromBackendBoard, has, nice, readStoryboard, scenesAt, scenesWith } from './storyboard.js';
import { IconDocument, IconExport, IconLink, IconPin, IconQuote, IconUpload } from './StoryIcons.jsx';
import s from './Storyboard.module.css';

/**
 * Storyboard (a Creative Module, "Layer by layer"): a story broken down into its characters and how they are
 * related, its scenes with their dialogue, its places and its objects, with an overview on top.
 *
 *   /dashboard/projects/:id/storyboard            picks the story (the last one with a storyboard)
 *   /dashboard/projects/:id/storyboard/:storyId   that story's storyboard
 *
 * The storyboard is words only (the script side: characters, descriptions, dialogue); pictures of characters and
 * places are made later, in the Characters and Environment modules.
 *
 * Making a storyboard is a demo for now (storyboard.js works it out from the story's text); the backend will make
 * it with AI later in the same format. Export / Import JSON use that format, and the template shows it.
 */
const base = (projectId) => `/dashboard/projects/${projectId}/storyboard`;

async function load(projectId) {
  const [project, stories, boards] = await Promise.all([getProject(projectId), listProjectStories(projectId), listStoryboards(projectId)]);
  return { project, stories, boards };
}

export default function StoryboardPage({ projectId, storyId = null }) {
  const { navigate } = useRouter();
  const { data, error, reload } = useResource(() => load(projectId), [projectId]);
  useDocumentTitle(data ? `Storyboard: ${data.project.title}` : 'Storyboard');
  const back = `/dashboard/projects/${projectId}`;

  // no story in the address: open the last storyboard made, or the newest story
  const chosen = data && (data.stories.find((st) => st.id === storyId) ? storyId : data.boards[0]?.storyId ?? data.stories[0]?.id ?? null);
  useEffect(() => {
    if (data && chosen && chosen !== storyId) navigate(`${base(projectId)}/${chosen}`, { replace: true });
  }, [data, chosen, storyId, projectId, navigate]);

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

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <Link to={back} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
        <div className={s.titleRow}>
          <h1 className={s.pageTitle}>Storyboard</h1>
          <p className={s.pageSub}>{data.project.title}</p>
        </div>
      </div>

      {data.stories.length === 0 ? (
        <section className={s.empty}>
          <span className={s.emptyIcon} aria-hidden="true">
            <IconBook width={22} height={22} />
          </span>
          <h2 className={s.emptyTitle}>Write a story first</h2>
          <p className={s.emptyText}>A storyboard is made from a story. Create one with AI or import yours, then come back here.</p>
          <Button onClick={() => navigate(`/dashboard/projects/${projectId}/story`)}>Open Story</Button>
        </section>
      ) : (
        <>
          <StoryPicker stories={data.stories} boards={data.boards} chosen={chosen} onPick={(id) => navigate(`${base(projectId)}/${id}`)} />
          {chosen && <Board key={chosen} projectId={projectId} storyId={chosen} onSaved={reload} />}
        </>
      )}
    </div>
  );
}

/* ====================================================================================== story picker */
function StoryPicker({ stories, boards, chosen, onPick }) {
  const uid = useId();
  return (
    <section className={s.picker} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className={s.sectionLabel}>
        Story <span className={s.count}>{stories.length}</span>
      </h2>
      <div className={s.storyList} role="radiogroup" aria-labelledby={`${uid}-h`}>
        {stories.map((st) => {
          const board = boards.find((b) => b.storyId === st.id);
          const on = st.id === chosen;
          return (
            <button key={st.id} type="button" role="radio" aria-checked={on} className={cx(s.storyCard, on && s.storyCardOn)} onClick={() => onPick(st.id)}>
              <span className={s.storyIcon} aria-hidden="true">
                <IconBook width={17} height={17} />
              </span>
              <span className={s.storyText}>
                <span className={s.storyName}>{st.title}</span>
                <span className={s.storyMeta}>{st.words.toLocaleString('en-IN')} words</span>
                <span className={cx(s.storyState, board ? (board.outdated ? s.stateOld : s.stateReady) : s.stateNone)}>
                  <span className={s.stateDot} aria-hidden="true" />
                  {board ? (board.outdated ? 'Story changed' : 'Storyboard ready') : 'No storyboard yet'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ====================================================================================== one story's storyboard */
const STEPS = ['Reading the story', 'Finding the characters', 'Splitting scenes and dialogue', 'Noting places and objects'];
const MIN_MAKE = 3200;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileNameFor = (title) => `${(title || 'storyboard').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'storyboard'} - storyboard.json`;

function Board({ projectId, storyId, onSaved }) {
  const toast = useToast();
  const { data, error, reload } = useResource(() => Promise.all([getProjectStory(projectId, storyId), getStoryboard(projectId, storyId), listModels()]), [projectId, storyId]);
  const [saved, setSaved] = useState(undefined); // the storyboard after making / importing one here
  const [making, setMaking] = useState(null); // { step, pct }
  const [makeError, setMakeError] = useState('');
  const [importing, setImporting] = useState(false);
  const [confirmRemake, setConfirmRemake] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState('overview');
  const [scene, setScene] = useState(0);
  const tabsRef = useRef(null);

  if (!data) return error ? <Notice message={error.message} onRetry={reload} /> : <div className={s.loading} aria-busy="true" />;
  const [story, loaded, models] = data;
  const record = saved === undefined ? loaded : saved;

  const make = async () => {
    setConfirmRemake(false);
    setMakeError('');
    const started = performance.now();
    try {
      // the AI reads the whole story, which takes a while: the steps move on meanwhile, the last one waits for it
      let finished = false;
      const job = generateStoryboard(projectId, storyId, { model: story.settings?.model || models[0]?.id || null }).finally(() => {
        finished = true;
      });
      for (let i = 0; i < STEPS.length; i += 1) {
        setMaking({ step: i, pct: Math.round((i / STEPS.length) * 90) });
        // eslint-disable-next-line no-await-in-loop
        if (!finished) await Promise.race([wait(Math.max(MIN_MAKE / STEPS.length, isLive ? 6000 : 0)), job.catch(() => {})]);
      }
      const result = await job;
      setMaking({ step: STEPS.length, pct: 100 });
      await wait(Math.max(350, MIN_MAKE + 400 - (performance.now() - started)));
      setSaved(result);
      setTab('overview');
      setScene(0);
      onSaved();
      toast(loaded || saved ? 'Storyboard made again' : 'Storyboard ready');
    } catch (err) {
      setMakeError(err.message || 'The storyboard could not be made. Please try again.');
    } finally {
      setMaking(null);
    }
  };

  const imported = (result) => {
    setSaved(result);
    setImporting(false);
    setTab('overview');
    setScene(0);
    onSaved();
    toast('Storyboard imported');
  };

  const exportJson = async () => {
    try {
      download(await exportStoryboard(projectId, storyId), fileNameFor(record.board.story_metadata.title || story.title));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const importModal = <ImportDialog open={importing} onClose={() => setImporting(false)} projectId={projectId} storyId={storyId} replacing={Boolean(record)} onDone={imported} />;

  if (making) {
    return (
      <section className={s.making} aria-live="polite">
        <CinemorOrb size="lg" busy />
        <h2 className={s.makingTitle}>Making your storyboard</h2>
        <ol className={s.makingSteps}>
          {STEPS.map((label, i) => (
            <li key={label} className={cx(s.makingStep, i < making.step && s.makingDone, i === making.step && s.makingNow)}>
              <span className={s.makingMark} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>
        <div className={s.makingBar} role="progressbar" aria-label="Making your storyboard" aria-valuemin={0} aria-valuemax={100} aria-valuenow={making.pct}>
          <span style={{ width: `${making.pct}%` }} />
        </div>
      </section>
    );
  }

  if (!record) {
    return (
      <section className={s.start} aria-labelledby="sb-start">
        <span className={s.startIcon} aria-hidden="true">
          <IconStoryboardSpark width={26} height={26} />
        </span>
        <h2 id="sb-start" className={s.startTitle}>
          Turn “{story.title}” into a storyboard
        </h2>
        <p className={s.startText}>Cinemor reads the story and lays out its characters, every scene with its dialogue, the places and the important objects.</p>
        {makeError && <p className={s.error}>{makeError}</p>}
        <div className={s.startActions}>
          <Button icon={IconStoryboardSpark} onClick={make}>
            Create storyboard
          </Button>
          <Button variant="secondary" icon={IconUpload} onClick={() => setImporting(true)}>
            Import JSON
          </Button>
        </div>
        {importModal}
      </section>
    );
  }

  const { board } = record;
  const counts = countsOf(board);
  const outdated = record.outdated ?? story.versions.length > record.storyVersion;
  const meta = board.story_metadata;
  const goTo = (nextTab, sceneNo) => {
    setTab(nextTab);
    if (sceneNo) setScene(Math.min(board.scenes.length - 1, Math.max(0, sceneNo - 1)));
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <>
      <section className={s.boardHead} aria-label="Storyboard">
        <div className={s.boardTitleRow}>
          <div className={s.boardTitles}>
            <h2 className={s.boardTitle}>{meta.title || story.title}</h2>
            <p className={s.boardMeta}>
              {[...meta.genre, ...meta.style].slice(0, 6).map((g) => (
                <span key={g} className={s.tag}>
                  {nice(g)}
                </span>
              ))}
              <span className={s.boardSource}>
                {record.source === 'import' ? `Imported${record.fileName ? ` from ${record.fileName}` : ''}` : 'Made by Cinemor'}, {timeAgo(record.updatedAt)}
              </span>
            </p>
          </div>
          <div className={s.boardActions}>
            <Button variant="secondary" icon={IconRefresh} onClick={() => setConfirmRemake(true)}>
              Regenerate
            </Button>
            <Button variant="secondary" icon={IconExport} onClick={exportJson}>
              Export JSON
            </Button>
            <Button variant="secondary" icon={IconUpload} onClick={() => setImporting(true)}>
              Import JSON
            </Button>
            <Button variant="danger" icon={IconTrash} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        </div>

        {outdated && (
          <div className={s.outdated} role="status">
            <span>The story has changed since this storyboard was made.</span>
            <button type="button" className={s.linkButton} onClick={() => setConfirmRemake(true)}>
              Update storyboard
            </button>
          </div>
        )}
        {makeError && <p className={s.error}>{makeError}</p>}

        <ul className={s.stats} aria-label="In this storyboard">
          {[
            ['characters', 'Characters', counts.characters, IconUsers],
            ['scenes', 'Scenes', counts.scenes, IconStoryboardSpark],
            ['scenes', 'Dialogue lines', counts.dialogue, IconQuote],
            ['locations', 'Locations', counts.locations, IconPin],
            ['objects', 'Objects', counts.objects, IconCube],
            ['characters', 'Relationships', counts.relationships, IconLink],
          ].map(([to, label, n, Icon]) => (
            <li key={label}>
              <button type="button" className={s.stat} onClick={() => goTo(to)}>
                <Icon width={16} height={16} className={s.statIcon} aria-hidden="true" />
                <span className={s.statNumber}>{n}</span>
                <span className={s.statLabel}>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div ref={tabsRef} className={s.tabs} role="tablist" aria-label="Storyboard parts">
        {[
          ['overview', 'Overview'],
          ['characters', 'Characters'],
          ['scenes', 'Scenes & dialogue'],
          ['locations', 'Locations'],
          ['objects', 'Objects'],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`sb-tab-${id}`} aria-selected={tab === id} aria-controls="sb-panel" className={cx(s.tab, tab === id && s.tabOn)} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <section id="sb-panel" role="tabpanel" aria-labelledby={`sb-tab-${tab}`} className={s.panel}>
        {tab === 'overview' && <Overview board={board} />}
        {tab === 'characters' && <Characters board={board} onScene={(n) => goTo('scenes', n)} />}
        {tab === 'scenes' && (
          <Scenes
            board={board}
            index={scene}
            onIndex={setScene}
            onEditLine={async (sceneAt, lineAt, text) => {
              setSaved(await updateStoryboardDialogue(projectId, storyId, sceneAt, lineAt, text));
              toast('Line saved');
            }}
            onEditScene={async (sceneAt, fields) => {
              setSaved(await updateStoryboardScene(projectId, storyId, sceneAt, fields));
              toast('Scene saved. New sketches and clips follow it.');
            }}
          />
        )}
        {tab === 'locations' && <Locations board={board} onScene={(n) => goTo('scenes', n)} />}
        {tab === 'objects' && <Objects board={board} onScene={(n) => goTo('scenes', n)} />}
      </section>

      <Modal open={confirmRemake} onClose={() => setConfirmRemake(false)} title="Make the storyboard again?" icon={IconRefresh}>
        <div className={s.dialogBody}>
          <p className={s.dialogText}>Cinemor reads the story again and makes a new storyboard. It replaces the current one{record.source === 'import' ? ', including the one you imported' : ''}. Export it first if you want to keep a copy.</p>
          <div className={s.dialogActions}>
            <Button variant="secondary" onClick={() => setConfirmRemake(false)}>
              Cancel
            </Button>
            <Button icon={IconRefresh} onClick={make}>
              Regenerate
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={confirmDelete}
        title="Delete this storyboard?"
        text="The storyboard is deleted for good, with everything made from it: the characters' and locations' profiles and images, every scene's sketches, the clips and the film. The story itself stays, and a new storyboard can be made from it. Export it first if you want to keep a copy."
        confirmLabel="Delete Storyboard"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteStoryboard(projectId, storyId);
          setSaved(null);
          setTab('overview');
          setScene(0);
          onSaved();
          toast('Storyboard deleted');
        }}
      />
      {importModal}
    </>
  );
}

function IconStoryboardSpark(props) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <rect x="3" y="4" width="8" height="6" rx="1.5" />
      <rect x="13" y="4" width="8" height="6" rx="1.5" />
      <rect x="3" y="14" width="8" height="6" rx="1.5" />
      <path d="M13 17h8M13 20h5" />
    </svg>
  );
}

/* ====================================================================================== tabs */
function Rows({ rows }) {
  const shown = rows.filter(([, v]) => has(v) || (v && typeof v === 'object' && !Array.isArray(v)));
  if (!shown.length) return null;
  return (
    <dl className={s.rows}>
      {shown.map(([label, value]) => (
        <div key={label} className={s.row}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Overview({ board }) {
  const meta = board.story_metadata;
  return (
    <div className={s.overview}>
      <div className={s.overviewMain}>
        {has(board.logline) && (
          <figure className={s.logline}>
            <figcaption className={s.blockLabel}>Logline</figcaption>
            <blockquote>{board.logline}</blockquote>
          </figure>
        )}
        {has(board.synopsis) && (
          <div className={s.block}>
            <h3 className={s.blockLabel}>Synopsis</h3>
            <p className={s.prose}>{board.synopsis}</p>
          </div>
        )}
        {board.themes.length > 0 && (
          <div className={s.block}>
            <h3 className={s.blockLabel}>Themes</h3>
            <ul className={s.chips}>
              {board.themes.map((t) => (
                <li key={t} className={s.chip}>
                  {nice(t)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <aside className={s.details} aria-labelledby="sb-details">
        <h3 id="sb-details" className={s.detailsTitle}>
          Story details
        </h3>
        <Rows
          rows={[
            ['Title', meta.title],
            ['Language', nice(meta.language)],
            ['Genre', meta.genre.map(nice).join(', ')],
            ['Style', meta.style.map(nice).join(', ')],
            ['Narrator', nice(meta.narrator)],
            ['Point of view', nice(meta.point_of_view)],
            ['Narrator details', meta.narrator_details],
          ]}
        />
      </aside>
    </div>
  );
}

const HUES = [262, 214, 320, 172, 28, 196, 292, 140];
const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
function Avatar({ character, size = 'md' }) {
  const hue = HUES[((character?.character_id || 1) - 1) % HUES.length];
  return (
    <span className={cx(s.avatar, size === 'sm' && s.avatarSm)} style={{ '--hue': hue }} aria-hidden="true">
      {initials(character?.name || '?')}
    </span>
  );
}

function SceneLinks({ numbers, onScene }) {
  if (!numbers.length) return null;
  return (
    <span className={s.sceneLinks}>
      {numbers.map((n, i) => (
        <span key={n}>
          <button type="button" className={s.linkButton} onClick={() => onScene(n)}>
            Scene {n}
          </button>
          {i < numbers.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  );
}

const ROLE_TONE = { protagonist: 'toneHero', antagonist: 'toneVillain', supporting: 'toneSupport' };

function Characters({ board, onScene }) {
  if (!board.characters.length) return <p className={s.none}>No characters in this storyboard.</p>;
  return (
    <>
      <ul className={s.cardGrid} aria-label="Characters">
        {board.characters.map((c) => {
          const look = c.appearance;
          const scenes = scenesWith(board, c);
          return (
            <li key={c.character_id} className={s.card}>
              <div className={s.cardHead}>
                <Avatar character={c} />
                <div className={s.cardTitles}>
                  <h3 className={s.cardTitle}>{c.name}</h3>
                  <p className={s.cardSub}>
                    {has(c.role) && <span className={cx(s.role, s[ROLE_TONE[c.role.toLowerCase()]] || s.toneOther)}>{nice(c.role)}</span>}
                    {has(c.importance) && <span className={s.cardSubText}>{nice(c.importance)} character</span>}
                  </p>
                </div>
              </div>
              {has(c.description) && <p className={s.cardText}>{c.description}</p>}
              <Rows
                rows={[
                  ['Gender', nice(c.gender)],
                  ['Age', nice(c.age_group)],
                  ['Also called', c.aliases.join(', ')],
                  ['Real identity', c.revealed_identity],
                  ['In scenes', scenes.length ? <SceneLinks numbers={scenes} onScene={onScene} /> : c.first_appearance ? <SceneLinks numbers={[c.first_appearance]} onScene={onScene} /> : ''],
                ]}
              />
              {(has(look.physical_traits) || has(look.clothing) || has(look.special_features)) && (
                <div className={s.subBlock}>
                  <h4 className={s.subLabel}>Appearance</h4>
                  <Rows
                    rows={[
                      ['Looks', look.physical_traits],
                      ['Clothing', look.clothing],
                      ['Stands out', look.special_features],
                    ]}
                  />
                </div>
              )}
              {c.dominant_emotions.length > 0 && (
                <div className={s.subBlock}>
                  <h4 className={s.subLabel}>Feelings</h4>
                  <ul className={s.chips}>
                    {c.dominant_emotions.map((e) => (
                      <li key={e} className={s.chip}>
                        {nice(e)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <section className={s.relations} aria-labelledby="sb-rel">
        <h3 id="sb-rel" className={s.relationsTitle}>
          <IconLink width={17} height={17} aria-hidden="true" /> Relationships
        </h3>
        {board.relationships.length === 0 ? (
          <p className={s.none}>No relationships noted.</p>
        ) : (
          <ul className={s.relationList}>
            {board.relationships.map((r, i) => {
              const a = findCharacter(board, r.source);
              const b = findCharacter(board, r.target);
              return (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i} className={s.relation}>
                  <span className={s.relationPair}>
                    <span className={s.person}>
                      <Avatar character={a} size="sm" />
                      {a?.name || String(r.source)}
                    </span>
                    <span className={s.relationKind}>{nice(r.relationship) || 'Related'}</span>
                    <span className={s.person}>
                      <Avatar character={b} size="sm" />
                      {b?.name || String(r.target)}
                    </span>
                  </span>
                  {has(r.description) && <span className={s.relationText}>{r.description}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// the scene details a person may change (they feed the sketches and the clips)
const SCENE_BLOCKS = [
  { key: 'primary_action', label: 'What happens', max: 4000, required: true },
  { key: 'visual_description', label: 'What we see', max: 4000, required: true },
  { key: 'camera_suggestion', label: 'Camera', max: 2000, required: false },
];

function Scenes({ board, index, onIndex, onEditLine, onEditScene }) {
  const listRef = useRef(null);
  const sc = board.scenes[index] || board.scenes[0];
  const i = board.scenes.indexOf(sc);
  const [editing, setEditing] = useState(null); // the line being edited (its position in the list)
  const [editingBlock, setEditingBlock] = useState(null); // 'primary_action' | 'visual_description' | 'camera_suggestion'
  useEffect(() => {
    setEditing(null);
    setEditingBlock(null);
  }, [i]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [i]);

  return (
    <div className={s.scenes}>
      <ol ref={listRef} className={s.sceneList} aria-label="Scenes">
        {board.scenes.map((x, n) => (
          <li key={`${x.scene_id}-${n}`}>
            <button type="button" className={cx(s.sceneItem, n === i && s.sceneItemOn)} aria-current={n === i ? 'true' : undefined} onClick={() => onIndex(n)}>
              <span className={s.sceneBadge} aria-hidden="true">
                {n + 1}
              </span>
              <span className={s.sceneItemText}>
                <span className={s.srOnly}>Scene {n + 1}: </span>
                <span className={s.sceneName}>{x.title}</span>
                {has(x.location) && <span className={s.scenePlace}>{x.location}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <article className={s.sceneDetail} aria-labelledby="sb-scene-title">
        <p className={s.sceneKicker}>
          <span>
            Scene {i + 1} of {board.scenes.length}
          </span>
          {sc.importance.toLowerCase() === 'major' && <span className={s.keyTag}>Key scene</span>}
        </p>

        <h3 id="sb-scene-title" className={s.sceneTitle}>
          {sc.title}
        </h3>
        {has(sc.summary) && <p className={s.sceneSummary}>{sc.summary}</p>}

        <ul className={s.facts} aria-label="About this scene">
          {has(sc.location) && (
            <li className={s.fact}>
              <IconPin width={15} height={15} aria-hidden="true" /> {sc.location}
            </li>
          )}
          {has(sc.emotion) && <li className={s.fact}>Mood: {nice(sc.emotion)}</li>}
          {has(sc.transition) && <li className={s.fact}>Ends with: {nice(sc.transition)}</li>}
        </ul>

        {sc.characters_present.length > 0 && (
          <div className={s.present}>
            <h4 className={s.subLabel}>In this scene</h4>
            <ul className={s.presentList}>
              {sc.characters_present.map((name) => (
                <li key={name} className={s.person}>
                  <Avatar character={findCharacter(board, name) || { name, character_id: 1 }} size="sm" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={s.sceneBlocks}>
          {SCENE_BLOCKS.filter((b) => onEditScene || has(sc[b.key])).map((b) => (
            <div key={b.key} className={cx(s.sceneBlock, editingBlock === b.key && s.sceneBlockEditing)}>
              <div className={s.blockHead}>
                <h4 className={s.subLabel}>{b.label}</h4>
                {onEditScene && editingBlock !== b.key && (
                  <button type="button" className={s.lineEdit} onClick={() => setEditingBlock(b.key)} aria-label={`Edit ${b.label}`} title={`Edit ${b.label}`}>
                    <IconPencil width={15} height={15} />
                  </button>
                )}
              </div>
              {editingBlock === b.key ? (
                <LineEditor
                  line={sc[b.key] || ''}
                  speaker={b.label}
                  label={b.label}
                  saveLabel="Save"
                  max={b.max}
                  required={b.required}
                  onCancel={() => setEditingBlock(null)}
                  onSave={async (text) => {
                    await onEditScene(sc.at ?? i, { [b.key]: text });
                    setEditingBlock(null);
                  }}
                />
              ) : has(sc[b.key]) ? (
                <p className={s.prose}>{sc[b.key]}</p>
              ) : (
                <p className={s.none}>Not set. Add it to guide the sketch and the clip.</p>
              )}
            </div>
          ))}
        </div>

        <div className={s.dialogue}>
          <h4 className={s.subLabel}>
            Dialogue <span className={s.count}>{sc.dialogues.length}</span>
          </h4>
          {sc.dialogues.length === 0 ? (
            <p className={s.none}>No dialogue in this scene.</p>
          ) : (
            <ol className={s.lines}>
              {sc.dialogues.map((d, n) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={n} className={s.line}>
                  <span className={s.speaker}>
                    {d.speaker || 'Unknown'}
                    {has(d.emotion) && <span className={s.lineMood}>{nice(d.emotion)}</span>}
                  </span>
                  {editing === n ? (
                    <LineEditor
                      line={d.line}
                      speaker={d.speaker}
                      onCancel={() => setEditing(null)}
                      onSave={async (text) => {
                        await onEditLine(sc.at ?? i, d.at ?? n, text);
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <span className={s.lineRow}>
                      <span className={s.lineText}>{d.line}</span>
                      {onEditLine && (
                        <button type="button" className={s.lineEdit} onClick={() => setEditing(n)} aria-label={`Edit ${d.speaker || 'this'}'s line`} title="Edit line">
                          <IconPencil width={15} height={15} />
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={s.sceneNav}>
          <Button variant="secondary" onClick={() => onIndex(i - 1)} disabled={i === 0}>
            Previous scene
          </Button>
          <Button variant="secondary" onClick={() => onIndex(i + 1)} disabled={i === board.scenes.length - 1}>
            Next scene
          </Button>
        </div>
      </article>
    </div>
  );
}

/**
 * A dialogue line (or a scene detail) being changed: the text, Save and Cancel (Esc cancels, Ctrl/Cmd + Enter saves).
 */
function LineEditor({ line, speaker, onSave, onCancel, label, saveLabel = 'Save line', max = 2000, required = true }) {
  const [text, setText] = useState(line);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const value = text.trim();
    if (!value && required) return setError(label ? `${label} cannot be empty.` : 'The line cannot be empty.');
    if (value === line.trim()) return onCancel();
    setBusy(true);
    setError('');
    try {
      await onSave(value);
    } catch (err) {
      setError(err.message || 'The line could not be saved. Please try again.');
      setBusy(false);
    }
    return undefined;
  };
  return (
    <span className={s.lineEditor}>
      <textarea
        className={s.lineInput}
        value={text}
        rows={Math.min(8, Math.max(2, Math.ceil(text.length / 70)))}
        maxLength={max}
        aria-label={label || `${speaker || 'The'}'s line`}
        disabled={busy}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      {error && (
        <span className={s.lineError} role="alert">
          {error}
        </span>
      )}
      <span className={s.lineActions}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} loading={busy}>
          {saveLabel}
        </Button>
      </span>
    </span>
  );
}

function Locations({ board, onScene }) {
  if (!board.locations.length) return <p className={s.none}>No locations in this storyboard.</p>;
  return (
    <ul className={s.cardGrid} aria-label="Locations">
      {board.locations.map((l) => {
        const scenes = scenesAt(board, l);
        return (
          <li key={l.location_id} className={s.card}>
            <div className={s.placeBody}>
              <div className={s.placeHead}>
                <span className={s.objectIcon} aria-hidden="true">
                  <IconPin width={18} height={18} />
                </span>
                <h3 className={s.cardTitle}>{l.name}</h3>
                {has(l.type) && <span className={s.tag}>{/interior/i.test(l.type) ? 'Indoors' : /exterior/i.test(l.type) ? 'Outdoors' : nice(l.type)}</span>}
              </div>
              {has(l.description) && <p className={s.cardText}>{l.description}</p>}
              <Rows
                rows={[
                  ['Also called', l.aliases.join(', ')],
                  ['In scenes', scenes.length ? <SceneLinks numbers={scenes} onScene={onScene} /> : l.first_appearance ? <SceneLinks numbers={[l.first_appearance]} onScene={onScene} /> : ''],
                ]}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Objects({ board, onScene }) {
  if (!board.objects.length) return <p className={s.none}>No objects in this storyboard.</p>;
  return (
    <ul className={cx(s.cardGrid, s.objectGrid)} aria-label="Objects">
      {board.objects.map((o) => (
        <li key={o.object_id} className={s.card}>
          <div className={s.cardHead}>
            <span className={s.objectIcon} aria-hidden="true">
              <IconCube width={18} height={18} />
            </span>
            <h3 className={s.cardTitle}>{o.name}</h3>
          </div>
          {has(o.description) && <p className={s.cardText}>{o.description}</p>}
          {o.first_appearance && (
            <p className={s.cardFoot}>
              First seen in <SceneLinks numbers={[o.first_appearance]} onScene={onScene} />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ====================================================================================== import */
const MAX_IMPORT = 1.5 * 1024 * 1024;

function ImportDialog({ open, onClose, projectId, storyId, replacing, onDone }) {
  const [file, setFile] = useState(null); // { name, board }
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setProblem('');
      setSaving(false);
    }
  }, [open]);

  const pick = async (f) => {
    setProblem('');
    setFile(null);
    if (!f) return;
    if (!/\.json$/i.test(f.name) && f.type !== 'application/json') return setProblem('Choose a .json file.');
    if (f.size > MAX_IMPORT) return setProblem('This file is larger than 1.5 MB.');
    let data;
    try {
      data = JSON.parse(await f.text());
    } catch {
      return setProblem('This file is not valid JSON. Check it in a text editor, or start from the template.');
    }
    // the backend reads its own format (the template); the counts are only a preview of what the file holds
    if (isLive) {
      if (!data || typeof data !== 'object' || !Array.isArray(data.scenes) || !data.scenes.length) return setProblem('The storyboard has no scenes. Start from the template.');
      return setFile({ name: f.name, board: fromBackendBoard(data), raw: f });
    }
    const { board, error } = readStoryboard(data);
    if (error) return setProblem(error);
    return setFile({ name: f.name, board, raw: f });
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      onDone(await importStoryboard(projectId, storyId, file.raw));
    } catch (err) {
      setProblem(err.message);
      setSaving(false);
    }
  };

  const counts = file ? countsOf(file.board) : null;
  return (
    <Modal open={open} onClose={onClose} title="Import storyboard" subtitle="From a JSON file" icon={IconUpload}>
      <div className={s.dialogBody}>
        <label
          className={cx(s.drop, drag && s.dropOn)}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <input ref={input} type="file" accept=".json,application/json" className={s.fileInput} data-testid="storyboard-file" onChange={(e) => pick(e.target.files?.[0])} />
          <IconDocument width={22} height={22} aria-hidden="true" />
          <span className={s.dropTitle}>{file ? file.name : 'Choose a JSON file'}</span>
          <span className={s.dropText}>{file ? `${sceneCount(counts.scenes)}, ${counts.characters} characters, ${counts.locations} locations` : 'or drop it here'}</span>
        </label>
        {problem && (
          <p className={s.error} role="alert">
            {problem}
          </p>
        )}
        <p className={s.dialogText}>
          Need the format?{' '}
          <button type="button" className={s.linkButton} onClick={() => storyboardTemplate().then((blob) => download(blob, 'cinemor-storyboard-template.json'), (err) => setProblem(err.message))}>
            Download the template
          </button>
          {replacing ? '. Importing replaces the current storyboard.' : '.'}
        </p>
        <div className={s.dialogActions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={IconUpload} onClick={save} disabled={!file} loading={saving}>
            Import
          </Button>
        </div>
      </div>
    </Modal>
  );
}