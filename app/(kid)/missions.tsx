import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Mission } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Mới bắt đầu',
  intermediate: 'Khá',
  advanced: 'Giỏi',
};

const CARD_HEIGHT = 188;
const CARD_GAP = 12;

export default function MissionsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();

  const [missions, setMissions] = useState<Mission[]>([]);
  const [priorityMissionIds, setPriorityMissionIds] = useState<Set<string>>(new Set());
  const [bestStarsByMission, setBestStarsByMission] = useState<Record<string, number>>({});

  const flatListRef = useRef<FlatList<Mission>>(null);
  const hasAutoScrolledRef = useRef(false);
  const missionsCountRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      const languageId = profile?.active_language_id ?? 'en';

      Promise.all([
        supabase.from('missions').select('*').eq('language_id', languageId).order('created_at'),
        user
          ? supabase
              .from('priority_vocab')
              .select('content')
              .eq('user_id', user.id)
              .eq('language_id', languageId)
          : Promise.resolve({ data: [] as { content: string }[] }),
        user
          ? supabase.from('mission_results').select('mission_id, stars').eq('user_id', user.id)
          : Promise.resolve({ data: [] as { mission_id: string; stars: number }[] }),
      ]).then(([missionsRes, vocabRes, resultsRes]) => {
        if (!missionsRes.data) return;
        const allMissions = missionsRes.data as Mission[];
        const terms = (vocabRes.data ?? []).map((v) => v.content.toLowerCase());

        // Nhiệm vụ có title/topic khớp từ vựng ưu tiên (Pha 6) được đẩy lên đầu danh sách.
        const matchedIds = new Set(
          allMissions
            .filter((m) =>
              terms.some(
                (t) => m.title.toLowerCase().includes(t) || m.topic.toLowerCase().includes(t),
              ),
            )
            .map((m) => m.id),
        );
        setPriorityMissionIds(matchedIds);

        const sortedMissions = [...allMissions].sort((a, b) => {
          const aPriority = matchedIds.has(a.id) ? 1 : 0;
          const bPriority = matchedIds.has(b.id) ? 1 : 0;
          return bPriority - aPriority;
        });
        setMissions(sortedMissions);
        missionsCountRef.current = sortedMissions.length;

        const best: Record<string, number> = {};
        for (const r of (resultsRes.data as { mission_id: string; stars: number }[]) ?? []) {
          best[r.mission_id] = Math.max(best[r.mission_id] ?? 0, r.stars);
        }
        setBestStarsByMission(best);

        if (hasAutoScrolledRef.current) return;
        hasAutoScrolledRef.current = true;
        const firstIncompleteIndex = sortedMissions.findIndex((m) => (best[m.id] ?? 0) === 0);
        if (firstIncompleteIndex > 1) {
          scrollTimeoutRef.current = setTimeout(() => {
            if (firstIncompleteIndex >= missionsCountRef.current) return;
            flatListRef.current?.scrollToIndex({
              index: firstIncompleteIndex,
              animated: true,
              viewPosition: 0.15,
            });
          }, 300);
        }
      });

      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = null;
        }
      };
    }, [profile?.active_language_id, user]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace('/(kid)/home' as Href)}
      >
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        <Text style={styles.backText}>Về nhà</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Chọn nhiệm vụ 🎯</Text>
      <Text style={styles.subtitle}>Cùng bạn đồng hành hoàn thành nhiệm vụ nhé!</Text>

      <FlatList
        ref={flatListRef}
        data={missions}
        keyExtractor={(m) => m.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.list}
        getItemLayout={(_, index) => ({
          length: CARD_HEIGHT,
          offset: Math.floor(index / 2) * (CARD_HEIGHT + CARD_GAP),
          index,
        })}
        onScrollToIndexFailed={({ index }) => {
          flatListRef.current?.scrollToOffset({
            offset: Math.floor(index / 2) * (CARD_HEIGHT + CARD_GAP),
            animated: true,
          });
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>Chưa có nhiệm vụ nào, quay lại sau nhé!</Text>
        }
        renderItem={({ item }) => {
          const stars = bestStarsByMission[item.id] ?? 0;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/(kid)/mission-live?missionId=${item.id}` as Href)}
            >
              {priorityMissionIds.has(item.id) ? (
                <View style={styles.priorityBadge}>
                  <Text style={styles.priorityBadgeText}>⭐ Ưu tiên</Text>
                </View>
              ) : null}

              <Text style={styles.cardIcon}>{item.icon}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>

              <View style={styles.cardMetaRow}>
                <View style={styles.levelChip}>
                  <Text style={styles.levelChipText}>{LEVEL_LABEL[item.level] ?? item.level}</Text>
                </View>
                <Text style={styles.cardMeta}>{item.step_count} bước</Text>
              </View>

              <Text style={styles.cardStars}>{'⭐'.repeat(stars) + '☆'.repeat(3 - stars)}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 24 },
    backBtn: { flexDirection: 'row', alignItems: 'center' },
    backText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    title: { fontSize: 26, fontWeight: '800', color: colors.primary, marginTop: 12 },
    subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 6, marginBottom: 8 },
    list: { paddingVertical: 8, gap: CARD_GAP },
    columnWrapper: { gap: CARD_GAP },
    empty: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
    card: {
      flex: 1,
      height: CARD_HEIGHT,
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.border,
      padding: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    priorityBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: colors.warning,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    priorityBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    cardIcon: { fontSize: 40 },
    cardTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    levelChip: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    levelChipText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    cardMeta: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    cardStars: { fontSize: 13 },
  });
