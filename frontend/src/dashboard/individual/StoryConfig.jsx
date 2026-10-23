import { useEffect, useId, useState } from 'react';
import cx from '../../utils/cx.js';
import { IconCheck, IconChevronDown, IconPlus, IconTrash } from '../ui/DashIcons.jsx';
import { GENRES, LANGUAGES, LIMITS, POV_OPTIONS, STORY_FORMATS, STYLES, TONES, WORDS_MAX, WORDS_MIN } from './storyOptions.js';
import s from './StoryPage.module.css';

/**
 * "Creative Direction": everything that shapes the story, on the left of the Story page (the story idea itself is
 * typed in the chat). In order: Genre, Style, Tone; Word Count and Target Audience; Subject and Grade Level;
 * Educational Objective; Learning Points; Setting; Characters; Additional Details. Changes apply straight away.
 */
export default function CreativeDirection({ settings, onChange, disabled }) {
  const uid = useId();
  const toggle = (key, value) => onChange({ [key]: settings[key].includes(value) ? settings[key].filter((v) => v !== value) : [...settings[key], value] });
  const text = (key) => (event) => onChange({ [key]: event.target.value });

  return (
    <div className={s.direction}>
      <Choice id={`${uid}-language`} label="Language" options={LANGUAGES.map((l) => ({ value: l, label: l }))} value={settings.language} onChange={(v) => onChange({ language: v })} disabled={disabled} />
      <Choice id={`${uid}-pov`} label="Point of View (POV)" options={POV_OPTIONS} value={settings.pointOfView} onChange={(v) => onChange({ pointOfView: v })} disabled={disabled} />
      <Choice id={`${uid}-format`} label="Story Format" options={STORY_FORMATS} value={settings.storyFormat} onChange={(v) => onChange({ storyFormat: v })} disabled={disabled} />
      <CheckGroup label="Genre" options={GENRES} picked={settings.genre} onToggle={(v) => toggle('genre', v)} disabled={disabled} />
      <CheckGroup label="Style" options={STYLES} picked={settings.style} onToggle={(v) => toggle('style', v)} disabled={disabled} />
      <CheckGroup label="Tone" options={TONES} picked={settings.tone} onToggle={(v) => toggle('tone', v)} disabled={disabled} />

      <div className={s.twoCols}>
        <WordCount id={`${uid}-words`} value={settings.wordCount} onChange={(v) => onChange({ wordCount: v })} disabled={disabled} />
        <Field id={`${uid}-audience`} label="Target Audience">
          <input id={`${uid}-audience`} className={s.input} placeholder="e.g. Young Adults" value={settings.targetAudience} maxLength={200} disabled={disabled} onChange={text('targetAudience')} />
        </Field>
      </div>

      <div className={s.twoCols}>
        <Field id={`${uid}-subject`} label="Subject">
          <input id={`${uid}-subject`} className={s.input} placeholder="e.g. Marine Science" value={settings.subject} maxLength={200} disabled={disabled} onChange={text('subject')} />
        </Field>
        <Field id={`${uid}-grade`} label="Grade Level">
          <input id={`${uid}-grade`} className={s.input} placeholder="e.g. Grade 10" value={settings.gradeLevel} maxLength={100} disabled={disabled} onChange={text('gradeLevel')} />
        </Field>
      </div>

      <Field id={`${uid}-objective`} label="Educational Objective">
        <textarea
          id={`${uid}-objective`}
          className={cx(s.input, s.area)}
          rows={3}
          placeholder="What should the reader understand by the end?"
          value={settings.educationalObjective}
          maxLength={LIMITS.objective}
          disabled={disabled}
          onChange={text('educationalObjective')}
        />
      </Field>

      <LearningPoints id={`${uid}-points`} points={settings.learningPoints} onChange={(learningPoints) => onChange({ learningPoints })} disabled={disabled} />

      <Field id={`${uid}-setting`} label="Setting">
        <textarea
          id={`${uid}-setting`}
          className={cx(s.input, s.area)}
          rows={3}
          placeholder="Where and when the story takes place"
          value={settings.setting}
          maxLength={LIMITS.setting}
          disabled={disabled}
          onChange={text('setting')}
        />
      </Field>

      <Characters uid={uid} characters={settings.characters} onChange={(characters) => onChange({ characters })} disabled={disabled} />

      <Field id={`${uid}-extra`} label="Additional Details">
        <textarea
          id={`${uid}-extra`}
          className={cx(s.input, s.area)}
          rows={3}
          placeholder="Anything else: how it should end, what to avoid, the pace..."
          value={settings.additionalDetails}
          maxLength={LIMITS.additionalDetails}
          disabled={disabled}
          onChange={text('additionalDetails')}
        />
      </Field>
    </div>
  );
}

