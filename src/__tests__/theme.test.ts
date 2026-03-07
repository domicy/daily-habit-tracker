import {theme, colors, fontFamily, typeScale, spacing} from '../theme';

describe('theme design system', () => {
  describe('colors', () => {
    const expectedColorKeys = [
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
      'heading',
      'headingFallback',
      'body',
      'bodyFallback',
      'mono',
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
    const expectedScaleKeys = ['h1', 'h2', 'body', 'caption', 'streak'];

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

  describe('theme combined object', () => {
    it('exposes colors, fontFamily, typeScale, and spacing', () => {
      expect(theme.colors).toBe(colors);
      expect(theme.fontFamily).toBe(fontFamily);
      expect(theme.typeScale).toBe(typeScale);
      expect(theme.spacing).toBe(spacing);
    });
  });
});
