import { supabase } from './supabase';

// Quy đổi sao → bánh biscuit khi hoàn thành mission/exploration (Reward System).
export const BISCUITS_BY_STARS: Record<number, number> = { 0: 0, 1: 1, 2: 3, 3: 5 };

// Tăng biscuit_count qua RPC `increment_biscuits` (atomic, tránh race khi update trực tiếp
// qua Supabase JS client).
async function incrementBiscuits(userId: string, amount: number): Promise<boolean> {
  const { error } = await supabase.rpc('increment_biscuits', {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.warn('[biscuits] increment_biscuits error:', error);
    return false;
  }
  return true;
}

// Trả về số biscuit thưởng (0 nếu stars=0 hoặc lỗi).
export async function awardBiscuits(userId: string, stars: number): Promise<number> {
  const amount = BISCUITS_BY_STARS[stars] ?? 0;
  if (amount <= 0) return 0;
  return (await incrementBiscuits(userId, amount)) ? amount : 0;
}

// Vòng quay may mắn — đạt tròn 3 sao thì được quay thêm 1 lần, thưởng ngẫu nhiên 1-5 biscuit.
export async function spinLuckyWheel(userId: string): Promise<number> {
  const amount = Math.floor(Math.random() * 5) + 1;
  return (await incrementBiscuits(userId, amount)) ? amount : 0;
}

// Mua costume bằng biscuit (cửa hàng trong Tủ trang phục) — qua RPC `purchase_costume`
// (atomic: trừ biscuit_count + insert user_costumes trong cùng 1 transaction phía DB,
// tránh client tự kiểm tra số dư rồi update riêng lẻ dưới race).
export async function purchaseCostume(userId: string, costumeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('purchase_costume', {
    p_user_id: userId,
    p_costume_id: costumeId,
  });
  if (error) {
    console.warn('[biscuits] purchase_costume error:', error);
    return false;
  }
  return Boolean(data);
}
