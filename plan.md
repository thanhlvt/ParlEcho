# Plan: Thay Gemini bằng Microsoft Pronunciation Assessment (Azure)

## Bối cảnh hiện trạng (đã khảo sát)

| Điểm gọi | File | Audio | Loại |
|---|---|---|---|
| Practice shadowing | `app/(app)/practice/[scenarioId].tsx:219` | **m4a/AAC** | scripted (có `reference_text`) |
| Notebook | `components/notebook/PronouncePracticeModal.tsx:165` | **m4a/AAC** | scripted |
| Live adult | `components/live/useLiveSession.ts:365` | PCM→WAV 16k mono | unscripted (gọi cuối phiên) |
| Kid Mission | `components/kid/useMissionSession.ts:495` | PCM→WAV 16k mono | unscripted |
| Kid Exploration | `components/kid/useExplorationSession.ts:508` | PCM→WAV 16k mono | unscripted |

- `pronounce` (`supabase/functions/pronounce/index.ts`) và `session-review`
  (`supabase/functions/session-review/index.ts`) hiện đều chấm holistic bằng
  Gemini + tính completeness cục bộ bằng Levenshtein (`alignWords`/
  `computeCompletenessScore` trong `pronounce`).
- Bảng `pronunciation_attempts` (`schema.sql:209`): `overall_score,
  accuracy_score, fluency_score, completeness_score, word_scores
  jsonb[{word,score,error_type}]`.

**Hai vấn đề chặn đường:**
1. **Định dạng audio:** Azure chỉ nhận WAV PCM (16k/16-bit/mono) trong Deno
   (AAC cần GStreamer — không có). Live/Kid đã đúng; **Practice + Notebook
   phải đổi từ m4a sang PCM/WAV.**
2. **Prosody chỉ có ở `en-US`** → tiếng Nhật (`ja-JP`) sẽ không có
   `ProsodyScore`; phải degrade mượt khi gộp điểm (xem quy tắc gộp dưới).

## Quyết định đã chốt

- Tích hợp Azure qua **Speech SDK `npm:microsoft-cognitiveservices-speech-sdk`**
  trong Deno (không dùng REST short-audio) — để có đầy đủ scripted +
  unscripted + prosody + continuous mode (>30s).
- Đã có Azure Speech key + region sẵn.
- Chấm theo từng câu (Live/Kid) **mở rộng `pronounce`** (không tạo function
  riêng) với chế độ `score_only`.
- **Giữ nguyên output shape hiện tại**: `clarity` (rõ ràng), `fluency` (trôi
  chảy) cho cả scripted/unscripted; `completeness` (đầy đủ) chỉ cho scripted,
  vẫn tính bằng Levenshtein cục bộ như hiện tại — **không** dùng
  `CompletenessScore` của Azure, **không** lộ thêm field mới (`prosody`,
  `pronScore`...) ra response.

## Kiến trúc đề xuất

**Luồng per-utterance (Live/Kid):** Azure scoring chạy **trong lúc** nói (mỗi
lượt user nói xong → upload WAV → gọi `pronounce` với `score_only=true` →
nhận điểm → giữ trong RAM, gắn theo `order`). Khi kết thúc phiên: tạo
`messages`, **insert `pronunciation_attempts` từ điểm đã có trong RAM**
(không gọi lại Azure), rồi `session-review` chỉ **tổng hợp avg_pronunciation +
phân tích ngữ pháp** (không tải/chấm audio nữa). Tránh bắt trẻ chờ lâu ở cuối
phiên và tái dùng tối đa plumbing hiện có.

### Phase 0 — Spike de-risk ✅ ĐÃ HOÀN THÀNH

Đã verify bằng `deno run` thuần (`npm:microsoft-cognitiveservices-speech-sdk@1.46.0`,
file test ở `supabase/functions/_spike-azure/standalone_test.ts`, audio mẫu
SAPI 16kHz mono): SDK chạy được, kết quả thật từ Azure (region
`southeastasia`):

```
text: The weather is nice today.
accuracyScore: 95   fluencyScore: 100   completenessScore: 100
pronunciationScore: 95.4   prosodyScore: 91.1
+ word/syllable/phoneme-level scores, ErrorType, Prosody Feedback
```

