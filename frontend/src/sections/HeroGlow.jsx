import styles from './HeroGlow.module.css';

// Everything that glows above the horizon. Rendered twice: once as is, and once
// mirrored (dimmer and blurred) to make the reflection underneath.
function GlowLayers() {
  return (
    <g clipPath="url(#cmAbove)">
      {/* wide violet halo */}
      <ellipse cx="500" cy="280" rx="420" ry="305" fill="url(#cmHalo)" />

      {/* faint outer arch that flares into the horizon */}
      <path
        d="M 180 283 C 330 274 350 118 500 114 C 650 118 670 274 820 283"
        fill="none"
        stroke="#b78cff"
        strokeOpacity="0.34"
        strokeWidth="4"
        filter="url(#cmBlur3)"
      />

      <g>
        {/* the bright lensed band */}
        <ellipse cx="500" cy="280" rx="152" ry="122" fill="url(#cmBand)" filter="url(#cmBlur4)" />
        {/* dark core with a violet edge */}
        <circle cx="500" cy="280" r="70" fill="url(#cmCore)" />
        {/* the thin bright ring around the core */}
        <circle cx="500" cy="280" r="70" fill="none" stroke="#c9a2ff" strokeOpacity="0.8" strokeWidth="12" filter="url(#cmBlur6)" />
        <circle cx="500" cy="280" r="70" fill="none" stroke="#f6ecff" strokeWidth="4.5" filter="url(#cmBlur1)" />
      </g>

      {/* the light streak along the horizon */}
      <ellipse cx="500" cy="280" rx="500" ry="42" fill="url(#cmStreakSoft)" filter="url(#cmBlur16)" />
      <rect x="40" y="274" width="920" height="12" rx="6" fill="url(#cmStreak)" filter="url(#cmBlur4)" />
      <rect x="220" y="277.8" width="560" height="3.6" rx="1.8" fill="#ffffff" filter="url(#cmBlur2)" />
    </g>
  );
}

/**
 * The hero background: a dark core with a bright ring, a lensed halo, a light streak
 * along the horizon and a soft reflection below it.
 *
 * Drawn as SVG so it stays sharp on any screen (a bitmap would blur when stretched).
 * Coordinates: viewBox is 1000 x 560, the horizon sits at y = 280, the centre at x = 500.
 * The colour numbers were measured from the reference image.
 */
export default function HeroGlow() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg className={styles.svg} viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" focusable="false">
        <defs>
          {/* wide violet halo, elliptical: bright near the ring, falling off to the dark page */}
          <radialGradient
            id="cmHalo"
            gradientUnits="userSpaceOnUse"
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(500 280) scale(420 305)"
          >
            <stop offset="0" stopColor="#7a3cff" />
            <stop offset="0.3" stopColor="#7434f2" />
            <stop offset="0.5" stopColor="#6e29e4" />
            <stop offset="0.55" stopColor="#4f1fb8" />
            <stop offset="0.61" stopColor="#3a1284" />
            <stop offset="0.67" stopColor="#31106a" />
            <stop offset="0.74" stopColor="#230b50" />
            <stop offset="0.82" stopColor="#170738" stopOpacity="0.8" />
            <stop offset="1" stopColor="#0b0320" stopOpacity="0" />
          </radialGradient>

          {/* the bright lensed band around the core */}
          <radialGradient id="cmBand" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.45" stopColor="#b98cff" stopOpacity="0" />
            <stop offset="0.54" stopColor="#c79dff" stopOpacity="0.7" />
            <stop offset="0.62" stopColor="#f6d9ff" stopOpacity="1" />
            <stop offset="0.78" stopColor="#fbe1ff" stopOpacity="1" />
            <stop offset="0.9" stopColor="#c89bff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#8a55ff" stopOpacity="0" />
          </radialGradient>

          {/* the dark core, lighter toward its edge */}
          <radialGradient id="cmCore" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#36108f" />
            <stop offset="0.55" stopColor="#4a1ebb" />
            <stop offset="0.82" stopColor="#6a34ee" />
            <stop offset="1" stopColor="#7c47f5" />
          </radialGradient>

          {/* horizon streak */}
          <linearGradient id="cmStreak" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9a64ff" stopOpacity="0" />
            <stop offset="0.14" stopColor="#a070ff" stopOpacity="0.7" />
            <stop offset="0.38" stopColor="#f2e6ff" stopOpacity="1" />
            <stop offset="0.62" stopColor="#f2e6ff" stopOpacity="1" />
            <stop offset="0.86" stopColor="#a070ff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#9a64ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cmStreakSoft" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7a3cff" stopOpacity="0" />
            <stop offset="0.22" stopColor="#8a50ff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#d7b8ff" stopOpacity="0.95" />
            <stop offset="0.78" stopColor="#8a50ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#7a3cff" stopOpacity="0" />
          </linearGradient>

          {/* sRGB is important: the default linear-light blur turns dark purples grey */}
          <filter id="cmBlur1" colorInterpolationFilters="sRGB" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
          <filter id="cmBlur2" colorInterpolationFilters="sRGB" x="-20%" y="-300%" width="140%" height="700%">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>
          <filter id="cmBlur3" colorInterpolationFilters="sRGB" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="cmBlur4" colorInterpolationFilters="sRGB" x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id="cmBlur6" colorInterpolationFilters="sRGB" x="-30%" y="-50%" width="160%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="cmBlur16" colorInterpolationFilters="sRGB" x="-30%" y="-150%" width="160%" height="400%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          {/* the reflection is blurred and tinted toward violet, like light seen through water */}
          <filter id="cmBlurRefl" colorInterpolationFilters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3.5" />
            <feColorMatrix type="matrix" values="0.86 0 0 0 0  0 0.62 0 0 0  0 0 1 0 0  0 0 0 1 0" />
          </filter>

          {/* only the half above the horizon is drawn by the main group */}
          <clipPath id="cmAbove">
            <rect x="0" y="0" width="1000" height="280" />
          </clipPath>

          {/* the reflection fades out as it goes down */}
          <linearGradient id="cmReflFade" gradientUnits="userSpaceOnUse" x1="0" y1="282" x2="0" y2="530">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="cmReflMask" maskUnits="userSpaceOnUse" x="0" y="280" width="1000" height="280">
            <rect x="0" y="280" width="1000" height="280" fill="url(#cmReflFade)" />
          </mask>
        </defs>

        <g>
          <GlowLayers />
          <g mask="url(#cmReflMask)" opacity="0.88" filter="url(#cmBlurRefl)">
            <g transform="translate(0 560) scale(1 -1)">
              <GlowLayers />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
