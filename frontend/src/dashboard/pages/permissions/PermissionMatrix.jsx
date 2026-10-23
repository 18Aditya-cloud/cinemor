import cx from '../../../utils/cx.js';
import { IconWrench } from '../../ui/DashIcons.jsx';
import AccessCell from './AccessCell.jsx';
import RoleAvatar from './RoleAvatar.jsx';
import { FEATURES, TOOL_COLOR } from './features.js';
import styles from './Permissions.module.css';

/**
 * The Job Roles table: one row per job role, with its number, id, name and description, then one column per Cinemor
 * feature and one per organization tool (the tools come from the Tools page). A ticked box means the role is allowed.
 * `onChange(roleId, 'features' | 'tools', id, allowed)`.
 */
export default function PermissionMatrix({ roles, tools, selectedId, onSelect, onChange }) {
  return (
    <div className={styles.matrixScroll} role="region" aria-label="Job roles and their permissions" tabIndex={0}>
      <table className={styles.matrix}>
        <caption className="cm-sr-only">Job roles and what each can use. A ticked box means the role is allowed; click a box to change it.</caption>
        <thead>
          <tr>
            <th rowSpan={2} scope="col" className={styles.numCol}>
              S.No.
            </th>
            <th rowSpan={2} scope="col" className={styles.idCol}>
              Job Role ID
            </th>
            <th rowSpan={2} scope="col" className={cx(styles.roleCol, styles.corner)}>
              Name
            </th>
            <th rowSpan={2} scope="col" className={styles.descCol}>
              Description
            </th>
            <th colSpan={FEATURES.length} scope="colgroup" role="columnheader" className={styles.groupHead}>
              Cinemor Features
            </th>
            {tools.length > 0 && (
              <th colSpan={tools.length} scope="colgroup" role="columnheader" className={cx(styles.groupHead, styles.groupSplit)}>
                Organization Tools
              </th>
            )}
          </tr>
          <tr>
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <th key={feature.id} scope="col" className={styles.colHead} style={{ '--stage': feature.color }}>
                  <span className={styles.colIcon} aria-hidden="true">
                    <Icon width={16} height={16} />
                  </span>
                  <span>{feature.label}</span>
                </th>
              );
            })}
            {tools.map((tool, index) => (
              <th key={tool.id} scope="col" className={cx(styles.colHead, index === 0 && styles.groupSplit)} style={{ '--stage': TOOL_COLOR }} title={tool.name}>
                <span className={styles.colIcon} aria-hidden="true">
                  <IconWrench width={16} height={16} />
                </span>
                <span className={styles.toolName}>{tool.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role, rowIndex) => (
            <tr key={role.id} className={cx(styles.row, selectedId === role.id && styles.selectedRow)}>
              <td className={styles.numCol}>{rowIndex + 1}</td>
              <td className={styles.idCol}>
                <strong>#{role.id}</strong>
              </td>
              <th scope="row" className={cx(styles.roleCol, styles.roleCell)}>
                <button type="button" className={styles.roleButton} onClick={() => onSelect(role.id)} aria-current={selectedId === role.id ? 'true' : undefined} title="Show details">
                  <RoleAvatar index={rowIndex} />
                  <span className={styles.roleName}>{role.name}</span>
                </button>
              </th>
              <td className={styles.descCol}>
                <span className={styles.desc}>{role.description || <span className={styles.muted}>-</span>}</span>
              </td>
              {FEATURES.map((feature) => (
                <td key={feature.id} className={styles.cellTd}>
                  <AccessCell allowed={role.features.includes(feature.id)} label={`${role.name}, ${feature.label}`} onChange={(allowed) => onChange(role.id, 'features', feature.id, allowed)} />
                </td>
              ))}
              {tools.map((tool, index) => (
                <td key={tool.id} className={cx(styles.cellTd, index === 0 && styles.groupSplit)}>
                  <AccessCell allowed={role.tools.includes(tool.id)} label={`${role.name}, ${tool.name}`} onChange={(allowed) => onChange(role.id, 'tools', tool.id, allowed)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
