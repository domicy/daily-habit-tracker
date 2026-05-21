// Soft Clemson v3 — Pixel 10a habit tracker palette.
// No black: text-only ink. Two-tier tiger + two-tier regalia do the
// contrast work that black used to.

export const colors = Object.freeze({
  // Soft Clemson core
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
  background: '#F2EBDC',
  surface: '#FAF5EA',
  clemsonOrange: '#C7754A',
  regaliaPurple: '#6A5A86',
  textPrimary: '#2E2A26',
  textSecondary: '#5B544B',
  success: '#C7754A',
  streakGold: '#C7754A',
  error: '#8E4F2E',
  border: '#6A5A86',
});

export type Colors = typeof colors;