**Ràng buộc bắt buộc phát hiện được (áp dụng cho Phase 1):** `PushAudioInputStream.write()`
phải ghi PCM theo **chunk nhỏ (~100ms) + delay tương ứng** giữa các lần
`write()`, mô phỏng tốc độ audio thật — **không đẩy cả buffer PCM một lần**.
Đã tái hiện 2 lần: đẩy cả buffer 1 lần → server nhận đủ audio (xác nhận qua
debug log `ConnectionMessageSentEvent`), sinh `speech.hypothesis` đúng nội
dung, nhưng **không bao giờ** gửi `speech.phrase`/`speech.endDetected`/
`turn.end` → `recognizeOnceAsync` treo vô hạn. Ghi theo chunk 100ms +
`setTimeout` → nhận đủ `speech.endDetected` → `speech.phrase` → `turn.end`,
trả kết quả trong ~1-2s. `assessPronunciation` ở Phase 1 PHẢI áp dụng cách
ghi theo nhịp này, dù input là audio đã ghi sẵn (không phải mic streaming
trực tiếp).

Function `_spike-azure` chỉ là spike, không phải code production — giữ lại
làm tài liệu tham khảo, đã thêm vào `.gitignore` (`supabase/functions/_spike-azure/`)
nên không bị commit/deploy.

### Phase 1 — Module dùng chung: `supabase/functions/_shared/azurePronunciation.ts` ✅ ĐÃ HOÀN THÀNH

Đã tạo `_shared/azurePronunciation.ts` với `assessPronunciation`,
`mergeClarityFluency`, `pickFlaggedWords`, `toAzureLocale`. Type-check sạch
(`deno check`) và đã test thật end-to-end (scripted + unscripted) bằng
`_spike-azure/test_shared_module.ts` — kết quả đúng như kỳ vọng
(`merged: { clarity: 93, fluency: 96 }` cho scripted). Khác 1 chỗ so với mô
tả ban đầu: `mergeClarityFluency`/`pickFlaggedWords`/`toAzureLocale` đặt
**trong module `_shared`** (không đặt riêng trong `pronounce`) để
`session-review` dùng chung trực tiếp, tránh import chéo giữa 2 thư mục
function.

<details><summary>Mô tả gốc (đã thực hiện đúng phần còn lại)</summary>

- `assessPronunciation({ pcm, sampleRate, locale, referenceText?,
  enableProsody })` — wrapper THUẦN của Azure, không tự gộp điểm.
- Tự chọn **single-shot** (`recognizeOnceAsync`) khi audio ≤30s,
  **continuous** (`startContinuousRecognitionAsync` + gom `recognized`
  events) khi >30s (tính duration = `pcm.length / (sampleRate * 2)`).
- `referenceText` rỗng/không truyền → **unscripted**; có giá trị →
  **scripted** (`EnableMiscue=true` ở single-shot). Ở continuous mode
  (>30s) Azure không hỗ trợ `EnableMiscue` nên word-level `errorType` sẽ
  thiếu `Omission`/`Insertion` — **không** backfill bằng `alignWords` (quá
  phức tạp cho 1 edge case hiếm: chỉ xảy ra khi 1 audio đơn lẻ dài >30s,
  thực tế Practice/Notebook là câu ngắn, Live/Kid chấm theo từng câu nói).
  `completeness` vẫn đúng vì tính độc lập bằng Levenshtein trên `transcript`,
  không phụ thuộc field này.
- `enableProsodyAssessment` chỉ bật khi `locale === 'en-US'`.
- Trả **raw** Azure scores, không gộp:
  `{ accuracy, fluency, prosody: number | null, transcript, words: [{ word, accuracyScore, errorType }] }`.
- Đọc `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` từ `Deno.env`.

Map locale (`toAzureLocale`): `en` → dùng `accent` của Live nếu có
(`en-US`/`en-GB`…), mặc định `en-US`; `ja` → `ja-JP`.

</details>

### Quy tắc gộp điểm (dùng ở cả Phase 2 và Phase 3) ✅ ĐÃ HOÀN THÀNH (`mergeClarityFluency`)

Nằm trong `_shared/azurePronunciation.ts` (không phải trong `pronounce` như
dự kiến ban đầu — xem lý do ở đầu Phase 1), export để cả `pronounce` và
`session-review` import dùng chung:

```
clarity = prosody != null ? round((accuracy + prosody) / 2) : accuracy
fluency = prosody != null ? round((fluencyAzure + prosody) / 2) : fluencyAzure
```

Lý do: prompt Gemini cũ định nghĩa *clarity* = "clarity AND **word stress**",
*fluency* = "flow AND **natural intonation**" — cả stress và intonation đều
nằm trong `ProsodyScore` của Azure (1 con số duy nhất cho cả câu, không tách
được theo từng tiêu chí). Gộp đều vào cả hai trục là cách đơn giản nhất,
không bịa thêm tiêu chí mới. Với `ja-JP` (không có prosody) → `clarity =
accuracy`, `fluency = fluencyAzure` thẳng, không gãy.

**Bỏ hẳn `CompletenessScore` của Azure.** `completeness` (chỉ áp dụng
scripted) vẫn tính 100% bằng `computeCompletenessScore(transcript,
reference_text)` — giữ nguyên y nguyên hàm Levenshtein word-alignment hiện
có, chỉ đổi nguồn `transcript` từ Gemini sang Azure recognized text
(`DisplayText`/lexical).

`flagged_words`: Azure không sinh tip tiếng Việt → đã thêm map tĩnh
`ERROR_TIP_MAP` (`Mispronunciation`, `Omission`, `Insertion`, `Monotone`,
`UnexpectedBreak`, `MissingBreak`) + hàm `pickFlaggedWords(words, max=3)`
trong `_shared/azurePronunciation.ts` — chọn tối đa 3 từ có
`errorType !== 'None'`, sort theo `accuracyScore` thấp nhất, map sang
`{word, tip}`, giữ đúng shape response cũ. **Đã test thật** (xem kết quả
Phase 1 ở trên).

### Phase 2 — Edge `pronounce` (scripted + score_only unscripted) ✅ ĐÃ HOÀN THÀNH

`supabase/functions/pronounce/index.ts` đã viết lại:
- `reference_text` optional; thêm `score_only?: boolean`, `accent?: string`.
- Thay `scorePronunciation` (Gemini) bằng `assessPronunciation` +
  `mergeClarityFluency` + `pickFlaggedWords` từ `_shared/azurePronunciation.ts`.
  Giữ nguyên `levenshtein`/`charSimilarity`/`normalizeWords`/`alignWords`/
  `computeCompletenessScore` tại chỗ (chỉ dùng trong `pronounce`, không cần
  share).
- Thêm guard: chỉ nhận `audio_mime_type === 'audio/wav'` — trả lỗi 400 rõ
  ràng nếu không (m4a/AAC chưa decode được trong Deno; Practice/Notebook sẽ
  hết lỗi này sau Phase 5).
- `score_only=true` → bỏ qua check `scenario_line_id`/`message_id` bắt buộc
  (chưa tồn tại lúc gọi giữa phiên Live/Kid), không ghi DB, vẫn xoá file
  storage.
- `overall_score`: `round((clarity+fluency+completeness)/3)` khi có
  `reference_text` (scripted); `= clarity` khi không có (unscripted/score_only) —
  khớp hành vi `session-review` cũ.
- Response giữ nguyên field: `{overall_score, clarity, fluency, completeness, transcript, flagged_words}`.

**Đã verify:** `deno check` sạch + test thật bằng audio mẫu
(`_spike-azure/test_pronounce_formula.ts`) cho cả 2 case, kết quả:
`{ clarity: 93, fluency: 96, completeness: 100, overall_score: 96 }` (scripted)
và `{ clarity: 92, fluency: 96, completeness: null, overall_score: 92 }`
(unscripted) — đúng công thức thiết kế.

### Phase 3 — Edge `session-review` (bỏ chấm audio) ✅ ĐÃ HOÀN THÀNH

`supabase/functions/session-review/index.ts` đã viết lại:
- Bỏ hàm `scorePronunciation` (Gemini) + toàn bộ tải/giải mã audio. Bỏ field
  `user_segments` khỏi `ReviewRequest` interface.
