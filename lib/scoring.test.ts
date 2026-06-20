import {
  getScoreColor,
  calculateScoreStats,
  calculateMissionStars,
  calculateExplorationStars,
} from './scoring';
import { DailyActivity } from './types';

const colors = {
  textMuted: 'muted',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

function activity(score: number | null): DailyActivity {
  return {
    id: 'x',
    user_id: 'u1',
    activity_date: '2024-01-01',
    minutes_practiced: 0,
    lines_practiced: 0,
    conversations_count: 0,
    avg_pronunciation_score: score,
  } as DailyActivity;
}

describe('getScoreColor', () => {
  it('returns textMuted for null', () => {
    expect(getScoreColor(null, colors)).toBe('muted');
  });
  it('returns success for >= 80', () => {
    expect(getScoreColor(80, colors)).toBe('success');
    expect(getScoreColor(100, colors)).toBe('success');
  });
  it('returns warning for 60-79', () => {
    expect(getScoreColor(60, colors)).toBe('warning');
    expect(getScoreColor(79, colors)).toBe('warning');
  });
  it('returns error below 60', () => {
    expect(getScoreColor(0, colors)).toBe('error');
    expect(getScoreColor(59, colors)).toBe('error');
  });
});

describe('calculateScoreStats', () => {
  it('returns 0/0 when there are no scored activities', () => {
    expect(calculateScoreStats([])).toEqual({ avg: 0, max: 0 });
    expect(calculateScoreStats([activity(null)])).toEqual({ avg: 0, max: 0 });
  });

  it('computes avg and max ignoring null entries', () => {
    const activities = [activity(80), activity(null), activity(60)];
    expect(calculateScoreStats(activities)).toEqual({ avg: 70, max: 80 });
  });

  it('rounds the average', () => {
    const activities = [activity(70), activity(71), activity(71)];
    // sum=212, /3=70.66 -> 71
    expect(calculateScoreStats(activities).avg).toBe(71);
  });
});

describe('calculateMissionStars', () => {
  it('awards 0 stars when nothing is satisfied', () => {
    expect(
      calculateMissionStars({ completed: false, avgPronunciation: null, usedHint: true }),
    ).toBe(0);
  });

  it('awards 1 star for completion only', () => {
    expect(
      calculateMissionStars({ completed: true, avgPronunciation: null, usedHint: true }),
    ).toBe(1);
  });

  it('awards 2 stars for completion + no hint', () => {
    expect(
      calculateMissionStars({ completed: true, avgPronunciation: null, usedHint: false }),
    ).toBe(2);
  });

  it('awards 3 stars when completed, pronunciation above threshold, and no hint used', () => {
    expect(
      calculateMissionStars({ completed: true, avgPronunciation: 75, usedHint: false }),
    ).toBe(3);
  });

  it('does not award the pronunciation star below the threshold', () => {
    expect(
      calculateMissionStars({
        completed: true,
        avgPronunciation: 69,
        usedHint: false,
        pronunciationThreshold: 70,
      }),
    ).toBe(2);
  });
});

describe('calculateExplorationStars', () => {
  it('always awards at least 1 star', () => {
    expect(calculateExplorationStars({ avgPronunciation: null })).toBe(1);
  });

  it('awards 1 star below the good threshold', () => {
    expect(calculateExplorationStars({ avgPronunciation: 50 })).toBe(1);
  });

  it('awards 2 stars between the good and excellent thresholds', () => {
    expect(calculateExplorationStars({ avgPronunciation: 75 })).toBe(2);
  });

  it('awards 3 stars at or above the excellent threshold', () => {
    expect(calculateExplorationStars({ avgPronunciation: 90 })).toBe(3);
  });

  it('respects custom thresholds', () => {
    expect(
      calculateExplorationStars({
        avgPronunciation: 95,
        goodThreshold: 50,
        excellentThreshold: 90,
      }),
    ).toBe(3);
  });
});
