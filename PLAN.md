# Plan: App luyện giao tiếp tiếng Anh & Nhật song song

> Tài liệu này dành cho Claude Code. Mục tiêu: xây MVP một app mobile giúp một người học luyện giao tiếp EN và JP, có hội thoại AI, kịch bản soạn sẵn, và chấm phát âm. Đồng bộ cloud qua Supabase.

---

## 1. Tổng quan sản phẩm

App mobile (iOS + Android) cho một người học luyện nói EN và JP song song. Ba trụ cột:

1. **Kịch bản soạn sẵn** — tình huống cố định (gọi món, check-in...), luyện trước khi hội thoại tự do.
2. **Hội thoại AI** — LLM đóng vai partner theo tình huống, sửa lỗi ngữ pháp, gợi ý câu tiếp.
3. **Chấm phát âm** — ghi âm → STT → so khớp câu mẫu → điểm + highlight từ sai.

Đặc thù song ngữ: dùng chung pipeline cho EN và JP. JP cần thêm furigana + romaji.

Quy mô: học một mình. Ưu tiên tốc độ build, chi phí thấp, ít vận hành.

---

## 2. Tech stack

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| App | React Native + Expo | một codebase iOS/Android, OTA update |
| Ghi âm | expo-av | thu audio user |
| TTS local | expo-speech | nghe mẫu nhanh, miễn phí (giọng cứng) |
| Backend | Supabase | Postgres + Auth + Storage + Edge Functions |
| Logic AI | Supabase Edge Functions (Deno) | lớp duy nhất giữ API key |
| LLM hội thoại | Claude API (`claude-sonnet-4-6`) | roleplay + sửa lỗi, trả JSON |
| STT + chấm phát âm | Azure Speech (Pronunciation Assessment) | gộp STT + chấm điểm phoneme một nhà |
| TTS chất lượng | Azure TTS hoặc ElevenLabs | giọng mẫu tự nhiên cho shadowing |
| Furigana/romaji | kuroshiro + kuromoji | sinh furigana từ text JP |

**Nguyên tắc bảo mật cốt lõi**: App chỉ giữ Supabase `anon` key. Mọi key của Claude/Azure nằm trong Edge Functions. App không bao giờ gọi trực tiếp Claude/Azure.

---

## 3. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────┐
│  APP — React Native (Expo)                                │
│  UI/điều hướng · Ghi âm+TTS local · State+cache furigana  │
└────────────────────────┬──────────────────────────────────┘
                         │ SDK Supabase (HTTPS + JWT)
┌────────────────────────▼──────────────────────────────────┐
│  BACKEND — Supabase                                        │
│  Auth (JWT) · Postgres+RLS · Storage (audio)               │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Edge Functions (Deno) — giữ key, điều phối AI          │ │
│  │   /chat       roleplay, sửa lỗi (Claude)               │ │
│  │   /pronounce  STT + chấm điểm (Azure)                  │ │
│  │   /tts        sinh audio mẫu (Azure/ElevenLabs)        │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────┬──────────────────────────────────┘
                         │ HTTPS có key server-side
