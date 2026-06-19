---
name: edge-functions
description: Edge Functions (Deno) của ParlEcho — chat, pronounce, tts, live-token, session-review, image-moderation — và quy tắc nghiệp vụ riêng từng function. Dùng khi viết/sửa code trong supabase/functions/.
---

# Edge Functions (Supabase, Deno)

Tất cả nằm dưới `supabase/functions/`. `_shared/cors.ts`, `_shared/auth.ts`
(`verifyUser`) dùng chung. ESLint ignore thư mục này (Deno, không theo
convention RN của app).

## Danh sách function

- **`chat`**: gọi Claude API (`claude-sonnet-4-6`) — trả reply + translation
  + corrections + hints cho chat tự do (adult).
- **`pronounce`**: Gemini STT transcribe rồi tính điểm bằng Levenshtein
  distance cục bộ (accuracy/fluency/completeness) — KHÔNG gọi LLM để chấm
  điểm (tránh chi phí + độ trễ).
- **`tts`**: sinh audio mẫu cho `scenario_lines`.
- **`live-token`**: tạo ephemeral token cho Gemini Live WebSocket + dựng
  system prompt (kể cả `buildKidExplorationPrompt` cho Image Exploration —
  Gemini tự sinh câu hỏi 5W1H+Why từ ảnh, không dùng `scenario_lines`).
  Với Guided Conversation, system prompt yêu cầu AI chèn marker
  `[STEP_DONE]`/`[OFFTOPIC]` vào lời nói khi đạt bước/lạc đề — client
  (`LiveClient`) parse và strip các marker này, KHÔNG hiển thị cho người
  dùng (xem skill `app-code`).
- **`session-review`**: tóm tắt sau buổi Live — `avg_pronunciation`,
  `fluency`, `vocab_to_learn`, `corrections`. Dùng cho cả Live tự do
  (adult) và Kid Mode (Guided Conversation + Image Exploration đều gọi lại
  function này để lấy `avg_pronunciation` tính sao).
- **`image-moderation`**: Gemini (`gemini-2.5-flash`, tái dùng
  `GOOGLE_GENAI_API_KEY` đang dùng cho chat/STT/Live) hỏi ảnh có an toàn
  cho trẻ em không, trả JSON `{is_safe, reason}` lưu vào
  `exploration_images.safesearch_result`.

## Quy tắc nghiệp vụ

- **`pronounce` không dùng LLM để chấm điểm** — Gemini chỉ dùng để
  transcribe (STT); điểm số tính bằng Levenshtein distance cục bộ.
- **`/chat` lọc corrections**: chỉ giữ correction nếu cụm từ lỗi thực sự
  xuất hiện trong message gần nhất của user (tránh Claude tự bịa lỗi
  không có thật).
- **Guided Conversation gọi `/session-review`** sau mỗi mission để lấy
  `avg_pronunciation` dùng tính sao — phần `corrections`/`vocab_to_learn`
  từ response này KHÔNG hiển thị cho trẻ (Kid Mode chưa có UI sửa ngữ
  pháp), chỉ `avg_pronunciation` được dùng. Image Exploration thì có dùng
  `vocab_to_learn`/`corrections` để tự lưu vào `saved_items`.
- **`image-moderation` dùng Gemini, KHÔNG dùng Cloud Vision SafeSearch** —
  tái dùng thẳng `GOOGLE_GENAI_API_KEY`, không cần secret/API riêng. Nếu
  JSON trả về không parse được, mặc định `is_safe: false` (an toàn là
  chặn duyệt, không tự ý approve khi không chắc).
- **Marker protocol (`live-token` ↔ `LiveClient`)**: `STEP_DONE`/`OFFTOPIC`
  là cách DUY NHẤT để báo tiến trình bước/lạc đề — không thêm heuristic
  phía client để suy đoán, vì sẽ lệch với system prompt khi đổi prompt mà
  quên đổi client (hoặc ngược lại).
- **Live session** giới hạn 15 phút (giới hạn cứng của Gemini Live), token
  ephemeral hiệu lực 30 phút. Guided Conversation giới hạn 10 phút/phiên
  (giới hạn riêng của app, ngắn hơn vì trẻ nhỏ khó tập trung lâu).
