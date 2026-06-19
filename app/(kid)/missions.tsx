import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

export default function MissionsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();

  const [missions, setMissions] = useState<Mission[]>([]);
  const [priorityMissionIds, setPriorityMissionIds] = useState<Set<string>>(new Set());

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
      ]).then(([missionsRes, vocabRes]) => {
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
        setMissions(
          [...allMissions].sort((a, b) => {
            const aPriority = matchedIds.has(a.id) ? 1 : 0;
            const bPriority = matchedIds.has(b.id) ? 1 : 0;
            return bPriority - aPriority;
          }),
        );
      });
    }, [profile?.active_language_id, user]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Chọn nhiệm vụ 🎯</Text>
      <Text style={styles.subtitle}>Cùng bạn đồng hành hoàn thành nhiệm vụ nhé!</Text>

      <FlatList
        data={missions}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Chưa có nhiệm vụ nào, quay lại sau nhé!</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/(kid)/mission-live?missionId=${item.id}` as Href)}
          >
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {priorityMissionIds.has(item.id) ? (
                <Text style={styles.priorityBadge}>⭐ Ưu tiên</Text>
              ) : null}
            </View>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardMeta}>{LEVEL_LABEL[item.level] ?? item.level}</Text>
              <Text style={styles.cardMeta}>{item.step_count} bước</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 24 },
    title: { fontSize: 26, fontWeight: '800', color: colors.primary, marginTop: 12 },
    subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 6, marginBottom: 8 },
    list: { paddingVertical: 8, gap: 12 },
    empty: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.border,
      padding: 18,
    },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    cardTitle: { fontSize: 19, fontWeight: '800', color: colors.textPrimary },
    priorityBadge: { fontSize: 12, fontWeight: '700', color: colors.warning },
    cardMetaRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
    cardMeta: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  });
