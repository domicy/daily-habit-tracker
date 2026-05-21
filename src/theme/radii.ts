export const radii = {
  inner: 14,
  card: 22,
  xl: 32,
  pill: 999,
} as const;

export const borders = {
  thin: 1.5,
  base: 2,
  thick: 2.5,
} as const;

export const shadowOffsets = {
  xs: 2,
  md: 5,
  lg: 8,
} as const;

export type Radii = typeof radii;
export type Borders = typeof borders;
export type ShadowOffsets = typeof shadowOffsets;
