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

  // ─── Parity with the backend (#115) ────────────────────────────────
  //
  // The server computes the score independently in
  // backend/app/schemas.py::habit_score as `(100 * r * 2 + 16) // 32`, using
  // exact integer arithmetic. This client uses `floor((100 * r + 8) / 16)` on
  // floats. Both reduce to `floor((25r + 2) / 4)`; a drift between them would
  // make the score jump when a habit syncs, so pin the whole input space
  // rather than the four contract anchors alone.
  it('matches the backend formula across every valid rating combination', () => {
    for (let impact = 1; impact <= 5; impact++) {
      for (let friction = 1; friction <= 5; friction++) {
        for (let keystone = 1; keystone <= 5; keystone++) {
          for (let timeCost = 1; timeCost <= 5; timeCost++) {
            const raw =
              impact + (6 - friction) + keystone + (6 - timeCost) - 4;
            const backend = Math.floor((100 * raw * 2 + 16) / 32);
            expect(calculateHabitScore(impact, friction, keystone, timeCost)).toBe(
              backend,
            );
          }
        }
      }
    }
  });

  it('spans exactly 0 to 100 over the valid range', () => {
    const scores: number[] = [];
    for (let impact = 1; impact <= 5; impact++) {
      for (let friction = 1; friction <= 5; friction++) {
        for (let keystone = 1; keystone <= 5; keystone++) {
          for (let timeCost = 1; timeCost <= 5; timeCost++) {
            scores.push(calculateHabitScore(impact, friction, keystone, timeCost));
          }
        }
      }
    }
    expect(Math.min(...scores)).toBe(0);
    expect(Math.max(...scores)).toBe(100);
    expect(scores.every(Number.isInteger)).toBe(true);
  });
});
