// All visible copy lives here, so text can be edited without touching components.
// Anything marked TODO is placeholder text the owner should replace.

export const HERO = {
  // 'video' = the looping eclipse video behind the hero. 'glow' = the lighter drawn glow (no video).
  background: 'video',
  headline: 'Turn a single prompt into a story worth watching.',
  sub: 'Cinemor AI automates the slow parts of storytelling, so you can stay with the idea.',
  cta: 'Create your story',
};

// The scene where a hand lifts the rotating logo. Three short lines sit around it and fade
// away with the hand as you scroll on. (Edit freely.)
export const HAND_SCENE = {
  left: 'Describe your idea',
  top: 'Cinemor AI builds it',
  right: 'Invite your team',
};

export const SHOWCASE = {
  label: 'How Cinemor AI works',
  emptyNote: 'Product video goes here',
  // The card plays src/assets/video/how-it-works-*.mp4 (muted, looping). To use another video,
  // set these two (they win over the built-in film):
  videoSrc: null, // e.g. '/videos/how-it-works.mp4'
  poster: null, //   e.g. '/videos/how-it-works.jpg'
};

export const STORIES_SECTION = {
  title: 'What will you tell next?',
  tryLabel: 'Try now',
};

// Exactly 7 cards keeps the carousel loop seamless.
//   hue   tints the placeholder picture (0-360)
//   icon  one of: film, briefcase, bulb, music, layers, phone, globe (see components/Icons.jsx)
//   video / image  (optional) a URL. When set, it replaces the placeholder picture.
// TODO: replace titles and descriptions with your real story formats.
export const STORIES = [
  { id: 'short-films', icon: 'film', title: 'Short films', blurb: 'Turn a one-line premise into a scene-by-scene story.', hue: 192 },
  { id: 'brand-stories', icon: 'briefcase', title: 'Brand stories', blurb: 'Give a product a narrative people remember.', hue: 214 },
  { id: 'explainers', icon: 'bulb', title: 'Explainers', blurb: 'Make a complex idea easy to follow.', hue: 238 },
  { id: 'music-visuals', icon: 'music', title: 'Music visuals', blurb: 'Set a track to images that move with it.', hue: 260 },
  { id: 'episodic-series', icon: 'layers', title: 'Episodic series', blurb: 'Plan a story that unfolds across episodes.', hue: 282 },
  { id: 'social-reels', icon: 'phone', title: 'Social reels', blurb: 'Shape a story to fit a few seconds.', hue: 304 },
  { id: 'documentaries', icon: 'globe', title: 'Documentaries', blurb: 'Give real material a clear arc.', hue: 328 },
];

// Three words with the same number of letters, so they can morph letter by letter.
export const FLAME_WORDS = ['PROMPT', 'CREATE', 'COLLAB'];

// TODO: answers 2-4 are placeholders. Replace them with your real policies.
export const FAQ = {
  title: 'Frequently Asked Questions',
  items: [
    {
      q: 'What can I do with Cinemor AI?',
      a: 'Cinemor AI automates the steps between an idea and a finished story. You write a prompt, Cinemor AI builds the workflow around it, and you can bring collaborators in at any point.',
    },
    {
      q: 'Is Cinemor AI free to use?',
      a: 'Plan and pricing details will be listed here once they are final.',
    },
    {
      q: 'Can I use what I create commercially?',
      a: 'Usage rights for your stories will be described in our terms of use.',
    },
    {
      q: 'Is my uploaded content secure?',
      a: 'How Cinemor AI stores and protects your content will be described in our privacy policy.',
    },
    {
      q: 'I have more questions. How can I reach out?',
      a: 'Write to {email} and we will get back to you.', // {email} is filled from config/site.js
    },
  ],
};

