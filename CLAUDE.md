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
                              #   day-summary = màn hết giờ chơi (Screen Time, giới hạn theo phiên)
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
              BiscuitBadge (bộ đếm biscuit góc màn hình, đặt ở (kid)/_layout.tsx, đọc profile.biscuit_count),
              BiscuitReward (animation +N biscuit khi thưởng), LuckyWheel (vòng quay may mắn khi đạt tròn 3 sao),
              ScreenTimeBadge (bộ đếm góc màn hình + toast cảnh báo còn 2 phút, đặt ở (kid)/_layout.tsx),
              useMissionSession (state machine cho Guided Conversation: tải mission/steps/companion, mở LiveClient,
              theo dõi turn timeout/step advance/off-topic, gọi /session-review chấm phát âm, chấm sao + mở
              sticker/costume + thưởng biscuit (xem lib/biscuits.ts) + vòng quay may mắn khi tròn 3 sao, lưu
              conversation mode='kid_guided', kết thúc sau lượt nói hiện tại khi hết giờ chơi),
              useExplorationSession (state machine cho Image Exploration Mission, Pha 5: trẻ tự chọn 1 ảnh trong danh
              sách ảnh đã duyệt (exploration_images), resize/nén bằng expo-image-manipulator, mở LiveClient rồi gọi
              sendImageTurn() khi vào live, gọi /session-review rồi tự lưu vocab_to_learn/corrections vào saved_items
              — Kid Mode chưa có UI tap-to-save, lưu conversation mode='kid_exploration'; chấm sao theo
              avg_pronunciation (không có bước/hint như Guided Conversation) + thưởng biscuit + vòng quay may mắn
              giống useMissionSession)
  SwipeableRow.tsx

lib/
  supabase.ts        # Supabase client (AsyncStorage session)
  types.ts            # Types khớp schema.sql
  audioPlayback.ts    # Singleton chống phát audio chồng lấp (xem chi tiết bên dưới)
  audioCache.ts        # Quản lý file audio local (cleanup folder live/)
  liveClient.ts        # WebSocket client cho Gemini Live API
  pin.ts                # hashPin() — SHA-256 mã PIN phụ huynh qua expo-crypto (Pha 6)
  biscuits.ts           # awardBiscuits()/spinLuckyWheel() — gọi RPC increment_biscuits (atomic)

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
    image-moderation/  # Gemini (gemini-2.5-flash) duyệt nội dung ảnh exploration_images (Pha 5)
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

**Reward System (Pha 3):** `stickers`/`costumes` (static, catalog — 30
`missions`, 100 `stickers`, 50 `costumes` seed sẵn trong `schema.sql`/
`kid_mode.sql`; mỗi mission có `sticker_pool` 3 sticker riêng, gán tự động
bằng 1 script PL/pgSQL một lần khi seed — xem bước 29 `kid_mode.sql`) +
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

**Biscuit reward (mở rộng Reward System):** `profiles.biscuit_count` (int,
default 0) cộng dồn qua RPC `increment_biscuits(p_user_id, p_amount)`
(atomic, SECURITY INVOKER nên vẫn theo RLS "own profile" — client Supabase JS
không tự làm được `column = column + N` an toàn dưới race). Mỗi lần hoàn
thành 1 mission (Guided Conversation) hoặc 1 phiên Image Exploration đều gọi
`awardBiscuits()` (`lib/biscuits.ts`) theo số sao vừa đạt: 1 sao = 1 biscuit,
2 sao = 3 biscuit, 3 sao = 5 biscuit (`BISCUITS_BY_STARS`). Đạt tròn 3 sao
còn hiện thêm `LuckyWheel` (`components/kid/LuckyWheel.tsx`) — quay 1 lần
thưởng thêm ngẫu nhiên 1-5 biscuit (`spinLuckyWheel()`), cũng qua RPC
`increment_biscuits`. `BiscuitBadge` (đặt ở `(kid)/_layout.tsx`, đối xứng
`ScreenTimeBadge`) luôn hiện `profile.biscuit_count` ở góc màn hình; sau khi
thưởng, cả hai flow gọi `refresh()` của `ProfileProvider` để badge cập nhật
ngay. `BiscuitReward` là animation "+N 🍪" (reanimated, theo cùng cách tiếp
cận `StarRow.tsx`) hiện ở màn kết thúc mission/exploration.

