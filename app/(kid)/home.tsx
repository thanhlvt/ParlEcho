import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function KidHome() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const { profile, refresh } = useProfile();

  // TẠM THỜI (Pha 0): nút thoát Kid Mode để không bị khoá khi phát triển.
  // Pha 6 sẽ thay bằng cổng PIN phụ huynh; trẻ sẽ không thấy nút này.
  async function exitKidMode() {
    if (!user) return;
    await supabase.from('profiles').update({ is_kid_mode: false }).eq('id', user.id);
    await refresh();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.emoji}>🧸</Text>
        <Text style={styles.title}>Chế độ Trẻ em</Text>
        <Text style={styles.subtitle}>
          Xin chào {profile?.child_name ?? profile?.name ?? 'bạn nhỏ'}!
        </Text>
        <Text style={styles.note}>Nội dung Kid Mode sẽ xuất hiện ở các bước tiếp theo.</Text>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emoji: { fontSize: 96, marginBottom: 16 },
    title: { fontSize: 32, fontWeight: '800', color: colors.primary, marginBottom: 8 },
    subtitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
      textAlign: 'center',
    },
    note: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    exitBtn: {
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
    },
    exitText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  });
