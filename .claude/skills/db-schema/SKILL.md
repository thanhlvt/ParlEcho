---
name: db-schema
description: Quy ước schema Postgres/Supabase của ParlEcho — danh sách bảng, RLS, RPC atomic, quy ước migration song song schema.sql/kid_mode.sql, RLS Storage độc lập với RLS bảng. Dùng khi viết/sửa schema.sql, supabase/kid_mode.sql, grants.sql.
---

# Database (Supabase Postgres)

## Quy ước file

- `schema.sql`: canonical, dùng để tạo DB mới từ đầu.
- `supabase/kid_mode.sql`: migration **idempotent** áp lên DB đang chạy
  (mọi câu lệnh dùng `if not exists`/`on conflict do nothing`/`add column
if not exists`, có thể chạy lại nhiều lần an toàn).
- **Mọi thay đổi schema phải sửa CẢ HAI file** trong cùng lần thay đổi —
  `schema.sql` để DB mới tạo ra đúng từ đầu, `kid_mode.sql` để áp lên DB
  đang chạy (apply bằng `npx supabase db query --linked --file
supabase/kid_mode.sql` hoặc chạy trong SQL Editor).
- `grants.sql`, `seed_*.sql`: GRANT bổ sung + dữ liệu seed cho nội dung
  tĩnh (scenario/scenario_lines của adult).

## Danh sách bảng

**Nội dung tĩnh** (ai đăng nhập cũng đọc được, không ghi qua RLS thường):
`languages`, `scenario_groups`, `scenarios` (`audience: 'adult'|'child'`
phân loại nội dung), `scenario_lines`, `companions` (bear/cat/robot —
`personality` dùng cho system prompt Gemini), `missions`, `mission_steps`,
`stickers`, `costumes` (`price_biscuits` — giá mua bằng biscuit, xem
"Costume shop" dưới), `priority_vocab` (owner-only, không phải tĩnh — phụ
huynh tự thêm).

**Dữ liệu user** (RLS owner-only qua `auth.uid()`): `profiles`,
`conversations`, `messages`, `pronunciation_attempts`, `user_progress`,
`daily_activity`, `daily_kid_usage`, `saved_items`, `user_stickers`,
`user_costumes`, `companion_costume_state` (xem "Costume shop" dưới),
`mission_results`, `exploration_results`,
`exploration_images` (ngoại lệ: SELECT mở rộng cho ảnh `is_approved =
true` bất kể chủ sở hữu).

## `profiles` — các cột liên quan Kid Mode

`is_kid_mode`, `parent_pin` (hash SHA-256, KHÔNG bao giờ lưu plaintext),
`companion_id`, `screen_time_limit_minutes` (mặc định 20), `child_name`,
`child_level`, `biscuit_count` (mặc định 0, cộng dồn qua RPC
`increment_biscuits`).

Trang phục đang mặc KHÔNG còn nằm ở `profiles` — xem `companion_costume_state`
trong "Costume shop" dưới (lưu riêng theo từng companion, tránh lẫn khi đổi
companion).

## `conversations` / `messages`

`conversations.mode` (enum `conversation_mode`) có giá trị Kid Mode:
`kid_guided`, `kid_exploration` (ngoài các giá trị adult:
`roleplay`/`exam`/`journaling`/`code_switch`/`free_talk`).
`conversations.mission_id` gắn phiên Guided Conversation với `missions`.
`conversations.summary` (jsonb) — adult: `{recurring_errors,
words_to_learn}`; Kid Guided: `{avg_pronunciation, offtopic_turns:
number[]}` (danh sách `sort_order` lượt AI bị đánh dấu lạc đề, dùng để
highlight transcript ở Parent Dashboard).

## RPC functions (atomic, tránh race khi update qua Supabase JS client)

- **`increment_biscuits(p_user_id, p_amount)`**: `update profiles set
biscuit_count = biscuit_count + p_amount where id = p_user_id`. Dùng vì
  client JS không tự làm được `column = column + N` an toàn dưới race.
