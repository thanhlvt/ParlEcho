import { Href, Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { ScreenTimeBadge } from '../../components/kid/ScreenTimeBadge';
import { ScreenTimeProvider, useScreenTime } from '../../providers/ScreenTimeProvider';

// Hết giờ chơi (giới hạn theo phiên) → chặn mọi màn (kid) khác, đẩy về day-summary. Bỏ qua mission-live/
// exploration để useMissionSession/useExplorationSession tự kết thúc phiên sau lượt nói
// hiện tại (không cắt giữa câu). Bỏ qua parent-gate/parent để phụ huynh không bị đẩy ra
// giữa lúc đang xem Parent Dashboard.
function ScreenTimeGate() {
  const { limitReached } = useScreenTime();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!limitReached) return;
    const screen = segments[1] as string | undefined;
    if (
      screen === 'mission-live' ||
      screen === 'exploration' ||
      screen === 'day-summary' ||
      screen === 'parent-gate' ||
      screen === 'parent'
    )
      return;
    router.replace('/(kid)/day-summary' as Href);
  }, [limitReached, segments, router]);

  return <ScreenTimeBadge />;
}

// Kid Mode dùng UI tuỳ biến (nhân vật, chữ to) — không dùng header/tab mặc định.
export default function KidLayout() {
  return (
    <ScreenTimeProvider>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
        <ScreenTimeGate />
      </View>
    </ScreenTimeProvider>
  );
}
