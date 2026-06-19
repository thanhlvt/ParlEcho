import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { supabase } from '../../lib/supabase';
import { hashPin } from '../../lib/pin';
import { Profile } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
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
  const { refresh: refreshProfile } = useProfile();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [totalLines, setTotalLines] = useState<number>(0);
  const [audioCacheSize, setAudioCacheSize] = useState<number>(0);
  const [savingKid, setSavingKid] = useState(false);
  const [screenTimeLimit, setScreenTimeLimit] = useState(20);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pendingKidModeEnable, setPendingKidModeEnable] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        if (data?.screen_time_limit_minutes) setScreenTimeLimit(data.screen_time_limit_minutes);
      });

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

  // Bật/tắt Kid Mode. Khi bật, RouteGuard sẽ tự chuyển sang nhánh (kid) ngay —
  // phải có parent_pin trước, nếu chưa thì bắt đặt PIN trước khi bật, tránh
  // bị "nhốt" trong Kid Mode không vào lại được Parent Dashboard.
  const toggleKidMode = async (value: boolean) => {
    if (!user) return;
    if (value && !profile?.parent_pin) {
      setPendingKidModeEnable(true);
      Alert.alert(
        'Cần đặt mã PIN',
        'Hãy đặt mã PIN phụ huynh trước khi bật Chế độ trẻ em, để bạn có thể vào lại Parent Dashboard sau khi bật.',
      );
      openPinModal();
      return;
    }
    setSavingKid(true);
    const { error } = await supabase
      .from('profiles')
      .update({ is_kid_mode: value })
      .eq('id', user.id);
    if (error) {
      Alert.alert('Lỗi', 'Không thể cập nhật chế độ trẻ em.');
    } else {
      setProfile((p) => (p ? { ...p, is_kid_mode: value } : p));
      await refreshProfile();
    }
    setSavingKid(false);
  };

  // Giới hạn phút/phiên cho Kid Mode (Pha 4 — Screen Time). Mặc định 20, bước nhảy 5.
  const updateScreenTimeLimit = async (delta: number) => {
    if (!user) return;
    const next = Math.max(5, Math.min(120, screenTimeLimit + delta));
    setScreenTimeLimit(next);
    await supabase.from('profiles').update({ screen_time_limit_minutes: next }).eq('id', user.id);
  };

  // PIN 4 số gate Parent Dashboard (Pha 6) — hash bằng expo-crypto, KHÔNG lưu plaintext.
  const openPinModal = () => {
    setPinInput('');
    setPinConfirmInput('');
    setPinModalVisible(true);
  };

  const savePin = async () => {
    if (!user) return;
    if (pinInput.length !== 4 || !/^\d{4}$/.test(pinInput)) {
      Alert.alert('Lỗi', 'Mã PIN phải gồm đúng 4 chữ số.');
      return;
    }
    if (pinInput !== pinConfirmInput) {
      Alert.alert('Lỗi', 'Hai mã PIN không khớp.');
      return;
    }
    setSavingPin(true);
    try {
      const hashed = await hashPin(pinInput);
      const updates: Partial<Profile> = { parent_pin: hashed };
      if (pendingKidModeEnable) updates.is_kid_mode = true;
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;
      setProfile((p) => (p ? { ...p, ...updates } : p));
      setPinModalVisible(false);
      setPendingKidModeEnable(false);
      if (updates.is_kid_mode) {
        await refreshProfile();
        Alert.alert('Đã lưu', 'Mã PIN đã đặt và Chế độ trẻ em đã được bật.');
      } else {
        Alert.alert('Đã lưu', 'Mã PIN phụ huynh đã được cập nhật.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể lưu mã PIN.');
    } finally {
      setSavingPin(false);
    }
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

        {/* Kid Mode */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <Ionicons
              name="happy-outline"
              size={20}
              color={colors.textMuted}
              style={styles.settingIcon}
            />
            <Text style={styles.settingLabel}>Chế độ trẻ em</Text>
            <Switch
              value={profile?.is_kid_mode ?? false}
              onValueChange={toggleKidMode}
              disabled={savingKid}
              trackColor={{ true: colors.primary }}
            />
          </View>

          {profile?.is_kid_mode ? (
            <View style={styles.settingRow}>
              <Ionicons
                name="time-outline"
                size={20}
                color={colors.textMuted}
                style={styles.settingIcon}
              />
              <Text style={styles.settingLabel}>Giới hạn thời gian/phiên</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => updateScreenTimeLimit(-5)}
                >
                  <Ionicons name="remove" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{screenTimeLimit} phút</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => updateScreenTimeLimit(5)}
                >
                  <Ionicons name="add" size={16} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {profile?.is_kid_mode ? (
            <TouchableOpacity style={styles.settingRow} onPress={openPinModal} activeOpacity={0.7}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.textMuted}
                style={styles.settingIcon}
              />
              <Text style={styles.settingLabel}>Mã PIN phụ huynh</Text>
              <Text style={styles.settingValue}>{profile?.parent_pin ? 'Đã đặt' : 'Chưa đặt'}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          {profile?.is_kid_mode && profile?.parent_pin ? (
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.replace('/(kid)/home' as Href)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="play-outline"
                size={20}
                color={colors.textMuted}
                style={styles.settingIcon}
              />
              <Text style={styles.settingLabel}>Vào Kid Mode</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
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

      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Đặt mã PIN phụ huynh</Text>
            <Text style={styles.modalHint}>
              Dùng mã này để mở Parent Dashboard từ Kid Mode. Chỉ phụ huynh nên biết mã này.
            </Text>
            <TextInput
              style={styles.pinInput}
              value={pinInput}
              onChangeText={(t) => setPinInput(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="Mã PIN (4 số)"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <TextInput
              style={styles.pinInput}
              value={pinConfirmInput}
              onChangeText={(t) => setPinConfirmInput(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="Nhập lại mã PIN"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setPinModalVisible(false);
                  setPendingKidModeEnable(false);
                }}
              >
                <Text style={styles.modalCancelText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={savePin} disabled={savingPin}>
                <Text style={styles.modalSaveText}>{savingPin ? 'Đang lưu...' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepperBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, minWidth: 50 },
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
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 20,
      gap: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    modalHint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    pinInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      letterSpacing: 8,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
    modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
    modalCancelText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    modalSaveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    modalSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
