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
- **Animation:** react-native-reanimated ~4

## Cấu trúc thư mục

```
app/                          # Expo Router
  _layout.tsx                 # KeyboardProvider > AuthProvider > ProfileProvider > ThemeProvider > RouteGuard > Slot
  (auth)/                     # login, register — Stack, no header
  (kid)/                      # Kid Mode (is_kid_mode=true): UI riêng, RouteGuard cô lập khỏi (app)
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
  SwipeableRow.tsx

lib/
  supabase.ts        # Supabase client (AsyncStorage session)
  types.ts            # Types khớp schema.sql
  audioPlayback.ts    # Singleton chống phát audio chồng lấp (xem chi tiết bên dưới)
  audioCache.ts        # Quản lý file audio local (cleanup folder live/)
  liveClient.ts        # WebSocket client cho Gemini Live API

providers/
  AuthProvider.tsx     # useAuth() -> { session, user, loading, signOut }
  ProfileProvider.tsx  # useProfile() -> { profile, isKidMode, loading, refresh } — phụ thuộc useAuth
  ThemeProvider.tsx    # useTheme() -> { themeMode, activeTheme, colors, isDark, setThemeMode } — dùng kidColors khi isKidMode

supabase/
  grants.sql, seed_*.sql
  kid_mode.sql       # Migration idempotent áp Kid Mode lên DB cũ (schema.sql là canonical)
  functions/
    chat/            # Claude — reply + translation + corrections + hints
    pronounce/        # Gemini STT + Levenshtein scoring (không gọi LLM để chấm điểm)
    tts/               # Sinh audio mẫu cho scenario_lines
    live-token/        # Tạo ephemeral token cho Gemini Live WebSocket
    session-review/    # Tóm tắt sau buổi Live (pronunciation/fluency/vocab)
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
`daily_kid_usage` đếm screen time/ngày. Bật/tắt Kid Mode ở profile (adult) →
`RouteGuard` cô lập trẻ trong nhánh `(kid)`. Roadmap đầy đủ + spike multimodal:
xem `plan.md`.

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
- **`/chat` function** lọc corrections: chỉ giữ correction nếu cụm từ lỗi thực
  sự xuất hiện trong message gần nhất của user (tránh Claude tự bịa lỗi không có
  thật).

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
