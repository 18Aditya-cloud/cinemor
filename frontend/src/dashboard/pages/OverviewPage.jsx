import { DASHBOARD } from '../../data/content.js';
import OverviewClassic from './OverviewClassic.jsx';
import OverviewHome from './OverviewHome.jsx';

// Which Overview to show is one word in data/content.js: DASHBOARD.overview = 'home' or 'classic'.
export default function OverviewPage() {
  return DASHBOARD.overview === 'classic' ? <OverviewClassic /> : <OverviewHome />;
}
