// Type tokens and font family mapping.
// Font files must be present in /assets/fonts and linked via
// `npx react-native-asset` for the custom families to resolve; until
// then RN falls back to the system font automatically.

export const fontFamily = {
  // Primary roles
  display: 'Archivo Black',
  body: 'Space Grotesk',
  mono: 'Space Mono',

  // deprecated: use display
  heading: 'Archivo Black',
} as const;

export const typeScale = {
  // Display scale
  display01: {fontSize: 86, lineHeight: 71}, // TODAY headline
  display02: {fontSize: 60, lineHeight: 51},
  display03: {fontSize: 28, lineHeight: 28},
  label: {fontSize: 13, lineHeight: 16},

  // deprecated: use display02 or display03
  h2: {fontSize: 24, lineHeight: 32},
  // deprecated: use label
  body: {fontSize: 16, lineHeight: 24},
  // deprecated: use label
  caption: {fontSize: 12, lineHeight: 16},
} as const;

export type FontFamily = typeof fontFamily;
export type TypeScale = typeof typeScale;
