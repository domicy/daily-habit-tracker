export {colors} from './colors';
export type {Colors} from './colors';

export {fontFamily, typeScale} from './typography';
export type {FontFamily, TypeScale} from './typography';

export {spacing} from './spacing';
export type {Spacing} from './spacing';

import {colors} from './colors';
import {fontFamily, typeScale} from './typography';
import {spacing} from './spacing';

export const theme = {
  colors,
  fontFamily,
  typeScale,
  spacing,
} as const;

export type Theme = typeof theme;
