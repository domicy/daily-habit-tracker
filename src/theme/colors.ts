// App color tokens. Warm "tiger + regalia" palette; no pure black — the
// two-tier tiger and two-tier regalia ramps do the contrast work that
// black used to.

export const colors = Object.freeze({
  // Core surfaces and ink
  paper: '#F2EBDC',
  card: '#FAF5EA',
  text: '#2E2A26',
  textSoft: '#5B544B',

  tiger: '#C7754A',
  tigerSoft: '#E8B796',
  tigerDeep: '#8E4F2E',

  regalia: '#6A5A86',
  regaliaSoft: '#C9BFD8',
  regaliaDeep: '#3D2F52',

  mute: '#B5AC9A',

  // Semantic roles (replaces former black usage)
  line: '#6A5A86',
  lineDeep: '#3D2F52',
  shadow: '#3D2F52',
  darkBg: '#3D2F52',
  darkBgText: '#FAF5EA',

  // Legacy keys retained for backward compatibility with consumers that
  // still import them, remapped onto the new palette.
  background: '#F2EBDC', // alias of paper — primary screen background
  surface: '#FAF5EA', // alias of card — raised surfaces
  clemsonOrange: '#C7754A', // alias of tiger — kept for older imports
  regaliaPurple: '#6A5A86', // alias of regalia — kept for older imports
  textPrimary: '#2E2A26', // alias of text
  textSecondary: '#5B544B', // alias of textSoft
  // Semantic status colors, tuned to sit alongside the warm palette while
  // staying visually distinct from tiger (orange) and tigerDeep (shadow).
  success: '#5C7A4E', // muted olive-green — reads as "ok/done" without clashing
  streakGold: '#C8A24B', // warm gold — distinct from tiger orange
  error: '#8C2F36', // burgundy red — clearly different from tigerDeep shadow
  border: '#6A5A86', // alias of line
});

export type Colors = typeof colors;
