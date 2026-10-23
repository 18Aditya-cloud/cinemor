import { useId, useState } from 'react';
import { Link } from '../../../router/router.jsx';
import cx from '../../../utils/cx.js';
import Button from '../../ui/Button.jsx';
import { IconPencil, IconTrash, IconUsers } from '../../ui/DashIcons.jsx';
import Pill from '../../ui/Pill.jsx';
import AccessCheckbox from './AccessCheckbox.jsx';
import RoleAvatar from './RoleAvatar.jsx';
import { FEATURES } from './features.js';
import styles from './Permissions.module.css';

/**
 * The details of the chosen job role: who it is, what it can use (tick to allow), and the employees who have it.
 * It sits beside the table on wide screens and slides in from the right on narrower ones.
 */
export default function RoleDetails({ role, index, tools, assigned, onChange, onEdit, onDelete }) {
  const uid = useId();
  const [tab, setTab] = useState('permissions');
  const tabs = [
    { id: 'permissions', label: 'Permissions' },
    { id: 'users', label: 'Assigned Users' },
  ];

  const onTabKey = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = tab === 'permissions' ? 'users' : 'permissions';
    setTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  return (
    <div className={styles.details}>
      <div className={styles.detailsHead}>
        <RoleAvatar index={index} large />
        <div>
          <h3 className={styles.detailsName}>{role.name}</h3>
          <p className={styles.detailsDesc}>{role.description || 'No description yet.'}</p>
        </div>
      </div>

      <div className={styles.infoTiles}>
        <div className={styles.infoTile}>
          <p className={styles.infoLabel}>Features allowed</p>
          <p className={styles.infoValue}>
            {role.features.length} of {FEATURES.length}
          </p>
        </div>
        <div className={styles.infoTile}>
          <p className={styles.infoLabel}>Assigned Users</p>
          <p className={styles.infoValue}>
            <IconUsers width={16} height={16} />
            {assigned.length}
          </p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Role details" onKeyDown={onTabKey}>
        {tabs.map((t) => (
          <button key={t.id} id={`${uid}-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`${uid}-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} className={cx(styles.tab, tab === t.id && styles.tabOn)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'permissions' ? (
        <div id={`${uid}-panel-permissions`} role="tabpanel" aria-labelledby={`${uid}-tab-permissions`}>
          <h4 className={styles.groupTitle}>Cinemor Features</h4>
          <ul className={styles.levelList}>
            {FEATURES.map((feature) => (
              <li key={feature.id}>
                <AccessCheckbox checked={role.features.includes(feature.id)} label={feature.label} onChange={(allowed) => onChange('features', feature.id, allowed)} />
              </li>
            ))}
          </ul>
          <h4 className={styles.groupTitle}>Organization Tools</h4>
          {tools.length === 0 ? (
            <p className={styles.lockNote}>
              No tools yet. Add them on the{' '}
              <Link to="/organization/tools" className={styles.inlineLink}>
                Tools
              </Link>{' '}
              page and they will appear here.
            </p>
          ) : (
            <ul className={styles.levelList}>
              {tools.map((tool) => (
                <li key={tool.id}>
                  <AccessCheckbox checked={role.tools.includes(tool.id)} label={tool.name} onChange={(allowed) => onChange('tools', tool.id, allowed)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div id={`${uid}-panel-users`} role="tabpanel" aria-labelledby={`${uid}-tab-users`}>
          {assigned.length === 0 ? (
            <p className={styles.lockNote}>
              No employees have this role yet. Invite someone from the{' '}
              <Link to="/organization/invitations" className={styles.inlineLink}>
                Invitations
              </Link>{' '}
              page.
            </p>
          ) : (
            <ul className={styles.userList}>
              {assigned.map((employee) => (
                <li key={employee.id} className={styles.userRow}>
                  <span className={styles.userEmail}>{employee.email}</span>
                  <span className={styles.userTags}>
                    {employee.teamLeader && <Pill tone="violet">Team Leader</Pill>}
                    {employee.reviewer && <Pill tone="blue">Reviewer</Pill>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.detailsActions}>
        <Button variant="secondary" icon={IconPencil} onClick={onEdit}>
          Edit Role
        </Button>
        <Button variant="danger" icon={IconTrash} onClick={onDelete}>
          Delete Role
        </Button>
      </div>
    </div>
  );
}