┌────────────────────────▼──────────────────────────────────┐
│  DỊCH VỤ AI NGOÀI                                          │
│  Claude API · Azure Speech (STT+chấm) · Azure/ElevenLabs TTS│
└─────────────────────────────────────────────────────────┘
```

**Quy tắc bắt buộc khi viết Edge Function:**
- Tự verify JWT trong function, KHÔNG tin `user_id` do client truyền.
- Dùng `service_role` key bên trong function để ghi DB (bypass RLS một cách có kiểm soát).
- Đọc API key từ secrets/env, không hardcode.

**Storage buckets:**
- `recordings` (private) — audio user ghi.
- `tts` (public) — audio mẫu sinh sẵn.

---

## 4. Luồng dữ liệu chính

**Lượt chấm phát âm:**
1. App ghi âm (expo-av) → upload lên Storage `recordings`.
2. App gọi `/pronounce` kèm `audio_url`, `scenario_line_id` (hoặc `message_id`), `language_id`.
3. Function verify JWT → gửi audio + câu mẫu cho Azure Pronunciation Assessment.
4. Azure trả overall/accuracy/fluency/completeness + word_scores.
5. Function ghi vào `pronunciation_attempts`, cập nhật `user_progress`, trả kết quả về app.

**Lượt hội thoại AI:**
1. App gửi text (hoặc audio đã STT) tới `/chat` kèm `conversation_id`, lịch sử messages, `mode`, `language_id`.
2. Function gọi Claude với prompt yêu cầu trả JSON: `{reply, translation, furigana, romaji, corrections, hints}`.
3. Function ghi message user + assistant vào `messages`, trả JSON về app.
4. App render reply + sửa lỗi + gợi ý; phát TTS nếu cần.

---

## 5. Database schema (Supabase Postgres)

> File SQL đầy đủ kèm theo: `schema.sql`. Tóm tắt bảng:

**Nội dung tĩnh (read-only qua RLS, ghi bằng service_role):**
- `languages` — en, ja (tts_voice, stt_locale).
- `scenario_groups` — nhóm ghép cặp EN↔JP qua `slug`.
- `scenarios` — tình huống theo ngôn ngữ (level, type, group_id).
- `scenario_lines` — câu trong kịch bản (text, translation, furigana, romaji, audio_url).

**Dữ liệu user (owner-only qua `auth.uid()`):**
- `profiles` — 1-1 với `auth.users`, tự tạo qua trigger.
- `conversations` — phiên roleplay (mode, summary JSONB).
- `messages` — từng lượt nói (corrections, hints JSONB).
- `pronunciation_attempts` — điểm + word_scores JSONB.
- `user_progress` — tiến độ theo scenario × ngôn ngữ.
- `daily_activity` — streak + thống kê theo ngày.
- `saved_items` — sổ tay từ/câu sai.

**Ghi chú schema:**
- Audio chỉ lưu `*_url`, không nhét blob vào DB.
- JSONB cho dữ liệu linh hoạt (corrections, hints, word_scores, summary).
- Ghép cặp EN↔JP qua `scenario_groups` + `unique(group_id, language_id)`.

---

## 6. Use cases cần build (theo độ ưu tiên)

**MVP — build trước (tạo aha moment nhanh, ít phụ thuộc AI):**
- Shadowing: nghe câu mẫu → nhại lại → chấm phát âm.
- Đọc to đoạn hội thoại soạn sẵn, highlight từ sai.
- Flashcard câu giao tiếp.
- Streak + "câu hôm nay".

**Giai đoạn 2 — gắn LLM:**
- Roleplay tình huống (gọi món, check-in, hỏi đường, phỏng vấn, khám bệnh, mua sắm).
- Journaling bằng giọng nói → AI sửa lỗi.
- Tổng kết cuối phiên (lỗi lặp lại, từ nên học).

**Giai đoạn 3 — nâng cao:**
- Minimal pairs (cần Azure Pronunciation Assessment, không dùng Levenshtein).
- Mô phỏng thi nói (IELTS / JLPT 会話 / EIKEN).
- Code-switch drill (AI hỏi JP, đáp EN và ngược lại).
- Dịch ngược (nghe tiếng Việt → nói EN/JP).
- Biểu đồ điểm phát âm theo thời gian.

---

## 7. Lộ trình triển khai gợi ý

1. **Setup**: tạo project Supabase, chạy `schema.sql`, tạo 2 bucket Storage + policy. Khởi tạo Expo app, tích hợp SDK Supabase + Auth.
2. **Nội dung tĩnh**: seed vài `scenario_groups` mẫu (gọi món EN+JP kèm lines + furigana). Sinh audio mẫu qua `/tts` lưu vào bucket `tts`.
3. **MVP phát âm**: màn hình shadowing — ghi âm, upload, gọi `/pronounce`, hiển thị điểm + highlight. (Có thể bắt đầu bằng chấm Levenshtein đơn giản, sau nâng lên Azure.)
4. **Tiến độ**: lưu `pronunciation_attempts`, `user_progress`, `daily_activity`, màn hình streak.
5. **Hội thoại AI**: Edge Function `/chat` gọi Claude trả JSON, màn hình chat roleplay.
6. **Nâng cao**: minimal pairs (Azure), mô phỏng thi, code-switch, biểu đồ.

---

## 8. Lưu ý kỹ thuật quan trọng

- Edge Function phải verify JWT, dùng `service_role` để ghi DB, đọc key từ secrets.
- Bucket `recordings` private — truy cập qua signed URL.
- Prompt Claude: ép trả JSON thuần (không markdown, không preamble), parse an toàn, có fallback khi parse lỗi.
- JP: sinh furigana/romaji ở backend (kuroshiro) khi seed nội dung; có thể cache ở app.
- Độ trễ hội thoại turn-based (ghi âm → STT → LLM → TTS) là vài giây — chấp nhận được cho MVP. Muốn real-time sau này cần streaming STT (Deepgram) hoặc speech-to-speech.
- Gom STT + TTS + chấm phát âm về Azure Speech để giảm số nhà cung cấp cần tích hợp.

---

## 9. Biến môi trường cần có

```
# App (.env — chỉ key public)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# Edge Functions (Supabase secrets — KHÔNG để lộ ra app)
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
ELEVENLABS_API_KEY=   # nếu dùng
```
