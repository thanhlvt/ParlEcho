---
name: unit-test
description: Quy ước viết unit test cho ParlEcho — Jest (jest-expo), chỉ test pure logic (không React render, không network/Supabase, không native module), pattern tách logic ra lib/*.ts để test được. Dùng khi thêm/sửa logic trong lib/ hoặc khi được yêu cầu viết test.
---

# Unit test (Jest)

## Setup hiện có

- Framework: `jest` + preset `jest-expo`. Config nằm trong `package.json`
  (key `"jest"`), KHÔNG có file `jest.config.js` riêng.
- **Bắt buộc pin `jest@^29.x`** (không phải `30.x`) — `jest-expo` cho Expo
  SDK 54 phụ thuộc `jest-environment-jsdom`/`babel-jest`/`jest-snapshot`
  bản 29, dùng `jest@30` sẽ lỗi `this._moduleMocker.clearMocksOnScope is
not a function` ngay khi chạy `npm test`.
- Alias `@/*` được map qua `moduleNameMapper` trong block `"jest"` của
  `package.json`, khớp `tsconfig.json`.
- Không có `@testing-library/react-native`/`react-test-renderer` setup —
  phạm vi hiện tại CHỈ test pure logic, không render component.
- Chạy: `npm test` (hoặc `npx jest <file>` cho 1 file).

## Phạm vi: CHỈ test pure logic

Chỉ viết unit test cho hàm thuần (cùng input → cùng output, không gọi
network/Supabase/Edge Function, không dùng React hook/component, không
gọi native module như `expo-crypto`/`expo-audio`). Lý do: import trực
tiếp 1 file kéo theo `lib/supabase.ts` sẽ throw ngay lúc import vì thiếu
`EXPO_PUBLIC_SUPABASE_URL` (biến môi trường Expo không tự load khi chạy
Jest ngoài Expo CLI) — và import 1 screen/`provider` kéo theo cả
`expo-router`/`ThemeProvider`/native module, dễ flaky, giá trị test thấp.

**Không viết test cho**: Edge Functions (`supabase/functions/*` — chạy
Deno runtime, không phải scope Jest này), component/screen render, hook
gọi Supabase trực tiếp (`useMissionSession`, `useExplorationSession`,
`useLiveSession`...), hàm chỉ là wrapper RPC/network không có logic rẽ
nhánh thật (vd `lib/biscuits.ts`, `lib/pin.ts`).

## Pattern: tách pure logic ra `lib/*.ts` riêng để test được

Khi logic đáng test (có nhánh, có công thức, dễ sai edge case) đang nằm
LẪN trong file có side-effect nặng (class WebSocket, component màn hình,
hook gọi Supabase), tách phần thuần ra 1 file `lib/` riêng, export, rồi
file gốc import lại — KHÔNG đổi hành vi, chỉ di chuyển code. Ví dụ đã làm:

- `lib/markerProtocol.ts` — regex fuzzy-match `[STEP_DONE]`/`[OFFTOPIC]` tách
  khỏi `LiveClient` (nay chỉ defensive display cleanup —
  `_stripLeftoverMarkers` — vì tiến trình do tool-call điều khiển; phần
  side-effect/state vẫn trong class).
- `lib/audioFormat.ts` — `buildWavHeader`/`pcmToWav`/`bytesToBase64`, tách
  khỏi `lib/liveClient.ts` (vốn import `supabase`/`sentry`).
- `lib/streak.ts` — `computeStreak`/`buildWeekData`/`toLocalDateKey`, tách
  khỏi component `app/(app)/index.tsx`/`analytics.tsx`.
- `lib/scoring.ts` — `getScoreColor`, `calculateScoreStats`,
  `calculateMissionStars`, `calculateExplorationStars`, tách khỏi
  `analytics.tsx`/review screen/`useMissionSession`/`useExplorationSession`.

Khi hàm cần mốc thời gian (`new Date()`) để xác định, luôn thêm tham số
`today: Date = new Date()` (default giữ nguyên cách gọi cũ ở call site,
nhưng cho phép test truyền ngày cố định).

## Quy ước file test

- Colocate `*.test.ts` cạnh file nguồn (`lib/streak.ts` →
  `lib/streak.test.ts`), không dùng thư mục `__tests__/`.
- Test theo `describe(tên hàm)` + nhiều `it(...)` theo từng nhánh/edge
  case (rỗng, null, biên threshold, gap ngày, chuỗi rất dài...).
- `bytesToBase64`/encode-decode: so sánh với `Buffer.from(...).toString
('base64')` của Node thay vì hardcode chuỗi base64 kỳ vọng.

## Khi sửa logic đã tách

Nếu sửa hành vi của `computeStreak`/`calculateMissionStars`/
`calculateExplorationStars`/marker fuzzy-match, PHẢI cập nhật test tương
ứng trong cùng commit — các hàm này không có nơi nào khác xác nhận đúng
sai ngoài bộ test.
