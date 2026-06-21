# Plan triển khai Kid Mode + Image Exploration Mission

> Tài liệu kế hoạch. Chia 6 pha, mỗi pha ship độc lập, không phá vỡ Adult Mode.
> Quyết định đã chốt: **giữ Gemini** chấm phát âm (không Azure), **phân pha**,
> **hoãn push/email** sang hạng mục riêng.

---

## 0. Hiện trạng vs. yêu cầu

Đã khảo sát: `lib/liveClient.ts`, `components/live/useLiveSession.ts`,
`supabase/functions/live-token`, `supabase/functions/session-review`,
`lib/types.ts`, `schema.sql`, `grants.sql`, `storage_policies.sql`,
`app/(app)/_layout.tsx`.

### Tận dụng lại được
- Pipeline Live WebSocket (`LiveClient`), mic streaming + AEC, transcript
  accumulator, lưu `messages`/`conversations` — dùng lại cho cả Guided
  Conversation lẫn Image Exploration.
- `/session-review` (Claude phân tích ngữ pháp + Gemini chấm phát âm holistic) —
  tái dùng gần như nguyên vẹn.
- Bucket `recordings` (private, RLS theo `user_id`) đã sẵn cho audio con ghi.
- `STYLE_PROMPTS.children` đã có trong `live-token`.

### Khoảng trống cần xây mới

| Vùng | Hiện trạng | Cần |
|---|---|---|
| `profiles` | chỉ `name, active_language_id` | `+is_kid_mode, parent_pin, companion_id, screen_time_limit_minutes, child_name, child_level` |
| `scenarios` | không có `audience` | `+audience` (enum `adult`/`child`) |
| Mission/step | không tồn tại | bảng `missions` + `mission_steps` |
| Reward (sao/sticker/costume) | không tồn tại | bảng mới + UI |
| Companion | không tồn tại | bảng `companions` + component + assets |
| `LiveClient` | text-only; không giới hạn lượt; session 14 phút | gửi ảnh `inlineData`; per-turn 8s; session 8–10 phút; off-topic counter; mission progress |
| Kid UI / theme | chưa có | route group `(kid)` + palette Kid |
| Parent Dashboard + PIN | chưa có | màn riêng, gate PIN, upload ảnh + moderation |
| `exploration-images` bucket | chưa có | bucket public + Vision SafeSearch |
| Push/email | chưa có | **hoãn** (hạng mục riêng) |

---

## 1. Ghi chú DB quan trọng (sau khi đọc schema.sql)

- `schema.sql` nằm ở **root repo** (không phải `supabase/schema.sql` như CLAUDE.md
  ghi → **sửa CLAUDE.md ở Pha 0**). Đây là schema canonical chạy tay trong
  Supabase SQL Editor.
- Không có thư mục `migrations/`. Convention: schema.sql = nguồn chân lý +
  file SQL run-after (`grants.sql`, `storage_policies.sql`).
- **Cách áp DB mỗi pha:** cập nhật `schema.sql` (giữ canonical) **VÀ** thêm file
  ALTER idempotent riêng (vd `supabase/kid_mode.sql`) để áp lên DB đang chạy —
  vì `schema.sql` dùng `create table`/`create type` không chạy lại được.
- **Enums là Postgres `enum` thật, không phải text:**
  - `conversation_mode` enum → thêm `kid_guided`, `kid_image` bằng
    `ALTER TYPE conversation_mode ADD VALUE ...` (lưu ý: `ADD VALUE` không chạy
    trong transaction block; value mới không dùng được ngay trong cùng
    transaction).
  - `audience` làm **enum mới** `create type audience as enum ('adult','child')`.
- `conversations` cần thêm `mission_id uuid references missions(id) on delete set
  null` (nullable), giữ `scenario_id` cho luồng cũ. Image Mission cũng gắn qua
  `mission_id`.
- `profiles`: cột Kid mới có default → `handle_new_user()` trigger **không cần
  sửa**.
- RLS owner-only pattern `for all ... using (user_id = auth.uid())` → copy cho
  mọi bảng user mới + GRANT trong `grants.sql`.
- `pronunciation_attempts` có `check (scenario_line_id is not null or message_id
  is not null)` → Image Mission chấm qua `message_id`, **không cần sửa**.
- Bảng content tĩnh (`missions`, `mission_steps`, `stickers`, `costumes`,
  `companions`) theo pattern "read cho authenticated, write bằng service_role".

---

## 2. Nguyên tắc xuyên suốt

- Mỗi pha ship độc lập, không phá Adult Mode.
- Tuân thủ CLAUDE.md: `useTheme()` + `getStyles(colors)`, không inline style,
  không hardcode màu; không Redux; Supabase gọi trực tiếp; UI string tiếng Việt;
  Prettier (semi, single quote, printWidth 100).
- **Audio không phát chồng lấp:** mọi chỗ phát mới (companion voice / SFX) phải
  `stopActiveAudio()` → `registerActiveAudio(player, onStop)`, huỷ thì
  `clearActiveAudio(player)`.
