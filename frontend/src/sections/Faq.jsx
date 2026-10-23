import { useId, useState } from 'react';
import { FAQ } from '../data/content.js';
import { SITE } from '../config/site.js';
import { Plus } from '../components/Icons.jsx';
import cx from '../utils/cx.js';
import styles from './Faq.module.css';

// Turns "{email}" in an answer into a real mailto link.
function renderAnswer(text, email) {
  const parts = text.split('{email}');
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i < parts.length - 1
      ? [part, <a key={i} href={`mailto:${email}`}>{email}</a>]
      : [part],
  );
}

/** Questions and answers as an accordion. One answer is open at a time. */
export default function Faq({ items = FAQ.items, title = FAQ.title, email = SITE.contactEmail }) {
  const [openIndex, setOpenIndex] = useState(null);
  const baseId = useId();

  return (
    <section id="faq" className={styles.section} aria-labelledby={`${baseId}-title`}>
      <h2 id={`${baseId}-title`} className={styles.title}>
        {title}
      </h2>

      <div className={styles.panel}>
        {items.map((item, index) => {
          const open = openIndex === index;
          const buttonId = `${baseId}-q-${index}`;
          const panelId = `${baseId}-a-${index}`;
          return (
            <div key={item.q} className={cx(styles.row, open && styles.open)}>
              <h3 className={styles.q}>
                <button
                  id={buttonId}
                  type="button"
                  className={styles.trigger}
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span>{item.q}</span>
                  <span className={styles.icon} aria-hidden="true">
                    <Plus width={20} height={20} />
                  </span>
                </button>
              </h3>
              <div id={panelId} role="region" aria-labelledby={buttonId} className={styles.answer} inert={!open}>
                <div className={styles.answerInner}>
                  <p>{renderAnswer(item.a, email)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
