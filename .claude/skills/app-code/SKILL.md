---
name: app-code
description: Cấu trúc và quy tắc nghiệp vụ phía app (React Native/Expo) của ParlEcho — routing, providers, Kid Mode components/hooks, audio singleton, Screen Time, PIN gate. Dùng khi viết/sửa code trong app/, components/, providers/, lib/.
---

# App code (React Native / Expo)

## Routing (`app/`)

- `_layout.tsx`: `KeyboardProvider > AuthProvider > ProfileProvider >
ThemeProvider > RouteGuard > Slot`. `RouteGuard` chỉ chặn chiều
  `!isKidMode` mà đang ở `(kid)` → đẩy về `(app)` (không tự động điều
  hướng `isKidMode=true` vào `(kid)` — phụ huynh tự bấm vào khi sẵn sàng).
- `(auth)/`: login, register — Stack, no header.
- `(app)/`: tab bar `home, practice, chat, live, profile` (+ ẩn:
  `notebook`, `analytics`).
  - `practice/`: `index` = list kịch bản, `[scenarioId]` = chi tiết shadowing.
  - `live/`: `index` = setup+live+review, `history`, `review/[conversationId]`.
- `(kid)/`: UI riêng cho trẻ em, cô lập hoàn toàn khỏi `(app)`.
  - `_layout.tsx` bọc `ScreenTimeProvider` + `ScreenTimeGate`.
  - `onboarding` = chọn nhân vật đồng hành lần đầu; `home` = màn chính
    (gate sang `onboarding` nếu chưa chọn).
  - `missions` = list nhiệm vụ; `mission-live` = phiên Guided Conversation
    (`useMissionSession` + `LiveClient` + companion).
  - `exploration` = phiên Image Exploration Mission (`useExplorationSession`
    — `LiveClient` gửi ảnh multimodal).
  - `collection` = Album sticker + Tủ trang phục (cửa hàng costume).
  - `day-summary` = màn hết giờ chơi (Screen Time, giới hạn theo phiên).
  - `parent-gate` = nhập PIN phụ huynh (icon mờ, không nhãn, ở góc `home`).
  - `parent/dashboard` = KPI + biểu đồ phiên/điểm phát âm; `parent/sessions`
    = list phiên `kid_guided`/`kid_exploration`; `parent/session/[id]` =
    transcript + nghe lại audio + highlight lượt lạc đề; `parent/images` =
    upload/duyệt ảnh Image Mission; `parent/vocab` = CRUD từ vựng ưu tiên.

## Components (`components/`)

- `practice/`: `LineCard`, `ScorePanel`, `WordHighlight`.
- `chat/`: `ChatBubble`, `CorrectionRow`.
- `live/`: `SetupView`, `LiveConversationView`, `StatusView`,
  `useLiveSession` (state machine cho Live tự do, adult).
- `notebook/`: `FlashcardModal`, `PronouncePracticeModal`, `SavedItemCard`.
- `analytics/`: `ProgressRing`, `NotebookPieChart`.
- `kid/`:
  - `Companion` (emoji + reanimated, biểu cảm
    idle/happy/surprised/cheering/thinking), `companionAssets`.
  - `StarRow` (animation sao bay khi tổng kết mission).
  - `BiscuitBadge` (bộ đếm biscuit góc màn hình, đặt ở `(kid)/_layout.tsx`,
    đọc `profile.biscuit_count`), `BiscuitReward` (animation "+N 🍪" khi
    thưởng), `LuckyWheel` (vòng quay may mắn khi đạt tròn 3 sao).
  - `ScreenTimeBadge` (bộ đếm góc màn hình + toast cảnh báo còn 2 phút, đặt
    ở `(kid)/_layout.tsx`).
  - `useMissionSession`: state machine cho Guided Conversation — tải
    mission/steps/companion, mở `LiveClient`, theo dõi turn timeout/step
    advance/off-topic, gọi `/session-review` chấm phát âm, chấm sao + mở
    sticker + thưởng biscuit (`lib/biscuits.ts`) + Lucky Wheel khi tròn 3
    sao (costume KHÔNG mở qua đây — mua bằng biscuit ở `collection.tsx`),
    lưu `conversations.mode='kid_guided'`, kết thúc sau lượt nói hiện tại
    khi hết giờ chơi.
  - `useExplorationSession`: state machine cho Image Exploration Mission —
    trẻ tự chọn 1 ảnh trong danh sách đã duyệt (`exploration_images`),
    resize/nén bằng `expo-image-manipulator`, mở `LiveClient` rồi gọi
    `sendImageTurn()`, gọi `/session-review` rồi tự lưu
    `vocab_to_learn`/`corrections` vào `saved_items` (Kid Mode chưa có UI
    tap-to-save), lưu `conversations.mode='kid_exploration'`; chấm sao theo
    `avg_pronunciation` (không có bước/hint) + thưởng biscuit + Lucky Wheel
    giống `useMissionSession`.
