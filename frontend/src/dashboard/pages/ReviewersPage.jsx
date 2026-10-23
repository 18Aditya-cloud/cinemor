import { IconShield, IconUserCog } from '../ui/DashIcons.jsx';
import RoleListPage from './RoleListPage.jsx';

export default function ReviewersPage() {
  return (
    <RoleListPage
      field="reviewer"
      other="teamLeader"
      docTitle="Reviewers"
      title="Reviewers"
      subtitle="View employees currently assigned as Reviewers and manage their Reviewer responsibility."
      statIcon={IconUserCog}
      otherIcon={IconShield}
      emptyIcon={IconUserCog}
      emptyTitle="No Reviewers"
      emptyText="Employees marked as Reviewers from the Employees page will appear here."
    />
  );
}
