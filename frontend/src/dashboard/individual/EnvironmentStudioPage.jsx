import { useEffect, useId, useRef, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link, useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconBook, IconBuilding, IconCheck, IconImage, IconSparkles, IconSun, IconTrash } from '../ui/DashIcons.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Notice from '../ui/Notice.jsx';
import { useToast } from '../ui/Toast.jsx';
import { listModels } from '../../services/storyApi.js';
import { IMAGE_MODELS, LIMITS } from './characterStudio.js';
import { DEFAULT_STYLE_NOTES, LIVE_PLACE, LOCATION_FIELDS, LOCATION_STYLES } from './environmentStudio.js';
import { download } from './filmExport.js';
import {
  deleteLocationImage,
  downloadLocationImage,
  generateLocationImage,
  generateLocationProfile,
  getLocationRecords,
  getProject,
  getStoryboard,
  isLive,
  listLocations,
  listProjectStories,
  listStoryboards,
  saveLocationRecord,
  setLocationMainImage,
  uploadLocationImage,
} from './individualApi.js';
import ParticleForge from './ParticleForge.jsx';
import { IconArrowLeft } from './parts.jsx';
import { IconExport, IconPin, IconUpload } from './StoryIcons.jsx';
import s from './CharacterStudio.module.css';
import sk from './SketchStudio.module.css';

/**
 * Environment Studio (a Creative Module, "Layer by layer"): every place where the story happens gets a profile
 * (visual style, notes, and the details that keep it looking the same) and a master image, made one place at a time.
 * It works like Character Studio, and uses its layout and styles (CharacterStudio.module.css) with the wide 16:9
 * frame of Sketch Studio (SketchStudio.module.css).
 *
 *   /dashboard/projects/:id/environment                  picks a story
 *   /dashboard/projects/:id/environment/:storyId         that story's places
 *   /dashboard/projects/:id/environment/:storyId/:key    one place
 *
 * The places come from the story's storyboard (its locations; the backend sends the same list). Profiles and
 * images are a demo for now (environmentStudio.js); the backend will make them with AI later.
 */
const base = (projectId) => `/dashboard/projects/${projectId}/environment`;

async function load(projectId) {
  const [project, stories, boards] = await Promise.all([getProject(projectId), listProjectStories(projectId), listStoryboards(projectId)]);
  return { project, stories, boards };
}

