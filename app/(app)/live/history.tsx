import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { supabase } from '../../../lib/supabase';
import { Conversation } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';

type SessionItem = Conversation & { overall_feedback?: string; avg_pronunciation?: number | null };

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export default function LiveHistoryScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSessions(); }, []);

  async function fetchSessions() {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .eq('mode', 'free_talk')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(50);

    setSessions(
      (data ?? []).map((c) => ({
        ...c,
        overall_feedback: c.summary?.overall_feedback ?? '',
        avg_pronunciation: c.summary?.avg_pronunciation ?? null,
      })),
    );
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (sessions.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Ionicons name="radio-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Chưa có phiên nào</Text>
          <Text style={styles.emptySub}>Bắt đầu một phiên Live để xem nhận xét ở đây.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const score = item.avg_pronunciation;
          const scoreColor =
            score == null ? colors.textMuted
              : score >= 80 ? colors.success
              : score >= 60 ? colors.warning
              : colors.error;
          const langFlag = item.language_id === 'en' ? '🇺🇸' : '🇯🇵';

          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              onPress={() =>
                router.push({
                  pathname: '/live/review/[conversationId]',
                  params: { conversationId: item.id },
                })
              }
            >
              <View style={styles.cardTop}>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardLang}>{langFlag}</Text>
                  <Text style={styles.cardDate}>{formatDate(item.started_at)}</Text>
                  <Text style={styles.cardTime}>{formatTime(item.started_at)}</Text>
                </View>
                {score != null && (
                  <View style={styles.scoreWrap}>
                    <Text style={[styles.scoreNum, { color: scoreColor }]}>{Math.round(score)}</Text>
                    <Text style={styles.scoreLabel}>phát âm</Text>
                  </View>
                )}
              </View>
              {item.overall_feedback ? (
                <Text style={styles.feedback} numberOfLines={2}>
                  {item.overall_feedback}
                </Text>
              ) : (
                <Text style={styles.noFeedback}>Không có nhận xét</Text>
              )}
              <View style={styles.cardFooter}>
                <Text style={styles.viewText}>Xem nhận xét</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 12 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardLang: { fontSize: 16 },
  cardDate: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  cardTime: { fontSize: 12, color: colors.textMuted },

  scoreWrap: { alignItems: 'flex-end' },
  scoreNum: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  scoreLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },

  feedback: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  noFeedback: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  viewText: { fontSize: 12, fontWeight: '600', color: colors.primary },
});
