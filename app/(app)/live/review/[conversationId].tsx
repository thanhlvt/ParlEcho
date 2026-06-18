import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { useTheme } from '../../../../providers/ThemeProvider';
import { supabase } from '../../../../lib/supabase';
import { Conversation, Correction, Message, SegmentPronunciation } from '../../../../lib/types';
import { useAuth } from '../../../../providers/AuthProvider';
import { clearConversationAudio } from '../../../../lib/audioCache';

type ConversationWithReview = Conversation & {
  overall_feedback?: string;
  fluency_notes?: string;
  corrections?: Correction[];
  vocab_to_learn?: string[];
  pronunciation?: SegmentPronunciation[];
  avg_pronunciation?: number | null;
};

export default function ReviewScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [conv, setConv] = useState<ConversationWithReview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

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
        pronunciation: undefined, // pronunciation loaded from pronunciation_attempts below
      });
    }
    setMessages(msgRes.data ?? []);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  async function handlePlayAudio(messageId: string, audioUrl: string) {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingId === messageId) {
        setPlayingId(null);
        return;
      }
      setPlayingId(messageId);
      // The Live session leaves the native audio session claimed for recording
      // (mic capture + low-latency playback engine) — explicitly switch back to
      // normal playback mode here, otherwise expo-av fails to acquire audio focus.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
      soundRef.current = sound;
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (err) {
      console.error('Play audio error:', err);
      setPlayingId(null);
      const message = err instanceof Error ? err.message : String(err);
      const isMissingFile = /no such file|not found|ENOENT/i.test(message);
      Alert.alert(
        'Lỗi',
        isMissingFile
          ? 'Không tìm thấy file ghi âm. File có thể đã bị xoá khỏi máy.'
          : `Không thể phát lại ghi âm: ${message}`,
      );
    }
  }

  async function saveWord(word: string) {
    if (!user || !conv) return;
    try {
      const cleanWord = word.trim();
      if (!cleanWord) return;

      const { data: existing, error: checkError } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .ilike('content', cleanWord)
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        Alert.alert('Thông báo', `"${cleanWord}" đã tồn tại trong Sổ tay.`);
        return;
      }

      const { error } = await supabase.from('saved_items').insert({
        user_id: user.id,
        language_id: conv.language_id,
        type: 'word',
        content: cleanWord,
      });
      if (error) throw error;
      Alert.alert('Đã lưu', `"${cleanWord}" đã thêm vào sổ tay.`);
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể lưu từ vựng.');
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
              // 1. Xoá audio file ở local
              await clearConversationAudio(conversationId);

              // 2. Lấy danh sách ID tin nhắn thuộc phiên này
              const { data: messagesToDelete } = await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conversationId);

              const msgIds = messagesToDelete?.map((m) => m.id) ?? [];

              // 3. Xoá các bản ghi phát âm (attempts) liên quan trước để tránh lỗi check constraint
              if (msgIds.length > 0) {
                await supabase.from('pronunciation_attempts').delete().in('message_id', msgIds);
              }

              // 4. Xoá phiên hội thoại (cascade delete các tin nhắn trong messages)
              const { error } = await supabase
                .from('conversations')
                .delete()
                .eq('id', conversationId);

              if (error) throw error;

              Alert.alert('Đã xoá', 'Phiên hội thoại đã được xoá thành công.');

              // 5. Quay lại màn hình Live
              router.replace('/live');
            } catch (err: any) {
              console.error('[Review] Delete session error:', err);
              Alert.alert('Lỗi', 'Không thể xoá phiên hội thoại: ' + err.message);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Nhận xét phiên' }} />
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const score = conv?.avg_pronunciation;
  const scoreColor =
    score == null
      ? colors.textMuted
      : score >= 80
        ? colors.success
        : score >= 60
          ? colors.warning
          : colors.error;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Nhận xét phiên' }} />
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

        {/* Vocab to learn */}
        {conv?.vocab_to_learn?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Từ vựng nên học</Text>
            <View style={styles.vocabRow}>
              {conv.vocab_to_learn.map((w, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.vocabChip}
                  onPress={() => saveWord(w)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.vocabText}>{w}</Text>
                  <Ionicons name="bookmark-outline" size={13} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.vocabHint}>Tap để lưu vào sổ tay</Text>
          </View>
        ) : null}

        {/* Transcript */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcript</Text>
          <View style={styles.transcriptPanel}>
            {messages.map((m, i) => (
              <View key={i} style={styles.transcriptRow}>
                <View style={styles.transcriptHeader}>
                  <Text style={styles.transcriptRole}>
                    {m.role === 'user' ? '👤 Bạn' : '🤖 AI'}
                  </Text>
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
                <Text style={styles.transcriptText}>{m.text}</Text>
              </View>
            ))}
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
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    scoreBig: { fontSize: 42, fontWeight: '800' },
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.primaryLight,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      maxWidth: '100%',
    },
    vocabText: { fontSize: 13, color: colors.primary, fontWeight: '600', flexShrink: 1 },
    vocabHint: { fontSize: 11, color: colors.textMuted },

    transcriptPanel: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    transcriptRow: { gap: 2 },
    transcriptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    transcriptRole: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
    transcriptText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
    playBtn: { padding: 2 },

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