export default function EnvironmentStudioPage({ projectId, storyId = null, locationKey: characterKey = null }) {
  const { navigate } = useRouter();
  const { data, error, reload } = useResource(() => load(projectId), [projectId]);
  useDocumentTitle(data ? `Environment: ${data.project.title}` : 'Environment');
  const back = `/dashboard/projects/${projectId}`;

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

  const head = (
    <div className={s.pageHead}>
      {characterKey ? (
        <Link to={`${base(projectId)}/${chosen}`} className={s.back}>
          <IconArrowLeft width={16} height={16} /> All locations
        </Link>
      ) : (
        <Link to={back} className={s.back}>
          <IconArrowLeft width={16} height={16} /> Back to Project
        </Link>
      )}
      {!characterKey && (
        <div className={s.titleRow}>
          <h1 className={s.pageTitle}>Environment Studio</h1>
          <p className={s.pageSub}>{data.project.title}</p>
        </div>
      )}
    </div>
  );

  if (data.stories.length === 0) {
    return (
      <div className={s.page}>
        {head}
        <section className={s.empty}>
          <span className={s.emptyIcon} aria-hidden="true">
            <IconBook width={22} height={22} />
          </span>
          <h2 className={s.emptyTitle}>Write a story first</h2>
          <p className={s.emptyText}>Places come from a story. Create one with AI or import yours, then come back here.</p>
          <Button onClick={() => navigate(`/dashboard/projects/${projectId}/story`)}>Open Story</Button>
        </section>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {head}
      {chosen && (
        <Studio
          key={chosen}
          projectId={projectId}
          stories={data.stories}
          boards={data.boards}
          storyId={chosen}
          characterKey={characterKey}
          onPickStory={(id) => navigate(`${base(projectId)}/${id}`)}
          onOpen={(key) => navigate(`${base(projectId)}/${chosen}/${key}`)}
        />
      )}
    </div>
  );
}

/* ====================================================================================== one story */
function Studio({ projectId, stories, boards, storyId, characterKey, onPickStory, onOpen }) {
  const { navigate } = useRouter();
  const { data, error, reload } = useResource(() => Promise.all([listLocations(projectId, storyId), getStoryboard(projectId, storyId), getLocationRecords(projectId, storyId), listModels()]), [projectId, storyId]);
  const [records, setRecords] = useState(null);
  const characters = data?.[0] || [];
  const board = data?.[1];
  const textModel = data?.[3]?.[0]?.id || null;
  const saved = records || data?.[2] || {};

  if (!data) return error ? <Notice message={error.message} onRetry={reload} /> : <div className={s.loading} aria-busy="true" />;
  const onSaved = (record) => setRecords((r) => ({ ...(r || data[2]), [record.key]: record }));

  if (characterKey) {
    const index = characters.findIndex((c) => c.key === characterKey);
    if (index < 0) {
      return (
        <section className={s.empty}>
          <h2 className={s.emptyTitle}>This place is not in the story</h2>
          <p className={s.emptyText}>The story or its storyboard may have changed.</p>
          <Button onClick={() => navigate(`${base(projectId)}/${storyId}`)}>See all locations</Button>
        </section>
      );
    }
    return (
      <CharacterDetail
        key={characterKey}
        projectId={projectId}
        storyId={storyId}
        character={characters[index]}
        record={saved[characterKey]}
        cast={characters}
        records={saved}
        position={`${index + 1} of ${characters.length}`}
        textModel={textModel}
        onOpen={onOpen}
        onSaved={onSaved}
      />
    );
  }

  const withProfile = characters.filter((c) => saved[c.key]?.profile).length;
  return (
    <>
      <StoryPicker stories={stories} boards={boards} chosen={storyId} onPick={onPickStory} />
      {!board && !isLive && (
        <div className={s.hint} role="note">
          <span>These places were picked out of the story’s scenes. Make a storyboard first for richer details.</span>
          <button type="button" className={s.linkButton} onClick={() => navigate(`/dashboard/projects/${projectId}/storyboard/${storyId}`)}>
            Open Storyboard
          </button>
        </div>
      )}
      <section className={s.castSection} aria-labelledby="cs-cast">
        <div className={s.sectionHead}>
          <h2 id="cs-cast" className={s.sectionTitle}>
            Locations <span className={s.count}>{characters.length}</span>
          </h2>
          {characters.length > 0 && (
            <p className={s.sectionSub}>
              {withProfile} of {characters.length} with a profile
            </p>
          )}
        </div>
        {characters.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyIcon} aria-hidden="true">
              <IconPin width={22} height={22} />
            </span>
            <h3 className={s.emptyTitle}>No places found</h3>
            <p className={s.emptyText}>Make a storyboard for this story; its places appear here.</p>
            <Button onClick={() => navigate(`/dashboard/projects/${projectId}/storyboard/${storyId}`)}>Open Storyboard</Button>
          </div>
        ) : (
          <ul className={sk.sceneGrid} aria-label="Locations">
            {characters.map((c, n) => {
              const record = saved[c.key];
              const image = activeImage(record);
              return (
                <li key={c.key}>
                  <button type="button" className={sk.sceneCard} onClick={() => onOpen(c.key)} aria-label={`Open ${c.name}`}>
                    <span className={sk.sceneThumb}>
                      {image ? (
                        <img src={image.src} alt="" />
                      ) : (
                        <span className={sk.thumbEmpty}>
                          <IconPin width={22} height={22} aria-hidden="true" />
                        </span>
                      )}
                      <span className={sk.sceneNoTag}>Location {n + 1}</span>
                    </span>
                    <span className={sk.sceneBody}>
                      <span className={sk.sceneName}>{c.name}</span>
                      {c.description && <span className={sk.sceneText}>{c.description}</span>}
                      <span className={sk.sceneFoot}>
                        <span className={s.castState}>
                          <span className={cx(s.stateDot, record?.profile ? s.stateReady : s.stateNone)} aria-hidden="true" />
                          {record?.profile ? 'Profile ready' : 'No profile yet'}
                        </span>
                        <span className={sk.placeChip}>
                          {typeLabel(c)}
                          {c.scenes.length > 0 && `, ${sceneList(c.scenes)}`}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

const typeLabel = (place) => (/interior/i.test(place.type) ? 'Indoors' : /exterior/i.test(place.type) ? 'Outdoors' : 'Place');
const sceneList = (nos) => (nos.length === 1 ? `scene ${nos[0]}` : `scenes ${nos.slice(0, -1).join(', ')} and ${nos[nos.length - 1]}`);
const initials = (name) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const activeImage = (record) => {
  if (!record?.images) return null;
  const { master, uploaded, active } = record.images;
  return (active === 'uploaded' ? uploaded || master : master || uploaded) || null;
};

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
                <span className={s.storyMeta}>{board ? `${board.scenes} scenes in the storyboard` : 'No storyboard yet'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ====================================================================================== one place */
const IMAGE_STEPS = ['Reading the profile', 'Laying out the place', 'Adding light and colour', 'Final touches'];
const IMAGE_TIME = 7600;
const HINTS = ['The profile keeps this place looking the same in every scene.', 'Tip: add the time of day or the weather to change the image.', 'You can also upload your own image and make it the main one.'];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const fileName = (name, kind, type) => `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'location'} - ${kind}.${EXT[type] || 'jpg'}`;

// the place's details, in three groups
const GROUPS = [
  { title: 'Place', icon: IconImage, keys: ['environment', 'location_type', 'geography'] },
  { title: 'Structures', icon: IconBuilding, keys: ['architecture', 'layout', 'key_landmarks'] },
  { title: 'Light & mood', icon: IconSun, keys: ['lighting', 'time_of_day', 'weather', 'atmosphere', 'colour_palette'] },
];
// longer details get their own line
const WIDE = new Set(['environment', 'geography', 'architecture', 'layout', 'key_landmarks', 'lighting', 'atmosphere', 'colour_palette']);
const labelOf = (key) => LOCATION_FIELDS.find((f) => f.key === key)?.label || key;
// the backend's place profile has more details: grouped the same way
const ICONS = { Place: IconImage, Structures: IconBuilding, 'Light & mood': IconSun };
const groupsNow = isLive ? LIVE_PLACE.groups.map((g) => ({ ...g, icon: ICONS[g.title] })) : GROUPS;
const wideNow = isLive ? LIVE_PLACE.wide : WIDE;
const labelNow = isLive ? (key) => LIVE_PLACE.labels[key] || key : labelOf;

/**
 * One place, in three columns: the look (the place, visual style, notes, make the profile) on the left, the image
 * in the middle, the place's details on the right. On a narrow screen: image, look, details.
 */
function CharacterDetail({ projectId, storyId, character, record, cast, records, position, textModel, onOpen, onSaved }) {
  const toast = useToast();
  const uid = useId();
  const profile = record?.profile || null;
  const [style, setStyle] = useState(profile?.style || LOCATION_STYLES[0]);
  const [styleNotes, setStyleNotes] = useState(profile ? profile.style_notes : DEFAULT_STYLE_NOTES);
  const [custom, setCustom] = useState(profile?.customization || '');
  const [makingProfile, setMakingProfile] = useState(false);
  const [identity, setIdentity] = useState(profile?.identity || null);
  const [error, setError] = useState('');

  useEffect(() => {
    setIdentity(record?.profile?.identity || null);
  }, [record?.profile]);
  const dirty = !isLive && Boolean(identity && profile && LOCATION_FIELDS.some((f) => (identity[f.key] || '') !== (profile.identity[f.key] || '')));

  // (demo only: details changed by hand)
  const save = async (patch) => {
    const saved = await saveLocationRecord(projectId, storyId, character.key, { name: character.name, ...patch });
    onSaved(saved);
    return saved;
  };
  const makeProfileNow = async () => {
    const made = await generateLocationProfile(projectId, storyId, character.key, { style, styleNotes, customization: custom, model: textModel });
    onSaved(made);
    return made;
  };

  const buildProfile = async () => {
    setError('');
    setMakingProfile(true);
    try {
      await makeProfileNow();
      toast(profile ? 'Profile made again' : 'Profile ready');
    } catch (err) {
      setError(err.message);
    } finally {
      setMakingProfile(false);
    }
  };

  const saveIdentity = async () => {
    try {
      await save({ profile: { ...profile, identity } });
      toast('Changes saved');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className={s.detail}>
      {/* every place of the story, to jump between them */}
      <div className={s.castBar}>
        <h1 className={s.srOnly}>{character.name}</h1>
        <nav className={s.castStrip} aria-label="Locations">
          {cast.map((c) => {
            const img = activeImage(records[c.key]);
            const on = c.key === character.key;
            return (
              <button key={c.key} type="button" className={cx(s.castAvatar, on && s.castAvatarOn)} onClick={() => !on && onOpen(c.key)} aria-label={on ? `${c.name} (open)` : `Open ${c.name}`} aria-current={on ? 'page' : undefined} title={c.name}>
                {img ? <img src={img.src} alt="" /> : initials(c.name)}
              </button>
            );
          })}
        </nav>
        <p className={s.position}>Location {position}</p>
      </div>

      <div className={s.workbench}>
        {/* ---------------------------------------------------------------- left: the look */}
        <section className={cx(s.card, s.lookCard)} aria-labelledby={`${uid}-look`}>
          <div className={s.who}>
            <span className={s.whoInitials} aria-hidden="true">
              <IconPin width={20} height={20} />
            </span>
            <div className={s.whoText}>
              <p className={s.whoName}>{character.name}</p>
              <span className={cx(s.role, s.toneOther)}>{typeLabel(character)}</span>
            </div>
          </div>
          {character.description && <p className={s.whoDesc}>{character.description}</p>}
          {character.scenes.length > 0 && <p className={s.whoDesc}>Seen in {sceneList(character.scenes)}.</p>}
          <hr className={s.rule} />
          <div className={s.cardTop}>
            <h2 id={`${uid}-look`} className={s.cardTitle}>
              Look
            </h2>
            <span className={cx(s.pill, profile ? s.pillReady : s.pillNone)}>{profile ? 'Profile ready' : 'No profile yet'}</span>
          </div>
          <div className={s.field}>
            <label htmlFor={`${uid}-style`} className={s.label}>
              Visual style
            </label>
            <select id={`${uid}-style`} className={s.input} value={style} onChange={(e) => setStyle(e.target.value)} disabled={makingProfile}>
              {LOCATION_STYLES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className={s.field}>
            <label htmlFor={`${uid}-notes`} className={s.label}>
              Style instructions
            </label>
            <textarea
              id={`${uid}-notes`}
              className={cx(s.input, s.area)}
              rows={3}
              maxLength={LIMITS.notes}
              placeholder="e.g. soft lighting, painterly textures, warm colours"
              value={styleNotes}
              onChange={(e) => setStyleNotes(e.target.value)}
              disabled={makingProfile}
            />
          </div>
          <div className={s.field}>
            <label htmlFor={`${uid}-custom`} className={s.label}>
              Location requirements
            </label>
            <textarea
              id={`${uid}-custom`}
              className={cx(s.input, s.area)}
              rows={3}
              maxLength={LIMITS.notes}
              placeholder="Landmarks, layout, materials, time of day, anything that must stay the same"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              disabled={makingProfile}
            />
          </div>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          <Button icon={IconSparkles} onClick={buildProfile} loading={makingProfile} className={s.wideButton}>
            {makingProfile ? 'Making the profile…' : profile ? 'Regenerate profile' : 'Create profile'}
          </Button>
        </section>

        {/* ---------------------------------------------------------------- middle: the image */}
        <MasterImage
          projectId={projectId}
          storyId={storyId}
          character={character}
          record={record}
          profile={profile}
          ensureProfile={async () => {
            if (profile) return dirty ? { ...profile, identity } : profile;
            return (await makeProfileNow()).profile;
          }}
          onSaved={onSaved}
        />

        {/* ---------------------------------------------------------------- right: the identity */}
        <section className={cx(s.card, s.identityCard)} aria-labelledby={`${uid}-identity`} aria-busy={makingProfile || undefined}>
          <div>
            <h2 id={`${uid}-identity`} className={s.cardTitle}>
              Place details
            </h2>
            <p className={s.cardSub}>{isLive ? `Keeps ${character.name} the same in every image. To change a detail, describe it in Location requirements and regenerate the profile.` : `Keeps ${character.name} the same in every image. Click a value to change it.`}</p>
          </div>
          {!identity && !makingProfile ? (
            <p className={s.identityEmpty}>Make the profile (on the left) and these are filled in for you: the place, its buildings, the light and the mood.</p>
          ) : (
            <>
              {groupsNow.map((group) => (
                <fieldset key={group.title} className={cx(s.group, makingProfile && s.groupBusy)} disabled={makingProfile}>
                  <legend className={s.groupHead}>
                    <span className={s.groupIcon} aria-hidden="true">
                      <group.icon width={14} height={14} />
                    </span>
                    {group.title}
                  </legend>
                  {group.keys.map((key) => {
                    const value = makingProfile ? '' : identity?.[key] || '';
                    const dot = '';
                    return (
                      <div key={key} className={cx(s.idRow, wideNow.has(key) && s.idRowWide)}>
                        <label htmlFor={`${uid}-${key}`} className={s.idKey}>
                          {labelNow(key)}
                        </label>
                        <span className={s.idValue}>
                          {dot && <span className={s.swatch} style={{ background: dot }} aria-hidden="true" />}
                          {wideNow.has(key) ? (
                            // long details wrap onto as many lines as they need
                            <textarea id={`${uid}-${key}`} className={cx(s.idInput, s.idArea)} rows={1} value={value} maxLength={isLive ? undefined : LIMITS.field} placeholder="Not set" readOnly={isLive} onChange={(e) => setIdentity((cur) => ({ ...cur, [key]: e.target.value }))} />
                          ) : (
                            <input id={`${uid}-${key}`} className={s.idInput} style={{ width: `${Math.max(6, value.length + 2)}ch` }} value={value} maxLength={isLive ? undefined : LIMITS.field} placeholder="Not set" readOnly={isLive} onChange={(e) => setIdentity((cur) => ({ ...cur, [key]: e.target.value }))} />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </fieldset>
              ))}
              {dirty && (
                <div className={s.saveRow}>
                  <span>Changes not saved yet.</span>
                  <Button variant="secondary" onClick={() => setIdentity(profile.identity)}>
                    Undo
                  </Button>
                  <Button icon={IconCheck} onClick={saveIdentity}>
                    Save changes
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the image, in the middle */
function MasterImage({ projectId, storyId, character, record, profile, ensureProfile, onSaved }) {
  const toast = useToast();
  const uid = useId();
  const images = record?.images || { master: null, uploaded: null, active: 'master' };
  const [tab, setTab] = useState(images.active === 'uploaded' && images.uploaded ? 'uploaded' : 'master');
  const [model, setModel] = useState(images.master?.model || IMAGE_MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [run, setRun] = useState(null); // { step, started, done }
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false); // "delete this image?"
  const fileRef = useRef(null);
  const shown = tab === 'master' ? images.master : images.uploaded;
  const isMain = shown && (images.active === tab || !images[images.active]);

  const generate = async () => {
    setError('');
    setTab('master');
    const started = performance.now();
    setRun({ step: 0, started, done: false });
    try {
      const used = await ensureProfile();
      const job = generateLocationImage(projectId, storyId, character.key, { model, prompt, profile: used });
      job.catch(() => {});
      for (let i = 1; i < IMAGE_STEPS.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await wait(Math.max(0, started + (IMAGE_TIME * i) / IMAGE_STEPS.length - performance.now()));
        setRun((r) => ({ ...r, step: i }));
      }
      await wait(Math.max(0, started + IMAGE_TIME - performance.now()));
      const made = await job;
      setRun((r) => ({ ...r, done: true }));
      await wait(800);
      onSaved(made);
      setReveal((n) => n + 1);
      setPrompt('');
      toast('Master image ready');
    } catch (err) {
      setError(err.message || 'The image could not be made. Please try again.');
    } finally {
      setRun(null);
    }
  };

  const upload = async (file) => {
    setError('');
    if (!file) return;
    try {
      onSaved(await uploadLocationImage(projectId, storyId, character.key, file));
      setTab('uploaded');
      setReveal((n) => n + 1);
      toast('Image uploaded and set as the main image');
    } catch (err) {
      setTab('uploaded');
      setError(err.message);
    }
  };

  const busy = Boolean(run);
  const pct = useRunPercent(run);
  return (
    <section className={cx(s.card, s.imageCard)} aria-labelledby={`${uid}-image`}>
      <h2 id={`${uid}-image`} className={s.srOnly}>
        Master image
      </h2>
      <div className={s.tabs} role="tablist" aria-label="Image">
        {[
          ['master', 'Master image'],
          ['uploaded', 'Your image'],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={cx(s.tab, tab === id && s.tabOn)} onClick={() => setTab(id)} disabled={busy}>
            {label}
            {images[id] && (images.active === id || !images[images.active]) && <span className={s.mainDot} title="Main image" />}
          </button>
        ))}
      </div>

      <div className={cx(s.stageWrap, sk.stageWrap, busy && s.stageBusy)}>
        {busy && <span className={s.edgeGlow} aria-hidden="true" />}
        <div className={cx(s.stage, sk.stage)}>
          {shown && !busy ? (
            <img key={`${tab}-${reveal}`} className={cx(s.photo, sk.photo, reveal > 0 && s.photoReveal)} src={shown.src} alt={`${character.name}, ${tab === 'master' ? 'master image' : 'your image'}`} />
          ) : !busy ? (
            <div className={s.placeholder}>
              <span className={cx(s.placeholderMark, sk.placeholderMark)} aria-hidden="true">
                <IconImage width={26} height={26} />
              </span>
              <p>{tab === 'master' ? 'No master image yet' : 'No image uploaded yet'}</p>
            </div>
          ) : null}
          {busy && <ParticleForge shape="scene" started={run.started} duration={IMAGE_TIME} done={run.done} pct={pct} hint={HINTS[run.step % HINTS.length]} />}
          {isMain && !busy && <span className={s.mainTag}>Main image</span>}
          {!busy && (
            <div className={s.stageTools}>
              <button
                type="button"
                className={s.toolButton}
                onClick={() => downloadLocationImage(projectId, storyId, character.key, tab).then((blob) => download(blob, fileName(character.name, tab === 'master' ? 'master image' : 'your image', blob.type)), (err) => setError(err.message))}
                disabled={!shown}
                aria-label="Download image"
                title="Download image"
              >
                <IconExport width={16} height={16} />
              </button>
              <button type="button" className={s.toolButton} onClick={() => setAsking(true)} disabled={!shown} aria-label="Delete image" title="Delete image">
                <IconTrash width={16} height={16} />
              </button>
              <button type="button" className={s.toolButton} onClick={() => fileRef.current?.click()} aria-label={images.uploaded ? 'Replace your image' : 'Upload your image'} title={images.uploaded ? 'Replace your image' : 'Upload your image'}>
                <IconUpload width={16} height={16} />
              </button>
            </div>
          )}
        </div>
        {busy && <span className={cx(s.edgeLight, run.done && s.edgeDone)} aria-hidden="true" />}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className={s.fileInput} data-testid="location-upload" onChange={(e) => upload(e.target.files?.[0])} />

      {busy ? (
        <ImageProgress run={run} pct={pct} />
      ) : (
        <div className={s.imageMetaRow}>
          {shown && tab === 'master' && (
            <p className={s.imageMeta}>
              {shown.at ? `Made ${timeAgo(shown.at)} with ${IMAGE_MODELS.find((m) => m.id === shown.model)?.name || shown.model || 'Cinemor'}` : 'Master image'}
            </p>
          )}
          {shown && tab === 'uploaded' && <p className={s.imageMeta}>{shown.name || 'Your image'}</p>}
          {shown && !isMain && (
            <button
              type="button"
              className={s.linkButton}
              onClick={() =>
                setLocationMainImage(projectId, storyId, character.key, tab).then(
                  (rec) => {
                    onSaved(rec);
                    toast('Main image changed');
                  },
                  (err) => setError(err.message),
                )
              }
            >
              Use as main image
            </button>
          )}
        </div>
      )}
      <ConfirmModal
        open={asking}
        title={tab === 'master' ? 'Delete the master image?' : 'Delete your image?'}
        text={`The ${tab === 'master' ? 'generated master image' : 'image you uploaded'} of ${character.name} will be deleted for good.${isMain && images[tab === 'master' ? 'uploaded' : 'master'] ? ' The other image becomes the main one.' : ''} This cannot be undone.`}
        confirmLabel="Delete Image"
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          onSaved(await deleteLocationImage(projectId, storyId, character.key, tab));
          setReveal((n) => n + 1);
          toast('Image deleted');
        }}
      />
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      {tab === 'master' ? (
        <div className={s.genBar}>
          <select className={cx(s.input, s.genModel)} aria-label="Image model" value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            className={s.genPrompt}
            aria-label="Image customisation"
            maxLength={LIMITS.prompt}
            placeholder="Optional visual details…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) generate();
            }}
            disabled={busy}
          />
          <Button icon={IconSparkles} onClick={generate} disabled={busy}>
            {images.master ? 'Generate again' : 'Generate'}
          </Button>
        </div>
      ) : (
        <div className={s.uploadBar}>
          <Button variant={images.uploaded ? 'secondary' : 'primary'} icon={IconUpload} onClick={() => fileRef.current?.click()} disabled={busy}>
            {images.uploaded ? 'Replace your image' : 'Upload your image'}
          </Button>
          <p className={s.note}>PNG, JPG, WEBP or GIF. It becomes the main image for {character.name}.</p>
        </div>
      )}
      {tab === 'master' && !profile && <p className={s.demoNote}>No profile yet: one is made from the Look settings first.</p>}
    </section>
  );
}


/* ------------------------------------------------------------------ while an image is made */
/** How far along the run is (0..100): it eases towards the end and only shows 100 once the image is ready. */
function useRunPercent(run) {
  const [pct, setPct] = useState(0);
  const started = run?.started;
  const done = run?.done;
  useEffect(() => {
    if (!started) {
      setPct(0);
      return undefined;
    }
    let frame;
    const tick = () => {
      const t = (performance.now() - started) / IMAGE_TIME;
      setPct(done ? 100 : Math.min(97, Math.round(100 * (1 - (1 - Math.min(1, t)) ** 1.6))));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, done]);
  return pct;
}

function ImageProgress({ run, pct }) {
  const label = run.done ? 'The master image is ready' : `${IMAGE_STEPS[run.step]}…`;
  return (
    <div className={cx(s.progress, run.done && s.progressDone)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Making the master image">
      <span className={s.progressLabel}>{label}</span>
      <span className={s.progressPct}>{pct}%</span>
    </div>
  );
}
