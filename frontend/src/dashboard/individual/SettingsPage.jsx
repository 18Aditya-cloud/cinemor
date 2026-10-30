import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import DeleteAccountCard from '../pages/DeleteAccountCard.jsx';
import { PasswordCard, ProfileCard, SessionsCard } from '../pages/SettingsPage.jsx';
import settings from '../pages/SettingsPage.module.css';
import { Header } from './parts.jsx';
import s from './Individual.module.css';

/**
 * The creator's Settings: their name, their password, logging out of every device (the cards of the organization
 * Settings page, reused) and deleting the account.
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
        <DeleteAccountCard />
      </div>
    </div>
  );
}