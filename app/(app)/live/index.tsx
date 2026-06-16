/**
 * Live Conversation Screen
 *
 * View states: setup → connecting → live → saving → (navigate to review)
 *
 * NOTE: sendAudioChunk() is wired up in useEffect below with a STUB that
 * simulates mic input. Replace the stub with your native audio lib
 * (@siteed/expo-audio-studio or similar) once the EAS dev build is ready.
 * The rest of the flow (WebSocket, session-review, upload) is fully functional.
 */

import { Ionicons } from '@expo/vector-icons';
import { ExpoAudioStreamModule, useAudioRecorder } from '@siteed/audio-studio';
import { LegacyEventEmitter } from 'expo-modules-core';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AudioBufferQueueSourceNode,
  AudioContext,
  decodePCMInBase64,
} from 'react-native-audio-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/Colors';
import { LiveClient, LiveState, uploadLiveSegment } from '../../../lib/liveClient';
import { supabase } from '../../../lib/supabase';
import { LanguageId, LiveAudioSegment, LiveTurn } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';

const SESSION_LIMIT_MINUTES = 14; // Gemini Live cap ~15 min; auto-end at 14

type ViewState = 'setup' | 'connecting' | 'live' | 'saving';

export default function LiveScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<ViewState>('setup');
  const [languageId, setLanguageId] = useState<LanguageId>('en');
  const [topic, setTopic] = useState('');
  const [liveState, setLiveState] = useState<LiveState>('idle');
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [savingMsg, setSavingMsg] = useState('');

  const clientRef = useRef<LiveClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatRef = useRef<FlatList>(null);
  const audioCtxRef = useRef<InstanceType<typeof AudioContext> | null>(null);
  const audioQueueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const audioEmitter = useRef(new LegacyEventEmitter(ExpoAudioStreamModule));
  const { startRecording, stopRecording } = useAudioRecorder();

  // Load active language from profile
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('active_language_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.active_language_id) setLanguageId(data.active_language_id as LanguageId);
        });
    }, [user?.id]),
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Wire mic streaming + speaker playback when session goes live
  useEffect(() => {
    if (view !== 'live') return;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const queue = ctx.createBufferQueueSource();
    queue.connect(ctx.destination);
    queue.start();
    audioQueueRef.current = queue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = audioEmitter.current.addListener('AudioData', async (event: any) => {
      if (event?.encoded) {
        clientRef.current?.sendAudioChunk(event.encoded as string);
      }
    });

    startRecording({ sampleRate: 16000, channels: 1, encoding: 'pcm_16bit', interval: 100 })
      .catch((e) => console.warn('[Live] startRecording error', e));

    return () => {
      sub.remove();
      stopRecording().catch(() => {});
      queue.stop();
      ctx.close();
      audioCtxRef.current = null;
      audioQueueRef.current = null;
    };
  }, [view]);

  // ── Start session ───────────────────────────────────────────────────
  async function startSession() {
    setView('connecting');
    setTurns([]);
    setElapsedSec(0);

    const client = new LiveClient({
      onStateChange: (s) => {
        setLiveState(s);
        if (s === 'live') {
          setView('live');
          // Session timer
          timerRef.current = setInterval(() => {
            setElapsedSec((prev) => {
              if (prev >= SESSION_LIMIT_MINUTES * 60 - 1) {
                // Auto-end when limit approaches
                endSession();
                return prev;
              }
              return prev + 1;
            });
          }, 1000);
        }
        if (s === 'error') {
          if (timerRef.current) clearInterval(timerRef.current);
          setView('setup');
          Alert.alert('Lỗi kết nối', 'Không thể kết nối Live API. Thử lại sau.');
        }
      },
      onAudioChunk: async (pcm24Base64) => {
        const queue = audioQueueRef.current;
        if (!queue) return;
        try {
          const buffer = await decodePCMInBase64(pcm24Base64, 24000, 1);
          queue.enqueueBuffer(buffer);
        } catch (e) {
          console.warn('[Live] playback enqueue error', e);
        }
      },
      onInterrupted: () => {
        audioQueueRef.current?.clearBuffers();
      },
      onTranscriptUpdate: (t) => {
        setTurns([...t]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      },
      onError: (msg) => Alert.alert('Lỗi', msg),
    });

    clientRef.current = client;
    await client.start({ languageId, topic: topic.trim() });
  }

  // ── End session ─────────────────────────────────────────────────────
  async function endSession() {
    if (timerRef.current) clearInterval(timerRef.current);
    const client = clientRef.current;
    if (!client) return;

    setView('saving');
    setSavingMsg('Đang lưu phiên...');

    const { turns: finalTurns, rawUserSegments } = client.stop();
    clientRef.current = null;

    if (finalTurns.length === 0) {
      setView('setup');
      return;
    }

    if (!user) return;

    try {
      // 1. Create conversation row
      setSavingMsg('Tạo phiên hội thoại...');
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          language_id: languageId,
          mode: 'free_talk',
        })
        .select('id')
        .single();

      if (convErr || !conv) throw new Error('Không thể tạo phiên hội thoại');
      const conversationId = conv.id;

      // 2. Save transcript turns as messages
      setSavingMsg('Lưu transcript...');
      const { data: savedMessages } = await supabase
        .from('messages')
        .insert(
          finalTurns.map((t) => ({
            conversation_id: conversationId,
            user_id: user.id,
            role: t.role,
            sort_order: t.sort_order,
            text: t.text,
          })),
        )
        .select('id, sort_order, role');

      const messageIdByOrder = new Map(
        (savedMessages ?? []).map((m: { id: string; sort_order: number }) => [m.sort_order, m.id]),
      );

      // 3. Upload user audio segments + build segment list for review
      setSavingMsg('Lưu audio...');
      const audioSegments: LiveAudioSegment[] = [];

      for (const seg of rawUserSegments) {
        if (seg.pcm.length === 0 || !seg.text) continue;
        const messageId = messageIdByOrder.get(seg.order);
        if (!messageId) continue;

        try {
          const storagePath = await uploadLiveSegment(
            user.id,
            conversationId,
            seg.order,
            seg.pcm,
          );
          audioSegments.push({
            message_id: messageId,
            audio_storage_path: storagePath,
            text: seg.text,
            sort_order: seg.order,
          });
        } catch (uploadErr) {
          console.warn('[Live] audio upload failed for segment', seg.order, uploadErr);
        }
      }

      // 4. Call /session-review
      setSavingMsg('Đang phân tích...');
      const { error: reviewErr } = await supabase.functions.invoke('session-review', {
        body: {
          conversation_id: conversationId,
          language_id: languageId,
          transcript: finalTurns.map((t) => ({ role: t.role, text: t.text })),
          user_segments: audioSegments,
        },
      });

      if (reviewErr) console.warn('[Live] session-review error:', reviewErr);

      // 5. Navigate to review screen
      router.replace({
        pathname: '/live/review/[conversationId]',
        params: { conversationId },
      });
    } catch (err) {
      console.error('[Live] endSession error:', err);
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Lỗi lưu phiên');
      setView('setup');
    }
  }

  // ── Timer display ───────────────────────────────────────────────────
  function formatTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ── Render ──────────────────────────────────────────────────────────
  if (view === 'setup') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.setupContainer}>
          <View style={styles.iconWrap}>
            <Ionicons name="radio" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.setupTitle}>Hội thoại trực tiếp</Text>
          <Text style={styles.setupSub}>
            Nói chuyện tự nhiên với AI partner theo thời gian thực.{'\n'}
            Nhận xét ngữ pháp & phát âm sẽ hiện sau khi kết thúc phiên.
          </Text>

          {/* Language selector */}
          <View style={styles.langRow}>
            {(['en', 'ja'] as LanguageId[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.langBtn, languageId === lang && styles.langBtnActive]}
                onPress={() => setLanguageId(lang)}
                activeOpacity={0.8}
              >
                <Text style={[styles.langBtnText, languageId === lang && styles.langBtnTextActive]}>
                  {lang === 'en' ? '🇺🇸 English' : '🇯🇵 Japanese'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Optional topic */}
          <View style={styles.topicWrap}>
            <Text style={styles.topicLabel}>Chủ đề (tuỳ chọn)</Text>
            <TextInput
              style={styles.topicInput}
              value={topic}
              onChangeText={setTopic}
              placeholder={
                languageId === 'en'
                  ? 'e.g. Travel, Food, Daily life…'
                  : '例: 旅行、食べ物、日常生活…'
              }
              placeholderTextColor={Colors.textMuted}
              maxLength={80}
            />
          </View>

          {/* EAS dev build notice */}
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
            <Text style={styles.noticeText}>
              Tính năng này cần EAS dev build và native audio lib. Không hoạt động trong Expo Go.
            </Text>
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={startSession} activeOpacity={0.85}>
            <Ionicons name="radio" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Bắt đầu hội thoại</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (view === 'connecting') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.connectingText}>Đang kết nối...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'saving') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.connectingText}>{savingMsg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Live view ─────────────────────────────────────────────────────
  const isListening = liveState === 'live';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.liveHeader}>
        <View style={styles.liveIndicatorWrap}>
          <View style={[styles.liveDot, isListening && styles.liveDotActive]} />
          <Text style={styles.liveLabel}>
            {isListening ? 'Đang kết nối' : 'Đang xử lý'}
          </Text>
        </View>
        <Text style={styles.timer}>{formatTime(elapsedSec)}</Text>
        <Text style={styles.langChip}>
          {languageId === 'en' ? '🇺🇸 EN' : '🇯🇵 JP'}
        </Text>
      </View>

      {/* Transcript */}
      <FlatList
        ref={flatRef}
        data={turns}
        keyExtractor={(t, i) => `${t.role}-${i}`}
        contentContainerStyle={styles.transcriptList}
        ListEmptyComponent={
          <View style={styles.emptyTranscript}>
            <Text style={styles.emptyTranscriptText}>
              {languageId === 'en'
                ? 'Start speaking to begin the conversation…'
                : '話し始めてください…'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[
            styles.turnRow,
            item.role === 'user' ? styles.turnRowUser : styles.turnRowAI,
          ]}>
            <Text style={[
              styles.turnText,
              item.role === 'user' ? styles.turnTextUser : styles.turnTextAI,
            ]}>
              {item.text}
            </Text>
          </View>
        )}
      />

      {/* End button */}
      <View style={styles.endBar}>
        <TouchableOpacity style={styles.endBtn} onPress={endSession} activeOpacity={0.85}>
          <Ionicons name="stop-circle" size={22} color="#fff" />
          <Text style={styles.endBtnText}>Kết thúc & Xem nhận xét</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Setup
  setupContainer: { alignItems: 'center', padding: 28, gap: 16, paddingBottom: 40 },
  iconWrap: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  setupTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  setupSub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  langRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  langBtn: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 14, borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  langBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  langBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  langBtnTextActive: { color: Colors.primary },
  topicWrap: { alignSelf: 'stretch', gap: 6 },
  topicLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  topicInput: {
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: Colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  notice: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12, alignSelf: 'stretch',
  },
  noticeText: { flex: 1, fontSize: 12, color: Colors.warning, lineHeight: 18 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 16,
    width: '100%', justifyContent: 'center',
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Loading / saving
  centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  connectingText: { fontSize: 15, color: Colors.textMuted },

  // Live
  liveHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  liveIndicatorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border },
  liveDotActive: { backgroundColor: Colors.error },
  liveLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  timer: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  langChip: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },

  transcriptList: { padding: 16, gap: 10, paddingBottom: 8 },
  emptyTranscript: { paddingTop: 60, alignItems: 'center' },
  emptyTranscriptText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },

  turnRow: { maxWidth: '85%', borderRadius: 16, padding: 12 },
  turnRowUser: {
    alignSelf: 'flex-end', backgroundColor: Colors.primary, borderBottomRightRadius: 4,
  },
  turnRowAI: {
    alignSelf: 'flex-start', backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    ...(Platform.OS !== 'android' && { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }),
    elevation: 1,
  },
  turnText: { fontSize: 15, lineHeight: 22 },
  turnTextUser: { color: '#fff' },
  turnTextAI: { color: Colors.textPrimary },

  endBar: {
    padding: 16, paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: Colors.error, borderRadius: 16, paddingVertical: 14,
  },
  endBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
