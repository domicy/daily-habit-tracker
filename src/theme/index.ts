export {colors} from './colors';
export type {Colors} from './colors';

export {fontFamily, typeScale} from './typography';
export type {FontFamily, TypeScale} from './typography';

export {spacing} from './spacing';
export type {Spacing} from './spacing';

export {radii, borders, shadowOffsets} from './radii';
export type {Radii, Borders, ShadowOffsets} from './radii';

import {colors} from './colors';
import {fontFamily, typeScale} from './typography';
import {spacing} from './spacing';
import {radii, borders, shadowOffsets} from './radii';

export const theme = {
  colors,
  fontFamily,
  typeScale,
  spacing,
  radii,
  borders,
  shadowOffsets,
} as const;

export type Theme = typeof theme;
