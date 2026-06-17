import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { supabase } from '../../../lib/supabase';
import { LanguageId, Scenario, UserProgress } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useSidebar } from '../_layout';

type ScenarioWithProgress = Scenario & {
  progress: UserProgress | null;
};

export default function PracticeIndexScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();
  const [activeLang, setActiveLang] = useState<LanguageId>('en');
  const [scenarios, setScenarios] = useState<ScenarioWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');

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

  // Filter scenarios based on search query and selected level
  const filteredScenarios = scenarios.filter((s) => {
    const matchSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchLevel = selectedLevel === 'all' || s.level === selectedLevel;
    return matchSearch && matchLevel;
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={toggleSidebar} activeOpacity={0.7} style={{ padding: 4 }} hitSlop={8}>
            <Ionicons name="menu" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Luyện phát âm</Text>
        </View>
        <View style={styles.langBadge}>
          <Text style={styles.langText}>{activeLang === 'en' ? '🇺🇸 EN' : '🇯🇵 JP'}</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Tìm kiếm bài học..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Level Filters */}
      <View style={{ marginBottom: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.levelScroll}>
          <TouchableOpacity
            style={[
              styles.levelChip,
              selectedLevel === 'all' && styles.levelChipActiveAll,
            ]}
            onPress={() => setSelectedLevel('all')}
          >
            <Text style={[styles.levelChipText, selectedLevel === 'all' && styles.levelChipTextActive]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.levelChip,
              selectedLevel === 'beginner' && styles.levelChipActiveBeginner,
            ]}
            onPress={() => setSelectedLevel('beginner')}
          >
            <Text style={[
              styles.levelChipText,
              { color: selectedLevel === 'beginner' ? '#fff' : colors.success },
              selectedLevel === 'beginner' && styles.levelChipTextActive
            ]}>
              Cơ bản
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.levelChip,
              selectedLevel === 'intermediate' && styles.levelChipActiveIntermediate,
            ]}
            onPress={() => setSelectedLevel('intermediate')}
          >
            <Text style={[
              styles.levelChipText,
              { color: selectedLevel === 'intermediate' ? '#fff' : colors.warning },
              selectedLevel === 'intermediate' && styles.levelChipTextActive
            ]}>
              Trung cấp
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.levelChip,
              selectedLevel === 'advanced' && styles.levelChipActiveAdvanced,
            ]}
            onPress={() => setSelectedLevel('advanced')}
          >
            <Text style={[
              styles.levelChipText,
              { color: selectedLevel === 'advanced' ? '#fff' : colors.error },
              selectedLevel === 'advanced' && styles.levelChipTextActive
            ]}>
              Nâng cao
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : scenarios.length === 0 ? (
        <EmptyState error={fetchError} lang={activeLang} onRetry={fetchData} />
      ) : filteredScenarios.length === 0 ? (
        <View style={styles.emptyFiltered}>
          <Text style={styles.emptyFilteredIcon}>🔍</Text>
          <Text style={styles.emptyFilteredTitle}>Không tìm thấy bài học</Text>
          <Text style={styles.emptyFilteredText}>
            Không có kịch bản nào khớp với bộ lọc và từ khóa của bạn.
          </Text>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              setSearchQuery('');
              setSelectedLevel('all');
            }}
          >
            <Text style={styles.resetBtnText}>Xóa bộ lọc</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filteredScenarios.map((s) => (
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
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const LEVEL_COLOR = {
    beginner: colors.success,
    intermediate: colors.warning,
    advanced: colors.error,
  } as const;

  const score = scenario.progress?.best_pronunciation_score;
  const scoreColor =
    score == null ? colors.textMuted
      : score >= 80 ? colors.success
      : score >= 60 ? colors.warning
      : colors.error;

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
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
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
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{error ? '⚠️' : '📚'}</Text>
      <Text style={styles.emptyTitle}>
        {error ? 'Lỗi tải dữ liệu' : 'Chưa có kịch bản'}
      </Text>
      {error ? (
        <Text style={[styles.emptyText, { color: colors.error }]}>{error}</Text>
      ) : (
        <Text style={styles.emptyText}>
          Không có kịch bản nào cho ngôn ngữ{' '}
          <Text style={{ fontWeight: '700', color: colors.primary }}>
            {lang === 'en' ? 'English (EN)' : 'Japanese (JP)'}
          </Text>
          {'\n\n'}Chạy{' '}
          <Text style={{ fontFamily: 'monospace', color: colors.primary }}>
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

const getStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  langBadge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  langText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  loader: { flex: 1 },
  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: colors.surface,
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
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  levelBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  levelText: { fontSize: 11, fontWeight: '700' },
  attemptsText: { fontSize: 12, color: colors.textMuted },
  cardRight: { alignItems: 'center', gap: 4 },
  scoreText: { fontSize: 18, fontWeight: '800' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // New Search & Level Filters styles
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  levelScroll: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  levelChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  levelChipActiveAll: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  levelChipActiveBeginner: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  levelChipActiveIntermediate: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  levelChipActiveAdvanced: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  levelChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  levelChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyFiltered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 32,
  },
  emptyFilteredIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyFilteredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptyFilteredText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  resetBtn: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetBtnText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
});
