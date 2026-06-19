import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

// Luôn hiển thị số biscuit ở góc màn hình (Reward System). Đặt ở (kid)/_layout.tsx nên
// hiện xuyên suốt mọi màn hình con, đối xứng với ScreenTimeBadge (góc phải).
export function BiscuitBadge() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="none">
      <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>
          🍪 {profile?.biscuit_count ?? 0}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12 },
  badge: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 13, fontWeight: '700' },
});
