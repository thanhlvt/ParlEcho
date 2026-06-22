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
  /** Lật icon theo chiều dọc (scaleY: -1). Mặc định false. */
  flip?: boolean;
  /** Số bản vẽ cùng 1 emoji (vd 2 bao tay/2 giày — mỗi bên 1 cái). Mặc định 1. */
  count?: number;
  /** Khi count = 2: override top/left/sizeRatio/rotate/flip cho bản sao thứ 2 — thuộc tính
   * không khai báo ở đây sẽ lấy lại từ layout chính (ví dụ chỉ đổi `left` để đặt sang bên kia). */
  second?: Partial<Omit<CostumeLayout, 'count' | 'second'>>;
}

const DEFAULT_COSTUME_LAYOUT: CostumeLayout = { top: 52, left: 50, sizeRatio: 0.4 };

// Khớp theo emoji trang phục (catalog cố định trong supabase/kid_mode.sql). Mỗi companion
// (bear/cat/robot) dùng 1 bộ 15-16 emoji RIÊNG (không trùng nhau) để trang phục không bị
// lẫn hình ảnh khi đổi companion — nhưng cùng "vị trí" trên thân (mũ/mặt/cổ/sau lưng/tay-chân)
// thì dùng layout giống nhau, chỉ icon khác.
export const COSTUME_LAYOUT: Record<string, CostumeLayout> = {
  // Đội đầu — Nón vui nhộn / Vương miện / Nón cướp biển / Vòng hoa
  '🎩': { top: -5, left: 55, sizeRatio: 0.55, rotate: 0.15 }, // bear: Nón vui nhộn
  '🧢': { top: 13, left: 38, sizeRatio: 0.55, rotate: 0.1 }, // cat: Nón vui nhộn
  '⛑️': { top: 10, left: 45, sizeRatio: 0.55 }, // robot: Nón vui nhộn
  '👑': { top: -2, left: 47, sizeRatio: 0.5 }, // bear: Vương miện
  '💎': { top: 2, left: 47, sizeRatio: 0.5, rotate: 3.1416 }, // cat: Vương miện
  '🏆': { top: 70, left: 105, sizeRatio: 0.45, rotate: 0.27 }, // robot: Cup
  '🏴‍☠️': { top: -5, left: 40, sizeRatio: 0.6, rotate: -0.2 }, // bear: Nón cướp biển
  '⚔️': { top: -4, left: 47, sizeRatio: 0.45, behind: true }, // cat: Kiếm sắt
  '🦹': { top: 0, left: 46, sizeRatio: 0.5 }, // robot: Mũ phù thủy
  '🌼': { top: 8, left: 65, sizeRatio: 0.35 }, // bear: Vòng hoa
  '🌺': { top: 8, left: 65, sizeRatio: 0.35 }, // cat: Hoa hồng
  '🌟': { top: 8, left: 75, sizeRatio: 0.35 }, // robot: Vòng sao
  // Trên mặt — Kính râm / Mặt nạ bí ẩn
  '🕶️': { top: 45, left: 46, sizeRatio: 0.55 }, // bear: Kính râm
  '🥽': { top: 26, left: 46, sizeRatio: 0.5 }, // cat: Kính bơi
  '👓': { top: 45, left: 46, sizeRatio: 0.55 }, // robot: Kính râm
  '👺': { top: 46, left: 55, sizeRatio: 0.55 }, // bear: Mặt nạ bí ẩn
  '🃏': { top: 48, left: 100, sizeRatio: 0.45, rotate: 0.5 }, // cat: Thần bài
  '👾': { top: 46, left: 55, sizeRatio: 0.65 }, // robot: Mặt nạ bí ẩn
  // Cổ/ngực — Vòng cổ lấp lánh / Huy chương / Nơ lấp lánh / trang phục gốc
  '📿': { top: 105, left: 50, sizeRatio: 0.38, behind: true }, // bear: Vòng cổ lấp lánh
  '💠': { top: 105, left: 48, sizeRatio: 0.28 }, // cat: Vòng cổ lấp lánh
  '🔗': { top: 100, left: 48, sizeRatio: 0.38, rotate: 0.75 }, // robot: Vòng cổ
  '🏅': { top: 105, left: 47, sizeRatio: 0.4, behind: true }, // bear: Huy chương
  '🥇': { top: 105, left: 47, sizeRatio: 0.4, behind: true }, // cat: Huy chương
  '🎖️': { top: 105, left: 47, sizeRatio: 0.4, behind: true }, // robot: Huy chương lấp lánh
  '🎗️': { top: 98, left: 47, sizeRatio: 0.45, behind: true }, // bear: Nơ lấp lánh
  '💫': { top: 25, left: 45, sizeRatio: 0.45, rotate: -0.8 }, // cat: Vòng hoa
  '🔧': { top: 65, left: -6, sizeRatio: 0.4, rotate: 0.3 }, // robot: Cờ lê
  '🧣': { top: 97, left: 50, sizeRatio: 0.5, behind: true }, // bear: trang phục gốc (Khăn len ấm)
  '🎀': { top: 101, left: 47, sizeRatio: 0.4 }, // cat: trang phục gốc (Nơ xinh)
  // Sau lưng/bên cạnh (lộ ra hai bên thân nhân vật) — Balo / Cánh thiên thần / Áo choàng / Đôi cánh bướm
  '🎒': { top: 25, left: 25, sizeRatio: 0.7, behind: true }, // bear: Balo phiêu lưu
  '👜': { top: 85, left: 100, sizeRatio: 0.4, behind: true }, // cat: Túi xách
  '🧰': { top: 85, left: 109, sizeRatio: 0.4, behind: true }, // robot: Hộp phiêu lưu
  '🪽': { top: 55, left: 98, sizeRatio: 0.35, behind: true, count: 2, second: { left: -3, flip: true } }, // bear: Cánh thiên thần
  '🧚': { top: 48, left: 98, sizeRatio: 0.5, behind: true }, // cat: Thiên thần
  '🚀': { top: 40, left: 100, sizeRatio: 0.4, behind: true, rotate: -0.6 }, // robot: Tên lửa
  '🧙': { top: 5, left: 45, sizeRatio: 0.95, behind: true }, // bear: Áo choàng phù thủy
  '🪄': { top: 60, left: 100, sizeRatio: 0.45, behind: true, rotate: -0.3 }, // cat: Gậy phù thủy
  '🛸': { top: 10, left: 75, sizeRatio: 0.5, behind: true, rotate: -0.3 }, // robot: UFO
  '🦸': { top: 0, left: 46, sizeRatio: 0.5 }, // robot: Mũ anh hùng
  '🦋': { top: 20, left: 55, sizeRatio: 0.8, behind: true }, // bear: Đôi cánh bướm
  '🐉': { top: 55, left: 100, sizeRatio: 0.45, behind: true }, // cat: Rồng nhỏ
  // Tay/chân — Bao tay ấm / Giày boots / Dù che nắng
  '🥊': { top: 65, left: -4, sizeRatio: 0.32, rotate: -0.3, count: 2, second: { left: 99, rotate: 0.3, flip: true } }, // bear: Bao tay ấm
  '🧦': { top: 110, left: 40, sizeRatio: 0.4 }, // cat: Đôi vớ
  '🦾': { top: 75, left: -6, sizeRatio: 0.32, count: 2, second: { left: 100, flip: true } }, // robot: Tay robot
  '👢': { top: 107, left: 62, sizeRatio: 0.32, count: 2, second: { left: 33, flip: true } }, // bear: Giày boots
  '👡': { top: 110, left: 72, sizeRatio: 0.32, count: 2, second: { left: 25, flip: true } }, // cat: Guốc mộc
  '🦿': { top: 110, left: 25, sizeRatio: 0.32, count: 2, second: { left: 72, flip: true } }, // robot: Chân robot
  '☂️': { top: 2, left: 80, sizeRatio: 0.6, rotate: 0.15 }, // bear: Dù che nắng
  '🌂': { top: 2, left: 70, sizeRatio: 0.55, rotate: 0.15 + 3.14 }, // cat: Dù che nắng
  '🛡️': { top: 30, left: 90, sizeRatio: 0.5, rotate: 0.25 }, // robot: Khiên che nắng
};

export function layoutForCostume(emoji: string | null | undefined): CostumeLayout | null {
  if (!emoji) return null;
  return COSTUME_LAYOUT[emoji] ?? DEFAULT_COSTUME_LAYOUT;
}
