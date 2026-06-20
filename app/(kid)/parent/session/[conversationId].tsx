import { Ionicons } from '@expo/vector-icons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  clearActiveAudio,
  registerActiveAudio,
  stopActiveAudio,
} from '../../../../lib/audioPlayback';
import { clearConversationAudio } from '../../../../lib/audioCache';
import { supabase } from '../../../../lib/supabase';
import { Conversation, Correction, Message, PronunciationAttempt } from '../../../../lib/types';
import { useTheme } from '../../../../providers/ThemeProvider';
import { getScoreColor } from '../../../../lib/scoring';

type ConversationWithReview = Conversation & {
  overall_feedback?: string;
  fluency_notes?: string;
  corrections?: Correction[];
  vocab_to_learn?: string[];
  avg_pronunciation?: number | null;
};

export default function ParentSessionReviewScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  const [loading, setLoading] = useState(true);
  const [conv, setConv] = useState<ConversationWithReview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attemptByMessageId, setAttemptByMessageId] = useState<Map<string, PronunciationAttempt>>(
    new Map(),
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<AudioPlayer | null>(null);
  const playingIdRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    const [convRes, msgRes] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', conversationId).single(),
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('sort_order'),
    ]);

    if (convRes.data) {
      const summary = convRes.data.summary ?? {};
      setConv({
        ...convRes.data,
        overall_feedback: summary.overall_feedback,
        fluency_notes: summary.fluency_notes,
        corrections: summary.corrections,
        vocab_to_learn: summary.words_to_learn,
        avg_pronunciation: summary.avg_pronunciation,
      });
    }
    const fetchedMessages = msgRes.data ?? [];
    setMessages(fetchedMessages);

    const userMessageIds = fetchedMessages
      .filter((m) => m.role === 'user' && m.audio_url)
      .map((m) => m.id);
    if (userMessageIds.length > 0) {
      const { data: attemptsData } = await supabase
        .from('pronunciation_attempts')
        .select('*')
        .in('message_id', userMessageIds);
      setAttemptByMessageId(new Map((attemptsData ?? []).map((a) => [a.message_id as string, a])));
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      soundRef.current?.pause();
      soundRef.current?.remove();
    };
  }, []);

  async function handlePlayAudio(messageId: string, audioUrl: string) {
    try {
      if (soundRef.current) {
        soundRef.current.pause();
        soundRef.current.remove();
        soundRef.current = null;
      }
      if (playingIdRef.current === messageId) {
        stopActiveAudio();
        playingIdRef.current = null;
        setPlayingId(null);
        return;
      }
      stopActiveAudio();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      const player = createAudioPlayer(audioUrl);
      soundRef.current = player;
      registerActiveAudio(player, () => {
        playingIdRef.current = null;
        setPlayingId(null);
      });
      playingIdRef.current = messageId;
      setPlayingId(messageId);
      player.play();
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          clearActiveAudio(player);
          playingIdRef.current = null;
          setPlayingId(null);
          player.remove();
          soundRef.current = null;
        }
      });
    } catch (err) {
      console.error('Play audio error:', err);
      playingIdRef.current = null;
      setPlayingId(null);
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('Lỗi', `Không thể phát lại ghi âm: ${message}`);
    }
  }

  async function handleDeleteSession() {
    Alert.alert(
      'Xoá phiên hội thoại',
      'Bạn có chắc chắn muốn xoá toàn bộ dữ liệu ghi âm và kết quả của phiên hội thoại này không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearConversationAudio(conversationId);

              const { data: messagesToDelete } = await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conversationId);

              const msgIds = messagesToDelete?.map((m) => m.id) ?? [];
              if (msgIds.length > 0) {
                await supabase.from('pronunciation_attempts').delete().in('message_id', msgIds);
              }

              const { error } = await supabase
                .from('conversations')
                .delete()
                .eq('id', conversationId);
              if (error) throw error;

              Alert.alert('Đã xoá', 'Phiên hội thoại đã được xoá thành công.');
              router.replace('/(kid)/parent/sessions' as Href);
            } catch (err: any) {
              console.error('[ParentSessionReview] Delete session error:', err);
              Alert.alert('Lỗi', 'Không thể xoá phiên hội thoại: ' + err.message);
            }
          },
        },
      ],
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.replace('/(kid)/parent/sessions' as Href)}
        hitSlop={10}
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Chi tiết phiên</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const offtopicOrders = new Set(conv?.summary?.offtopic_turns ?? []);
  const score = conv?.avg_pronunciation;
  const scoreColor = getScoreColor(score ?? null, colors);

  return (
    <SafeAreaView style={styles.safe}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        {/* Overall feedback */}
        {conv?.overall_feedback ? (
          <View style={styles.feedbackCard}>
            <Text style={styles.sectionTitle}>Nhận xét tổng quan</Text>
            <Text style={styles.feedbackText}>{conv.overall_feedback}</Text>
            {conv.fluency_notes ? (
              <Text style={styles.fluencyText}>💬 {conv.fluency_notes}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Pronunciation score */}
        {score != null && (
          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreBig, { color: scoreColor }]}>{Math.round(score)}</Text>
              <Text style={styles.scoreOf}>/100</Text>
              <Text style={styles.scoreLabel}>Điểm phát âm TB</Text>
            </View>
          </View>
        )}

        {/* Grammar corrections */}
        {conv?.corrections?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Lỗi ngữ pháp cần sửa</Text>
            <View style={styles.corrPanel}>
              {conv.corrections.map((c, i) => (
                <CorrectionRow key={i} correction={c} />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ngữ pháp</Text>
            <Text style={styles.noIssues}>✅ Không phát hiện lỗi ngữ pháp đáng chú ý.</Text>
          </View>
        )}

        {/* Vocab to learn — hiển thị tĩnh, phụ huynh xem (không tap lưu) */}
        {conv?.vocab_to_learn?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Từ vựng nên học</Text>
            <View style={styles.vocabRow}>
              {conv.vocab_to_learn.map((w, i) => (
                <View key={i} style={styles.vocabChip}>
                  <Text style={styles.vocabText}>{w}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Transcript */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <View style={styles.transcriptPanel}>
            {messages.map((m, i) => {
              const isOfftopic = m.role === 'assistant' && offtopicOrders.has(m.sort_order);
              return (
                <View
                  key={i}
                  style={[styles.transcriptRow, isOfftopic && styles.transcriptRowOfftopic]}
                >
                  <View style={styles.transcriptHeader}>
                    <Text style={styles.transcriptRole}>
                      {m.role === 'user' ? '👤 Bé' : '🤖 AI'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {isOfftopic ? <Text style={styles.offtopicBadge}>⚠️ Lạc đề</Text> : null}
                      {m.audio_url ? (
                        <TouchableOpacity
                          onPress={() => handlePlayAudio(m.id, m.audio_url!)}
                          style={styles.playBtn}
                          hitSlop={8}
                        >
                          <Ionicons
                            name={playingId === m.id ? 'pause-circle' : 'play-circle'}
                            size={20}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.transcriptText}>{m.text}</Text>
                  {m.role === 'user' && m.audio_url ? (
                    <PronunciationDetail attempt={attemptByMessageId.get(m.id)} />
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteSession}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={styles.deleteBtnText}>Xóa phiên hội thoại này</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Bảng pronunciation_attempts được 2 Edge Function dùng chung nhưng diễn giải
// word_scores khác nhau: ở session-review (màn này), error_type là TIP cải thiện
// (không phải mã loại lỗi như ở pronounce/WordHighlight.tsx) và score luôn = 0.
function PronunciationDetail({ attempt }: { attempt: PronunciationAttempt | undefined }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  if (!attempt || (attempt.accuracy_score == null && attempt.fluency_score == null)) return null;

  const clarityColor = getScoreColor(attempt.accuracy_score, colors);
  const fluencyColor = getScoreColor(attempt.fluency_score, colors);
  const flaggedWords = (attempt.word_scores ?? []).filter((ws) => ws.word);

  return (
    <View>
      <View style={styles.pronScoreRow}>
        {attempt.accuracy_score != null ? (
          <View style={[styles.pronBadge, { borderColor: clarityColor }]}>
            <Text style={[styles.pronBadgeText, { color: clarityColor }]}>
              Rõ: {Math.round(attempt.accuracy_score)}
            </Text>
          </View>
        ) : null}
        {attempt.fluency_score != null ? (
          <View style={[styles.pronBadge, { borderColor: fluencyColor }]}>
            <Text style={[styles.pronBadgeText, { color: fluencyColor }]}>
              Trôi chảy: {Math.round(attempt.fluency_score)}
            </Text>
          </View>
        ) : null}
      </View>
      {flaggedWords.map((ws, i) => (
        <Text key={i} style={styles.flaggedWordRow}>
          • &quot;{ws.word}&quot; - {ws.error_type}
        </Text>
      ))}
    </View>
  );
}

function CorrectionRow({ correction }: { correction: Correction }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.corrRow}>
      <View style={styles.corrLine}>
        <Text style={styles.corrLabelSai}>Sai</Text>
        <Text style={styles.corrOriginal}>{correction.original}</Text>
        <Ionicons name="arrow-forward" size={13} color={colors.textMuted} />
        <Text style={styles.corrFixed}>{correction.fixed}</Text>
      </View>
      {correction.explanation ? (
        <Text style={styles.corrExplain}>{correction.explanation}</Text>
      ) : null}
    </View>
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
    content: { padding: 16, gap: 14 },

    feedbackCard: {
      backgroundColor: colors.primaryLight,
      borderRadius: 16,
      padding: 16,
      gap: 8,
    },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
    feedbackText: { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
    fluencyText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },

    scoreCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    scoreBig: { fontSize: 36, fontWeight: '800' },
    scoreOf: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
    scoreLabel: { marginLeft: 10, fontSize: 14, color: colors.textSecondary },

    section: { gap: 8 },
    noIssues: { fontSize: 14, color: colors.success },

    corrPanel: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    corrRow: { gap: 4 },
    corrLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    corrLabelSai: { fontSize: 10, fontWeight: '700', color: colors.textMuted, width: 26 },
    corrOriginal: { fontSize: 13, color: colors.error, textDecorationLine: 'line-through' },
    corrFixed: { fontSize: 13, color: colors.success, fontWeight: '700' },
    corrExplain: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', paddingLeft: 32 },

    vocabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    vocabChip: {
      backgroundColor: colors.primaryLight,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      maxWidth: '100%',
    },
    vocabText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

    transcriptPanel: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    transcriptRow: { gap: 2, padding: 8, borderRadius: 10 },
    transcriptRowOfftopic: { backgroundColor: colors.warning + '20' },
    transcriptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    transcriptRole: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
    transcriptText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
    offtopicBadge: { fontSize: 11, fontWeight: '700', color: colors.warning },
    playBtn: { padding: 2 },

    pronScoreRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
    pronBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    pronBadgeText: { fontSize: 11, fontWeight: '700' },
    flaggedWordRow: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.error,
      borderRadius: 12,
      paddingVertical: 12,
      marginTop: 8,
    },
    deleteBtnText: {
      color: colors.error,
      fontSize: 14,
      fontWeight: '600',
    },
  });
