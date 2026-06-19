import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenTime } from '../../providers/ScreenTimeProvider';
import { useTheme } from '../../providers/ThemeProvider';

function formatMmSs(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Bộ đếm góc màn hình + cảnh báo còn 2 phút (Pha 4 — Screen Time). Đặt ở (kid)/_layout.tsx
// nên hiện xuyên suốt mọi màn hình con, không cần nhúng riêng lẻ.
export function ScreenTimeBadge() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { remainingSeconds, showWarning } = useScreenTime();
  const [showToast, setShowToast] = useState(false);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (showWarning && !warnedRef.current) {
      warnedRef.current = true;
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(t);
    }
    if (!showWarning) warnedRef.current = false;
  }, [showWarning]);

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="none">
      <View
        style={[
          styles.badge,
          { backgroundColor: showWarning ? colors.warning : colors.surfaceAlt },
        ]}
      >
        <Text style={[styles.badgeText, { color: showWarning ? '#fff' : colors.textMuted }]}>
          ⏰ {formatMmSs(remainingSeconds)}
        </Text>
      </View>
      {showToast ? (
        <View style={[styles.toast, { backgroundColor: colors.warning }]}>
          <Text style={styles.toastText}>Còn 2 phút nữa thôi! ⏰</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 12, alignItems: 'flex-end', gap: 6 },
  badge: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  toast: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220 },
  toastText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
