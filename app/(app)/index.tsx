import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { DailyActivity, LanguageId, Profile } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';

// ── helpers ────────────────────────────────────────────────────────────
const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function buildWeekData(activities: DailyActivity[]) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const act = activities.find((a) => a.activity_date === dateStr);
    return {
      label: DAY_LABELS[d.getDay()],
      lines: act?.lines_practiced ?? 0,
      isToday: i === 6,
    };
  });
}

function computeStreak(activities: DailyActivity[]): number {
  const dateSet = new Set(activities.map((a) => a.activity_date));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (true) {
    const key = cursor.toISOString().split('T')[0];
    if (dateSet.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// ── Main screen ─────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activities, setActivities] = useState<DailyActivity[]>([]);
  const [activeLang, setActiveLang] = useState<LanguageId>('en');

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchData();
    }, [user?.id]),
  );

  async function fetchData() {
    if (!user) return;
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
  }

  async function toggleLanguage(lang: LanguageId) {
    setActiveLang(lang);
    if (user) {
      await supabase.from('profiles').update({ active_language_id: lang }).eq('id', user.id);
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const todayAct = activities.find((a) => a.activity_date === today) ?? null;
  const streak = computeStreak(activities);
  const weekData = buildWeekData(activities);
  const displayName = profile?.name ?? user?.email?.split('@')[0] ?? 'bạn';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.userName}>{displayName}! 👋</Text>
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
        <WeeklyChart data={weekData} />

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Bắt đầu luyện tập</Text>
        <View style={styles.actions}>
          <ActionCard
            icon="mic"
            title="Luyện phát âm"
            subtitle={'Shadowing\nKịch bản soạn sẵn'}
            color={Colors.primary}
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
        </View>

        {/* Coming soon */}
        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonTitle}>Sắp ra mắt</Text>
          {[
            '🃏 Flashcard câu giao tiếp',
            '🔄 Minimal pairs luyện phân biệt âm',
            '📊 Lịch sử chi tiết điểm phát âm',
          ].map((item) => (
            <Text key={item} style={styles.comingSoonItem}>{item}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Weekly chart ────────────────────────────────────────────────────────
function WeeklyChart({
  data,
}: {
  data: { label: string; lines: number; isToday: boolean }[];
}) {
  const maxLines = Math.max(...data.map((d) => d.lines), 1);

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>7 ngày gần đây</Text>
      <View style={styles.chartBars}>
        {data.map((d, i) => {
          const heightPct = d.lines / maxLines;
          return (
            <View key={i} style={styles.chartCol}>
              <View style={styles.barContainer}>
                {d.lines > 0 && (
                  <Text style={styles.barValue}>{d.lines}</Text>
                )}
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(4, Math.round(heightPct * 56)),
                      backgroundColor: d.isToday
                        ? Colors.primary
                        : d.lines > 0
                        ? Colors.primary + '60'
                        : Colors.border,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, d.isToday && styles.barLabelToday]}>
                {d.label}
              </Text>
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
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 0 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: { fontSize: 14, color: Colors.textMuted },
  userName: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  langToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 3,
  },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
  langBtnActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  langBtnText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  langBtnTextActive: { color: Colors.textPrimary, fontWeight: '700' },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
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
  streakNum: { fontSize: 24, fontWeight: '800', color: Colors.warning },
  statValue: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  // Weekly chart
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  chartTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  barContainer: { width: '100%', alignItems: 'center', height: 72, justifyContent: 'flex-end' },
  bar: { width: '70%', borderRadius: 4 },
  barValue: { fontSize: 9, color: Colors.textMuted, marginBottom: 2 },
  barLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  barLabelToday: { color: Colors.primary, fontWeight: '800' },
  chartSub: { fontSize: 11, color: Colors.textMuted, marginTop: 10, textAlign: 'center' },

  // Actions
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.surface,
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
  actionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  actionSubtitle: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },

  // Coming soon
  comingSoon: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  comingSoonTitle: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, marginBottom: 4 },
  comingSoonItem: { fontSize: 14, color: Colors.textSecondary },
});
