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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../../providers/ThemeProvider';
import { bytesToBase64, LiveClient, LiveState, pcmToWav, uploadLiveSegment } from '../../../lib/liveClient';
import { supabase } from '../../../lib/supabase';
import { LanguageId, LiveAudioSegment, LiveTurn } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useSidebar } from '../_layout';

const SESSION_LIMIT_MINUTES = 14; // Gemini Live cap ~15 min; auto-end at 14

const VOICES = [
  { id: 'Puck', desc: 'Vui vẻ' },
  { id: 'Charon', desc: 'Điềm tĩnh' },
  { id: 'Kore', desc: 'Rõ ràng' },
  { id: 'Fenrir', desc: 'Sôi nổi' },
  { id: 'Aoede', desc: 'Nhẹ nhàng' },
  { id: 'Leda', desc: 'Trẻ trung' },
  { id: 'Orus', desc: 'Mạnh mẽ' },
  { id: 'Zephyr', desc: 'Trầm ấm' },
  { id: 'Schedar', desc: 'Trung lập' },
  { id: 'Achernar', desc: 'Linh hoạt' },
] as const;
type VoiceId = (typeof VOICES)[number]['id'];

const SPEAKING_STYLES = [
  { id: 'casual', label: 'Casual', icon: '😊' },
  { id: 'formal', label: 'Lịch sự', icon: '🤝' },
  { id: 'workplace', label: 'Công sở', icon: '💼' },
  { id: 'beginner', label: 'Nói chậm', icon: '🐢' },
  { id: 'children', label: 'Cho trẻ em', icon: '🧒' },
] as const;
type SpeakingStyleId = (typeof SPEAKING_STYLES)[number]['id'];

const CONVERSATION_METHODS = [
  { id: 'free_talk', label: 'Nói tự do', icon: '💬' },
  { id: 'consulting', label: 'Tư vấn', icon: '🤔' },
  { id: 'interview', label: 'Phỏng vấn', icon: '📋' },
  { id: 'empathetic', label: 'Thấu cảm', icon: '💝' },
  { id: 'pressure', label: 'Gây áp lực', icon: '🔥' },
] as const;
type ConversationMethodId = (typeof CONVERSATION_METHODS)[number]['id'];

type ViewState = 'setup' | 'connecting' | 'live' | 'saving';

