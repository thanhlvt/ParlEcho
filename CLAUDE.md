# ParlEcho

App luyện nói tiếng Anh & tiếng Nhật song song (shadowing, chat AI, live
conversation, pronunciation scoring) cho người lớn, kèm **Kid Mode** riêng
cho trẻ em (Guided Conversation, Image Exploration Mission, Reward System,
Screen Time, Parent Dashboard). React Native + Expo, backend Supabase.

## Tech stack

- **App:** Expo SDK ~54, React 19, React Native 0.81, Expo Router ~6
  (file-based, typed routes)
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions Deno)
- **LLM chat:** Claude API (`claude-sonnet-4-6`) qua Edge Function `/chat`
- **STT/TTS/Live:** Google Gemini (`gemini-2.5-flash` cho STT/TTS,
  `gemini-*-live-preview` cho WebSocket Live)
- **Audio:** `expo-audio`, `expo-speech`, `@siteed/expo-audio-studio` (mic
  streaming + AEC), `react-native-audio-api` (buffer queue cho Live)
- **Image:** `expo-image-manipulator` (resize + nén ảnh trước khi gửi
  multimodal cho Image Exploration Mission), `expo-image-picker` (chụp ảnh
  camera hoặc chọn từ thư viện cho Parent Dashboard upload — cần plugin
  `expo-image-picker` trong `app.json` để khai báo `cameraPermission`)
- **Security:** `expo-crypto` (hash SHA-256 mã PIN phụ huynh)
- **Animation:** react-native-reanimated ~4

## Cấu trúc thư mục

```
app/                # Expo Router
  _layout.tsx        # KeyboardProvider > AuthProvider > ProfileProvider > ThemeProvider > RouteGuard > Slot
  (auth)/             # login, register
  (kid)/              # Kid Mode (is_kid_mode=true) — UI riêng, cô lập khỏi (app)
  (app)/              # Tab bar: home, practice, chat, live, profile (+ ẩn: notebook, analytics)

components/
  practice/, chat/, live/, notebook/, analytics/   # theo từng tab (app)
  kid/                                              # components + hooks riêng cho Kid Mode
  SwipeableRow.tsx

lib/                  # Supabase client, types, audio, LiveClient, biscuits, pin
providers/            # AuthProvider, ProfileProvider, ThemeProvider, ScreenTimeProvider

supabase/
  grants.sql, seed_*.sql, kid_mode.sql   # migration idempotent cho DB cũ
  functions/           # Edge Functions (Deno): chat, pronounce, tts, live-token,
                       #   session-review, image-moderation, _shared

scripts/              # generate-audio, generate-scenarios-sql, fix-group-ids

schema.sql            # canonical schema cho DB tạo mới
```

Chi tiết theo khu vực — xem skill tương ứng (tự động gợi ý khi liên quan,
hoặc gọi trực tiếp bằng `/<skill-name>`):

- **`app-code`** — cấu trúc `app/`, `components/`, `providers/`, `lib/`,
  Kid Mode flow, quy tắc nghiệp vụ phía app (audio singleton, Screen Time,
  PIN gate, Switch...).
- **`db-schema`** — bảng dữ liệu, RLS, RPC, quy ước migration
  (`schema.sql` ↔ `supabase/kid_mode.sql`), Storage policy.
- **`edge-functions`** — từng Edge Function trong `supabase/functions/` và
  quy tắc nghiệp vụ riêng (pronunciation scoring, correction filtering,
  image moderation...).
- **`code-review`** — checklist các lỗi/gotcha đặc thù dự án cần soát lại
  trước khi duyệt thay đổi.

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

## Lệnh hay dùng

- `npm run lint` — `expo lint`
- `npm run format` / `format:check` — Prettier
- `npm run generate-audio` — sinh audio mẫu còn thiếu cho scenario_lines (cần
  `.env.scripts` với `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENAI_API_KEY`)

## Bắt buộc: giữ tài liệu luôn cập nhật

Sau khi thêm chức năng mới, thêm/xoá/đổi tên file-thư mục, đổi tech
stack/dependency quan trọng, đổi schema DB, hoặc đổi quy tắc nghiệp vụ — PHẢI
cập nhật CLAUDE.md **và** skill liên quan (`.claude/skills/app-code`,
`db-schema`, `edge-functions`, `code-review`) trong cùng lần thay đổi đó,
không để lại cho lần sau. Chỉ ghi thông tin chức năng hiện tại (cấu trúc,
quy tắc, lý do kỹ thuật) — không ghi lịch sử triển khai (phase, ngày tháng,
commit).
