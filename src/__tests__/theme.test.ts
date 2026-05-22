import {
  theme,
  colors,
  fontFamily,
  typeScale,
  spacing,
  radii,
  borders,
  shadowOffsets,
} from '../theme';

describe('theme design system', () => {
  describe('colors', () => {
    const expectedColorKeys = [
      // Soft Clemson v3 canonical keys
      'paper',
      'card',
      'text',
      'textSoft',
      'tiger',
      'tigerSoft',
      'tigerDeep',
      'regalia',
      'regaliaSoft',
      'regaliaDeep',
      'mute',
      'line',
      'shadow',
      'darkBg',
      'darkBgText',
      // Legacy keys retained for backward compatibility
      'background',
      'surface',
      'clemsonOrange',
      'regaliaPurple',
      'textPrimary',
      'textSecondary',
      'success',
      'streakGold',
      'error',
      'border',
    ];

    it.each(expectedColorKeys)('has non-empty color value for "%s"', key => {
      const value = colors[key as keyof typeof colors];
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(colors)).toBe(true);
    });
  });

  describe('fontFamily', () => {
    const expectedFontKeys = [
      'display',
      'body',
      'mono',
      'heading',
    ];

    it.each(expectedFontKeys)(
      'has non-empty font family for "%s"',
      key => {
        const value = fontFamily[key as keyof typeof fontFamily];
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      },
    );
  });

  describe('typeScale', () => {
    const expectedScaleKeys = [
      'display01',
      'display02',
      'display03',
      'label',
      'h2',
      'body',
      'caption',
    ];

    it.each(expectedScaleKeys)(
      'has fontSize and lineHeight for "%s"',
      key => {
        const entry = typeScale[key as keyof typeof typeScale];
        expect(typeof entry.fontSize).toBe('number');
        expect(entry.fontSize).toBeGreaterThan(0);
        expect(typeof entry.lineHeight).toBe('number');
        expect(entry.lineHeight).toBeGreaterThan(0);
      },
    );
  });

  describe('spacing', () => {
    const expectedSpacingKeys = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'];

    it.each(expectedSpacingKeys)(
      'has positive number for "%s"',
      key => {
        const value = spacing[key as keyof typeof spacing];
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      },
    );

    it('uses a 4px base scale', () => {
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(16);
      expect(spacing.lg).toBe(24);
      expect(spacing.xl).toBe(32);
      expect(spacing.xxl).toBe(48);
    });
  });

  describe('radii', () => {
    it.each(['inner', 'card', 'xl', 'pill'])(
      'has positive number for "%s"',
      key => {
        const value = radii[key as keyof typeof radii];
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      },
    );
  });

  describe('borders', () => {
    it.each(['thin', 'base', 'thick'])(
      'has positive number for "%s"',
      key => {
        const value = borders[key as keyof typeof borders];
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      },
    );
  });

  describe('shadowOffsets', () => {
    it.each(['xs', 'md', 'lg'])('has positive number for "%s"', key => {
      const value = shadowOffsets[key as keyof typeof shadowOffsets];
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    });
  });

  describe('theme combined object', () => {
    it('exposes colors, fontFamily, typeScale, spacing, radii, borders, shadowOffsets', () => {
      expect(theme.colors).toBe(colors);
      expect(theme.fontFamily).toBe(fontFamily);
      expect(theme.typeScale).toBe(typeScale);
      expect(theme.spacing).toBe(spacing);
      expect(theme.radii).toBe(radii);
      expect(theme.borders).toBe(borders);
      expect(theme.shadowOffsets).toBe(shadowOffsets);
    });
  });
});
