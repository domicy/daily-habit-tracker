export {colors} from './colors';
export type {Colors} from './colors';

export {fontFamily, typeScale} from './typography';
export type {FontFamily, TypeScale} from './typography';

export {spacing} from './spacing';
export type {Spacing} from './spacing';

export {radii} from './radii';
export type {Radii} from './radii';

export {borders} from './borders';
export type {Borders} from './borders';

export {shadowOffsets} from './shadowOffsets';
export type {ShadowOffsets} from './shadowOffsets';

import {colors} from './colors';
import {fontFamily, typeScale} from './typography';
import {spacing} from './spacing';
import {radii} from './radii';
import {borders} from './borders';
import {shadowOffsets} from './shadowOffsets';

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
