import { DailyActivity } from './types';

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// activity_date is stored as a local calendar day (YYYY-MM-DD) — must format
// using local Y/M/D, not toISOString() (UTC), otherwise dates shift by one
// day for any timezone ahead of UTC (e.g. Vietnam, UTC+7).
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildWeekData(activities: DailyActivity[], today: Date = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = toLocalDateKey(d);
    const act = activities.find((a) => a.activity_date === dateStr);
    return {
      label: DAY_LABELS[d.getDay()],
      lines: act?.lines_practiced ?? 0,
      isToday: i === 6,
    };
  });
}

// Dùng chung cho Home + Analytics. Đếm lùi từ HÔM NAY; nếu hôm nay chưa có hoạt động thì lùi
// thử 1 ngày trước (hôm qua) — coi như streak chưa "đứt" cho tới khi qua hết hôm nay, tránh
// hiện streak=0 ngay trước khi user kịp học hôm đó (kiểu Duolingo). Dùng local date key
// (không parse `new Date(string)` UTC) để tránh lệch ngày ở timezone UTC+ (vd Việt Nam).
export function computeStreak(activities: DailyActivity[], today: Date = new Date()): number {
  const dateSet = new Set(activities.map((a) => a.activity_date));
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);

  if (!dateSet.has(toLocalDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateSet.has(toLocalDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (dateSet.has(toLocalDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