- `SwipeableRow.tsx`: dùng cho list có hành động xoá (vd. lịch sử phiên).

## Lib (`lib/`)

- `supabase.ts`: Supabase client (AsyncStorage session).
- `types.ts`: types khớp `schema.sql`.
- `audioPlayback.ts`: singleton chống phát audio chồng lấp (xem quy tắc dưới).
- `audioCache.ts`: quản lý file audio local (cleanup folder `live/`).
- `liveClient.ts`: WebSocket client cho Gemini Live API.
- `pin.ts`: `hashPin()` — SHA-256 mã PIN phụ huynh qua `expo-crypto`.
- `biscuits.ts`: `awardBiscuits()`, `spinLuckyWheel()`, `purchaseCostume()`
  — gọi các RPC atomic (`increment_biscuits`, `purchase_costume`), xem
  skill `db-schema`.

## Providers (`providers/`)

- `AuthProvider` → `useAuth()`: `{ session, user, loading, signOut }`.
- `ProfileProvider` → `useProfile()`: `{ profile, isKidMode, loading,
refresh }` — phụ thuộc `useAuth`.
- `ThemeProvider` → `useTheme()`: `{ themeMode, activeTheme, colors, isDark,
setThemeMode }` — chỉ áp `kidColors` khi `isKidMode && đang ở route group
(kid)` (dùng `useSegments()`), không áp toàn app chỉ vì `is_kid_mode=true`
  trong DB.
- `ScreenTimeProvider` → `useScreenTime()`: `{ usedSeconds, limitSeconds,
remainingSeconds, limitReached, showWarning }` — chỉ bọc nhánh `(kid)`.

## Quy tắc nghiệp vụ phía app

- **Audio không được phát chồng lấp**: trước khi tạo `AudioPlayer` hoặc gọi
  `expo-speech` mới, PHẢI gọi `stopActiveAudio()` từ `lib/audioPlayback.ts`
  trước, sau đó `registerActiveAudio(player, onStop)` (hoặc
  `registerActiveSpeech`). Khi player bị huỷ phải gọi
  `clearActiveAudio(player)`/`clearActiveSpeech()`. Đây là singleton
  module-level — không tự ý bỏ qua bước này khi thêm chỗ phát audio mới.
- **`registerActiveAudio` tự có watchdog chống "kẹt nút play"**: module
  `AudioPlayer` của `expo-audio` trên Android không bao giờ bắn event báo lỗi
  khi nguồn audio load thất bại (file cục bộ bị xoá, URL hỏng/hết hạn, sai
  định dạng) — `player.play()` chạy "thành công" về mặt JS nhưng không phát
  ra tiếng và không bao giờ bắn `didJustFinish`, khiến nút Play kẹt ở trạng
  thái "đang phát" vĩnh viễn (khởi động lại app không tự hết, vì nguồn audio
  vẫn hỏng y như cũ). `registerActiveAudio` tự poll `player.playing`/
  `player.isBuffering` sau ~8s (tối đa 2 lần nếu vẫn đang buffer) — nếu chưa
  từng phát được thì tự `stopActiveAudio()` (đưa UI về trạng thái idle qua
  `onStop`) + hiện `Alert` báo lỗi. Không cần tự xử lý lại ở từng màn hình
  gọi `registerActiveAudio`.
- **Kid Mode toggle ở `(app)/profile.tsx`** bắt đặt `parent_pin` trước (mở
  PIN modal ngay khi gạt switch nếu chưa có PIN) — KHÔNG tự động điều
  hướng vào `(kid)`, để phụ huynh còn ở lại thiết lập tiếp (giới hạn giờ,
  upload ảnh...). Phụ huynh tự bấm "Vào Kid Mode" để chuyển sang
  `(kid)/home` khi sẵn sàng giao máy.
