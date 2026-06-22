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
- **`pronounce`**: chấm phát âm bằng **Azure Pronunciation Assessment**
  (`microsoft-cognitiveservices-speech-sdk` qua `npm:` specifier, wrapper ở
  `_shared/azurePronunciation.ts#assessPronunciation`) — chỉ nhận audio
  `audio/wav` (PCM 16kHz/16-bit/mono, strip 44-byte header cố định trước khi
  đưa vào SDK; m4a/AAC bị chặn 400 vì Deno không decode được). Có
  `reference_text` → **scripted** (Practice/Notebook, luyện theo câu mẫu cố
  định ở `scenario_lines`); không có → **unscripted** qua `score_only:true`
  (Live/Kid chấm theo từng câu nói tự do — xem `lib/pronunciationScoring.ts`,
  không ghi DB, chỉ trả điểm). `clarity`/`fluency` GỘP từ
  `accuracy`/`fluency`/`prosody` thô của Azure
  (`mergeClarityFluency` — xem comment trong `azurePronunciation.ts` giải
  thích lý do gộp); `ja-JP` không có prosody nên giữ nguyên accuracy/fluency
  thô. `completeness` (chỉ scripted) lấy thẳng `CompletenessScore` của Azure
  (tự so khớp transcript với `reference_text`, kể cả khi từ bị tách/gộp khác
  số từ) — **KHÔNG** tự tính bằng Levenshtein/word-alignment cục bộ như
  trước (đã bỏ hẳn `alignWords`/`computeCompletenessScore`/`levenshtein`
  trong `pronounce/index.ts`, vì lo ngại ban đầu là dành cho model tự chấm
  — LLM (Gemini) — không áp dụng cho Azure vì đây là thuật toán đo lường,
  không phải model tự đánh giá). **Lưu ý quan trọng:** Azure LUÔN trả 1 số
  cho `CompletenessScore` — khi unscripted (không có `reference_text`) Azure
  tự trả `100` (coi như "đủ" vì không có gì để so khớp), KHÔNG trả thiếu
  field/null — `pronounce/index.ts` PHẢI tự ép `completeness = null` khi
  không có `reference_text`, không dùng thẳng giá trị Azure trả về (đã verify
  bằng test thật). `overall_score` = trung bình clarity/fluency/completeness khi scripted;
  = clarity khi unscripted (khớp hành vi cũ của `session-review`, tránh lệch
  ngưỡng sao 70/85 đã tune ở Kid Mode). `flagged_words` map từ mã lỗi Azure
  (`ErrorType`) sang tip tiếng Việt (`ERROR_TIP_MAP`/`buildTip`/`pickFlaggedWords`
  trong `azurePronunciation.ts`) — Azure không tự sinh tip như Gemini trước
  đây; riêng `Mispronunciation` được làm chi tiết hơn bằng phoneme-level: mỗi
  từ trả về `phonemes[]` (IPA, set `phonemeAlphabet='IPA'` — mặc định SDK là
  SAPI) kèm `bestGuess` suy từ `NBestPhonemes` (**nằm bên trong**
  `PronunciationAssessment` của phoneme, KHÔNG ngang hàng với `Phoneme` —
  dễ nhầm, đã từng bug ở đây) khi có ứng viên khác với độ tin cậy cao hơn
  chính nó; tip dạng "Phát âm chưa chuẩn: /ð/ nghe như /z/ — luyện lại âm
  này." Các mã lỗi khác (Omission/Insertion/UnexpectedBreak/MissingBreak/
  Monotone) không liên quan tới phoneme cụ thể, vẫn dùng tip tĩnh trong
  `ERROR_TIP_MAP`. `transcript` trả về trong response để client tô màu câu
  mẫu theo từng từ (xem `lib/wordDiff.ts#compareWords` — vẫn có Levenshtein
  riêng cho mục đích tô màu UI ở phía app RN, KHÔNG liên quan tới
  completeness; Edge Function (Deno) không import được `lib/` của app RN
  nên 2 nơi độc lập, không cần đồng bộ với nhau). **Real-time pacing bắt
  buộc:** `assessPronunciation`
  ghi PCM vào `PushAudioInputStream` theo chunk ~100ms + delay — đẩy cả
  buffer 1 lần làm Azure kẹt ở `speech.hypothesis`, không bao giờ trả
  `speech.phrase` cuối (đã verify bằng spike, tái hiện 2 lần) — không tự ý
  đổi cách ghi này. **`recognized: false`** trên `AzureAssessmentResult`/
  response: Azure không nhận diện được giọng nói (`NoMatch`, hay gặp với
  audio rất ngắn/nhỏ — vd câu "はい." trong Live) → `accuracy`/`fluency` lúc
  đó luôn là 0 nhưng đó là "không chấm được", KHÔNG phải điểm 0 thật. Với
  `score_only`, response khi đó CHỈ có `{recognized:false}` (các field điểm
  số không tồn tại ở runtime) — `lib/pronunciationScoring.ts#scoreUtterance`
  PHẢI kiểm tra field này trước, trả `null` (bỏ qua hẳn câu đó, không insert
  `pronunciation_attempts`) nếu `false`. Với `pronounce` thường (scripted),
  vẫn giữ hành vi cũ (ghi điểm 0 thật) — chỉ field `recognized` phản ánh
  đúng trạng thái, không early-return.