- **`purchase_costume(p_user_id, p_costume_id)`**: atomic mua costume — trừ
  `biscuit_count` chỉ khi đủ tiền trong điều kiện `WHERE` của `UPDATE`
  (không phải check-rồi-update riêng lẻ, để tránh race double-spend), rồi
  mới insert `user_costumes`; chặn mua lại costume đã có ngay từ đầu hàm
  để không trừ tiền oan.
- Cả hai dùng **SECURITY INVOKER** (mặc định) để RLS "own profile" / "own
  user_costumes" vẫn áp dụng bình thường — chỉ tác động lên dữ liệu của
  chính người gọi.

## Costume shop

`costumes.price_biscuits` tăng dần theo `sort_order` (20, 30, 40...). Trẻ
tự mua bằng biscuit đã gom ở `(kid)/costumes.tsx` qua RPC
`purchase_costume` (xem trên) — costume KHÔNG tự mở theo số sao đạt được,
chỉ sticker mới mở tự động khi hoàn thành mission (qua `sticker_pool`).
Costume đã mua có thể "mặc" — upsert vào `companion_costume_state`
(PK `(user_id, companion_id)`, FK `active_costume_id → costumes.id`), chỉ 1
costume mặc cùng lúc CHO MỖI companion; chạm lại costume đang mặc để cởi ra
(xoá row đó, không phải set null — không có cột nullable). Lưu riêng theo
`companion_id` nên đổi companion không "mượn" costume của companion khác và
companion cũ vẫn nhớ costume đã chọn khi đổi lại. Catalog costume dùng 1 bộ
16 emoji RIÊNG cho mỗi companion (không trùng nhau giữa bear/cat/robot,
xem `COSTUME_LAYOUT` trong `companionAssets.ts`) + 3 costume gốc riêng theo
companion (🧣 bear/🎀 cat/🦸 robot) — `Companion.tsx` khớp vị trí hiển thị
theo **emoji**, xem skill `app-code`.

## Image Exploration / moderation

`exploration_images.storage_path` trong bucket public
`exploration-images`; chỉ ảnh `is_approved = true` mới đọc được qua RLS
bảng (trừ chủ ảnh luôn đọc được ảnh của mình để theo dõi trạng thái
duyệt). Duyệt bởi Edge Function `image-moderation` (xem skill
`edge-functions`), kết quả lưu vào `safesearch_result` jsonb.

`exploration_results` lưu kết quả mỗi lần khám phá xong 1 ảnh
(`exploration_image_id`, `stars` 0-3, `conversation_id`) — tương tự
`mission_results` nhưng theo ảnh thay vì mission; `(kid)/exploration.tsx`
dùng max(stars) theo `exploration_image_id` để hiện số sao đã đạt trên
mỗi ảnh ở lưới chọn.

## RLS & Storage — 2 lớp kiểm tra độc lập

- **Policy RLS cho Supabase Storage là độc lập với policy RLS của bảng** —
  thêm policy insert ở bảng (vd. `exploration_images`) không tự động cho
  phép upload file vào bucket tương ứng; phải thêm policy riêng trên
  `storage.objects` scope theo
  `(storage.foldername(name))[1] = auth.uid()::text`. Thiếu policy này
  khiến upload luôn báo lỗi dù code app đúng. Tương tự cho delete: cần cả
  policy delete trên bảng (owner-only) VÀ trên `storage.objects` (scope
  cùng path) — thiếu 1 trong 2 sẽ xoá được record DB nhưng để rác file
  trong Storage, hoặc ngược lại.
- **RLS policy KHÔNG đủ để Postgres cho phép câu lệnh chạy tới** — bảng
  còn cần GRANT ở cấp lệnh (`grant delete/insert/update on table ... to
authenticated`). Thiếu GRANT khiến lệnh luôn thất bại dù policy đúng —
  đây là lớp kiểm tra độc lập với RLS policy.
