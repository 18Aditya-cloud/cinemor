import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { PasswordCard, SessionsCard } from '../pages/SettingsPage.jsx';
import settings from '../pages/SettingsPage.module.css';
import { Header } from './parts.jsx';
import s from './Individual.module.css';

/**
 * The creator's Settings: change password, and log out of every device. (The backend's individual routes have no
 * profile endpoint yet, so there is nothing else to edit here for now.) Both cards are the organization Settings
 * page's own, reused.
 */
export default function SettingsPage() {
  useDocumentTitle('Settings');
  return (
    <div className={s.page}>
      <Header title="Settings" subtitle="Manage your account security." />
      <div className={settings.stack}>
        <PasswordCard description="Update the password you use to log in to Cinemor AI." />
        <SessionsCard />
      </div>
    </div>
  );
}