- **`tts`**: sinh audio mẫu cho `scenario_lines`.
- **`live-token`**: tạo ephemeral token cho Gemini Live WebSocket + dựng
  system prompt (kể cả `buildKidExplorationPrompt` cho Image Exploration —
  Gemini tự sinh câu hỏi 5W1H+Why từ ảnh, không dùng `scenario_lines`).
  Với Guided Conversation, system prompt yêu cầu AI gọi FUNCTION CALL
  `mark_step_complete(step_order)` (xong bước) / `report_off_topic()` (lạc
  đề) — KHÔNG đọc marker thành tiếng. Tool declaration khai báo ở client
  (`LiveClient` setup, mode `kid_guided`), tên tool PHẢI khớp prompt
  `live-token`. Là function-calling ĐỒNG BỘ (BLOCKING, không set `behavior`):
  model gửi `toolCall` rồi tạm dừng audio cho tới khi client gửi
  `toolResponse` có `id` khớp + `response.result`, sau đó nói tiếp khen + hỏi
  bước kế. (Trước đây tưởng FC "treo phiên" — thực ra do chưa gửi/sai `id`
  trong `toolResponse`; gửi đúng thì model nói tiếp bình thường.) Image
  Exploration cũng dùng 1 tool `end_activity()`: AI gọi NGAY sau câu trả lời
  cuối, TRƯỚC khi nói lời tạm biệt (cùng pattern "tool trước, lời nói sau"
  với `mark_step_complete` — gọi SAU khi đã nói goodbye không đáng tin, model
  hay coi goodbye là điểm dừng tự nhiên rồi quên gọi tool theo sau, khiến
  `activityCompletedRef` không bao giờ true dù trẻ đã trả lời hết câu hỏi),
  để client tự kết thúc phiên (thay vì chỉ chờ Gemini đóng socket — không đáng
  tin). Tên các tool ở prompt PHẢI khớp `functionDeclarations` trong
  `lib/liveClient.ts` (guided → mark/off-topic; exploration → end_activity).
- **`session-review`**: tóm tắt sau buổi Live — KHÔNG tự chấm phát âm
  (đã chấm xong theo từng câu nói lúc phiên đang diễn ra, xem `pronounce`
  `score_only` + `lib/pronunciationScoring.ts`). Chỉ làm 2 việc: (a) Claude
  phân tích ngữ pháp/từ vựng (`analyzeGrammar`, không đổi), (b) **tổng hợp**
  `avg_pronunciation` = trung bình `accuracy_score` từ `pronunciation_attempts`
  join qua `message_id` (query `messages` role=`user` của conversation, rồi
  `pronunciation_attempts.message_id IN (...)`) — client phải insert
  `pronunciation_attempts` xong **trước** khi gọi function này. Dùng cho cả
  Live tự do (adult) và Kid Mode (Guided Conversation + Image Exploration
  đều gọi lại function này để lấy `avg_pronunciation` tính sao).