- Chỉ còn: (a) `analyzeGrammar` (Claude — giữ nguyên), (b) **tổng hợp**
  `avg_pronunciation` = trung bình `accuracy_score` từ `pronunciation_attempts`
  join qua `message_id` (query `messages` role=`user` thuộc conversation, rồi
  `pronunciation_attempts.message_id IN (...)`) — khớp đúng hành vi cũ (trước
  đây cũng lấy trung bình `clarity`, lưu vào cột `accuracy_score`), (c) cập
  nhật `conversations.summary` + bump `daily_activity` — không đổi.
- Response bỏ field `pronunciation` (mảng chấm theo từng đoạn) — đã xác nhận
  field này **không được UI nào đọc** (chỉ `avg_pronunciation` được dùng), an
  toàn để bỏ. Cập nhật `lib/types.ts`: xoá `SegmentPronunciation`, bỏ field
  `pronunciation` khỏi `SessionReviewApiResponse`; `PronounceApiResponse.completeness`
  đổi thành `number | null` (null khi `score_only`/unscripted).
- **Đã verify:** `deno check` sạch cho edge function, `tsc --noEmit` sạch cho
  toàn app RN (không có lỗi type nào phát sinh từ thay đổi `completeness`/
  bỏ `SegmentPronunciation`).
- **Trạng thái trung gian (đến khi Phase 4 xong):** client vẫn gửi
  `user_segments` trong body — vô hại, field này bị bỏ qua. `avg_pronunciation`
  sẽ là `null` cho tới khi Phase 4 (client insert `pronunciation_attempts` từ
  `pronounce score_only` mỗi câu nói) hoàn thành, vì hiện chưa có gì insert
  vào `pronunciation_attempts` cho luồng Live/Kid nữa.

### Phase 4 — Client per-utterance ✅ ĐÃ HOÀN THÀNH

- `lib/liveClient.ts`: thêm callback `onUserUtterance(pcm, text, order)`,
  bắn trong `_flushCurrentUserTurn` ngay khi 1 lượt user có text được chốt
  (cùng giá trị `order` với `sort_order` của turn, dùng để map message_id
  sau). Xoá dead code `uploadLiveSegment`/`LiveSessionResult`/
  `LiveAudioSegment` (không còn ai gọi sau khi bỏ luồng upload cuối phiên).
- Thêm `lib/pronunciationScoring.ts#scoreUtterance(userId, pcm, languageId, accent?)`
  — helper dùng chung cho cả 3 hook: upload WAV tạm (`{userId}/scoring/...`),
  gọi `pronounce` với `score_only:true` (unscripted), trả `null` nếu lỗi
  (không làm gãy phiên đang chạy).
- 3 hook (`useLiveSession.ts`, `useMissionSession.ts`,
  `useExplorationSession.ts`) đều áp dụng cùng pattern:
  - Thêm `pronunciationScoresRef = useRef<Map<number, PronounceApiResponse>>`,
    clear ở đầu `startSession`.
  - `onUserUtterance` gọi `scoreUtterance` (fire-and-forget, không await
    trong message loop), lưu kết quả vào Map theo `order`.
  - Cuối phiên: sau khi có `messageIdByOrder`, build `attemptRows` từ Map
    (map `order → message_id`, `accuracy_score=clarity`, `fluency_score`,
    `completeness_score: null`, `word_scores` từ `flagged_words`) rồi
    **insert thẳng `pronunciation_attempts` từ client** (RLS `own attempts`
    cho phép). Bỏ hẳn vòng upload `audioSegments`/`uploadLiveSegment` cuối
    phiên (audio đã được upload + chấm + xoá ngay lúc nói, tránh upload
    trùng 2 lần).
  - Gọi `session-review` mới chỉ với `{conversation_id, language_id, transcript}`
    (không còn `user_segments`).
- **Sửa thêm 1 bug phát hiện trong lúc làm:** `AccentId` của app dùng
  `'en-UK'` (quy ước riêng cho prompt Gemini Live), không phải mã BCP-47 —
  Azure cần `'en-GB'`. Đã thêm mapping trong `toAzureLocale`
  (`_shared/azurePronunciation.ts`).
- **Đã verify:** `tsc --noEmit` + `deno check` (3 edge function liên quan)
  + `expo lint` đều sạch (lint chỉ còn 2 warning `exhaustive-deps` có từ
  trước, không liên quan).

### Phase 5 — Client Practice + Notebook (đổi sang WAV) ✅ ĐÃ HOÀN THÀNH

