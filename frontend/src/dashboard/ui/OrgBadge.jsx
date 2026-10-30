import { useAuth } from '../../auth/AuthContext.jsx';
import { IconBuilding } from './DashIcons.jsx';
import styles from './OrgBadge.module.css';

/**
 * The organization a Team Leader or an employee works for, at the top of their dashboard:
 * a small building chip with the organization's name, then the person's role.
 * The name comes from the signed-in session (GET /api/auth/me, organization_name); without one only the role shows.
 */
export default function OrgBadge({ role }) {
  const { user } = useAuth();
  const name = (user?.organizationName || '').trim();
  if (!name && !role) return null;
  return (
    <p className={styles.row}>
      {name && (
        <span className={styles.chip} title={`You work for ${name}`}>
          <IconBuilding width={15} height={15} aria-hidden="true" />
          <span className={styles.name}>{name}</span>
        </span>
      )}
      {role && <span className={styles.role}>{role}</span>}
    </p>
  );
}