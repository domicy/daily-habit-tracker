// Soft Clemson v3 — Archivo Black / Space Grotesk / Space Mono.
// Font files must be present in /assets/fonts and linked via
// `npx react-native-asset` for the custom families to resolve; until
// then RN falls back to the system font automatically.

export const fontFamily = {
  // Primary roles
  display: 'Archivo Black',
  body: 'Space Grotesk',
  mono: 'Space Mono',

  // Legacy keys retained so existing consumers (and theme.test.ts) keep
  // compiling. heading/body map onto the new display/body fonts.
  heading: 'Archivo Black',
  headingFallback: 'sans-serif',
  bodyFallback: 'sans-serif',
} as const;

export const typeScale = {
  // Soft Clemson v3 display scale
  display01: {fontSize: 86, lineHeight: 71}, // TODAY headline
  display02: {fontSize: 60, lineHeight: 51},
  display03: {fontSize: 28, lineHeight: 28},
  label: {fontSize: 13, lineHeight: 16},

  // Legacy keys retained
  h1: {fontSize: 32, lineHeight: 40},
  h2: {fontSize: 24, lineHeight: 32},
  body: {fontSize: 16, lineHeight: 24},
  caption: {fontSize: 12, lineHeight: 16},
  streak: {fontSize: 48, lineHeight: 56},
} as const;

export type FontFamily = typeof fontFamily;
export type TypeScale = typeof typeScale;
