# ParlEcho

App luyện nói tiếng Anh & tiếng Nhật song song (shadowing, chat AI, live
conversation, pronunciation scoring). React Native + Expo, backend Supabase.

## Tech stack

- **App:** Expo SDK ~54, React 19, React Native 0.81, Expo Router ~6
  (file-based, typed routes)
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions Deno)
- **LLM chat:** Claude API (`claude-sonnet-4-6`) qua Edge Function `/chat`
- **STT/TTS/Live:** Google Gemini (`gemini-2.5-flash` cho STT/TTS,
  `gemini-*-live-preview` cho WebSocket Live)
- **Audio:** `expo-audio`, `expo-speech`, `@siteed/expo-audio-studio` (mic
  streaming + AEC), `react-native-audio-api` (buffer queue cho Live)
- **Image:** `expo-image-manipulator` (resize + nén ảnh trước khi gửi multimodal
  cho Image Exploration Mission, Pha 5), `expo-image-picker` (chụp ảnh camera
  hoặc chọn từ thư viện cho Parent Dashboard upload, Pha 6 — cần plugin
  `expo-image-picker` trong `app.json` để khai báo `cameraPermission`)
- **Security:** `expo-crypto` (hash SHA-256 mã PIN phụ huynh, Pha 6)
- **Animation:** react-native-reanimated ~4

## Cấu trúc thư mục