- `app/(app)/practice/[scenarioId].tsx` &
  `components/notebook/PronouncePracticeModal.tsx`: đổi ghi âm từ
  `expo-audio` (`useAudioRecorder`/`RecordingPresets`, ra m4a/AAC) sang
  capture PCM bằng `@siteed/audio-studio` (`useAudioRecorder` +
  `LegacyEventEmitter('AudioData')`, giống pattern Live/Kid) → gom chunk
  vào `pcmChunksRef` → `pcmToWav(pcm, 16000, 16)` khi dừng ghi → upload
  `contentType:'audio/wav'`, gửi `audio_mime_type:'audio/wav'` cho
  `pronounce`. `expo-audio` vẫn giữ lại cho phần playback (`AudioPlayer`/
  `createAudioPlayer`) và xin quyền mic (`requestRecordingPermissionsAsync`)
  — chỉ phần ghi âm đổi sang audio-studio.
- `uploadRecording` đơn giản hoá: nhận trực tiếp `Uint8Array` (WAV bytes đã
  có sẵn trong RAM) thay vì đọc lại từ file URI qua `fetch`/XHR — bỏ hẳn
  dance fetch-fallback-XHR vì không còn cần đọc file từ disk.
- File ghi âm cục bộ để nghe lại (`recordedUri`/`recordedUris`) giờ tự viết
  bằng `FileSystem.writeAsStringAsync` (base64 WAV) vào `cacheDirectory`,
  thay vì dùng file gốc do recorder tạo ra.
- Thêm `lib/audioFormat.ts#concatUint8Arrays` (helper dùng chung gom PCM
  chunk) — tái dùng ở cả 2 màn hình này.
- **Đã verify:** `tsc --noEmit` sạch, `expo lint` sạch (2 warning
  `exhaustive-deps` còn lại không liên quan, có từ trước).

### Phase 6 — UI hiển thị điểm ✅ ĐÃ HOÀN THÀNH

Xác nhận đúng như dự kiến: không cần đổi logic hiển thị nào.
`word_scores[].error_type` tiếp tục là **tip tiếng Việt** (sinh sẵn ở edge
function từ map tĩnh `ERROR_TIP_MAP`, không phải mã Azure thô). Đã đọc kỹ
`ScorePanel.tsx` (đã có sẵn `value ?? 0` cho `completeness` nên không vỡ khi
null), `app/(app)/live/review/[conversationId].tsx`,
`app/(kid)/parent/session/[conversationId].tsx` — logic giữ nguyên 100%,
chỉ cập nhật lại comment đầu `PronunciationDetail` ở 2 file review (trước
ghi "chấm holistic bằng Gemini", giờ ghi đúng Azure + trỏ tới
`ERROR_TIP_MAP`). Cũng cập nhật 1 comment liên quan trong `lib/wordDiff.ts`
("transcript Gemini nghe được" → "transcript Azure nghe được").

Đã quét toàn repo (`grep Gemini`) để xác nhận không sót comment/text nào về
chấm điểm còn nhắc Gemini — các chỗ còn lại đều hợp lệ (Live/STT/TTS/
image-moderation thật vẫn dùng Gemini, không liên quan tới scoring) hoặc là
comment lịch sử giải thích lý do migration (giữ nguyên, có giá trị tham
khảo). `tsc --noEmit` sạch.

### Phase 7 — Secrets + Docs ✅ ĐÃ HOÀN THÀNH

- Đã `supabase secrets set AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=southeastasia`
  lên project **parlecho** (production, đã xác nhận với user trước khi
  chạy) — verify bằng `supabase secrets list`.
- **CLAUDE.md**: thêm mục "Pronunciation scoring" vào tech stack (Azure AI
  Speech, secret cần thiết); ghi chú `expo-audio-studio` giờ dùng cho cả
  ghi âm Practice/Notebook (không chỉ Live/Kid) vì Azure chỉ nhận WAV PCM.
- **`.env.example`**: thêm hướng dẫn lấy + set `AZURE_SPEECH_KEY`/
  `AZURE_SPEECH_REGION` (theo đúng pattern `GOOGLE_GENAI_API_KEY` đã có).
