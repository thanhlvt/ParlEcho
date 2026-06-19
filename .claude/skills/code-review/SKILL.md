---
name: code-review
description: Checklist các gotcha đặc thù của ParlEcho cần soát lại khi review thay đổi (audio singleton, RLS/Storage độc lập, GRANT, marker protocol, screen time mid-sentence, RPC atomic, PIN hashing). Dùng khi review PR/diff trong repo này.
---

# Code review checklist (đặc thù ParlEcho)

Dùng checklist này khi review thay đổi liên quan các vùng nhạy cảm dưới
đây. Chi tiết đầy đủ từng quy tắc xem ở skill tương ứng (`app-code`,
`db-schema`, `edge-functions`).

## Audio (app)

- [ ] Mọi chỗ phát audio mới (`AudioPlayer` hoặc `expo-speech`) gọi
      `stopActiveAudio()` trước khi tạo, rồi `registerActiveAudio()`/
      `registerActiveSpeech()` ngay sau.
- [ ] Khi player bị huỷ/unmount có gọi `clearActiveAudio()`/
      `clearActiveSpeech()` để không rò singleton state.

## Database / RLS / Storage

- [ ] Thay đổi schema có sửa CẢ `schema.sql` VÀ `supabase/kid_mode.sql`
      (idempotent) trong cùng commit.
- [ ] Update số dư/cộng dồn (biscuit, điểm...) qua RPC atomic
      (`UPDATE ... WHERE <điều kiện>` + check `ROW_COUNT`), không phải
      check-rồi-update riêng lẻ từ client JS (race condition).
- [ ] Bucket Storage mới/sửa có policy riêng trên `storage.objects`,
      KHÔNG chỉ policy trên bảng tham chiếu — cả insert và delete.
- [ ] Policy RLS có đi kèm GRANT tương ứng (`insert`/`update`/`delete` cho
      role `authenticated`) — thiếu GRANT thì lệnh thất bại dù policy đúng.

## Edge Functions

- [ ] `pronounce` không gọi LLM để chấm điểm — chỉ Levenshtein cục bộ.
- [ ] `/chat` corrections chỉ giữ lại nếu cụm từ lỗi xuất hiện thật trong
      message gần nhất của user.
- [ ] Marker (`STEP_DONE`/`OFFTOPIC`) là nguồn duy nhất báo tiến trình —
      không thêm heuristic suy đoán phía client.
- [ ] `image-moderation` mặc định `is_safe: false` khi không parse được
      JSON (fail-closed, không fail-open).

## Kid Mode UX-critical

- [ ] Không cắt phiên Guided Conversation/Image Exploration giữa câu khi
      hết giờ chơi — phải đợi AI hoàn thành lượt nói hiện tại (hoặc
      timeout fallback).
- [ ] `Switch` (React Native) set state đồng bộ trong `onValueChange`,
      không `await` network trước khi set (tránh nháy lại do animate).
- [ ] PIN phụ huynh không bao giờ lưu/so sánh plaintext — luôn hash
      SHA-256 trước khi gửi lên DB hoặc so sánh.
- [ ] `LiveClient.sendImageTurn()` không gọi trước khi server xác nhận
      `setupComplete` thật (dù có queue, không tự ý đổi thứ tự).
