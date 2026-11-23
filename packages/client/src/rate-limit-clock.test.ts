import { describe, expect, it } from 'vitest';
import { advanceRateLimitClock } from './rate-limit-clock';

function countEmissions(frameIntervalMs: number, durationMs: number, rateHz: number): number {
  let clock = -1;
  let emissions = 0;
  for (let time = 0; time <= durationMs; time += frameIntervalMs) {
    const next = advanceRateLimitClock(time, clock, rateHz);
    if (next !== null) {
      clock = next;
      emissions += 1;
    }
  }
  return emissions;
}

describe('advanceRateLimitClock', () => {
  it('maintains about 30 Hz when frames arrive just faster than 30 Hz', () => {
    const emissions = countEmissions(29, 10_000, 30);
    expect(emissions).toBeGreaterThanOrEqual(299);
    expect(emissions).toBeLessThanOrEqual(302);
  });

  it('limits a 60 Hz render loop to about 30 Hz', () => {
    const emissions = countEmissions(1000 / 60, 10_000, 30);
    expect(emissions).toBeGreaterThanOrEqual(299);
    expect(emissions).toBeLessThanOrEqual(302);
  });

  it('does not emit before the interval expires', () => {
    expect(advanceRateLimitClock(100, -1, 30)).toBe(100);
    expect(advanceRateLimitClock(120, 100, 30)).toBeNull();
  });

  it('skips missed intervals without requesting a burst', () => {
    const next = advanceRateLimitClock(1100, 100, 30);
    expect(next).not.toBeNull();
    expect(next!).toBeLessThanOrEqual(1100);
    expect(next!).toBeGreaterThanOrEqual(1100 - 1000 / 30);
  });

  it('recovers if the frame clock moves backwards', () => {
    expect(advanceRateLimitClock(50, 100, 30)).toBe(50);
  });

  it('rejects invalid rates and timestamps', () => {
    expect(advanceRateLimitClock(Number.NaN, -1, 30)).toBeNull();
    expect(advanceRateLimitClock(0, -1, 0)).toBeNull();
  });
});