**Screen Time (Pha 4):** Giới hạn áp dụng **theo từng phiên** (mỗi lần vào nhánh
`(kid)`, đếm lại từ 0), KHÔNG cộng dồn nhiều phiên trong ngày — `ScreenTimeProvider`
chỉ đếm `sessionSeconds` từ lúc provider mount để tính `remainingSeconds`/
`limitReached`, không cộng số đã dùng từ các phiên trước đó trong ngày vào giới
hạn này. `daily_kid_usage.seconds_used` vẫn được cộng dồn mỗi giây khi app ở
foreground trong nhánh `(kid)` và flush (upsert) định kỳ mỗi 10 giây + khi app
vào background/unmount, nhưng cột này CHỈ để lưu tổng thời lượng/ngày cho mục
đích thống kê (sau này có thể hiện ở Parent Dashboard), KHÔNG dùng để gate giới
hạn nữa. Giới hạn phút/phiên đọc từ `profiles.screen_time_limit_minutes` (mặc
định 20, chỉnh ở `(app)/profile.tsx` khi Kid Mode đang bật, bước nhảy 5 phút,
5-120). `ScreenTimeProvider` dùng `useSegments()` để **dừng đếm giờ** khi
phụ huynh đang ở `parent-gate`/`parent/*` (Parent Dashboard) — đây là thời
gian phụ huynh dùng máy, không phải thời gian trẻ chơi (dùng 1 ref đọc trong
`setInterval` để không phải tạo lại interval mỗi lần đổi route). Còn ≤2
phút → `ScreenTimeBadge` hiện toast cảnh báo một lần. Hết giờ
(`limitReached`): `ScreenTimeGate` ở `(kid)/_layout.tsx` chặn mọi màn (kid)
khác (trừ `mission-live`/`exploration`/`day-summary`/`parent-gate`/`parent`)
và đẩy về `day-summary` — bỏ qua `mission-live`/`exploration` để
`useMissionSession`/`useExplorationSession` tự kết thúc phiên đúng lúc (xem
dưới), bỏ qua `parent-gate`/`parent` để phụ huynh không bị đẩy ra giữa lúc
đang xem Parent Dashboard. `day-summary.tsx` vẫn hiện icon mờ vào
`parent-gate` ở góc màn hình (giống `(kid)/home.tsx`) dù đã hết giờ chơi, để
phụ huynh luôn vào được Parent Dashboard. Nếu đang ở giữa phiên Guided
Conversation, `useMissionSession` KHÔNG cắt ngay — đợi AI
nói xong lượt hiện tại (phát hiện qua `onTranscriptUpdate` khi có lượt
`assistant` mới) rồi mới `endSession()` (có fallback timeout nếu AI không nói
thêm gì), giữ đúng yêu cầu "không cắt giữa câu".

