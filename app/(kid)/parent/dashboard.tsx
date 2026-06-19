import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { Conversation } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useTheme } from '../../../providers/ThemeProvider';

const KID_MODES = ['kid_guided', 'kid_exploration'];

type DaySessions = { label: string; count: number };

export default function ParentDashboardScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [sessionsThisWeek, setSessionsThisWeek] = useState<DaySessions[]>([]);
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  const [missionsCompleted, setMissionsCompleted] = useState(0);
  const [stickerCount, setStickerCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      async function load() {
        setLoading(true);
        const [convRes, missionRes, stickerRes] = await Promise.all([
          supabase
            .from('conversations')
            .select('started_at, summary')
            .eq('user_id', user!.id)
            .in('mode', KID_MODES)
            .order('started_at', { ascending: true }),
          supabase
            .from('mission_results')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user!.id),
          supabase
            .from('user_stickers')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user!.id),
        ]);
        if (cancelled) return;

        const conversations = (convRes.data ?? []) as Pick<
          Conversation,
          'started_at' | 'summary'
        >[];

        setSessionsThisWeek(getLast7DaysCounts(conversations));
        setScoreHistory(
          conversations
            .map((c) => c.summary?.avg_pronunciation)
            .filter((s): s is number => typeof s === 'number')
            .slice(-7),
        );
        setMissionsCompleted(missionRes.count ?? 0);
        setStickerCount(stickerRes.count ?? 0);
        setLoading(false);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [user]),
  );

  function getLast7DaysCounts(
    conversations: Pick<Conversation, 'started_at' | 'summary'>[],
  ): DaySessions[] {
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const today = new Date();
    const result: DaySessions[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = conversations.filter((c) => c.started_at.startsWith(dateStr)).length;
      result.push({ label: dayNames[date.getDay()], count });
    }
    return result;
  }

  const avgScore =
    scoreHistory.length > 0
      ? Math.round(scoreHistory.reduce((s, v) => s + v, 0) / scoreHistory.length)
      : null;
  const maxSessions = Math.max(...sessionsThisWeek.map((d) => d.count), 1);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(kid)/home' as Href)} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Parent Dashboard</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>
                {sessionsThisWeek.reduce((s, d) => s + d.count, 0)}
              </Text>
              <Text style={styles.kpiLabel}>Phiên/tuần</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{missionsCompleted}</Text>
              <Text style={styles.kpiLabel}>Nhiệm vụ hoàn thành</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{stickerCount}</Text>
              <Text style={styles.kpiLabel}>Sticker đã có</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{avgScore != null ? `${avgScore}%` : '—'}</Text>
              <Text style={styles.kpiLabel}>Điểm phát âm TB</Text>
            </View>
          </View>

          <View style={styles.chartPanel}>
            <Text style={styles.sectionTitle}>Số phiên 7 ngày qua</Text>
            <View style={styles.barChartContainer}>
              {sessionsThisWeek.map((d, i) => (
                <View key={i} style={styles.chartColumn}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${(d.count / maxSessions) * 100}%`,
                          backgroundColor: d.count > 0 ? colors.primary : colors.border,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.dayLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {scoreHistory.length > 0 ? (
            <View style={styles.chartPanel}>
              <Text style={styles.sectionTitle}>Điểm phát âm theo thời gian</Text>
              <View style={styles.barChartContainer}>
                {scoreHistory.map((score, i) => (
                  <View key={i} style={styles.chartColumn}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${score}%`,
                            backgroundColor:
                              score >= 85
                                ? colors.success
                                : score >= 60
                                  ? colors.warning
                                  : colors.error,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.dayLabel}>{Math.round(score)}%</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.navSection}>
            <NavRow
              icon="chatbubbles-outline"
              label="Xem lại các phiên hội thoại"
              onPress={() => router.push('/(kid)/parent/sessions' as Href)}
            />
            <NavRow
              icon="image-outline"
              label="Quản lý ảnh khám phá"
              onPress={() => router.push('/(kid)/parent/images' as Href)}
            />
            <NavRow
              icon="star-outline"
              label="Từ vựng ưu tiên"
              onPress={() => router.push('/(kid)/parent/vocab' as Href)}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function NavRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={colors.textMuted} style={{ marginRight: 12 }} />
      <Text style={styles.navLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    content: { padding: 16, gap: 16 },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    kpiCard: {
      backgroundColor: colors.surface,
      flexBasis: '47%',
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    kpiValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
    kpiLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
    chartPanel: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
    barChartContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      height: 110,
    },
    chartColumn: { alignItems: 'center', flex: 1 },
    barTrack: {
      height: 90,
      width: 18,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 9,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    barFill: { width: '100%', borderRadius: 9 },
    dayLabel: { fontSize: 10, color: colors.textMuted, marginTop: 6, fontWeight: '500' },
    navSection: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    navLabel: { flex: 1, fontSize: 14, color: colors.textPrimary },
  });