```
app/                          # Expo Router
  _layout.tsx                 # KeyboardProvider > AuthProvider > ProfileProvider > ThemeProvider > RouteGuard > Slot
  (auth)/                     # login, register — Stack, no header
  (kid)/                      # Kid Mode (is_kid_mode=true): UI riêng, RouteGuard cô lập khỏi (app)
                              #   _layout.tsx bọc ScreenTimeProvider + ScreenTimeGate (Pha 4)
                              #   onboarding = chọn nhân vật lần đầu, home = màn chính (gate onboarding nếu chưa chọn)
                              #   missions = list nhiệm vụ, mission-live = phiên Guided Conversation (LiveClient + companion)
                              #   exploration = phiên Image Exploration Mission (LiveClient gửi ảnh multimodal, Pha 5)
                              #   collection = Album sticker + tủ trang phục (Reward System)
                              #   day-summary = màn hết giờ chơi/ngày (Screen Time)
                              #   parent-gate = nhập PIN phụ huynh (icon mờ, không nổi bật, ở góc home, Pha 6)
                              #   parent/dashboard = KPI + biểu đồ phiên/điểm phát âm, parent/sessions = list
                              #   phiên kid_guided/kid_exploration, parent/session/[conversationId] = transcript +
                              #   nghe lại audio + highlight lượt lạc đề, parent/images = upload ảnh Image Mission,
                              #   parent/vocab = CRUD từ vựng ưu tiên (Pha 6)
  (app)/                      # Tab bar: home, practice, chat, live, profile (+ ẩn: notebook, analytics)
    index.tsx                 # Home: goal, streak, weekly chart, action cards
    practice/                 # index = list kịch bản, [scenarioId] = chi tiết shadowing
    chat.tsx                  # Chat tự do với AI (Claude)
    live/                     # index = setup+live+review, history, review/[conversationId]
    notebook.tsx              # Saved words/phrases/mistakes + flashcard
    analytics.tsx             # Charts tiến độ

components/
  practice/   LineCard, ScorePanel, WordHighlight
  chat/       ChatBubble, CorrectionRow
  live/       SetupView, LiveConversationView, StatusView, useLiveSession (state machine)
  notebook/   FlashcardModal, PronouncePracticeModal, SavedItemCard
  analytics/  ProgressRing, NotebookPieChart
  kid/        Companion (emoji + reanimated, biểu cảm idle/happy/surprised/cheering/thinking), companionAssets,
              StarRow (animation sao bay khi tổng kết mission),
              ScreenTimeBadge (bộ đếm góc màn hình + toast cảnh báo còn 2 phút, đặt ở (kid)/_layout.tsx),
              useMissionSession (state machine cho Guided Conversation: tải mission/steps/companion, mở LiveClient,
              theo dõi turn timeout/step advance/off-topic, gọi /session-review chấm phát âm, chấm sao + mở
              sticker/costume, lưu conversation mode='kid_guided', kết thúc sau lượt nói hiện tại khi hết giờ chơi/ngày),
              useExplorationSession (state machine cho Image Exploration Mission, Pha 5: chọn ảnh approved ngẫu nhiên
              từ exploration_images, resize/nén bằng expo-image-manipulator, mở LiveClient rồi gọi sendImageTurn() khi
              vào live, gọi /session-review rồi tự lưu vocab_to_learn/corrections vào saved_items — Kid Mode chưa có
              UI tap-to-save, lưu conversation mode='kid_exploration')
  SwipeableRow.tsx

lib/
  supabase.ts        # Supabase client (AsyncStorage session)
  types.ts            # Types khớp schema.sql
  audioPlayback.ts    # Singleton chống phát audio chồng lấp (xem chi tiết bên dưới)
  audioCache.ts        # Quản lý file audio local (cleanup folder live/)
  liveClient.ts        # WebSocket client cho Gemini Live API
  pin.ts                # hashPin() — SHA-256 mã PIN phụ huynh qua expo-crypto (Pha 6)

providers/
  AuthProvider.tsx        # useAuth() -> { session, user, loading, signOut }
  ProfileProvider.tsx     # useProfile() -> { profile, isKidMode, loading, refresh } — phụ thuộc useAuth
  ThemeProvider.tsx       # useTheme() -> { themeMode, activeTheme, colors, isDark, setThemeMode } — dùng kidColors khi isKidMode
  ScreenTimeProvider.tsx  # useScreenTime() -> { usedSeconds, limitSeconds, remainingSeconds, limitReached,
                          #   showWarning } — đếm giây khi app foreground, flush định kỳ vào daily_kid_usage;
                          #   chỉ bọc nhánh (kid) (xem (kid)/_layout.tsx)

supabase/
  grants.sql, seed_*.sql
  kid_mode.sql       # Migration idempotent áp Kid Mode lên DB cũ (schema.sql là canonical)
  functions/
    chat/            # Claude — reply + translation + corrections + hints
    pronounce/        # Gemini STT + Levenshtein scoring (không gọi LLM để chấm điểm)
    tts/               # Sinh audio mẫu cho scenario_lines
    live-token/        # Tạo ephemeral token cho Gemini Live WebSocket
    session-review/    # Tóm tắt sau buổi Live (pronunciation/fluency/vocab)
    image-moderation/  # Google Vision SafeSearch duyệt ảnh exploration_images (Pha 5)
    _shared/cors.ts, auth.ts (verifyUser)

scripts/
  generate-audio.mjs           # Pre-generate TTS cho scenario_lines còn thiếu audio_url
  generate-scenarios-sql.mjs   # Sinh SQL seed từ định nghĩa kịch bản
  fix-group-ids.mjs            # Sửa scenario_group_id sai lệch

schema.sql
```

## Database (schema.sql)

`languages`, `scenario_groups`, `scenarios`, `scenario_lines` (kịch bản + audio
mẫu) — `profiles`, `conversations`, `messages` (chat) —
`pronunciation_attempts`, `user_progress`, `daily_activity`, `daily_kid_usage`
(tiến độ) — `saved_items` (flashcard). RLS: user chỉ đọc/ghi dữ liệu của chính
mình (xem `grants.sql`).