- Skill **`edge-functions`**: viết lại hoàn toàn mô tả `pronounce` (Azure,
  scripted/unscripted, real-time pacing bắt buộc, error tip map) và
  `session-review` (không tự chấm nữa, chỉ tổng hợp); thêm bullet quy tắc
  nghiệp vụ về secret riêng `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`.
- Skill **`code-review`**: cập nhật checklist Edge Functions — Azure thay
  Gemini, real-time pacing, chặn audio không phải WAV, thứ tự insert
  `pronunciation_attempts` trước khi gọi `session-review`.
- Skill **`app-code`**: cập nhật mô tả `ScorePanel`, `useMissionSession`/
  `useExplorationSession` (per-utterance scoring qua `onUserUtterance`),
  thêm entry `pronunciationScoring.ts` vào mục Lib, thêm quy tắc nghiệp vụ
  "ghi âm để chấm phát âm phải ra WAV PCM, dùng audio-studio không dùng
  expo-audio để ghi".
- **`db-schema`**: không cần sửa — không có thay đổi cột/bảng nào trong
  toàn bộ migration này (chỉ đổi nguồn ghi dữ liệu vào `pronunciation_attempts`
  đã có sẵn).
- Thêm test cho hàm mới `concatUint8Arrays` vào `lib/audioFormat.test.ts`
  (theo đúng quy tắc CLAUDE.md "sửa `lib/audioFormat.ts` phải cập nhật test
  tương ứng").
- **Đã verify lần cuối toàn bộ migration:** `tsc --noEmit` sạch, `expo lint`
  sạch (2 warning pre-existing không liên quan), `npx jest` 64/64 test pass
  (5 suite), `prettier --check` sạch cho mọi file code đã sửa (file `.md`
  giữ nguyên style thủ công sẵn có của repo, không bị Prettier format —
  xác nhận các skill `.md` khác chưa đụng tới cũng "fail" check này, là
  convention có từ trước, không phải lỗi do thay đổi này).

## Rủi ro chính

1. **SDK chạy trong Deno** — Phase 0 spike quyết định toàn bộ hướng đi.
   (Rủi ro cao nhất)
2. **`ja-JP` không có prosody** — đã có quy tắc degrade (`clarity=accuracy`,
   `fluency=fluencyAzure`) khi `prosody == null`.
3. **Điểm Azure phân bố khác Gemini** — ngưỡng sao (70/85) có thể cần tinh
   chỉnh sau khi thử thực tế trên dữ liệu thật.
4. **Continuous mode không hỗ trợ `EnableMiscue`** — đã bù bằng tái dùng
   `alignWords` cho scripted dài >30s (hiếm xảy ra vì Practice/Notebook là
   câu ngắn).

## Thứ tự thực hiện

Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (tuần tự, không bỏ qua Phase 0).

## ✅ MIGRATION HOÀN TẤT (cả 7 phase)

Toàn bộ chấm phát âm (Practice, Notebook, Live tự do, Kid Guided
Conversation, Kid Image Exploration) đã chuyển từ Gemini sang Azure
Pronunciation Assessment, secrets production đã set, docs/skills đã đồng
bộ. Gemini chỉ còn dùng cho Live API (STT/TTS/conversation thật) và
`image-moderation` — không còn liên quan tới chấm điểm phát âm.

## Bổ sung sau migration: completeness dùng thẳng CompletenessScore của Azure

Đổi quyết định ban đầu (Phase 1/2: "KHÔNG dùng CompletenessScore của Azure,
giữ Levenshtein cục bộ giống thời Gemini") — đã **xoá hẳn**
`levenshtein`/`charSimilarity`/`normalizeWords`/`alignWords`/
`computeCompletenessScore` khỏi `pronounce/index.ts`. `completeness` giờ
lấy thẳng `azureResult.completeness` (field mới trên `AzureAssessmentResult`,
đọc từ `pronResult.completenessScore`/`CompletenessScore` trong JSON, có
fallback aggregate theo câu cho continuous mode).

**Bug/gotcha bắt được khi test thật:** Azure **luôn** trả về 1 số cho
`CompletenessScore` — khi unscripted (không có `reference_text`) Azure tự
trả `100` (coi như "đủ" vì không có gì để so khớp), **không** trả thiếu
field hay null. `pronounce/index.ts` vẫn phải tự ép `completeness = null`
khi `!reference_text` (`const completeness = reference_text ?
azureResult.completeness : null;`) — không thể suy ra unscripted từ giá trị
Azure trả về. Đã verify bằng test thật 3 case: scripted đủ câu
(`completeness: 100`), scripted nói thiếu hẳn nửa câu
(`completeness: 28` — Azure tự phát hiện đúng, không cần thuật toán riêng),
và unscripted (Azure tự trả `100`, bị ép `null` ở lớp gọi).

Đã deploy `pronounce` lên production sau khi verify; cập nhật skill
`edge-functions`/`code-review`.

## Bổ sung sau migration: dedupe gợi ý sửa lặp lại + tip chi tiết theo phoneme

**1. Dedupe `flagged_words` khi hiển thị (Practice, Live review, Kid Parent
session):** thêm `lib/scoring.ts#dedupeFlaggedWordsAcross` (pure, có test) —
bỏ gợi ý đã hiện ở dòng/lượt nói TRƯỚC trong cùng màn hình khi trùng cả
`word` VÀ nội dung tip; cùng từ nhưng tip khác (lỗi khác lần) vẫn giữ. Áp
dụng ở `app/(app)/practice/[scenarioId].tsx` (theo thứ tự `lines`),
`app/(app)/live/review/[conversationId].tsx` và
`app/(kid)/parent/session/[conversationId].tsx` (theo thứ tự lượt nói
`sort_order`) — dùng `useMemo` đặt TRƯỚC mọi early return để không vi phạm
rules-of-hooks. Notebook không cần (chỉ hiển thị 1 kết quả/lần, không có gì
để so trùng).

**2. Tip chi tiết theo phoneme cho `Mispronunciation`:** trước đây chỉ có
tip tĩnh chung "phát âm chưa chuẩn". Giờ `_shared/azurePronunciation.ts`:
- Bật `pronunciationConfig.phonemeAlphabet = 'IPA'` (mặc định SDK là SAPI)
  + `nbestPhonemeCount = 5` trong `assessPronunciation`.
- `WordAssessment.phonemes: PhonemeAssessment[]` — mỗi phoneme có
  `accuracyScore` + `bestGuess` (phoneme IPA nhiều khả năng đã nghe được,
  suy từ `NBestPhonemes`).
- **Bug đã bắt được qua test thật (audio cố ý phát âm sai)**: `NBestPhonemes`
  nằm **trong** `PronunciationAssessment` của từng phoneme, KHÔNG ngang
  hàng với field `Phoneme` như giả định ban đầu — code lúc đầu luôn parse
  ra `bestGuess: null`. Đã sửa + verify lại bằng audio mẫu phát âm sai thật
  (`_spike-azure/test_mispronunciation_tip.ts`), kết quả đúng: tip
  `"Phát âm chưa chuẩn: /ð/ nghe như /z/, /ɚ/ nghe như /g/ — luyện lại âm
  này."`. Các mã lỗi khác (Omission/Insertion/UnexpectedBreak/MissingBreak/
  Monotone) giữ tip tĩnh cũ — không liên quan tới phoneme cụ thể.
- Không đổi shape response `pronounce`/`PronounceApiResponse` (`flagged_words:
  [{word, tip}]`) — chỉ nội dung `tip` chi tiết hơn, không cần đổi gì ở
  client/UI/DB.
- Đã deploy `pronounce` lên production sau khi verify.

**Việc còn để ngỏ, chưa làm trong migration này (không nằm trong scope ban
đầu, cần theo dõi riêng):**
- Theo dõi thực tế phân bố điểm Azure so với Gemini cũ — ngưỡng sao 70/85
  (`PRONUNCIATION_STAR_THRESHOLD`/`PRONUNCIATION_EXCELLENT_THRESHOLD`) có
  thể cần tinh chỉnh sau khi có dữ liệu người dùng thật.
- Spike artifacts ở `supabase/functions/_spike-azure/` được giữ lại làm
  tài liệu tham khảo (đã gitignore) — có thể xoá khi không còn cần.
- Chưa test thật trên thiết bị di động (chỉ verify bằng `deno run`/`tsc`/
  `jest`/`eslint`) — nên test tay luồng ghi âm thật (Practice, Notebook,
  Live, Kid Mission/Exploration) trên Android + iOS trước khi coi là xong
  hoàn toàn.