export default function LiveScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  const [view, setView] = useState<ViewState>('setup');
  const [languageId, setLanguageId] = useState<LanguageId>('en');
  const [voice, setVoice] = useState<VoiceId>('Kore');
  const [speakingStyle, setSpeakingStyle] = useState<SpeakingStyleId>('casual');
  const [conversationMethod, setConversationMethod] = useState<ConversationMethodId>('free_talk');
  const [accent, setAccent] = useState<'en-US' | 'en-UK'>('en-US');
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

  // Wire mic streaming when session goes live.
  // AudioContext is created LAZILY on first AI audio chunk to avoid
  // claiming the audio session before the mic has a chance to start.
  useEffect(() => {
    if (view !== 'live') return;

    let chunkCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = audioEmitter.current.addListener('AudioData', async (event: any) => {
      chunkCount++;
      if (chunkCount <= 3) console.log('[Live] AudioData chunk', chunkCount, 'encoded:', !!event?.encoded);
      if (event?.encoded) {
        clientRef.current?.sendAudioChunk(event.encoded as string);
      }
    });

    console.log('[Live] Starting recording...');
    startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100,
      // VoiceChat mode enables hardware AEC on iOS — mic cancels speaker output automatically
      ios: {
        audioSession: {
          category: 'PlayAndRecord',
          mode: 'VoiceChat',
          categoryOptions: ['DefaultToSpeaker', 'AllowBluetooth'],
        },
      },
      // Keep communication focus priority on Android so audio routing behaves like a voice call
      android: { audioFocusStrategy: 'communication' },
    })
      .then(() => console.log('[Live] Recording started OK'))
      .catch((e) => console.warn('[Live] startRecording error', e));

    return () => {
      sub.remove();
      stopRecording().catch(() => { });
      audioQueueRef.current?.stop();
      audioCtxRef.current?.close();
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
        // Lazy-init AudioContext on first chunk to avoid audio session
        // conflict with mic recording that starts before AI responds
        if (!audioCtxRef.current) {
          // Must match Gemini Live output rate (24 kHz) — otherwise audio plays at wrong speed
          const ctx = new AudioContext({ sampleRate: 24000 });
          audioCtxRef.current = ctx;
          const queue = ctx.createBufferQueueSource();
          queue.connect(ctx.destination);
          queue.start(0, 0);
          audioQueueRef.current = queue;
        }
        try {
          const buffer = await decodePCMInBase64(pcm24Base64, 24000, 1);
          audioQueueRef.current?.enqueueBuffer(buffer);
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
    await client.start({ languageId, topic: topic.trim(), voice, speakingStyle, conversationMethod, accent });
  }

  // ── End session ─────────────────────────────────────────────────────
  async function endSession() {
    if (timerRef.current) clearInterval(timerRef.current);
    const client = clientRef.current;
    if (!client) return;

    setView('saving');
    setSavingMsg('Đang lưu phiên...');

    const { turns: finalTurns, rawUserSegments, rawAiSegments } = client.stop();
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

      if (convErr || !conv) {
        console.error('[Live] conversation insert error:', convErr?.message, convErr?.code);
        throw new Error('Không thể tạo phiên hội thoại');
      }
      const conversationId = conv.id;
      console.log('[Live] conversation created:', conversationId, 'user:', user.id);

      // 1.5. Save local audio files
      setSavingMsg('Lưu file âm thanh cục bộ...');
      const localAudioDir = `${FileSystem.documentDirectory}live/${conversationId}/`;
      await FileSystem.makeDirectoryAsync(localAudioDir, { intermediates: true });

      const userAudioMap = new Map<number, string>();
      for (const seg of rawUserSegments) {
        if (seg.pcm.length === 0) continue;
        const wavBytes = pcmToWav(seg.pcm, 16000, 16);
        const base64Wav = bytesToBase64(wavBytes);
        const localUri = `${localAudioDir}${seg.order}_user.wav`;
        await FileSystem.writeAsStringAsync(localUri, base64Wav, { encoding: FileSystem.EncodingType.Base64 });
        userAudioMap.set(seg.order, localUri);
      }

      const aiAudioMap = new Map<number, string>();
      for (const seg of rawAiSegments) {
        if (seg.pcm.length === 0) continue;
        const wavBytes = pcmToWav(seg.pcm, 24000, 16);
        const base64Wav = bytesToBase64(wavBytes);
        const localUri = `${localAudioDir}${seg.order}_ai.wav`;
        await FileSystem.writeAsStringAsync(localUri, base64Wav, { encoding: FileSystem.EncodingType.Base64 });
        aiAudioMap.set(seg.order, localUri);
      }

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
            audio_url: t.role === 'user' ? userAudioMap.get(t.sort_order) : aiAudioMap.get(t.sort_order),
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
        {/* Topbar with Drawer trigger and History link */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={toggleSidebar} activeOpacity={0.7} style={{ padding: 4 }} hitSlop={8}>
            <Ionicons name="menu" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => router.push('/(app)/live/history')}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.historyBtnText}>Lịch sử</Text>
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.setupContainer}>
            <View style={styles.iconWrap}>
              <Ionicons name="radio" size={48} color={colors.primary} />
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

            {/* Accent selector (English only) */}
            {languageId === 'en' && (
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionLabel}>Chất giọng (Accent)</Text>
                <View style={styles.accentRow}>
                  <TouchableOpacity
                    style={[styles.accentBtn, accent === 'en-US' && styles.accentBtnActive]}
                    onPress={() => setAccent('en-US')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.accentBtnText, accent === 'en-US' && styles.accentBtnTextActive]}>
                      🇺🇸 Anh-Mỹ (en-US)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.accentBtn, accent === 'en-UK' && styles.accentBtnActive]}
                    onPress={() => setAccent('en-UK')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.accentBtnText, accent === 'en-UK' && styles.accentBtnTextActive]}>
                      🇬🇧 Anh-Anh (en-UK)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Voice selector */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>Giọng nói</Text>
              <View style={styles.voiceGrid}>
                {VOICES.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.voiceChip, voice === v.id && styles.voiceChipActive]}
                    onPress={() => setVoice(v.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.voiceChipName, voice === v.id && styles.voiceChipNameActive]}>
                      {v.id}
                    </Text>
                    <Text style={[styles.voiceChipDesc, voice === v.id && styles.voiceChipDescActive]}>
                      {v.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Speaking style */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>Cách nói chuyện</Text>
              <View style={styles.optionGrid}>
                {SPEAKING_STYLES.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.optionChip, speakingStyle === s.id && styles.optionChipActive]}
                    onPress={() => setSpeakingStyle(s.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.optionChipIcon}>{s.icon}</Text>
                    <Text style={[styles.optionChipLabel, speakingStyle === s.id && styles.optionChipLabelActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Conversation method */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>Phương pháp hội thoại</Text>
              <View style={styles.optionGrid}>
                {CONVERSATION_METHODS.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.optionChip, conversationMethod === m.id && styles.optionChipActive]}
                    onPress={() => setConversationMethod(m.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.optionChipIcon}>{m.icon}</Text>
                    <Text style={[styles.optionChipLabel, conversationMethod === m.id && styles.optionChipLabelActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
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
                placeholderTextColor={colors.textMuted}
                maxLength={80}
              />
            </View>

            <TouchableOpacity style={styles.startBtn} onPress={startSession} activeOpacity={0.85}>
              <Ionicons name="radio" size={20} color="#fff" />
              <Text style={styles.startBtnText}>Bắt đầu hội thoại</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (view === 'connecting') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.connectingText}>Đang kết nối...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'saving') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.connectingText}>{savingMsg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Live view ─────────────────────────────────────────────────────
  const isListening = liveState === 'live';

  return (
    <SafeAreaView style={styles.safe}>
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
const getStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // Setup
  setupContainer: { alignItems: 'center', padding: 28, gap: 16, paddingBottom: 40 },
  iconWrap: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  setupTitle: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  setupSub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  langRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  langBtn: {
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 14, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  langBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  langBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  langBtnTextActive: { color: colors.primary },
  accentRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  accentBtn: {
    flex: 1,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 14, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  accentBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  accentBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  accentBtnTextActive: { color: colors.primary },
  topicWrap: { alignSelf: 'stretch', gap: 6 },
  topicLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  topicInput: {
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: colors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  notice: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12, alignSelf: 'stretch',
  },
  noticeText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 18 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.primary, borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 16,
    width: '100%', justifyContent: 'center',
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Option sections
  sectionWrap: { alignSelf: 'stretch', gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  voiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voiceChip: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 12, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface, width: '23%',
  },
  voiceChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  voiceChipName: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  voiceChipNameActive: { color: colors.primary },
  voiceChipDesc: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  voiceChipDescActive: { color: colors.primary },

  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionChipIcon: { fontSize: 14 },
  optionChipLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  optionChipLabelActive: { color: colors.primary },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, backgroundColor: colors.primaryLight,
  },
  historyBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Loading / saving
  centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  connectingText: { fontSize: 15, color: colors.textMuted },

  // Live
  liveHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  liveIndicatorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  liveDotActive: { backgroundColor: colors.error },
  liveLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  timer: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  langChip: { fontSize: 13, fontWeight: '600', color: colors.textMuted },

  transcriptList: { padding: 16, gap: 10, paddingBottom: 8 },
  emptyTranscript: { paddingTop: 60, alignItems: 'center' },
  emptyTranscriptText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  turnRow: { maxWidth: '85%', borderRadius: 16, padding: 12 },
  turnRowUser: {
    alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4,
  },
  turnRowAI: {
    alignSelf: 'flex-start', backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    ...(Platform.OS !== 'android' && { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }),
    elevation: 1,
  },
  turnText: { fontSize: 15, lineHeight: 22 },
  turnTextUser: { color: '#fff' },
  turnTextAI: { color: colors.textPrimary },

  endBar: {
    padding: 16, paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: colors.error, borderRadius: 16, paddingVertical: 14,
  },
  endBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
