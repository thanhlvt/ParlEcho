import { Stack } from 'expo-router';
import { Colors } from '../../../constants/Colors';

export default function LiveLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="review/[conversationId]" options={{ title: 'Nhận xét phiên' }} />
    </Stack>
  );
}
