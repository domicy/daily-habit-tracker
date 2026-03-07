import {Platform} from 'react-native';

export const fontFamily = {
  heading: 'TradeGothicNextLT-Bold',
  headingFallback: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  body: 'Biotif-Regular',
  bodyFallback: Platform.OS === 'ios' ? 'San Francisco' : 'sans-serif',
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
} as const;

export const typeScale = {
  h1: {fontSize: 32, lineHeight: 40},
  h2: {fontSize: 24, lineHeight: 32},
  body: {fontSize: 16, lineHeight: 24},
  caption: {fontSize: 12, lineHeight: 16},
  streak: {fontSize: 48, lineHeight: 56},
} as const;

export type FontFamily = typeof fontFamily;
export type TypeScale = typeof typeScale;