- **`Switch` (React Native) đổi `value` qua `onValueChange` phải `setState`
  ngay, KHÔNG `await` network rồi mới set** — native Switch (đặc biệt
  Android) đã tự nhảy theo gesture ngay lúc chạm; nếu đợi
  `await supabase...update()` xong mới `setProfile(...)`, React sẽ phát
  hiện prop `value` đổi và tự chạy animate lại từ vị trí cũ sang vị trí
  mới, gây hiệu ứng nháy 1 cái rồi animate lại. Set state đồng bộ trước,
  rollback nếu `update()` lỗi (xem `toggleKidMode` ở `(app)/profile.tsx`).
- **Guided Conversation** giới hạn 10 phút/phiên, mỗi lượt trẻ có tối đa 8s
  để nói (`TURN_LIMIT_SEC` trong `useMissionSession.ts`) trước khi
  companion nhắc lại. Tiến trình bước (`STEP_DONE`) và lạc đề (`OFFTOPIC`)
  được AI báo qua marker trong text (`live-token` chèn, `LiveClient` parse
  và strip — xem skill `edge-functions`) — KHÔNG dùng heuristic phía client
  để suy đoán, tránh sai lệch với system prompt.
- **Hết giờ chơi (Kid Mode, giới hạn theo phiên) không cắt phiên giữa
  câu** — `useMissionSession`/`useExplorationSession` chỉ đặt cờ chờ
  (`timeUpPendingRef`) khi `ScreenTimeProvider` báo `limitReached`, và chỉ
  gọi `endSession()` ở điểm AI vừa hoàn thành một lượt nói mới (hoặc sau
  timeout fallback `TIME_UP_FALLBACK_MS` nếu AI im lặng).
- **Screen Time áp dụng theo từng phiên** (mỗi lần vào nhánh `(kid)`, đếm
  lại từ 0), KHÔNG cộng dồn nhiều phiên trong ngày. `ScreenTimeProvider`
  dùng `useSegments()` để **dừng đếm giờ** khi phụ huynh đang ở
  `parent-gate`/`parent/*` (Parent Dashboard) — đây là thời gian phụ huynh
  dùng máy, không phải thời gian trẻ chơi. Hết giờ (`limitReached`):
  `ScreenTimeGate` ở `(kid)/_layout.tsx` chặn mọi màn (kid) khác (trừ
  `mission-live`/`exploration`/`day-summary`/`parent-gate`/`parent`) và đẩy
  về `day-summary` — bỏ qua `mission-live`/`exploration` để
  `useMissionSession`/`useExplorationSession` tự kết thúc phiên đúng lúc
  (xem trên), bỏ qua `parent-gate`/`parent` để phụ huynh không bị đẩy ra
  giữa lúc đang xem Parent Dashboard. `day-summary.tsx` vẫn hiện icon mờ
  vào `parent-gate` ở góc màn hình dù đã hết giờ chơi.
- **`LiveClient.sendImageTurn()` chỉ được gửi sau khi server xác nhận
  `setupComplete` thật** — KHÔNG phải lúc `ws.onopen` (lúc đó
  `onStateChange('live')` đã fire nhưng server có thể chưa sẵn sàng nhận
  `clientContent`). Gọi sớm hơn vẫn an toàn vì `LiveClient` tự queue
  (`pendingImageTurn`) và flush khi `_handleMessage` nhận `setupComplete` —
  không tự ý đổi thứ tự gửi ảnh/setup.
- **PIN phụ huynh không bao giờ lưu plaintext phía client** — `lib/pin.ts#hashPin`
  hash SHA-256 trước khi gửi lên `profiles.parent_pin`; `(kid)/parent-gate.tsx`
  hash input rồi so chuỗi, không có verify phía Edge Function. Cổng vào PIN
  gate (`(kid)/home.tsx`, `(kid)/day-summary.tsx`) là icon mờ, không nhãn —
  không tự ý làm nó nổi bật hơn. Icon đặt `top: insets.top - 8` (qua
  `useSafeAreaInsets()`), không hardcode `top: 8`, để không bị status
  bar/notch che.
