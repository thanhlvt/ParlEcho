import { Ionicons } from '@expo/vector-icons';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Stack, useLocalSearchParams } from 'expo-router';
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
import { supabase } from '../../../../lib/supabase';
import { Conversation, Message } from '../../../../lib/types';
import { useTheme } from '../../../../providers/ThemeProvider';

export default function ParentSessionReviewScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  const [loading, setLoading] = useState(true);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
    if (convRes.data) setConv(convRes.data as Conversation);
    setMessages(msgRes.data ?? []);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Chi tiết phiên' }} />
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const offtopicOrders = new Set(conv?.summary?.offtopic_turns ?? []);
  const score = conv?.summary?.avg_pronunciation;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Chi tiết phiên' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {score != null ? (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreBig}>{Math.round(score)}</Text>
            <Text style={styles.scoreLabel}>/100 điểm phát âm trung bình</Text>
          </View>
        ) : null}

        <View style={styles.transcriptPanel}>
          {messages.map((m, i) => {
            const isOfftopic = m.role === 'assistant' && offtopicOrders.has(m.sort_order);
            return (
              <View
                key={i}
                style={[styles.transcriptRow, isOfftopic && styles.transcriptRowOfftopic]}
              >
                <View style={styles.transcriptHeader}>
                  <Text style={styles.transcriptRole}>{m.role === 'user' ? '👤 Bé' : '🤖 AI'}</Text>
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
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 14 },
    scoreCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    scoreBig: { fontSize: 36, fontWeight: '800', color: colors.primary },
    scoreLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
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
  });
