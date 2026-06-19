import { Stack } from 'expo-router';

// Kid Mode dùng UI tuỳ biến (nhân vật, chữ to) — không dùng header/tab mặc định.
export default function KidLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