- Mỗi pha đụng schema/route/nghiệp vụ → cập nhật CLAUDE.md ngay trong pha đó.

---

## Pha 0 — Nền tảng dữ liệu & Kid flag

**DB (`schema.sql` + `supabase/kid_mode.sql` idempotent):**
- `profiles`: `+ is_kid_mode boolean default false`, `parent_pin text` (hash, KHÔNG
  plaintext), `companion_id text`, `screen_time_limit_minutes int default 20`,
  `child_name text`, `child_level text default 'beginner'`.
- `create type audience as enum ('adult','child')`; `scenarios.audience audience
  default 'adult'`.
- Bảng `daily_kid_usage` (user_id, date, seconds_used) — tách khỏi
  `daily_activity` để đếm screen time riêng. RLS owner-only + GRANT.

**App:**
- Thêm field mới vào type `Profile` (`lib/types.ts`).
- `ThemeProvider`: thêm palette Kid (màu tươi, chữ to); đọc `is_kid_mode` để chọn
  theme; thêm `isKidMode` vào context.
- **RouteGuard**: `is_kid_mode=true` → vào nhánh `app/(kid)/`, chặn `(app)`.
  Quyết định kiến trúc chính: **tách route group `(kid)`** thay vì if-lồng.
- Toggle Kid Mode + đặt PIN: trong `app/(app)/profile.tsx` (Settings adult),
  **không** xuất hiện trong UI Kid.
- Sửa đường dẫn `schema.sql` trong CLAUDE.md.

**Ra khỏi pha:** bật/tắt được Kid mode, thấy Kid shell trống (chưa companion/
mission).

---

## Pha 1 — Companion (nhân vật đồng hành)

- Bảng `companions` (seed tĩnh: gấu/mèo/robot — id, name, personality, asset refs)
  + dùng `profiles.companion_id`.
- Màn chọn nhân vật lần đầu (`app/(kid)/onboarding.tsx`).
- Component `components/kid/Companion.tsx`: biểu cảm động theo state
  `idle | happy | surprised | cheering | thinking` (Lottie hoặc sprite +
  reanimated). Xuất hiện mọi màn Kid.
- Personality + tên nhân vật chuẩn bị cho system prompt (Pha 2/5): luôn xưng tên,
  không tự nhận là AI.

---

## Pha 2 — Guided Conversation (hội thoại có cấu trúc)

**DB:** `missions` (id, audience, language_id, title, topic, step_count,
sticker_pool, level) + `mission_steps` (mission_id, step_order, target_sentence,
intent). Seed mission mẫu ("Gọi món tại quán kem" 5 bước…).

**Mở rộng `LiveClient` (phần phức tạp nhất):**
- **Per-turn 8s limit:** timer reset mỗi khi `inputTranscription` đến; hết 8s →
  callback `onTurnTimeout` (companion nhắc "Thử nói lại nhé!" + hiện gợi ý câu).
  `LiveClient` hiện chưa có khái niệm "lượt" → thêm.
- **Mission progress:** system prompt nhận đủ N bước + câu mục tiêu; AI chỉ sang
  bước kế khi trẻ nói đủ ý. Cơ chế đọc tín hiệu "đã sang bước": ưu tiên function
  call / marker token trong outputTranscription để client tăng `currentStep`;
  fallback heuristic. **Prototype đầu Pha 2.**
- **Off-topic guard:** counter `offTopicStreak`; system prompt ép AI ghi nhận ≤1
  câu rồi kéo về mission; 3 lần liên tiếp → companion đổi tone + UI phóng to gợi ý.
- **Session cap 10 phút** (Guided) — tham số thay cho `SESSION_LIMIT_MINUTES` cứng.
- `live-token`: nhận `mode='kid_guided'` + mission payload để build system prompt.

**UI:** thanh tiến trình "Bước 2/5", gợi ý câu mục tiêu nhỏ, companion dẫn dắt bằng
câu hỏi đóng / 2 lựa chọn (không hỏi mở).

---

## Pha 3 — Reward System

**DB:** `stickers` (catalog theo chủ đề), `user_stickers` (đã mở), `costumes` +
`user_costumes`, `mission_results` (mission_id, stars 1–3, used_hint bool,
completed_at).
- Star = đủ bước (1) + phát âm đạt ngưỡng Gemini (1) + không dùng gợi ý (1).
- **Streak dừng chứ không reset thưởng** (bỏ lỡ ngày không trừ sticker/costume).
- Không leaderboard, không so sánh.

**UI:** animation sao bay (reanimated), Album sticker, tủ trang phục cho companion,
màn tổng kết mission.

---

## Pha 4 — Screen Time

- Bộ đếm nhỏ góc màn hình; cộng dồn vào `daily_kid_usage`.
- Còn 2 phút: companion báo trước.
- Hết giờ: kết thúc **sau lượt nói hiện tại** (không cắt giữa câu) → lưu tiến độ →
  màn tổng kết ngày.
