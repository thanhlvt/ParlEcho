import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Companion } from '../../components/kid/Companion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useScreenTime } from '../../providers/ScreenTimeProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function DaySummaryScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { profile, refresh } = useProfile();
  const { usedSeconds } = useScreenTime();

  const minutes = Math.round(usedSeconds / 60);

  // TẠM THỜI (như home.tsx) — Pha 6 sẽ thay bằng cổng PIN phụ huynh.
  async function exitKidMode() {
    if (!user) return;
    await supabase.from('profiles').update({ is_kid_mode: false }).eq('id', user.id);
    await refresh();
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Cổng phụ huynh — vẫn hiển thị ở màn hết giờ chơi để phụ huynh vào được
          Parent Dashboard mà không cần thoát Kid Mode (xem ScreenTimeGate ở
          (kid)/_layout.tsx, day-summary là 1 trong số ít màn được phép truy cập). */}
      <TouchableOpacity
        style={[styles.parentGateBtn, { top: insets.top + 8 }]}
        onPress={() => router.push('/(kid)/parent-gate' as Href)}
        hitSlop={10}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Companion companionId={profile?.companion_id} expression="cheering" size={150} />
        <Text style={styles.title}>Hết giờ chơi rồi! 🌙</Text>
        <Text style={styles.note}>
          Phiên này con đã học được {minutes} phút. Nghỉ một chút rồi vào lại chơi tiếp nhé!
        </Text>
      </View>

      <TouchableOpacity style={styles.exitBtn} onPress={exitKidMode} activeOpacity={0.8}>
        <Text style={styles.exitText}>(Tạm) Thoát Kid Mode</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'space-between',
      paddingBottom: 24,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    parentGateBtn: {
      position: 'absolute',
      left: 8,
      zIndex: 1,
      padding: 10,
      opacity: 0.5,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.primary,
      marginTop: 24,
      textAlign: 'center',
    },
    note: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
    exitBtn: {
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
    },
    exitText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  });
