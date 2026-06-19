// Lớp trình bày cho nhân vật đồng hành (Kid Mode).
// HIỆN TẠI dùng emoji placeholder để chạy được ngay không cần asset art.
// Sau này thay bằng Lottie/sprite: chỉ cần đổi map ở đây, không đụng data flow.

export type CompanionExpression = 'idle' | 'happy' | 'surprised' | 'cheering' | 'thinking';

// Emoji "thân" nhân vật theo id (khớp bảng companions)
export const COMPANION_BASE_EMOJI: Record<string, string> = {
  bear: '🐻',
  cat: '🐱',
  robot: '🤖',
};

export const FALLBACK_BASE_EMOJI = '🧸';

// Huy hiệu cảm xúc chèn góc trên (null = không hiển thị)
export const EXPRESSION_BADGE: Record<CompanionExpression, string | null> = {
  idle: null,
  happy: '💛',
  surprised: '❗',
  cheering: '🎉',
  thinking: '💭',
};

export function baseEmojiFor(companionId: string | null | undefined): string {
  if (!companionId) return FALLBACK_BASE_EMOJI;
  return COMPANION_BASE_EMOJI[companionId] ?? FALLBACK_BASE_EMOJI;
}