**Kid Mode (đang triển khai theo `plan.md`):** `profiles` có `is_kid_mode`,
`parent_pin`, `companion_id`, `screen_time_limit_minutes`, `child_name`,
`child_level`. `scenarios.audience` (`'adult'|'child'`) phân loại nội dung.
`companions` (static, seed bear/cat/robot) lưu `name` + `personality` (dùng cho
system prompt Gemini) + `accent_color`. `daily_kid_usage` đếm screen time/ngày.
Bật Kid Mode ở `(app)/profile.tsx` **bắt đặt `parent_pin` trước** (mở PIN modal
ngay khi gạt switch nếu chưa có PIN) — KHÔNG tự động điều hướng vào `(kid)`
(`RouteGuard` ở `app/_layout.tsx` chỉ chặn chiều ngược lại: `!isKidMode` mà
đang ở `(kid)` thì đẩy về `(app)`), để phụ huynh còn ở lại `(app)/profile.tsx`
thiết lập tiếp (giới hạn giờ, upload ảnh qua Parent Dashboard...) mà không bị
"nhốt" trong `(kid)`. Phụ huynh tự bấm "Vào Kid Mode" (settingRow, chỉ hiện khi
đã có PIN) để chuyển sang `(kid)/home` khi sẵn sàng giao máy. `ThemeProvider`
chỉ áp `kidColors` khi `isKidMode && đang ở route group (kid)` (dùng
`useSegments()`), không áp toàn app chỉ vì `is_kid_mode=true` trong DB.

