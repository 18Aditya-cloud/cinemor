import { Person } from '../../../components/Icons.jsx';
import { IconLock } from '../../ui/DashIcons.jsx';
import styles from './Permissions.module.css';

const PALETTE = ['#8b5cf6', '#3b82f6', '#f97316', '#ec4899', '#10b981', '#6366f1', '#14b8a6'];

// The round coloured icon beside a role's name. The colour follows the role's position in the list.
export default function RoleAvatar({ index = 0, locked = false, large = false }) {
  const Icon = locked ? IconLock : Person;
  return (
    <span className={large ? `${styles.avatar} ${styles.avatarLarge}` : styles.avatar} style={{ '--c': locked ? '#6b7280' : PALETTE[index % PALETTE.length] }} aria-hidden="true">
      <Icon width={large ? 26 : 16} height={large ? 26 : 16} />
    </span>
  );
}
