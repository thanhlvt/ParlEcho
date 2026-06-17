import { Stack } from 'expo-router';
import { useTheme } from '../../../providers/ThemeProvider';

export default function LiveLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ title: 'Lịch sử phiên Live' }} />
      <Stack.Screen name="review/[conversationId]" options={{ title: 'Nhận xét phiên' }} />
    </Stack>
  );
}
