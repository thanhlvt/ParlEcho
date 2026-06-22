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

// Kid Mode — Guided Conversation mission: chưa hoàn thành hết các bước thì 0 sao, không xét
// tới phát âm/hint. Hoàn thành rồi mới cộng thêm phát âm đạt ngưỡng + không dùng hint.
// Xem useMissionSession.ts awardMissionResult().
export function calculateMissionStars(params: {
  completed: boolean;
  avgPronunciation: number | null;
  usedHint: boolean;
  pronunciationThreshold?: number;
}): number {
  const { completed, avgPronunciation, usedHint, pronunciationThreshold = 85 } = params;
  if (!completed) return 0;
  const starPronunciation = avgPronunciation !== null && avgPronunciation >= pronunciationThreshold;
  const starNoHint = !usedHint;
  return 1 + (starPronunciation ? 1 : 0) + (starNoHint ? 1 : 0);
}

// Kid Mode — Image Exploration mission: chưa trả lời hết câu hỏi của AI (AI chưa nói xong lời
// tạm biệt kết thúc hoạt động) thì 0 sao. Hoàn thành mới được star 1, rồi cộng thêm star 2/3
// theo 2 ngưỡng điểm phát âm trung bình. Xem useExplorationSession.ts.
export function calculateExplorationStars(params: {
  completed: boolean;
  avgPronunciation: number | null;
  goodThreshold?: number;
  excellentThreshold?: number;
}): number {
  const { completed, avgPronunciation, goodThreshold = 70, excellentThreshold = 85 } = params;
  if (!completed) return 0;
  const starGood = avgPronunciation !== null && avgPronunciation >= goodThreshold;
  const starExcellent = avgPronunciation !== null && avgPronunciation >= excellentThreshold;
  return 1 + (starGood ? 1 : 0) + (starExcellent ? 1 : 0);
}

// Lọc bỏ gợi ý sửa (word + nội dung tip) đã hiện ở 1 danh sách TRƯỚC trong cùng chuỗi —
// tránh lặp lại y nguyên 1 lời khuyên nhiều lần khi xem nhiều câu/lượt liên tiếp (vd. Practice
// nhiều dòng, Live/Kid review nhiều lượt nói). `itemLists` phải theo đúng thứ tự hiển thị trên
// màn hình; giữ nguyên lần xuất hiện ĐẦU TIÊN, bỏ các lần lặp lại sau (cùng word VÀ cùng tip —
// cùng word nhưng tip khác do lỗi khác lần này vẫn được giữ).
export function dedupeFlaggedWordsAcross<T>(itemLists: T[][], getKey: (item: T) => string): T[][] {
  const seen = new Set<string>();
  return itemLists.map((list) =>
    list.filter((item) => {
      const key = getKey(item).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}
