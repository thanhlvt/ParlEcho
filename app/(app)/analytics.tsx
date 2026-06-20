import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSidebar } from './_layout';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { supabase } from '../../lib/supabase';
import { DailyActivity } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { NotebookPieChart } from '../../components/analytics/NotebookPieChart';
import { computeStreak } from '../../lib/streak';
import { calculateScoreStats } from '../../lib/scoring';

const { width } = Dimensions.get('window');

type ChartMetric = 'score' | 'lines';

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('score');
  const [savedCounts, setSavedCounts] = useState({ word: 0, phrase: 0, mistake: 0 });

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    try {
      // Get past 30 days of activities
      const [actRes, savedRes] = await Promise.all([
        supabase
          .from('daily_activity')
          .select('*')
          .eq('user_id', user.id)
          .order('activity_date', { ascending: true }),
        supabase.from('saved_items').select('type').eq('user_id', user.id),
      ]);

      if (actRes.error) throw actRes.error;
      setActivities(actRes.data ?? []);

      if (savedRes.data) {
        const counts = { word: 0, phrase: 0, mistake: 0 };
        savedRes.data.forEach((item) => {
          if (item.type === 'word' || item.type === 'phrase' || item.type === 'mistake') {
            counts[item.type as 'word' | 'phrase' | 'mistake']++;
          }
        });
        setSavedCounts(counts);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể tải thống kê tiến độ.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics();
    }, [fetchAnalytics]),
  );

  // ── Calculate KPIs ───────────────────────────────────────────────────
  const totalLines = activities.reduce((sum, act) => sum + act.lines_practiced, 0);
  const totalMinutes = activities.reduce((sum, act) => sum + act.minutes_practiced, 0);
  const totalConvs = activities.reduce((sum, act) => sum + act.conversations_count, 0);

  const { avg: avgOverallScore, max: maxOverallScore } = calculateScoreStats(activities);

  // Streak calculation
  const currentStreak = computeStreak(activities);

  // ── Process last 7 days chart data ───────────────────────────────────
  const chartData = getLast7DaysData(activities);

  function getLast7DaysData(activityList: DailyActivity[]) {
    const dataList = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      // Find activity for this date
      const match = activityList.find((a) => a.activity_date === dateString);

      const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      const dayLabel = dayNames[date.getDay()];

      dataList.push({
        date: dateString,
        label: dayLabel,
        score: match?.avg_pronunciation_score ?? null,
        lines: match?.lines_practiced ?? 0,
      });
    }
    return dataList;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Header */}
      <View style={styles.customHeader}>
        <TouchableOpacity onPress={toggleSidebar} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="menu" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.customHeaderTitle}>Thống kê tiến độ</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          {/* Streak Section */}
          <View style={styles.streakBanner}>
            <View style={styles.streakLeft}>
              <Text style={styles.streakNumber}>{currentStreak}</Text>
              <Text style={styles.streakUnit}>ngày liên tiếp</Text>
            </View>
            <View style={styles.streakRight}>
              <View style={styles.fireIconContainer}>
                <Ionicons name="flame" size={36} color="#FF6B6B" />
              </View>
              <Text style={styles.streakText}>
                {currentStreak > 0
                  ? 'Tuyệt vời! Hãy tiếp tục duy trì thói quen học tập mỗi ngày.'
                  : 'Bắt đầu bài học ngay hôm nay để kích hoạt chuỗi học tập nhé!'}
              </Text>
            </View>
          </View>

          {/* Grid KPI Cards */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="mic-sharp" size={20} color={colors.primary} />
              </View>
              <Text style={styles.kpiValue}>{totalLines}</Text>
              <Text style={styles.kpiLabel}>Câu đã nói</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="chatbubbles" size={20} color={colors.success} />
              </View>
              <Text style={styles.kpiValue}>{totalConvs}</Text>
              <Text style={styles.kpiLabel}>Cuộc hội thoại</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#FFFBEB' }]}>
                <Ionicons name="time" size={20} color={colors.warning} />
              </View>
              <Text style={styles.kpiValue}>{totalMinutes}</Text>
              <Text style={styles.kpiLabel}>Số phút luyện</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: '#FFF5F5' }]}>
                <Ionicons name="trophy" size={20} color={colors.secondary} />
              </View>
              <Text style={styles.kpiValue}>{maxOverallScore}%</Text>
              <Text style={styles.kpiLabel}>Điểm cao nhất</Text>
            </View>
          </View>

          {/* Progress Chart Panel */}
          <View style={styles.chartPanel}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Biểu đồ tuần này</Text>

              <View style={styles.metricToggle}>
                <TouchableOpacity
                  style={[styles.toggleBtn, chartMetric === 'score' && styles.toggleBtnActive]}
                  onPress={() => setChartMetric('score')}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      chartMetric === 'score' && styles.toggleBtnTextActive,
                    ]}
                  >
                    Điểm số
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, chartMetric === 'lines' && styles.toggleBtnActive]}
                  onPress={() => setChartMetric('lines')}
                >
                  <Text
                    style={[
                      styles.toggleBtnText,
                      chartMetric === 'lines' && styles.toggleBtnTextActive,
                    ]}
                  >
                    Số câu
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Custom Bar Chart */}
            <View style={styles.barChartContainer}>
              {chartData.map((day, idx) => {
                const isToday = idx === 6;
                const value = chartMetric === 'score' ? (day.score ?? 0) : day.lines;

                // Scale calculations: Score max 100, Lines max 50 (or dynamically based on max value)
                const maxValue =
                  chartMetric === 'score' ? 100 : Math.max(...chartData.map((d) => d.lines), 5);
                const barHeightPct = maxValue > 0 ? (value / maxValue) * 100 : 0;

                // Custom color
                const barColor =
                  chartMetric === 'score'
                    ? value >= 85
                      ? colors.success
                      : value >= 60
                        ? colors.warning
                        : value > 0
                          ? colors.error
                          : colors.border
                    : colors.primary;

                return (
                  <View key={idx} style={styles.chartColumn}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${barHeightPct}%`,
                            backgroundColor: value > 0 ? barColor : '#E5E7EB',
                          },
                        ]}
                      />
                      {value > 0 && (
                        <Text style={styles.barValueText}>
                          {chartMetric === 'score' ? `${value}%` : value}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                      {day.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={styles.legendText}>Tốt (≥85%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                <Text style={styles.legendText}>Khá (60-84%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                <Text style={styles.legendText}>Cần luyện thêm ({'<'}60%)</Text>
              </View>
            </View>
          </View>

          {/* Notebook Pie Chart */}
          <NotebookPieChart
            wordCount={savedCounts.word}
            phraseCount={savedCounts.phrase}
            mistakeCount={savedCounts.mistake}
          />

          {/* Activity Heatmap Grid / Calendar summary */}
          <View style={styles.activitySummaryPanel}>
            <Text style={styles.sectionTitle}>Tóm tắt học tập</Text>

            <View style={styles.summaryRow}>
              <View style={styles.summaryColumn}>
                <Text style={styles.summaryHeader}>Độ chuẩn xác trung bình</Text>
                <Text style={[styles.summaryNumber, { color: colors.primary }]}>
                  {avgOverallScore}%
                </Text>
              </View>
              <View style={styles.verticalDivider} />
              <View style={styles.summaryColumn}>
                <Text style={styles.summaryHeader}>Hoạt động trong tháng</Text>
                <Text style={[styles.summaryNumber, { color: colors.success }]}>
                  {activities.length} ngày
                </Text>
              </View>
            </View>

            <View style={styles.actionBanner}>
              <Text style={styles.actionBannerText}>
                Bạn đã luyện nói tổng cộng <Text style={{ fontWeight: 'bold' }}>{totalLines}</Text>{' '}
                câu. Hãy thử sức với các bài hội thoại AI mới hoặc live luyện nói ngay!
              </Text>
              <TouchableOpacity
                style={styles.actionBannerBtn}
                onPress={() => router.push('/(app)')}
              >
                <Text style={styles.actionBannerBtnText}>Luyện tập ngay</Text>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    loader: { flex: 1, justifyContent: 'center' },
    container: { padding: 16, gap: 16 },

    // Streak Banner
    streakBanner: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    streakLeft: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingRight: 16,
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    streakNumber: {
      fontSize: 36,
      fontWeight: '800',
      color: '#FF6B6B',
    },
    streakUnit: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
      marginTop: 2,
    },
    streakRight: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      gap: 12,
    },
    fireIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: '#FFF5F5',
      justifyContent: 'center',
      alignItems: 'center',
    },
    streakText: {
      flex: 1,
      fontSize: 13,
      color: colors.textPrimary,
      lineHeight: 18,
    },

    // KPI Grid
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    kpiCard: {
      backgroundColor: colors.surface,
      width: (width - 32 - 12) / 2,
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    kpiIconWrapper: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    kpiValue: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    kpiLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },

    // Chart Panel
    chartPanel: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chartHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    chartTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    metricToggle: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 2,
    },
    toggleBtn: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
    },
    toggleBtnActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 1,
    },
    toggleBtnText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    toggleBtnTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },

    // Custom Chart
    barChartContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      height: 180,
      paddingTop: 24,
      paddingHorizontal: 8,
    },
    chartColumn: {
      alignItems: 'center',
      flex: 1,
    },
    barTrack: {
      height: 130,
      width: 22,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      justifyContent: 'flex-end',
      alignItems: 'center',
      position: 'relative',
    },
    barFill: {
      width: '100%',
      borderRadius: 12,
    },
    barValueText: {
      position: 'absolute',
      top: -20,
      fontSize: 9,
      fontWeight: '700',
      color: colors.textPrimary,
      width: 40,
      textAlign: 'center',
    },
    dayLabel: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 8,
      fontWeight: '500',
    },
    dayLabelToday: {
      color: colors.primary,
      fontWeight: '700',
    },

    chartLegend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      justifyContent: 'center',
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 10,
      color: colors.textSecondary,
    },

    // Activity summary
    activitySummaryPanel: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 8,
      marginBottom: 16,
    },
    summaryColumn: {
      alignItems: 'center',
    },
    summaryHeader: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
    },
    summaryNumber: {
      fontSize: 24,
      fontWeight: '800',
      marginTop: 4,
    },
    verticalDivider: {
      width: 1,
      backgroundColor: colors.border,
      height: '100%',
    },

    actionBanner: {
      backgroundColor: colors.primaryLight,
      borderRadius: 12,
      padding: 12,
      gap: 10,
    },
    actionBannerText: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    actionBannerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingVertical: 8,
      borderRadius: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
    },
    actionBannerBtnText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    customHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    customHeaderTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    backBtn: {
      padding: 4,
    },
  });
