import { HERO } from '../data/content.js';
import GlowButton from './GlowButton.jsx';
import { Sparkle } from './Icons.jsx';

/**
 * The "Create your story" button shown under the hero.
 * It only reports the click through `onClick`. What happens next (open login,
 * go to the studio, call the API) is decided by the parent, so this file
 * never needs to change when the backend is connected.
 */
export default function Create({ children = HERO.cta, onClick, ...rest }) {
  return (
    <GlowButton size="lg" icon={<Sparkle width={20} height={20} />} onClick={onClick} {...rest}>
      {children}
    </GlowButton>
  );
}