- **`image-moderation`**: Gemini (`gemini-2.5-flash`, tái dùng
  `GOOGLE_GENAI_API_KEY` đang dùng cho chat/STT/Live) hỏi ảnh có an toàn
  cho trẻ em không, trả JSON `{is_safe, reason}` lưu vào
  `exploration_images.safesearch_result`.

## Quy tắc nghiệp vụ

- **`pronounce` là nơi DUY NHẤT gọi Azure để chấm phát âm** — `session-review`
  không tải/chấm audio nữa, chỉ tổng hợp `avg_pronunciation` từ
  `pronunciation_attempts` đã có sẵn. Format ghi `pronunciation_attempts`
  giống nhau ở cả 2 đường (`pronounce` ghi trực tiếp khi có
  `scenario_line_id`/`message_id` lúc gọi; Live/Kid insert từ client sau khi
  có `message_id`, dùng điểm trả về từ `score_only`): `accuracy_score`=clarity,
  `completeness_score`=null khi unscripted, `word_scores[].error_type` là tip
  cải thiện tiếng Việt chứ không phải mã lỗi Azure thô — đổi format thì phải
  đổi cả `pronounce`, `lib/pronunciationScoring.ts`, 3 hook insert
  (`useLiveSession`/`useMissionSession`/`useExplorationSession`), và UI đọc
  bảng này (`components/practice/ScorePanel.tsx`,
  `app/(app)/live/review/[conversationId].tsx`,
  `app/(kid)/parent/session/[conversationId].tsx`).
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
- **`pronounce` cần secret riêng `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`**
  (`npx supabase secrets set ...`, xem `.env.example`) — khác các function
  khác đều tái dùng `GOOGLE_GENAI_API_KEY`/`ANTHROPIC_API_KEY` sẵn có.
  `AZURE_SPEECH_REGION` là region của Azure Speech resource (vd
  `southeastasia`), không phải URL.
- **Tool-call protocol (`live-token` ↔ `LiveClient`)**: tiến trình bước/lạc
  đề báo qua FUNCTION CALL `mark_step_complete`/`report_off_topic` — không
  thêm heuristic phía client để suy đoán, vì sẽ lệch với system prompt khi
  đổi prompt mà quên đổi client (hoặc ngược lại). Tên tool trong system prompt
  (`live-token/index.ts`) PHẢI khớp `functionDeclarations` ở setup message
  (`lib/liveClient.ts`). BLOCKING (mặc định, không set `behavior`): handler
  `toolCall` phải gửi `toolResponse` NGAY, đồng bộ, `id` khớp chính xác — nếu
  không model treo (đây mới là nguyên nhân "treo phiên" trước kia, không phải
  model không hỗ trợ FC). KHÔNG có reminder ẩn hay force-advance phía client:
  đã bỏ vì (a) reminder bị model đọc to ra transcript, và (b) ở màn mở đầu nó
  khiến model hỏi lại Step 1 (model phát 1 lượt chào + 1 lượt rỗng) → trẻ nghe
  câu đầu 2 lần. Chỉ giữ guard `childSpokeSinceAdvance`: từ chối
  `mark_step_complete` (trả `too_early`) nếu trẻ chưa nói gì kể từ lần sang bước
  trước, chống model "hoàn thành" bước nó vừa hỏi → goodbye sớm ở bước cuối.
  Prompt cấm model đọc to tên tool/cú pháp `()`; `lib/markerProtocol.ts`
  (`stripToolCallArtifacts`) strip nốt nếu vẫn lọt vào transcript hiển thị.
- **`realtimeInputConfig` cho Kid Mode** (setup message ở `LiveClient`):
  `silenceDurationMs` cao (1500ms) + sensitivity `LOW` + `activityHandling:
  NO_INTERRUPTION` để trẻ nói chậm/ngắt quãng không bị AI chen lời và tiếng
  AI vọng vào mic không "ngắt" model gây lặp câu. Chỉ áp cho kid mode; Live
  adult giữ mặc định (cho phép barge-in).
- **Live session** giới hạn 15 phút (giới hạn cứng của Gemini Live), token
  ephemeral hiệu lực 30 phút. Guided Conversation giới hạn 10 phút/phiên
  (giới hạn riêng của app, ngắn hơn vì trẻ nhỏ khó tập trung lâu).
