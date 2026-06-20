import { ExpoAudioStreamModule, useAudioRecorder } from '@siteed/audio-studio';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { LegacyEventEmitter } from 'expo-modules-core';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AudioBufferQueueSourceNode,
  AudioContext,
  decodePCMInBase64,
} from 'react-native-audio-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  bytesToBase64,
  LiveClient,
  LiveState,
  pcmToWav,
  uploadLiveSegment,
} from '../../lib/liveClient';
import { supabase } from '../../lib/supabase';
import { logError } from '../../lib/sentry';
import { LanguageId, LiveAudioSegment, LiveTurn } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import {
  AccentId,
  ConversationMethodId,
  SESSION_LIMIT_MINUTES,
  SpeakingStyleId,
  ViewState,
  VoiceId,
} from './options';

export function useLiveSession() {
  const { user } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<ViewState>('setup');
  const [languageId, setLanguageId] = useState<LanguageId>('en');
  const [voice, setVoice] = useState<VoiceId>('Kore');
  const [speakingStyle, setSpeakingStyle] = useState<SpeakingStyleId>('casual');
  const [conversationMethod, setConversationMethod] = useState<ConversationMethodId>('free_talk');
  const [accent, setAccent] = useState<AccentId>('en-US');
  const [topic, setTopic] = useState('');
  const [liveState, setLiveState] = useState<LiveState>('idle');
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [savingMsg, setSavingMsg] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  const clientRef = useRef<LiveClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flatRef = useRef<FlatList>(null);
  const audioCtxRef = useRef<InstanceType<typeof AudioContext> | null>(null);
  const audioQueueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const audioEmitter = useRef(new LegacyEventEmitter(ExpoAudioStreamModule));
  const turnsRef = useRef<LiveTurn[]>([]);
  const lastErrorMsgRef = useRef<string>('');
  const isPausedRef = useRef(false);
  const { startRecording, stopRecording } = useAudioRecorder();

  function togglePause() {
    const next = !isPaused;
    setIsPaused(next);
    isPausedRef.current = next;
    if (next) {
      audioQueueRef.current?.clearBuffers();
    }
  }

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
    }, [user]),
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
    const sub = audioEmitter.current.addListener('AudioData', async (event: any) => {
      chunkCount++;
      if (chunkCount <= 3)
        console.log('[Live] AudioData chunk', chunkCount, 'encoded:', !!event?.encoded);
      if (event?.encoded && !isPausedRef.current) {
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
      stopRecording().catch(() => {});
      audioQueueRef.current?.stop();
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      audioQueueRef.current = null;
    };
  }, [view, startRecording, stopRecording]);

  // ── Start session ───────────────────────────────────────────────────
  async function startSession() {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Cần quyền microphone',
          'Vào Cài đặt → ParlEcho → Microphone để cho phép ghi âm.',
        );
        return;
      }
    } catch (err) {
      logError('Live.requestPermission', err);
      Alert.alert(
        'Lỗi quyền micro',
        'Không thể yêu cầu quyền ghi âm. Vui lòng cấp quyền trong Cài đặt thiết bị.',
      );
      return;
    }

    setView('connecting');
    setTurns([]);
    turnsRef.current = [];
    lastErrorMsgRef.current = '';
    setElapsedSec(0);
    setIsPaused(false);
    isPausedRef.current = false;

    const client = new LiveClient({
      onStateChange: (s) => {
        setLiveState(s);
        if (s === 'live') {
          setView('live');
          // Session timer
          timerRef.current = setInterval(() => {
            setElapsedSec((prev) => {
              if (isPausedRef.current) return prev;
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
          // onError (with the real close reason) fires right after this, synchronously
          // in the same tick — defer so lastErrorMsgRef is populated before we read it.
          setTimeout(() => {
            if (turnsRef.current.length > 0) {
              // Connection dropped mid-conversation — don't discard what was already
              // captured. Save & review the partial session instead of losing it.
              Alert.alert(
                'Mất kết nối',
                'Kết nối tới AI bị ngắt giữa phiên. Đang lưu lại phần đã ghi được...',
              );
              endSession();
            } else {
              setView('setup');
              Alert.alert(
                'Lỗi kết nối',
                lastErrorMsgRef.current || 'Không thể kết nối Live API. Thử lại sau.',
              );
            }
          }, 0);
        }
      },
      onAudioChunk: async (pcm24Base64) => {
        if (isPausedRef.current) return;
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
        turnsRef.current = t;
        setTurns([...t]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      },
      onError: (msg) => {
        lastErrorMsgRef.current = msg;
      },
    });

    clientRef.current = client;
    await client.start({
      languageId,
      topic: topic.trim(),
      voice,
      speakingStyle,
      conversationMethod,
      accent,
    });
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
        logError('Live.conversationInsert', convErr);
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
        await FileSystem.writeAsStringAsync(localUri, base64Wav, {
          encoding: FileSystem.EncodingType.Base64,
        });
        userAudioMap.set(seg.order, localUri);
      }

      const aiAudioMap = new Map<number, string>();
      for (const seg of rawAiSegments) {
        if (seg.pcm.length === 0) continue;
        const wavBytes = pcmToWav(seg.pcm, 24000, 16);
        const base64Wav = bytesToBase64(wavBytes);
        const localUri = `${localAudioDir}${seg.order}_ai.wav`;
        await FileSystem.writeAsStringAsync(localUri, base64Wav, {
          encoding: FileSystem.EncodingType.Base64,
        });
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
            audio_url:
              t.role === 'user' ? userAudioMap.get(t.sort_order) : aiAudioMap.get(t.sort_order),
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
          const storagePath = await uploadLiveSegment(user.id, conversationId, seg.order, seg.pcm);
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
      logError('Live.endSession', err);
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Lỗi lưu phiên');
      setView('setup');
    }
  }

  return {
    view,
    languageId,
    setLanguageId,
    voice,
    setVoice,
    speakingStyle,
    setSpeakingStyle,
    conversationMethod,
    setConversationMethod,
    accent,
    setAccent,
    topic,
    setTopic,
    liveState,
    turns,
    elapsedSec,
    savingMsg,
    isPaused,
    flatRef,
    togglePause,
    startSession,
    endSession,
  };
}
