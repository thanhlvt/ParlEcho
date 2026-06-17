import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
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
import { Colors } from '../../../constants/Colors';
import { supabase } from '../../../lib/supabase';
import { LanguageId, Scenario, UserProgress } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useSidebar } from '../_layout';

type ScenarioWithProgress = Scenario & {
  progress: UserProgress | null;
};

const LEVEL_COLOR = {
  beginner: Colors.success,
  intermediate: Colors.warning,
  advanced: Colors.error,
} as const;

export default function PracticeIndexScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [activeLang, setActiveLang] = useState<LanguageId>('en');
  const [scenarios, setScenarios] = useState<ScenarioWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (user) fetchData();
    }, [user?.id]),
  );

  async function fetchData() {
    if (!user) return;
    setLoading(true);
    setFetchError(null);

    const [profileRes, scenariosRes, progressRes] = await Promise.all([
      supabase.from('profiles').select('active_language_id').eq('id', user.id).single(),
      supabase.from('scenarios').select('*').order('sort_order'),
      supabase.from('user_progress').select('*').eq('user_id', user.id),
    ]);

    if (scenariosRes.error) {
      console.error('[Practice] scenarios fetch error:', scenariosRes.error);
      setFetchError(scenariosRes.error.message);
      setLoading(false);
      return;
    }

    const lang = (profileRes.data?.active_language_id as LanguageId) ?? 'en';
    setActiveLang(lang);

    const progressMap = new Map(
      (progressRes.data ?? []).map((p: UserProgress) => [p.scenario_id, p]),
    );

    const filtered = (scenariosRes.data ?? [])
      .filter((s: Scenario) => s.language_id === lang)
      .map((s: Scenario) => ({
        ...s,
        progress: progressMap.get(s.id) ?? null,
      }));

    setScenarios(filtered);
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={toggleSidebar} activeOpacity={0.7} style={{ padding: 4 }} hitSlop={8}>
            <Ionicons name="menu" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Luyện phát âm</Text>
        </View>
        <View style={styles.langBadge}>
          <Text style={styles.langText}>{activeLang === 'en' ? '🇺🇸 EN' : '🇯🇵 JP'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : scenarios.length === 0 ? (
        <EmptyState error={fetchError} lang={activeLang} onRetry={fetchData} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {scenarios.map((s) => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              onPress={() =>
                router.push({
                  pathname: '/practice/[scenarioId]',
                  params: { scenarioId: s.id },
                })
              }
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ScenarioCard({
  scenario,
  onPress,
}: {
  scenario: ScenarioWithProgress;
  onPress: () => void;
}) {
  const score = scenario.progress?.best_pronunciation_score;
  const scoreColor =
    score == null ? Colors.textMuted
      : score >= 80 ? Colors.success
      : score >= 60 ? Colors.warning
      : Colors.error;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.cardIcon}>{scenario.icon ?? '💬'}</Text>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{scenario.title}</Text>
        {scenario.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{scenario.description}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          <View
            style={[
              styles.levelBadge,
              { backgroundColor: LEVEL_COLOR[scenario.level] + '20' },
            ]}
          >
            <Text style={[styles.levelText, { color: LEVEL_COLOR[scenario.level] }]}>
              {scenario.level === 'beginner' ? 'Cơ bản'
                : scenario.level === 'intermediate' ? 'Trung cấp'
                : 'Nâng cao'}
            </Text>
          </View>
          {scenario.progress && (
            <Text style={styles.attemptsText}>
              {scenario.progress.attempts_count} lần luyện
            </Text>
          )}
        </View>
      </View>
      <View style={styles.cardRight}>
        {score != null && (
          <Text style={[styles.scoreText, { color: scoreColor }]}>
            {Math.round(score)}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({
  error,
  lang,
  onRetry,
}: {
  error: string | null;
  lang: LanguageId;
  onRetry: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{error ? '⚠️' : '📚'}</Text>
      <Text style={styles.emptyTitle}>
        {error ? 'Lỗi tải dữ liệu' : 'Chưa có kịch bản'}
      </Text>
      {error ? (
        <Text style={[styles.emptyText, { color: Colors.error }]}>{error}</Text>
      ) : (
        <Text style={styles.emptyText}>
          Không có kịch bản nào cho ngôn ngữ{' '}
          <Text style={{ fontWeight: '700', color: Colors.primary }}>
            {lang === 'en' ? 'English (EN)' : 'Japanese (JP)'}
          </Text>
          {'\n\n'}Chạy{' '}
          <Text style={{ fontFamily: 'monospace', color: Colors.primary }}>
            seed_scenarios.sql
          </Text>
          {' '}trong Supabase SQL Editor, hoặc đổi ngôn ngữ ở màn hình Home.
        </Text>
      )}
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  langBadge: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  langText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  loader: { flex: 1 },
  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIcon: { fontSize: 36 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  levelBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  levelText: { fontSize: 11, fontWeight: '700' },
  attemptsText: { fontSize: 12, color: Colors.textMuted },
  cardRight: { alignItems: 'center', gap: 4 },
  scoreText: { fontSize: 18, fontWeight: '800' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