**Image Exploration Mission (Pha 5):** `exploration_images` (`storage_path` trong
bucket public `exploration-images`, `is_approved`, `safesearch_result` jsonb) —
chỉ ảnh `is_approved = true` mới đọc được (RLS), duyệt bởi edge function
`image-moderation` — gọi Gemini (`gemini-2.5-flash`, tái dùng
`GOOGLE_GENAI_API_KEY`) hỏi ảnh có an toàn cho trẻ em không, trả JSON
`{is_safe, reason}` lưu vào `safesearch_result` (tên cột giữ nguyên từ Pha 5
dù không còn dùng Cloud Vision SafeSearch nữa — đổi từ Cloud Vision sang
Gemini vì Gemini đã đọc/phân tích được ảnh, tránh phải enable + xin quyền
riêng cho Cloud Vision API trên GCP, từng bị lỗi `API_KEY_SERVICE_BLOCKED`
do API key giới hạn theo service).
`conversation_mode` có thêm value `'kid_exploration'`. `useExplorationSession`
tải tối đa 50 ảnh đã duyệt cho trẻ **tự chọn** (view `'picking'`, lưới ảnh —
KHÔNG tự động chọn ngẫu nhiên), sau khi chọn mới resize ≤1024px + nén JPEG
(`expo-image-manipulator`) thành base64 **trước khi mở WebSocket**; sau khi
`LiveClient` nhận `setupComplete` thật (không phải lúc `ws.onopen`), gọi
`sendImageTurn()` gửi MỘT `clientContent` user turn chứa ảnh + câu mở đầu cố
định (`EXPLORATION_OPENING_TEXT`) — ảnh KHÔNG được nhét vào setup message.
`scenario_lines`/`missions` không dùng ở mission này; câu hỏi (5W1H+Why) do
Gemini tự sinh từ ảnh qua system prompt (`buildKidExplorationPrompt` trong
`live-token`). Kết thúc gọi `/session-review` như Guided Conversation, lấy
`avg_pronunciation` để chấm sao (star 1 = hoàn thành phiên, star 2/3 = đạt 2
ngưỡng điểm phát âm — không có bước/hint nên không dùng cùng công thức 3 tiêu
chí như Guided Conversation), rồi **tự động** lưu `vocab_to_learn`/
`corrections` vào `saved_items` (Kid Mode chưa có UI tap-to-save như màn
review của adult).

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
RLS policy KHÔNG đủ để Postgres cho phép câu lệnh chạy tới — bảng còn cần
GRANT ở cấp lệnh (`grant delete on table ... to authenticated`, bước 25);
thiếu GRANT khiến xoá luôn thất bại dù policy đúng, đây là lớp kiểm tra độc
lập với RLS policy (đã gặp lỗi này thật với `exploration_images`, chỉ tạo
policy ở bước 24 mà quên GRANT).

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
- **Hết giờ chơi (Kid Mode, giới hạn theo phiên) không cắt phiên giữa câu** — `useMissionSession`
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
- **`image-moderation` function dùng Gemini (`gemini-2.5-flash`) để duyệt ảnh,
  KHÔNG dùng Cloud Vision SafeSearch** — tái dùng thẳng `GOOGLE_GENAI_API_KEY`
  đang dùng cho chat/STT/Live, không cần secret hay API riêng. Nếu JSON trả về
  không parse được, mặc định `is_safe: false` (an toàn là chặn duyệt, không
  tự ý approve khi không chắc).
- **PIN phụ huynh không bao giờ lưu plaintext** — `profiles.parent_pin` chỉ
  lưu hash SHA-256 (`lib/pin.ts#hashPin`); `(kid)/parent-gate.tsx` hash input
  rồi so chuỗi, không có verify phía Edge Function. Cổng vào PIN gate
  (`(kid)/home.tsx`) là icon mờ, không nhãn, theo đúng yêu cầu "không hiện
  trong UI Kid" — không tự ý làm nó nổi bật hơn. Icon này đặt `top: insets.top
  - 8`(qua`useSafeAreaInsets()`), không hardcode `top: 8`, để không bị
    status bar/notch che (đã từng bị che trên thiết bị có insets lớn).
- **Policy RLS cho Supabase Storage là độc lập với policy RLS của bảng** —
  thêm policy insert ở bảng `exploration_images` không tự động cho phép
  upload file vào bucket `exploration-images`; phải thêm policy riêng trên
  `storage.objects` (xem bước 23, `kid_mode.sql`) scope theo
  `(storage.foldername(name))[1] = auth.uid()::text`. Thiếu policy này khiến
  `parent/images.tsx` luôn báo lỗi "Không thể tải ảnh lên." dù code app đúng.
- **`Switch` (React Native) đổi `value` qua `onValueChange` phải `setState` ngay,
  KHÔNG `await` network rồi mới set** — native Switch (đặc biệt Android) đã tự
  nhảy theo gesture ngay lúc chạm; nếu đợi `await supabase...update()` xong mới
  `setProfile(...)`, React sẽ phát hiện prop `value` đổi và tự chạy animate lại
  từ vị trí cũ sang vị trí mới, gây hiệu ứng nháy 1 cái rồi animate lại (xem
  `toggleKidMode` ở `(app)/profile.tsx` — set state đồng bộ trước, rollback nếu
  `update()` lỗi).
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
