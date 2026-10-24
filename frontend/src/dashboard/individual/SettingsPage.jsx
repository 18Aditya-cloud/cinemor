import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { PasswordCard, ProfileCard, SessionsCard } from '../pages/SettingsPage.jsx';
import settings from '../pages/SettingsPage.module.css';
import { Header } from './parts.jsx';
import s from './Individual.module.css';

/**
 * The creator's Settings: their name, their password, and logging out of every device (the cards of the organization
 * Settings page, reused).
 */
export default function SettingsPage() {
  useDocumentTitle('Settings');
  return (
    <div className={s.page}>
      <Header title="Settings" subtitle="Your name, your password and where you are logged in." />
      <div className={settings.stack}>
        <ProfileCard />
        <PasswordCard description="Update the password you use to log in to Cinemor AI." />
        <SessionsCard />
      </div>
    </div>
  );
}