// Text on the Log in and Sign up pages.
export const AUTH = {
  login: {
    title: 'Welcome back',
    sub: 'Log in to keep building your stories on Cinemor AI.',
    google: 'Sign in with Google',
    submit: 'Log in',
    switchText: 'New to Cinemor AI?',
    switchLink: 'Create an account',
  },
  signup: {
    typeTitle: 'How will you use Cinemor AI?',
    typeSub: 'Choose the account that fits you.',
    formTitle: 'Create your account',
    google: 'Sign up with Google',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchLink: 'Log in',
  },
  // Shown once, to a brand-new person who signed in with Google before registering.
  chooseAccount: {
    title: 'Almost there',
    sub: 'Choose the account that fits you. We only ask this once.',
    signedInAs: 'Signed in with Google as',
    submit: 'Continue',
    needType: 'Choose Individual or Organization to continue.',
    different: 'Use a different account',
    checking: 'Checking your Google sign-in...',
  },
  // The two account types. `id` is sent to your backend as accountType.
  types: [
    { id: 'individual', title: 'Individual', text: 'For creators making their own stories.', emailLabel: 'Email', emailPlaceholder: 'you@example.com' },
    { id: 'organization', title: 'Organization', text: 'For teams, studios and companies creating together.', emailLabel: 'Work email', emailPlaceholder: 'you@company.com' },
  ],
};

// Text on the "Forgot password" and "Reset password" pages.
// Email confirmation after sign-up (strict: an account works only once its email is confirmed).
export const VERIFY = {
  // The link's lifetime is decided by the backend (EMAIL_VERIFICATION_EXPIRE_HOURS); this is only what the page says.
  linkHours: 24,
  // The backend sends at most one new link per minute; the button waits as long.
  resendSeconds: 60,
  inbox: {
    title: 'Check your inbox',
    spam: "Can't see it? Look in your spam folder.",
    resend: 'Send a new link',
    resent: 'If that email is waiting for confirmation, we sent a new link.',
  },
  unverified: {
    title: 'Confirm your email first',
    text: 'Your account is almost ready. Open the link we emailed you to confirm your address, then log in.',
  },
  page: {
    checking: 'Confirming your email...',
    doneTitle: 'Email confirmed',
    doneText: 'Your account is ready. Log in to get started.',
    alreadyTitle: 'Already confirmed',
    alreadyText: 'This email was confirmed before. You can log in.',
    invalidTitle: "This link can't be used",
    invalidText: 'It may have expired, or a newer link was sent after it. Enter your email and we will send a fresh one.',
    errorTitle: "We couldn't confirm your email",
    errorText: "Something went wrong on our side, or you're offline. Try again in a moment.",
    submit: 'Send a new link',
  },
};

export const RECOVERY = {
  // The reset link's lifetime is decided by your backend; this number is only what the "Check your email" page says.
  linkMinutes: 30,
  // How long "Resend" stays disabled after a link was sent.
  resendSeconds: 30,
  forgot: {
    title: 'Forgot your password?',
    sub: "No problem. Enter your email and we'll send you a link to choose a new one.",
    submit: 'Send reset link',
    back: 'Back to log in',
  },
  sent: {
    title: 'Check your email',
    spam: "Can't see it? Look in your spam folder.",
    resend: 'Send it again',
    different: 'Use a different email',
  },
  reset: {
    checking: 'Checking your link...',
    title: 'Set a new password',
    subWithEmail: 'Choose a strong password for',
    sub: 'Choose a strong password for your account.',
    submit: 'Update password',
    doneTitle: 'Password updated',
    doneText: 'Your password has been changed. Log in with your new password.',
    invalidTitle: "This link can't be used",
    invalidText: 'It may have expired, or it may already have been used. For your safety, each reset link works only once.',
    errorTitle: "We couldn't check your link",
    errorText: "Something went wrong on our side, or you're offline. Try again in a moment.",
  },
};

/**
 * Dashboard look. To undo the "home" redesign, change these words and nothing else:
 *   overview: 'home'    the new Overview (stats, "Get started" checklist, recent activity)
 *             'classic' the earlier Overview (big turning logo and three link cards)
 *   projectsView: 'cards' | 'table'   which view All Projects shows to someone who has not chosen one yet
 *                                     (the page always has a Cards / Table switch, and remembers the choice)
 */
export const DASHBOARD = {
  overview: 'home',
  projectsView: 'cards',
};
