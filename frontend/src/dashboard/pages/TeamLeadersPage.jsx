import { IconShield, IconUserCog } from '../ui/DashIcons.jsx';
import RoleListPage from './RoleListPage.jsx';

export default function TeamLeadersPage() {
  return (
    <RoleListPage
      field="teamLeader"
      other="reviewer"
      docTitle="Team Leaders"
      title="Team Leaders"
      subtitle="View employees currently assigned as Team Leaders and manage their Team Leader responsibility."
      statIcon={IconShield}
      otherIcon={IconUserCog}
      emptyIcon={IconShield}
      emptyTitle="No Team Leaders"
      emptyText="Employees marked as Team Leaders from the Employees page will appear here."
    />
  );
}