function Field({ id, label, children }) {
  return (
    <div className={s.formField}>
      <label htmlFor={id} className={s.formLabel}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** A dropdown ({ value, label } options). A saved value that is no longer in the list is still shown. */
function Choice({ id, label, options, value, onChange, disabled }) {
  const list = value && !options.some((o) => o.value === value) ? [{ value, label: value }, ...options] : options;
  return (
    <Field id={id} label={label}>
      <div className={s.selectWrap}>
        <select id={id} className={cx(s.input, s.select)} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {list.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IconChevronDown width={16} height={16} aria-hidden="true" />
      </div>
    </Field>
  );
}

/** A group of tick boxes, each one a small card (picked ones are highlighted). */
function CheckGroup({ label, options, picked, onToggle, disabled }) {
  return (
    <fieldset className={s.checkGroup} disabled={disabled}>
      <legend className={s.formLabel}>{label}</legend>
      <div className={s.checkGrid}>
        {options.map((option) => {
          const on = picked.includes(option);
          return (
            <label key={option} className={cx(s.checkCard, on && s.checkOn)}>
              <input type="checkbox" checked={on} onChange={() => onToggle(option)} />
              <span className={s.checkBox} aria-hidden="true">
                {on && <IconCheck width={11} height={11} strokeWidth={3.2} />}
              </span>
              <span className={s.checkText}>{option}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function WordCount({ id, value, onChange, disabled }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const number = Number(draft);
  const invalid = draft !== '' && (!Number.isInteger(number) || number < WORDS_MIN || number > WORDS_MAX);
  return (
    <Field id={id} label="Word Count">
      <input
        id={id}
        className={cx(s.input, invalid && s.inputBad)}
        type="number"
        inputMode="numeric"
        min={WORDS_MIN}
        max={WORDS_MAX}
        step={100}
        value={draft}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        title={`${WORDS_MIN} to ${WORDS_MAX.toLocaleString('en-IN')} words`}
        onChange={(event) => {
          setDraft(event.target.value);
          const n = Number(event.target.value);
          if (Number.isInteger(n) && n >= WORDS_MIN && n <= WORDS_MAX) onChange(n);
        }}
        onBlur={() => {
          // an empty or out-of-range number snaps back to the nearest allowed value
          const n = Math.round(Number(draft)) || 1000;
          const fixed = Math.min(WORDS_MAX, Math.max(WORDS_MIN, n));
          setDraft(String(fixed));
          onChange(fixed);
        }}
      />
    </Field>
  );
}

function LearningPoints({ id, points, onChange, disabled }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const point = draft.trim();
    if (!point || points.some((p) => p.toLowerCase() === point.toLowerCase())) return setDraft('');
    onChange([...points, point]);
    return setDraft('');
  };
  return (
    <Field id={id} label="Learning Points">
      <div className={s.addRow}>
        <input
          id={id}
          className={s.input}
          placeholder="Add a learning point"
          value={draft}
          maxLength={300}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className={s.smallButton} onClick={add} disabled={disabled || !draft.trim()}>
          <IconPlus width={15} height={15} /> Add
        </button>
      </div>
      {points.length > 0 && (
        <ul className={s.pointList} aria-label="Learning points">
          {points.map((point) => (
            <li key={point} className={s.point}>
              <span>{point}</span>
              <button type="button" className={s.pointRemove} onClick={() => onChange(points.filter((p) => p !== point))} aria-label={`Remove "${point}"`} disabled={disabled}>
                <IconTrash width={13} height={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

const BLANK = { name: '', role: '', details: '' };

/** Characters: name, role and details (the backend needs all three), added to a list that can be removed from. */
function Characters({ uid, characters, onChange, disabled }) {
  const [draft, setDraft] = useState(BLANK);
  const [error, setError] = useState('');
  const set = (key) => (event) => {
    setDraft((d) => ({ ...d, [key]: event.target.value }));
    setError('');
  };
  const add = () => {
    const ch = { name: draft.name.trim(), role: draft.role.trim(), details: draft.details.trim() };
    if (!ch.name || !ch.role || !ch.details) return setError('Give the character a name, a role and some details.');
    if (characters.some((c) => c.name.toLowerCase() === ch.name.toLowerCase())) return setError('There is already a character with this name.');
    onChange([...characters, ch]);
    setDraft(BLANK);
    return setError('');
  };
  return (
    <fieldset className={s.characters} disabled={disabled}>
      <legend className={s.formLabel}>Characters</legend>
      <div className={s.twoCols}>
        <input aria-label="Character name" className={s.input} placeholder="Character name" value={draft.name} maxLength={100} onChange={set('name')} />
        <input aria-label="Role" className={s.input} placeholder="Role" value={draft.role} maxLength={100} onChange={set('role')} />
      </div>
      <textarea aria-label="Character details" className={cx(s.input, s.area)} rows={3} placeholder="Character details" value={draft.details} maxLength={2000} onChange={set('details')} />
      {error && (
        <p className={s.fieldError} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={cx(s.smallButton, s.addCharacter)} onClick={add} id={`${uid}-add-character`}>
        <IconPlus width={15} height={15} /> Add Character
      </button>
      {characters.length > 0 && (
        <ul className={s.characterList} aria-label="Characters">
          {characters.map((c) => (
            <li key={c.name} className={s.character}>
              <div className={s.characterText}>
                <span className={s.characterName}>{c.name}</span>
                <span className={s.characterRole}>{c.role}</span>
                <span className={s.characterDetails}>{c.details}</span>
              </div>
              <button type="button" className={s.removeButton} onClick={() => onChange(characters.filter((x) => x !== c))} aria-label={`Remove ${c.name}`}>
                <IconTrash width={14} height={14} /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
