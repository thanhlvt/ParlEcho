import { toLocalDateKey, buildWeekData, computeStreak } from './streak';
import { DailyActivity } from './types';

function activity(date: string, overrides: Partial<DailyActivity> = {}): DailyActivity {
  return {
    id: date,
    user_id: 'u1',
    activity_date: date,
    minutes_practiced: 0,
    lines_practiced: 0,
    conversations_count: 0,
    avg_pronunciation_score: null,
    ...overrides,
  } as DailyActivity;
}

describe('toLocalDateKey', () => {
  it('formats using local Y-M-D, not UTC', () => {
    // 2024-01-05 23:30 local time — toISOString() would shift this to 2024-01-06 in UTC+ zones.
    const d = new Date(2024, 0, 5, 23, 30);
    expect(toLocalDateKey(d)).toBe('2024-01-05');
  });

  it('pads single-digit month and day', () => {
    expect(toLocalDateKey(new Date(2024, 2, 7))).toBe('2024-03-07');
  });
});

describe('computeStreak', () => {
  const today = new Date(2024, 5, 10); // 2024-06-10

  it('returns 0 when there is no activity', () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it('counts a single day streak for today', () => {
    expect(computeStreak([activity('2024-06-10')], today)).toBe(1);
  });

  it('still counts a streak when today has no activity yet but yesterday does', () => {
    const activities = [activity('2024-06-09'), activity('2024-06-08')];
    expect(computeStreak(activities, today)).toBe(2);
  });

  it('returns 0 when most recent activity is older than yesterday', () => {
    expect(computeStreak([activity('2024-06-07')], today)).toBe(0);
  });

  it('counts consecutive days including today', () => {
    const activities = [activity('2024-06-10'), activity('2024-06-09'), activity('2024-06-08')];
    expect(computeStreak(activities, today)).toBe(3);
  });

  it('stops at the first gap', () => {
    const activities = [
      activity('2024-06-10'),
      activity('2024-06-09'),
      activity('2024-06-07'), // gap at 06-08
    ];
    expect(computeStreak(activities, today)).toBe(2);
  });
});

describe('buildWeekData', () => {
  const today = new Date(2024, 5, 10); // Monday 2024-06-10

  it('returns 7 days ending in today', () => {
    const week = buildWeekData([], today);
    expect(week).toHaveLength(7);
    expect(week[6].isToday).toBe(true);
    expect(week.slice(0, 6).every((d) => d.isToday === false)).toBe(true);
  });

  it('fills lines_practiced from matching activity, defaults to 0 otherwise', () => {
    const activities = [activity('2024-06-10', { lines_practiced: 5 })];
    const week = buildWeekData(activities, today);
    expect(week[6].lines).toBe(5);
    expect(week[0].lines).toBe(0);
  });
});
