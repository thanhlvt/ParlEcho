import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useSidebar } from './_layout';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [totalLines, setTotalLines] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setProfile(data));

    supabase
      .from('daily_activity')
      .select('lines_practiced')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) {
          const sum = data.reduce((acc, curr) => acc + curr.lines_practiced, 0);
          setTotalLines(sum);
        }
      });
  }, [user]);

  const initial = (profile?.name ?? user?.email ?? '?')[0].toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={toggleSidebar} activeOpacity={0.7} style={{ padding: 4 }} hitSlop={8}>
          <Ionicons name="menu" size={28} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ</Text>
        <View style={{ width: 32 }} />
      </View>
      <View style={styles.content}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{profile?.name ?? 'Chưa đặt tên'}</Text>
        <Text style={styles.email}>{user?.email}</Text>

        {/* Settings */}
        <View style={styles.section}>
          <SettingRow
            icon="language"
            label="Ngôn ngữ đang học"
            value={profile?.active_language_id === 'ja' ? '🇯🇵 Tiếng Nhật' : '🇺🇸 Tiếng Anh'}
          />
          <SettingRow 
            icon="trophy-outline" 
            label="Tổng số câu đã luyện" 
            value={totalLines.toString()} 
          />
          <SettingRow
            icon="book-outline"
            label="Sổ tay cá nhân"
            onPress={() => router.push('/(app)/notebook')}
          />
          <SettingRow
            icon="stats-chart-outline"
            label="Thống kê tiến độ"
            onPress={() => router.push('/(app)/analytics')}
          />
          <SettingRow icon="information-circle-outline" label="Phiên bản" value="1.0.0" />
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.signOutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={Colors.textMuted} style={styles.settingIcon} />
      <Text style={styles.settingLabel}>{label}</Text>
      {value ? <Text style={styles.settingValue}>{value}</Text> : null}
      {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
    </Container>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  content: { padding: 24, alignItems: 'center' },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#FFF' },
  name: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  email: { fontSize: 14, color: Colors.textMuted, marginBottom: 32 },
  section: {
    alignSelf: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingIcon: { marginRight: 12 },
  settingLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  settingValue: { fontSize: 14, color: Colors.textMuted },
  signOutBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.error + '40',
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: Colors.error },
});
