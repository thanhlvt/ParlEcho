import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../providers/ThemeProvider';
import { supabase } from '../../lib/supabase';
import { DailyActivity, LanguageId, Profile } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useSidebar } from './_layout';
import { ProgressRing } from '../../components/analytics/ProgressRing';
import { toLocalDateKey, buildWeekData, computeStreak } from '../../lib/streak';

const { width } = Dimensions.get('window');

// ── helpers ────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// ── Main screen ─────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [activeLang, setActiveLang] = useState<LanguageId>('en');

  // Daily Goal states
  const [goalType, setGoalType] = useState<'lines' | 'minutes'>('lines');
  const [goalTarget, setGoalTarget] = useState<number>(10);
  const [isGoalModalVisible, setIsGoalModalVisible] = useState(false);
  const [tempGoalType, setTempGoalType] = useState<'lines' | 'minutes'>('lines');
  const [tempGoalTarget, setTempGoalTarget] = useState<number>(10);

  const fetchData = useCallback(async () => {
    if (!user) return;

    // Load goals from AsyncStorage
    try {
      const storedType = await AsyncStorage.getItem(`goal_type_${user.id}`);
      const storedTarget = await AsyncStorage.getItem(`goal_target_${user.id}`);
      if (storedType) {
        setGoalType(storedType as 'lines' | 'minutes');
      } else {
        setGoalType('lines');
      }
      if (storedTarget) {
        setGoalTarget(parseInt(storedTarget, 10));
      } else {
        setGoalTarget(10); // mặc định 10 câu
      }
    } catch (e) {
      console.warn('Error reading goal settings:', e);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 13);
    const since = cutoff.toISOString().split('T')[0];

    const [profileRes, actRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('daily_activity')
        .select('*')
        .eq('user_id', user.id)
        .gte('activity_date', since)
        .order('activity_date', { ascending: false }),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
      setActiveLang((profileRes.data.active_language_id as LanguageId) ?? 'en');
    }
    setActivities(actRes.data ?? []);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  async function toggleLanguage(lang: LanguageId) {
    setActiveLang(lang);
    if (user) {
      await supabase.from('profiles').update({ active_language_id: lang }).eq('id', user.id);
    }
  }

  async function saveDailyGoal(type: 'lines' | 'minutes', target: number) {
    if (!user) return;
    try {
      await AsyncStorage.setItem(`goal_type_${user.id}`, type);
      await AsyncStorage.setItem(`goal_target_${user.id}`, target.toString());
      setGoalType(type);
      setGoalTarget(target);
      setIsGoalModalVisible(false);
    } catch (e) {
      console.warn('Error saving goal:', e);
    }
  }

  function openGoalSettings() {
    setTempGoalType(goalType);
    setTempGoalTarget(goalTarget);
    setIsGoalModalVisible(true);
  }

  const today = toLocalDateKey(new Date());
  const todayAct = activities.find((a) => a.activity_date === today) ?? null;
  const streak = computeStreak(activities);
  const weekData = buildWeekData(activities);
  const displayName = profile?.name ?? user?.email?.split('@')[0] ?? 'bạn';

  // Compute daily goal progress
  const currentProgress =
    goalType === 'lines' ? (todayAct?.lines_practiced ?? 0) : (todayAct?.minutes_practiced ?? 0);
  const goalProgress = goalTarget > 0 ? Math.min(currentProgress / goalTarget, 1) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity
              onPress={toggleSidebar}
              activeOpacity={0.7}
              style={{ padding: 4 }}
              hitSlop={8}
            >
              <Ionicons name="menu" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.greeting}>{greeting()},</Text>
              <Text style={styles.userName}>{displayName}! 👋</Text>
            </View>
          </View>
          <View style={styles.langToggle}>
            {(['en', 'ja'] as LanguageId[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.langBtn, activeLang === lang && styles.langBtnActive]}
                onPress={() => toggleLanguage(lang)}
              >
                <Text style={[styles.langBtnText, activeLang === lang && styles.langBtnTextActive]}>
                  {lang === 'en' ? '🇺🇸 EN' : '🇯🇵 JP'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Daily Goal Card */}
        <View style={styles.goalCard}>
          <View style={styles.goalCardLeft}>
            <ProgressRing
              size={68}
              progress={goalProgress}
              strokeWidth={8}
              color={colors.primary}
              backgroundColor={colors.surfaceAlt}
            >
              <Text style={styles.goalPercentText}>{Math.round(goalProgress * 100)}%</Text>
            </ProgressRing>
          </View>
          <View style={styles.goalCardRight}>
            <Text style={styles.goalTitle}>Mục tiêu hôm nay</Text>
            <Text style={styles.goalProgressText}>
              Đã hoàn thành{' '}
              <Text style={{ fontWeight: '800', color: colors.primary }}>{currentProgress}</Text> /{' '}
              {goalTarget} {goalType === 'lines' ? 'câu' : 'phút'}
            </Text>
            <TouchableOpacity
              style={styles.goalSetupBtn}
              onPress={openGoalSettings}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={14} color={colors.primary} />
              <Text style={styles.goalSetupBtnText}>Thiết lập mục tiêu</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Streak + stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardStreak]}>
            <Text style={styles.streakFire}>🔥</Text>
            <Text style={styles.streakNum}>{streak}</Text>
            <Text style={styles.statLabel}>ngày liên tiếp</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayAct?.lines_practiced ?? 0}</Text>
            <Text style={styles.statLabel}>câu hôm nay</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {todayAct?.avg_pronunciation_score != null
                ? Math.round(todayAct.avg_pronunciation_score)
                : '—'}
            </Text>
            <Text style={styles.statLabel}>điểm TB</Text>
          </View>
        </View>

        {/* Weekly chart */}
        <WeeklyChart data={weekData} onPressDetails={() => router.push('/(app)/analytics')} />

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Bắt đầu luyện tập</Text>
        <View style={styles.actions}>
          <ActionCard
            icon="mic"
            title="Luyện phát âm"
            subtitle={'Shadowing\nKịch bản soạn sẵn'}
            color={colors.primary}
            onPress={() => router.push('/(app)/practice')}
          />
          <ActionCard
            icon="chatbubbles"
            title="Hội thoại AI"
            subtitle={'Roleplay\nSửa lỗi ngữ pháp'}
            color="#10B981"
            onPress={() => router.push('/(app)/chat')}
          />
          <ActionCard
            icon="radio"
            title="Live"
            subtitle={'Hội thoại thật\nNhận xét cuối phiên'}
            color="#F59E0B"
            onPress={() => router.push('/(app)/live')}
          />
          <ActionCard
            icon="book"
            title="Sổ tay ôn tập"
            subtitle={'Từ vựng & Mẫu câu\nLuyện Flashcard'}
            color="#8B5CF6"
            onPress={() => router.push('/(app)/notebook')}
          />
          <ActionCard
            icon="stats-chart"
            title="Thống kê tiến độ"
            subtitle={'Lịch sử điểm số\nChuỗi học tập'}
            color="#EC4899"
            onPress={() => router.push('/(app)/analytics')}
          />
        </View>
      </ScrollView>

      {/* Goal Setting Modal */}
      <Modal
        visible={isGoalModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsGoalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mục tiêu hàng ngày</Text>

            {/* Goal Type Selector */}
            <Text style={styles.modalLabel}>Đo lường tiến độ theo</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeBtn, tempGoalType === 'lines' && styles.typeBtnActive]}
                onPress={() => {
                  setTempGoalType('lines');
                  setTempGoalTarget(10);
                }}
              >
                <Text
                  style={[styles.typeBtnText, tempGoalType === 'lines' && styles.typeBtnTextActive]}
                >
                  Số câu đã nói
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, tempGoalType === 'minutes' && styles.typeBtnActive]}
                onPress={() => {
                  setTempGoalType('minutes');
                  setTempGoalTarget(15);
                }}
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    tempGoalType === 'minutes' && styles.typeBtnTextActive,
                  ]}
                >
                  Số phút luyện tập
                </Text>
              </TouchableOpacity>
            </View>

            {/* Target Value Adjuster */}
            <Text style={styles.modalLabel}>Đặt chỉ tiêu hàng ngày</Text>
            <View style={styles.adjusterRow}>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() =>
                  setTempGoalTarget((prev) =>
                    Math.max(1, prev - (tempGoalType === 'lines' ? 5 : 5)),
                  )
                }
              >
                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </TouchableOpacity>

              <TextInput
                style={styles.targetInput}
                value={tempGoalTarget.toString()}
                keyboardType="number-pad"
                onChangeText={(text) => {
                  const val = parseInt(text.replace(/[^0-9]/g, ''), 10);
                  setTempGoalTarget(isNaN(val) ? 0 : val);
                }}
              />

              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() =>
                  setTempGoalTarget((prev) => prev + (tempGoalType === 'lines' ? 5 : 5))
                }
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.adjusterUnit}>
              {tempGoalType === 'lines' ? 'câu luyện mỗi ngày' : 'phút học tập mỗi ngày'}
            </Text>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsGoalModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  if (tempGoalTarget > 0) {
                    saveDailyGoal(tempGoalType, tempGoalTarget);
                  } else {
                    Alert.alert('Lỗi', 'Mục tiêu phải lớn hơn 0.');
                  }
                }}
              >
                <Text style={styles.saveBtnText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Weekly chart ────────────────────────────────────────────────────────
function WeeklyChart({
  data,
  onPressDetails,
}: {
  data: { label: string; lines: number; isToday: boolean }[];
  onPressDetails: () => void;
}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const maxLines = Math.max(...data.map((d) => d.lines), 1);

  return (
    <View style={styles.chartCard}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={styles.chartTitle}>7 ngày gần đây</Text>
        <TouchableOpacity onPress={onPressDetails} activeOpacity={0.7}>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
            Xem chi tiết →
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.chartBars}>
        {data.map((d, i) => {
          const heightPct = d.lines / maxLines;
          return (
            <View key={i} style={styles.chartCol}>
              <View style={styles.barContainer}>
                {d.lines > 0 && <Text style={styles.barValue}>{d.lines}</Text>}
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(4, Math.round(heightPct * 56)),
                      backgroundColor: d.isToday
                        ? colors.primary
                        : d.lines > 0
                          ? colors.primary + '60'
                          : colors.border,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]}>{d.label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.chartSub}>câu đã luyện mỗi ngày</Text>
    </View>
  );
}

// ── Action card ─────────────────────────────────────────────────────────
function ActionCard({
  icon,
  title,
  subtitle,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40, gap: 0 },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    greeting: { fontSize: 14, color: colors.textMuted },
    userName: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
    langToggle: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      padding: 3,
    },
    langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
    langBtnActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    langBtnText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
    langBtnTextActive: { color: colors.textPrimary, fontWeight: '700' },

    // Stats row
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    statCardStreak: { backgroundColor: '#FFF7ED' },
    streakFire: { fontSize: 22, marginBottom: 2 },
    streakNum: { fontSize: 24, fontWeight: '800', color: colors.warning },
    statValue: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
    statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: 'center' },

    // Weekly chart
    chartCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    chartTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
    chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    chartCol: { flex: 1, alignItems: 'center', gap: 4 },
    barContainer: { width: '100%', alignItems: 'center', height: 72, justifyContent: 'flex-end' },
    bar: { width: '70%', borderRadius: 4 },
    barValue: { fontSize: 9, color: colors.textMuted, marginBottom: 2 },
    barLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
    barLabelToday: { color: colors.primary, fontWeight: '800' },
    chartSub: { fontSize: 11, color: colors.textMuted, marginTop: 10, textAlign: 'center' },

    // Actions
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
    actions: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
    actionCard: {
      width: (width - 40 - 12) / 2,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    actionIcon: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    actionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
    actionSubtitle: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

    // Coming soon
    comingSoon: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 16,
      padding: 18,
      gap: 10,
    },
    comingSoonTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
    comingSoonItem: { fontSize: 14, color: colors.textSecondary },

    // Daily Goal Card styles
    goalCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    goalCardLeft: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    goalCardRight: {
      flex: 1,
    },
    goalPercentText: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    goalTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    goalProgressText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    goalSetupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    goalSetupBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },

    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 340,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 5,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 20,
    },
    modalLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 12,
    },
    typeSelector: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      padding: 4,
      gap: 4,
      marginBottom: 16,
    },
    typeBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    typeBtnActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    typeBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    typeBtnTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    adjusterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginTop: 8,
    },
    adjustBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    targetInput: {
      width: 80,
      height: 44,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    adjusterUnit: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    saveBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    saveBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
    },
  });