- Giới hạn phút/ngày đặt ở Parent settings (mặc định 20).

---

## Pha 5 — Image Exploration Mission

**Mở rộng `LiveClient` gửi ảnh multimodal:**
- App fetch ảnh từ bucket `exploration-images` → resize ≤1024px + nén JPEG
  (`expo-image-manipulator`) → base64. Ảnh phải load xong **trước** khi mở WS.
- **Cách gửi ảnh (đã verify bằng spike):** sau khi nhận `setupComplete`, gửi MỘT
  `clientContent` user turn chứa `parts: [{ inlineData: { mimeType, data } },
  { text: <câu mở đầu> }]`, `turnComplete: true`. KHÔNG nhét ảnh vào setup
  message. `LiveClient` cần thêm method `sendImageTurn(base64, mimeType, text)`.
- System prompt: `question_flow` 5W1H+Why, 5–7 câu theo `level`, per-turn 8s,
  session cap **8 phút**; xử lý đúng / đúng-một-phần / sai / im lặng / lạc đề.
- `scenario_lines` **không dùng** — câu hỏi do Gemini sinh từ ảnh.
- Kết thúc: transcript + audio → `/session-review` (Claude phân tích ngữ pháp, lỗi
  lặp → `saved_items`). Tái dùng nguyên pipeline.

**Nguồn ảnh + moderation:**
- Bucket `exploration-images` (public) + RLS (`storage_policies.sql`).
- Bảng `exploration_images` (uploader, storage_path, is_approved,
  safesearch_result).
- Edge function `image-moderation` (Google Vision SafeSearch) → set `is_approved`
  trước khi cho dùng.

---

## Pha 6 — Parent Dashboard

- Gate **PIN 4 số** (so với `parent_pin` hash) — không hiện trong UI Kid.
- Xem transcript đầy đủ mỗi phiên (reuse `messages`/`conversations`), nghe lại
  audio bucket `recordings`, đánh dấu thời điểm lạc đề.
- Biểu đồ: phiên/tuần, điểm phát âm theo thời gian, mission hoàn thành, sticker
  (reuse pattern `app/(app)/analytics.tsx` + ProgressRing).
- Upload ảnh cho Image Mission (qua moderation Pha 5).
- Thêm từ vựng/câu ưu tiên → đẩy vào mission selection.
- **Push/email: hoãn** — ghi TODO trong CLAUDE.md.

---

## 3. Rủi ro & điểm prototype sớm

1. ~~**Gemini Live multimodal qua ephemeral token + constrained endpoint**~~
   **✅ ĐÃ GIẢI QUYẾT (spike `scripts/spike-live-image.mjs`).** Đã test thật:
   mint ephemeral token → mở `BidiGenerateContentConstrained` → gửi ảnh PNG đỏ
   qua `clientContent` inlineData → model trả lời đúng "Red." Kết luận:
   - Ảnh gửi qua `clientContent.turns[].parts[]` dạng
     `{ inlineData: { mimeType: 'image/png'|'image/jpeg', data: base64 } }` +
     part text, `turnComplete: true`. Gửi **sau** khi nhận `setupComplete`,
     **không** nhét vào setup message.
   - Endpoint constrained/ephemeral **không chặn** image input.
   - Model `models/gemini-3.1-flash-live-preview` (giống live-token hiện tại).
   - Audio output đã được chứng minh bởi Live adult hiện hành (cùng model+endpoint).
2. ~~**Phát hiện "đã sang bước"** (Guided)~~ **✅ ĐÃ GIẢI QUYẾT.** Nay dùng
   FUNCTION CALL `mark_step_complete`/`report_off_topic` (BLOCKING) thay cho
   marker token. Lý do đổi: marker `[STEP_DONE]`/`[OFFTOPIC]` (bản đầu) bị model
   đọc thành tiếng vì output chỉ là AUDIO → khó hiểu cho trẻ. Tool call đi qua
   kênh riêng nên không bị đọc. System prompt (`live-token`) yêu cầu AI gọi tool;
   `LiveClient` khai báo `functionDeclarations` ở setup, nhận `toolCall` rồi gửi
   `toolResponse` đồng bộ (`id` khớp) để model nói tiếp. Giữ lưới an toàn
   reminder/force-advance phòng model quên gọi tool.
3. **Per-turn 8s + AEC gating:** `LiveClient` đã có cơ chế `aiSpeaking` mute mic
   phức tạp; turn-timer mới không được xung đột.
4. **Tách route `(kid)`:** RouteGuard + AuthProvider xử lý chuyển mode mượt (không
   bắt đăng nhập lại).

---

## 4. Thứ tự đề xuất

**Spike rủi ro #1 (Gemini Live nhận ảnh)** → **Pha 0** → 1 → 2 → 3 → 4 → 5 → 6.

Lý do spike trước: xác nhận khả thi multimodal sớm để tránh thiết kế lại Pha 5.
