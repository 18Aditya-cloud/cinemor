import Button from './Button.jsx';
import { IconRefresh } from './DashIcons.jsx';

// The refresh button in every page header. It spins while the page's data is loading.
export default function RefreshButton({ onClick, loading, withText = false }) {
  return withText ? (
    <Button variant="secondary" icon={IconRefresh} onClick={onClick} loading={loading}>
      Refresh
    </Button>
  ) : (
    <Button variant="secondary" iconOnly icon={IconRefresh} aria-label="Refresh" onClick={onClick} loading={loading} />
  );
}
