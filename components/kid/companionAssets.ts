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

// Vị trí hiển thị trang phục đang mặc, tương đối so với nhân vật (Companion).
// `top`/`left` là % của khung companion (size x size), neo vào tâm icon trang phục
// (Companion.tsx tự trừ nửa kích thước icon để căn giữa đúng điểm neo).
// `behind: true` = vẽ phía sau thân nhân vật (cánh, áo choàng, balo) để lộ ra hai bên/sau lưng.
export interface CostumeLayout {
  top: number;
  left: number;
  sizeRatio: number; // kích thước icon trang phục so với size của Companion
  behind?: boolean;
  rotate?: number; // radian, lệch tĩnh (ví dụ dù cầm nghiêng)
}

const DEFAULT_COSTUME_LAYOUT: CostumeLayout = { top: 52, left: 50, sizeRatio: 0.4 };

// Khớp theo emoji trang phục (catalog cố định trong supabase/kid_mode.sql) — không theo id
// vì id khác nhau giữa 3 companion nhưng dùng chung 1 bộ 16 loại trang phục + 3 loại gốc.
export const COSTUME_LAYOUT: Record<string, CostumeLayout> = {
  // Đội đầu
  '🎩': { top: -10, left: 50, sizeRatio: 0.55 },
  '👑': { top: -12, left: 50, sizeRatio: 0.55 },
  '🏴‍☠️': { top: -10, left: 50, sizeRatio: 0.6 },
  '🌼': { top: -8, left: 50, sizeRatio: 0.5 },
  // Trên mặt
  '🕶️': { top: 26, left: 50, sizeRatio: 0.5 },
  '🎭': { top: 24, left: 50, sizeRatio: 0.55 },
  // Cổ/ngực
  '📿': { top: 55, left: 50, sizeRatio: 0.38 },
  '🏅': { top: 58, left: 50, sizeRatio: 0.4 },
  '🎗️': { top: 50, left: 50, sizeRatio: 0.4 },
  '🧣': { top: 48, left: 50, sizeRatio: 0.45 },
  '🎀': { top: 50, left: 50, sizeRatio: 0.4 },
  // Sau lưng/bên cạnh (lộ ra hai bên thân nhân vật)
  '🎒': { top: 35, left: 50, sizeRatio: 0.7, behind: true },
  '🪽': { top: 28, left: 50, sizeRatio: 1.0, behind: true },
  '🧙': { top: 30, left: 50, sizeRatio: 0.85, behind: true },
  '🦸': { top: 30, left: 50, sizeRatio: 0.85, behind: true },
  '🦋': { top: 25, left: 50, sizeRatio: 0.9, behind: true },
  // Tay/chân
  '🧤': { top: 58, left: 18, sizeRatio: 0.32 },
  '👢': { top: 92, left: 50, sizeRatio: 0.4 },
  '☂️': { top: 2, left: 80, sizeRatio: 0.6, rotate: 0.15 },
};

export function layoutForCostume(emoji: string | null | undefined): CostumeLayout | null {
  if (!emoji) return null;
  return COSTUME_LAYOUT[emoji] ?? DEFAULT_COSTUME_LAYOUT;
}
