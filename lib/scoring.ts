import { DailyActivity } from './types';

export function getScoreColor(score: number | null, colors: any): string {
  if (score == null) return colors.textMuted;
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.warning;
  return colors.error;
}

// Analytics: điểm trung bình + điểm cao nhất trong các ngày có chấm phát âm
// (avg_pronunciation_score == null nghĩa là ngày đó chưa có phiên nào được chấm).
export function calculateScoreStats(activities: DailyActivity[]): { avg: number; max: number } {
  const scoredActivities = activities.filter((act) => act.avg_pronunciation_score !== null);
  if (scoredActivities.length === 0) return { avg: 0, max: 0 };

  const avg = Math.round(
    scoredActivities.reduce((sum, act) => sum + (act.avg_pronunciation_score ?? 0), 0) /
      scoredActivities.length,
  );
  const max = Math.max(...scoredActivities.map((act) => act.avg_pronunciation_score ?? 0));
  return { avg, max };
}

// Kid Mode — Guided Conversation mission: 3 sao độc lập (hoàn thành bước, phát âm đạt
// ngưỡng, không dùng hint). Xem useMissionSession.ts awardMissionResult().
export function calculateMissionStars(params: {
  completed: boolean;
  avgPronunciation: number | null;
  usedHint: boolean;
  pronunciationThreshold?: number;
}): number {
  const { completed, avgPronunciation, usedHint, pronunciationThreshold = 70 } = params;
  const starCompleted = completed;
  const starPronunciation = avgPronunciation !== null && avgPronunciation >= pronunciationThreshold;
  const starNoHint = !usedHint;
  return [starCompleted, starPronunciation, starNoHint].filter(Boolean).length;
}

// Kid Mode — Image Exploration mission: star 1 luôn có khi hoàn thành phiên, star 2/3 theo
// 2 ngưỡng điểm phát âm trung bình. Xem useExplorationSession.ts.
export function calculateExplorationStars(params: {
  avgPronunciation: number | null;
  goodThreshold?: number;
  excellentThreshold?: number;
}): number {
  const { avgPronunciation, goodThreshold = 70, excellentThreshold = 85 } = params;
  const starGood = avgPronunciation !== null && avgPronunciation >= goodThreshold;
  const starExcellent = avgPronunciation !== null && avgPronunciation >= excellentThreshold;
  return 1 + (starGood ? 1 : 0) + (starExcellent ? 1 : 0);
}
