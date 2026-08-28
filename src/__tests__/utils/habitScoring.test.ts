import {calculateHabitScore} from '../../utils/habitScoring';

describe('calculateHabitScore', () => {
  it.each([
    [[5, 1, 5, 1], 100],
    [[3, 3, 3, 3], 50],
    [[1, 5, 1, 5], 0],
    [[4, 2, 3, 4], 56],
  ])('scores %j as %d', (ratings, expected) => {
    expect(calculateHabitScore(...(ratings as [number, number, number, number]))).toBe(expected);
  });

  it('improves with impact and keystone, and declines with friction and time cost', () => {
    const neutral = calculateHabitScore(3, 3, 3, 3);
    expect(calculateHabitScore(4, 3, 3, 3)).toBeGreaterThan(neutral);
    expect(calculateHabitScore(3, 3, 4, 3)).toBeGreaterThan(neutral);
    expect(calculateHabitScore(3, 4, 3, 3)).toBeLessThan(neutral);
    expect(calculateHabitScore(3, 3, 3, 4)).toBeLessThan(neutral);
  });
});
