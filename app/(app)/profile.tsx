import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useSidebar } from './_layout';
import { clearAllAudioCache, getAudioCacheSize } from '../../lib/audioCache';

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function ProfileScreen() {
  const { colors, themeMode, setThemeMode } = useTheme();
  const styles = getStyles(colors);
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [totalLines, setTotalLines] = useState<number>(0);
  const [audioCacheSize, setAudioCacheSize] = useState<number>(0);

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

    getAudioCacheSize().then(setAudioCacheSize);
  }, [user]);

  const handleClearCache = () => {
    Alert.alert(
      'Xoá dữ liệu ghi âm',
      'Bạn có chắc chắn muốn xoá toàn bộ dữ liệu ghi âm của các phiên Live đã lưu trên máy không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            await clearAllAudioCache();
            const newSize = await getAudioCacheSize();
            setAudioCacheSize(newSize);
            Alert.alert('Đã xoá', 'Toàn bộ dữ liệu ghi âm đã được xoá.');
          },
        },
      ],
    );
  };

  const initial = (profile?.name ?? user?.email ?? '?')[0].toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={toggleSidebar}
          activeOpacity={0.7}
          style={{ padding: 4 }}
          hitSlop={8}
        >
          <Ionicons name="menu" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
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
          <SettingRow
            icon="trash-bin-outline"
            label="Xóa bộ nhớ ghi âm"
            value={formatSize(audioCacheSize)}
            onPress={handleClearCache}
          />
          <SettingRow icon="information-circle-outline" label="Phiên bản" value="1.0.0" />
        </View>

        {/* Theme Settings */}
        <View style={styles.themeSection}>
          <Text style={styles.themeTitle}>Giao diện ứng dụng</Text>
          <View style={styles.themeToggleGroup}>
            {(['light', 'dark', 'system'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.themeToggleBtn, themeMode === mode && styles.themeToggleBtnActive]}
                onPress={() => setThemeMode(mode)}
              >
                <Text
                  style={[
                    styles.themeToggleText,
                    themeMode === mode && styles.themeToggleTextActive,
                  ]}
                >
                  {mode === 'light' ? '☀️ Sáng' : mode === 'dark' ? '🌙 Tối' : '🤖 Tự động'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.signOutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>
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
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={colors.textMuted} style={styles.settingIcon} />
      <Text style={styles.settingLabel}>{label}</Text>
      {value ? <Text style={styles.settingValue}>{value}</Text> : null}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
    </Container>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
      color: colors.textPrimary,
    },
    content: { padding: 24, paddingBottom: 40, alignItems: 'center' },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    avatarText: { fontSize: 32, fontWeight: '700', color: '#FFF' },
    name: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    email: { fontSize: 14, color: colors.textMuted, marginBottom: 32 },
    section: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
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
      borderBottomColor: colors.border,
    },
    settingIcon: { marginRight: 12 },
    settingLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
    settingValue: { fontSize: 14, color: colors.textMuted },
    signOutBtn: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.error + '40',
    },
    signOutText: { fontSize: 16, fontWeight: '600', color: colors.error },
    themeSection: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    themeTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 12,
    },
    themeToggleGroup: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 4,
      gap: 4,
    },
    themeToggleBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 8,
    },
    themeToggleBtnActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 1,
    },
    themeToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    themeToggleTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