**Guided Conversation (Pha 2):** `missions` (static, seed "Gọi món tại quán
kem") + `mission_steps` (`step_order`, `target_sentence`, `intent`) định nghĩa
nhiệm vụ trẻ đi qua từng bước. `conversations.mission_id` gắn phiên với
nhiệm vụ, `conversation_mode` có thêm value `'kid_guided'`. AI (qua
`live-token` system prompt) chèn marker `[STEP_DONE]`/`[OFFTOPIC]` vào lời nói
— `LiveClient` parse và strip các marker này (xem `STEP_DONE_MARKER`,
`OFFTOPIC_MARKER` trong `lib/liveClient.ts`) để bắn callback
`onStepAdvance`/`onOffTopic`, KHÔNG hiển thị marker cho người dùng.

**Reward System (Pha 3):** `stickers`/`costumes` (static, catalog) +
`user_stickers`/`user_costumes` (đã mở khoá, owner-only) + `mission_results`
(`stars` 0-3, `used_hint`, gắn `mission_id`/`conversation_id`). Mỗi `mission`
có `sticker_pool` (text[] id sticker có thể thưởng). Chấm sao khi kết thúc
mission (`useMissionSession.awardMissionResult`): star 1 = hoàn thành đủ
bước, star 2 = `avg_pronunciation` (từ `/session-review`, tái dùng cho Kid
Mode kể từ pha này) đạt ngưỡng `PRONUNCIATION_STAR_THRESHOLD`, star 3 =
không bấm nút "Gợi ý" trong phiên. Số sao đạt được mở khoá tương ứng số
sticker trong `sticker_pool` (theo thứ tự, bỏ qua cái đã có); đạt tròn 3 sao
mở thêm 1 costume mới cho companion hiện tại. Streak không reset
sticker/costume đã mở (bỏ lỡ ngày không bị thu hồi).

**Screen Time (Pha 4):** `daily_kid_usage.seconds_used` được `ScreenTimeProvider`
cộng dồn mỗi giây khi app ở foreground trong nhánh `(kid)`, flush (upsert) định
kỳ mỗi 10 giây + khi app vào background/unmount. Giới hạn phút/ngày đọc từ
`profiles.screen_time_limit_minutes` (mặc định 20, chỉnh ở `(app)/profile.tsx`
khi Kid Mode đang bật, bước nhảy 5 phút, 5-120). Còn ≤2 phút → `ScreenTimeBadge`
hiện toast cảnh báo một lần. Hết giờ (`limitReached`): `ScreenTimeGate` ở
`(kid)/_layout.tsx` chặn mọi màn (kid) khác (trừ `mission-live`/`day-summary`)
và đẩy về `day-summary`; nếu đang ở giữa phiên Guided Conversation,
`useMissionSession` KHÔNG cắt ngay — đợi AI nói xong lượt hiện tại (phát hiện
qua `onTranscriptUpdate` khi có lượt `assistant` mới) rồi mới `endSession()`
(có fallback timeout nếu AI không nói thêm gì), giữ đúng yêu cầu "không cắt
giữa câu".

**Image Exploration Mission (Pha 5):** `exploration_images` (`storage_path` trong
bucket public `exploration-images`, `is_approved`, `safesearch_result` jsonb) —
chỉ ảnh `is_approved = true` mới đọc được (RLS), duyệt bởi edge function
`image-moderation` (Google Vision SafeSearch, tái dùng `GOOGLE_GENAI_API_KEY`).
`conversation_mode` có thêm value `'kid_exploration'`. `useExplorationSession`
chọn ngẫu nhiên 1 ảnh đã duyệt, resize ≤1024px + nén JPEG (`expo-image-manipulator`)

- base64 **trước khi mở WebSocket**; sau khi `LiveClient` nhận `setupComplete`
  thật (không phải lúc `ws.onopen`), gọi `sendImageTurn()` gửi MỘT `clientContent`
  user turn chứa ảnh + câu mở đầu cố định (`EXPLORATION_OPENING_TEXT`) — ảnh
  KHÔNG được nhét vào setup message. `scenario_lines`/`missions` không dùng ở
  mission này; câu hỏi (5W1H+Why) do Gemini tự sinh từ ảnh qua system prompt
  (`buildKidExplorationPrompt` trong `live-token`). Kết thúc gọi `/session-review`
  như Guided Conversation, rồi **tự động** lưu `vocab_to_learn`/`corrections` vào
  `saved_items` (Kid Mode chưa có UI tap-to-save như màn review của adult).

**Parent Dashboard (Pha 6):** `profiles.parent_pin` lưu hash SHA-256 (xem
`lib/pin.ts`), so khớp client-side ở `(kid)/parent-gate.tsx` — không có hàm
verify phía server. `conversations.summary` (jsonb, trước đây chỉ ghi cho
review của adult) nay cũng được `useMissionSession` ghi cho `kid_guided`:
`{ avg_pronunciation, offtopic_turns: number[] }` — `offtopic_turns` là danh
sách `sort_order` của các lượt AI bị đánh dấu lạc đề (lấy từ
`LiveClient.onOffTopic(streak, sortOrder)`, xem `lib/liveClient.ts`), dùng để
highlight transcript ở `parent/session/[conversationId].tsx`. `priority_vocab`
(owner-only, `user_id`/`language_id`/`content`) là từ vựng phụ huynh thêm qua
`parent/vocab.tsx`; `(kid)/missions.tsx` đẩy lên đầu danh sách (badge "⭐ Ưu
tiên") mọi mission có `title`/`topic` chứa một `content` trong đó.
`exploration_images` có thêm policy insert (`uploader = auth.uid()`) và SELECT
mở rộng (`is_approved = true or uploader = auth.uid()`) để `parent/images.tsx`
upload ảnh mới (qua `expo-image-picker` — chụp ảnh camera hoặc chọn từ album +
bucket `exploration-images`) và theo dõi trạng thái duyệt của ảnh mình tải
lên, gọi lại edge function `image-moderation` (Pha 5) ngay sau insert.
`storage.objects` của bucket `exploration-images` cần thêm policy insert riêng
(`exploration-images: own upload`, scope theo path `{auth.uid()}/...`) — chỉ
tạo policy ở bảng `exploration_images` (bước 20) KHÔNG đủ để upload file vào
Storage thành công, đây là 2 lớp RLS độc lập (bảng vs `storage.objects`).
Tương tự, xoá ảnh (`parent/images.tsx`) cần cả 2 policy delete: bước 24 thêm
policy delete cho bảng `exploration_images` (owner-only) VÀ cho
`storage.objects` (scope cùng path) — thiếu 1 trong 2 sẽ xoá được record DB
nhưng để rác file trong Storage, hoặc xoá được file nhưng lỗi xoá record.

Roadmap đầy đủ + spike multimodal: xem `plan.md`.

## Code style & convention

- **Component:** functional + hooks only. Props khai báo bằng
  `interface XxxProps`.
- **Styling:** luôn dùng `useTheme()` lấy `colors`, rồi
  `const styles = getStyles(colors)` với `getStyles` là hàm
  `StyleSheet.create()` đặt ở cuối file. Không dùng inline style, không hardcode
  màu trong JSX.
- **State:** `useState` cho local; context (`useAuth`, `useTheme`, `useSidebar`)
  cho global. Không dùng Redux/Zustand.
- **Data fetching:** `useCallback` + `useFocusEffect` khi cần load lại khi focus
  màn hình. Gọi Supabase trực tiếp (`supabase.from(...)`), không có data layer
  trừu tượng.
- **Async/error:** try/catch hoặc kiểm tra `.error` từ response Supabase. Không
  có error boundary phức tạp.
- **Import order:** thư viện ngoài → relative (`../../lib`, `../../providers`) →
  types.
- **Naming:** file/route kebab-case hoặc `[param]`; component/hook
  PascalCase/`useXxx`; biến/hàm camelCase; hằng số UPPERCASE.
- **Comment:** tối thiểu, code tự giải thích qua tên biến/hàm. UI string tiếng
  Việt, code/tên hàm tiếng Anh.
- **Format:** Prettier — semi, single quote, trailing comma all, printWidth 100,
  tabWidth 2. ESLint ignore `supabase/functions/**` và `scripts/**` (Deno/Node,
  không theo convention RN).
- **TypeScript:** strict mode, alias `@/*`.

## Quy tắc nghiệp vụ quan trọng

- **Audio không được phát chồng lấp**: trước khi tạo `AudioPlayer` hoặc gọi
  `expo-speech` mới, PHẢI gọi `stopActiveAudio()` từ `lib/audioPlayback.ts`
  trước, sau đó `registerActiveAudio(player, onStop)` (hoặc
  `registerActiveSpeech`). Khi player bị huỷ phải gọi
  `clearActiveAudio(player)`/`clearActiveSpeech()`. Đây là singleton
  module-level, từng bị bug phát đè (xem commit `b669cde`, `1ed19dd`) — không tự
  ý bỏ qua bước này khi thêm chỗ phát audio mới.
- **Pronunciation scoring không dùng LLM để chấm điểm** — `pronounce` function
  transcribe bằng Gemini rồi tính điểm bằng Levenshtein distance cục bộ
  (accuracy/fluency/completeness), tránh chi phí và độ trễ gọi thêm LLM chấm
  điểm.
- **Live session** giới hạn 15 phút (giới hạn cứng của Gemini Live), token
  ephemeral hiệu lực 30 phút.
- **Guided Conversation (Kid Mode)** giới hạn 10 phút/phiên, mỗi lượt trẻ có
  tối đa 8s để nói (`TURN_LIMIT_SEC` trong `useMissionSession.ts`) trước khi
  companion nhắc lại. Tiến trình bước (`STEP_DONE`) và lạc đề (`OFFTOPIC`)
  được AI báo qua marker trong text — KHÔNG dùng heuristic phía client để suy
  đoán, tránh sai lệch với system prompt.
- **Guided Conversation gọi `/session-review`** sau mỗi mission (kể từ Pha 3)
  để lấy `avg_pronunciation` dùng tính sao — phần `corrections`/`vocab_to_learn`
  từ Claude trong response này KHÔNG hiển thị cho trẻ (Kid Mode chưa có UI sửa
  ngữ pháp), chỉ `avg_pronunciation` được dùng.
- **`/chat` function** lọc corrections: chỉ giữ correction nếu cụm từ lỗi thực
  sự xuất hiện trong message gần nhất của user (tránh Claude tự bịa lỗi không có
  thật).
- **Hết giờ chơi/ngày (Kid Mode) không cắt phiên giữa câu** — `useMissionSession`
  chỉ đặt cờ chờ (`timeUpPendingRef`) khi `ScreenTimeProvider` báo
  `limitReached`, và chỉ gọi `endSession()` ở điểm AI vừa hoàn thành một lượt
  nói mới (hoặc sau timeout fallback `TIME_UP_FALLBACK_MS` nếu AI im lặng).
  `useExplorationSession` dùng lại đúng pattern này.
- **`LiveClient.sendImageTurn()` chỉ được gửi sau khi server xác nhận
  `setupComplete` thật** — KHÔNG phải lúc `ws.onopen` (lúc đó `onStateChange('live')`
  đã fire nhưng server có thể chưa sẵn sàng nhận `clientContent`). Gọi
  `sendImageTurn()` sớm hơn vẫn an toàn vì `LiveClient` tự queue
  (`pendingImageTurn`) và flush khi `_handleMessage` nhận `setupComplete`. Hành
  vi này đã được verify bằng spike `scripts/spike-live-image.mjs` trước khi
  implement — không tự ý đổi thứ tự gửi ảnh/setup.
- **`image-moderation` function tái dùng `GOOGLE_GENAI_API_KEY`** cho Google
  Cloud Vision SafeSearch — không cần thêm secret riêng, miễn Cloud Vision API
  đã enable trên cùng GCP project với Gemini.
- **PIN phụ huynh không bao giờ lưu plaintext** — `profiles.parent_pin` chỉ
  lưu hash SHA-256 (`lib/pin.ts#hashPin`); `(kid)/parent-gate.tsx` hash input
  rồi so chuỗi, không có verify phía Edge Function. Cổng vào PIN gate
  (`(kid)/home.tsx`) là icon mờ, không nhãn, theo đúng yêu cầu "không hiện
  trong UI Kid" — không tự ý làm nó nổi bật hơn. Icon này đặt `top: insets.top
  + 8` (qua `useSafeAreaInsets()`), không hardcode `top: 8`, để không bị
  status bar/notch che (đã từng bị che trên thiết bị có insets lớn).
- **Policy RLS cho Supabase Storage là độc lập với policy RLS của bảng** —
  thêm policy insert ở bảng `exploration_images` không tự động cho phép
  upload file vào bucket `exploration-images`; phải thêm policy riêng trên
  `storage.objects` (xem bước 23, `kid_mode.sql`) scope theo
  `(storage.foldername(name))[1] = auth.uid()::text`. Thiếu policy này khiến
  `parent/images.tsx` luôn báo lỗi "Không thể tải ảnh lên." dù code app đúng.
- **TODO (Pha 6, hoãn):** Parent Dashboard chưa có push/email notification
  (vd. báo phụ huynh khi có ảnh mới cần duyệt, khi đạt sao, khi gần hết giờ
  chơi) — cần chọn provider (Expo Push/FCM hoặc email service) và bảng lưu
  device token/preference trước khi triển khai.

## Lệnh hay dùng

- `npm run lint` — `expo lint`
- `npm run format` / `format:check` — Prettier
- `npm run generate-audio` — sinh audio mẫu còn thiếu cho scenario_lines (cần
  `.env.scripts` với `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENAI_API_KEY`)

## Bắt buộc: giữ CLAUDE.md luôn cập nhật

Sau khi thêm chức năng mới, thêm/xoá/đổi tên file-thư mục, đổi tech
stack/dependency quan trọng, đổi schema DB, hoặc đổi quy tắc nghiệp vụ — PHẢI
cập nhật phần tương ứng trong file này (cấu trúc thư mục, tech stack, database,
quy tắc nghiệp vụ...) trong cùng lần thay đổi đó, không để lại cho lần sau.
