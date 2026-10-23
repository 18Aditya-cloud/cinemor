import cx from '../../utils/cx.js';
import styles from './DataTable.module.css';

/**
 * A table card. `columns` is a list of { key, header, className?, render?(row, index) }.
 * A column with `wrap: true` may wrap onto several lines (use it for descriptions); the others stay on one line.
 * On narrow screens the table scrolls sideways (as the client list does in the design). The scroll area can
 * be reached with the keyboard.
 */
export default function DataTable({ columns, rows, rowKey, caption, bare = false }) {
  return (
    <div className={cx(styles.card, bare && styles.bare)}>
      <div className={styles.scroll} role="region" aria-label={caption} tabIndex={0}>
        <table className={styles.table}>
          <caption className="cm-sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cx(column.className, column.wrap && styles.wrapCell)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={rowKey(row)} className={styles.row}>
                {columns.map((column) => (
                  <td key={column.key} className={cx(column.className, column.wrap && styles.wrapCell)}>
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
