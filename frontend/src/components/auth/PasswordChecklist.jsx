import { useMemo } from 'react';
import { checkPassword, STRENGTH_COLORS, STRENGTH_LABELS, PASSWORD_RULES } from '../../auth/passwordRules.js';
import cx from '../../utils/cx.js';
import { Check } from '../Icons.jsx';
import styles from './PasswordChecklist.module.css';

/**
 * The password guide. It opens under the password field while you type, ticks each rule as it is
 * met, fills a strength bar, and turns fully green when every rule is met.
 *
 * Props: password (string), open (boolean), id (for aria-describedby), rules (optional, defaults to the
 * sign-up guide; pass ACCOUNT_PASSWORD_RULES from passwordRules.js for the stricter 12-character account guide)
 */
export default function PasswordChecklist({ password, open, id, rules = PASSWORD_RULES }) {
  const { results, score, allMet } = useMemo(() => checkPassword(password, rules), [password, rules]);
  const color = STRENGTH_COLORS[score];

  return (
    <div className={styles.wrap} data-open={open}>
      <div className={styles.inner}>
        <div
          id={id}
          className={cx(styles.panel, allMet && styles.complete)}
          data-complete={allMet}
          data-score={score}
          role="group"
          aria-label="Password requirements"
          style={{ '--meter': color }}
        >
          <div className={styles.head}>
            <span className={styles.title}>{allMet ? 'Strong password' : 'Make your password strong'}</span>
            <span className={styles.level}>{STRENGTH_LABELS[score]}</span>
          </div>

          <div className={styles.meter} aria-hidden="true">
            {rules.map((rule, index) => (
              <span key={rule.id} className={cx(styles.seg, index < score && styles.on)} />
            ))}
          </div>

          <ul className={styles.list}>
            {results.map((rule) => (
              <li key={rule.id} className={cx(styles.item, rule.met && styles.met)} data-met={rule.met}>
                <span className={styles.icon} aria-hidden="true">
                  {rule.met && <Check width={12} height={12} />}
                </span>
                <span>{rule.label}</span>
                <span className="cm-sr-only">{rule.met ? ' (done)' : ' (needed)'}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="cm-sr-only" aria-live="polite">
          {open ? `Password strength: ${STRENGTH_LABELS[score]}. ${score} of ${rules.length} requirements met.` : ''}
        </p>
      </div>
    </div>
  );
}
