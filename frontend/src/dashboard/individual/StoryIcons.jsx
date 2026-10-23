// Icons used only by the Story page, drawn like the other dashboard icons (ui/DashIcons.jsx).
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};
const make = (paths) =>
  function Icon(props) {
    return (
      <svg {...base} {...props}>
        {paths}
      </svg>
    );
  };

/** Attach a file */
export const IconPaperclip = make(<path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />);


/** Send / generate */
export const IconArrowUp = make(<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />);

/** Export (download) */
export const IconExport = make(
  <>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
);

/** Import / upload a file */
export const IconUpload = make(
  <>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
);

/** Restore an earlier version */
export const IconRestore = make(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </>,
);

/** A document (a story) */
export const IconDocument = make(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6M9 9h1" />
  </>,
);

/** The story chats (history) */
export const IconChats = make(
  <>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z" />
    <path d="M8.5 10.5h7M8.5 14h4.5" />
  </>,
);

/** Creative Direction (an open book) */
export const IconBookOpen = make(
  <>
    <path d="M12 7c-1.6-1.4-4-2-7-2H3v13h2c3 0 5.4.6 7 2 1.6-1.4 4-2 7-2h2V5h-2c-3 0-5.4.6-7 2Z" />
    <path d="M12 7v13" />
  </>,
);

/** Layer by layer */
export const IconLayers = make(
  <>
    <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
    <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
  </>,
);

/** One-click generation */
export const IconBolt = make(<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />);

/** A place (map pin) */
export const IconPin = make(
  <>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </>,
);

/** A relationship (two linked rings) */
export const IconLink = make(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
);

/** A line of dialogue */
export const IconQuote = make(
  <>
    <path d="M4 20.5V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8.5L4 20.5Z" />
    <path d="M8.5 9h7M8.5 12.5h4.5" />
  </>,
);
