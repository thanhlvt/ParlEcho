import { ExpoAudioStreamModule, useAudioRecorder } from '@siteed/audio-studio';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { LegacyEventEmitter } from 'expo-modules-core';
import { Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  AudioBufferQueueSourceNode,
  AudioContext,
  decodePCMInBase64,
} from 'react-native-audio-api';
import { awardBiscuits, spinLuckyWheel as spinLuckyWheelReward } from '../../lib/biscuits';
import {
  bytesToBase64,
  LiveClient,
  LiveState,
  pcmToWav,
  uploadLiveSegment,
} from '../../lib/liveClient';
import { supabase } from '../../lib/supabase';
import {
  Companion as CompanionType,
  LiveAudioSegment,
  LiveTurn,
  Mission,
  MissionStep,
  SessionReviewApiResponse,
  Sticker,
} from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useScreenTime } from '../../providers/ScreenTimeProvider';
import { CompanionExpression } from './companionAssets';

// Phiên Guided Conversation (Kid Mode) bị giới hạn ngắn hơn Live tự do của adult —
// trẻ nhỏ khó tập trung lâu, mission cũng chỉ có vài bước.
const SESSION_LIMIT_MINUTES = 10;
const TURN_LIMIT_SEC = 8;
const NUDGE_DISPLAY_MS = 4000;
const REACTION_DISPLAY_MS = 1600;
// Star 2 (phát âm): ngưỡng điểm clarity trung bình từ Gemini (/session-review).
const PRONUNCIATION_STAR_THRESHOLD = 70;
// Hết giờ chơi phiên (Pha 4) mà AI không nói thêm gì nữa — vẫn kết thúc sau tối đa khoảng này
// để tránh phiên treo vô hạn chờ "lượt nói hiện tại" không bao giờ tới.
const TIME_UP_FALLBACK_MS = 20000;

export type MissionView = 'loading' | 'connecting' | 'live' | 'saving' | 'finished' | 'error';

export function useMissionSession(missionId: string) {
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();
  const { limitReached: dailyLimitReached } = useScreenTime();
  const router = useRouter();

  const [view, setView] = useState<MissionView>('loading');
  const [mission, setMission] = useState<Mission | null>(null);
  const [steps, setSteps] = useState<MissionStep[]>([]);
  const [companion, setCompanion] = useState<CompanionType | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [expression, setExpression] = useState<CompanionExpression>('idle');
  const [lastAiText, setLastAiText] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showNudge, setShowNudge] = useState(false);
  const [savingMsg, setSavingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [stars, setStars] = useState(0);
  const [unlockedStickers, setUnlockedStickers] = useState<Sticker[]>([]);
  const [timeUp, setTimeUp] = useState(false);
  const [biscuitsAwarded, setBiscuitsAwarded] = useState(0);
  const [showLuckyWheel, setShowLuckyWheel] = useState(false);
  const [luckyWheelResult, setLuckyWheelResult] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const clientRef = useRef<LiveClient | null>(null);
  const isPausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeUpFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnsRef = useRef<LiveTurn[]>([]);
  const missionCompletedRef = useRef(false);
  const hintUsedRef = useRef(false);
  const timeUpPendingRef = useRef(false);
  const offTopicTurnsRef = useRef<number[]>([]);
  const audioCtxRef = useRef<InstanceType<typeof AudioContext> | null>(null);
  const audioQueueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const audioEmitter = useRef(new LegacyEventEmitter(ExpoAudioStreamModule));
  const { startRecording, stopRecording } = useAudioRecorder();

  const setReaction = useCallback((expr: CompanionExpression, durationMs: number) => {
    setExpression(expr);
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = setTimeout(() => setExpression('idle'), durationMs);
  }, []);

  // Trẻ bấm xem gợi ý câu mục tiêu — mất star 3 ("không dùng gợi ý") cho phiên này.
  const revealHint = useCallback(() => {
    hintUsedRef.current = true;
    setShowHint(true);
  }, []);

  const togglePause = useCallback(() => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (next) audioQueueRef.current?.clearBuffers();
  }, []);

  // ── Tải mission + steps + companion ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [missionRes, stepsRes] = await Promise.all([
        supabase.from('missions').select('*').eq('id', missionId).single(),
        supabase.from('mission_steps').select('*').eq('mission_id', missionId).order('step_order'),
      ]);
      if (cancelled) return;
      if (missionRes.error || !missionRes.data || !stepsRes.data?.length) {
        setErrorMsg('Không tải được nhiệm vụ.');
        setView('error');
        return;
      }
      setMission(missionRes.data as Mission);
      setSteps(stepsRes.data as MissionStep[]);

      if (profile?.companion_id) {
        const { data: comp } = await supabase
          .from('companions')
          .select('*')
          .eq('id', profile.companion_id)
          .single();
        if (!cancelled && comp) setCompanion(comp as CompanionType);
      }
      if (!cancelled) setView('connecting');
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  // ── Mở kết nối Live khi đã có đủ dữ liệu ──────────────────────────────
  useEffect(() => {
    if (view !== 'connecting' || !mission || steps.length === 0) return;
    startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mission, steps]);

  // Hết giờ chơi phiên (Pha 4) trong khi đang live → không cắt ngay, chờ AI nói xong lượt hiện
  // tại (xem onTranscriptUpdate) rồi mới kết thúc. Fallback nếu AI không nói gì thêm.
  useEffect(() => {
    if (!dailyLimitReached || view !== 'live' || timeUpPendingRef.current) return;
    timeUpPendingRef.current = true;
    setTimeUp(true);
    timeUpFallbackRef.current = setTimeout(() => endSession(), TIME_UP_FALLBACK_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyLimitReached, view]);

  // Cleanup khi unmount
  useEffect(() => {
    return () => {
      clientRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      if (timeUpFallbackRef.current) clearTimeout(timeUpFallbackRef.current);
    };
  }, []);

  // Mic streaming khi vào trạng thái live
  useEffect(() => {
    if (view !== 'live') return;

    const sub = audioEmitter.current.addListener('AudioData', async (event: any) => {
      if (event?.encoded && !isPausedRef.current) {
        clientRef.current?.sendAudioChunk(event.encoded as string);
      }
    });

    startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100,
      ios: {
        audioSession: {
          category: 'PlayAndRecord',
          mode: 'VoiceChat',
          categoryOptions: ['DefaultToSpeaker', 'AllowBluetooth'],
        },
      },
      android: { audioFocusStrategy: 'communication' },
    }).catch((e) => console.warn('[MissionSession] startRecording error', e));

    return () => {
      sub.remove();
      stopRecording().catch(() => {});
      audioQueueRef.current?.stop();
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      audioQueueRef.current = null;
    };
  }, [view, startRecording, stopRecording]);

  async function startSession() {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Cần quyền microphone',
          'Vào Cài đặt → ParlEcho → Microphone để cho phép ghi âm.',
        );
        setView('error');
        return;
      }
    } catch (err) {
      console.error('[MissionSession] permission error', err);
      setView('error');
      return;
    }

    if (!mission) return;
    turnsRef.current = [];
    missionCompletedRef.current = false;
    hintUsedRef.current = false;
    timeUpPendingRef.current = false;
    offTopicTurnsRef.current = [];
    setElapsedSec(0);
    setCurrentStepIndex(0);
    setShowHint(false);
    setTimeUp(false);
    setIsPaused(false);
    isPausedRef.current = false;

    const client = new LiveClient({
      onStateChange: (s: LiveState) => {
        if (s === 'live') {
          setView('live');
          timerRef.current = setInterval(() => {
            setElapsedSec((prev) => {
              if (isPausedRef.current) return prev;
              if (prev >= SESSION_LIMIT_MINUTES * 60 - 1) {
                endSession();
                return prev;
              }
              return prev + 1;
            });
          }, 1000);
        }
        if (s === 'error') {
          if (timerRef.current) clearInterval(timerRef.current);
          if (turnsRef.current.length > 0) {
            endSession();
          } else {
            setView('error');
          }
        }
      },
      onAudioChunk: async (pcm24Base64) => {
        if (isPausedRef.current) return;
        if (!audioCtxRef.current) {
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
          console.warn('[MissionSession] playback enqueue error', e);
        }
      },
      onInterrupted: () => {
        audioQueueRef.current?.clearBuffers();
      },
      onTranscriptUpdate: (t) => {
        const prevLen = turnsRef.current.length;
        turnsRef.current = t;
        const lastAi = [...t].reverse().find((turn) => turn.role === 'assistant');
        if (lastAi) setLastAiText(lastAi.text);
        // AI vừa nói xong một lượt mới (không phải bản preview của lượt user) — nếu đang chờ
        // hết giờ thì đây là điểm dừng an toàn, không cắt giữa câu.
        if (
          timeUpPendingRef.current &&
          t.length > prevLen &&
          t[t.length - 1]?.role === 'assistant'
        ) {
          if (timeUpFallbackRef.current) clearTimeout(timeUpFallbackRef.current);
          endSession();
        }
      },
      onError: (msg) => {
        console.warn('[MissionSession] error', msg);
      },
      onTurnTimeout: () => {
        setShowNudge(true);
        setReaction('thinking', NUDGE_DISPLAY_MS);
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(() => setShowNudge(false), NUDGE_DISPLAY_MS);
      },
      onStepAdvance: () => {
        setShowNudge(false);
        setShowHint(false);
        setCurrentStepIndex((prev) => {
          const next = prev + 1;
          setReaction('cheering', REACTION_DISPLAY_MS);
          if (next >= steps.length) {
            // Bước cuối — đợi AI nói xong lời chúc mừng (onAiAudioDone) rồi mới kết thúc
            // phiên, tránh cắt audio giữa câu. Xem onAiAudioDone bên dưới.
            missionCompletedRef.current = true;
          }
          return next;
        });
      },
      // AI vừa phát hết audio buffer của lượt cuối (lời chúc mừng) — nếu mission đã hoàn
      // thành thì giờ mới an toàn để kết thúc phiên.
      onAiAudioDone: () => {
        if (missionCompletedRef.current) endSession();
      },
      onOffTopic: (_streak, sortOrder) => {
        offTopicTurnsRef.current = [...offTopicTurnsRef.current, sortOrder];
        setReaction('surprised', REACTION_DISPLAY_MS);
      },
    });

    clientRef.current = client;
    await client.start({
      languageId: mission.language_id,
      mode: 'kid_guided',
      mission: {
        title: mission.title,
        topic: mission.topic,
        steps: steps.map((s) => ({
          stepOrder: s.step_order,
          targetSentence: s.target_sentence,
          intent: s.intent,
        })),
      },
      companionName: companion?.name,
      companionPersonality: companion?.personality,
      turnLimitSec: TURN_LIMIT_SEC,
    });
  }

  async function endSession() {
    if (timerRef.current) clearInterval(timerRef.current);
    const client = clientRef.current;
    if (!client || !mission || !user) {
      setView('finished');
      return;
    }

    setView('saving');
    setSavingMsg('Đang lưu lại...');

    const { turns: finalTurns, rawUserSegments, rawAiSegments } = client.stop();
    clientRef.current = null;

    if (finalTurns.length === 0) {
      setView('finished');
      return;
    }

    try {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          language_id: mission.language_id,
          mode: 'kid_guided',
          mission_id: mission.id,
        })
        .select('id')
        .single();

      if (convErr || !conv) throw new Error('Không thể tạo phiên hội thoại');
      const conversationId = conv.id;

      const localAudioDir = `${FileSystem.documentDirectory}live/${conversationId}/`;
      await FileSystem.makeDirectoryAsync(localAudioDir, { intermediates: true });

      const userAudioMap = new Map<number, string>();
      for (const seg of rawUserSegments) {
        if (seg.pcm.length === 0) continue;
        const base64Wav = bytesToBase64(pcmToWav(seg.pcm, 16000, 16));
        const localUri = `${localAudioDir}${seg.order}_user.wav`;
        await FileSystem.writeAsStringAsync(localUri, base64Wav, {
          encoding: FileSystem.EncodingType.Base64,
        });
        userAudioMap.set(seg.order, localUri);
      }

      const aiAudioMap = new Map<number, string>();
      for (const seg of rawAiSegments) {
        if (seg.pcm.length === 0) continue;
        const base64Wav = bytesToBase64(pcmToWav(seg.pcm, 24000, 16));
        const localUri = `${localAudioDir}${seg.order}_ai.wav`;
        await FileSystem.writeAsStringAsync(localUri, base64Wav, {
          encoding: FileSystem.EncodingType.Base64,
        });
        aiAudioMap.set(seg.order, localUri);
      }

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
        .select('id, sort_order');

      const messageIdByOrder = new Map(
        (savedMessages ?? []).map((m: { id: string; sort_order: number }) => [m.sort_order, m.id]),
      );

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
          console.warn('[MissionSession] audio upload failed', seg.order, uploadErr);
        }
      }

      setSavingMsg('Đang chấm điểm...');
      let avgPronunciation: number | null = null;
      try {
        const { data: reviewData, error: reviewErr } = await supabase.functions.invoke(
          'session-review',
          {
            body: {
              conversation_id: conversationId,
              language_id: mission.language_id,
              transcript: finalTurns.map((t) => ({ role: t.role, text: t.text })),
              user_segments: audioSegments,
            },
          },
        );
        if (reviewErr) console.warn('[MissionSession] session-review error:', reviewErr);
        avgPronunciation =
          (reviewData as SessionReviewApiResponse | null)?.avg_pronunciation ?? null;
      } catch (reviewErr) {
        console.warn('[MissionSession] session-review call failed:', reviewErr);
      }

      // Lưu avg_pronunciation + các lượt lạc đề vào summary jsonb — Parent Dashboard (Pha 6)
      // đọc lại để đánh dấu thời điểm lạc đề trong transcript.
      await supabase
        .from('conversations')
        .update({
          ended_at: new Date().toISOString(),
          summary: {
            avg_pronunciation: avgPronunciation,
            offtopic_turns: offTopicTurnsRef.current,
          },
        })
        .eq('id', conversationId);

      await awardMissionResult(conversationId, avgPronunciation);

      setView('finished');
    } catch (err) {
      console.error('[MissionSession] endSession error:', err);
      setView('finished');
    }
  }

  // Tính sao + mở khoá sticker/costume — chạy sau khi đã lưu transcript/audio.
  async function awardMissionResult(conversationId: string, avgPronunciation: number | null) {
    if (!mission || !user) return;

    const starCompleted = missionCompletedRef.current;
    const starPronunciation =
      avgPronunciation !== null && avgPronunciation >= PRONUNCIATION_STAR_THRESHOLD;
    const starNoHint = !hintUsedRef.current;
    const earnedStars = [starCompleted, starPronunciation, starNoHint].filter(Boolean).length;
    setStars(earnedStars);

    await supabase.from('mission_results').insert({
      user_id: user.id,
      mission_id: mission.id,
      conversation_id: conversationId,
      stars: earnedStars,
      used_hint: hintUsedRef.current,
    });

    if (earnedStars > 0) {
      const amount = await awardBiscuits(user.id, earnedStars);
      setBiscuitsAwarded(amount);
      await refreshProfile();
    }
    if (earnedStars === 3) setShowLuckyWheel(true);

    if (earnedStars === 0) return;

    // Mở sticker từ sticker_pool — 1 sao mở 1 sticker, theo đúng thứ tự pool, không lặp lại cái đã có.
    const pool = mission.sticker_pool ?? [];
    if (pool.length > 0) {
      const { data: owned } = await supabase
        .from('user_stickers')
        .select('sticker_id')
        .eq('user_id', user.id)
        .in('sticker_id', pool);
      const ownedIds = new Set((owned ?? []).map((o: { sticker_id: string }) => o.sticker_id));
      const toUnlock = pool.filter((id) => !ownedIds.has(id)).slice(0, earnedStars);

      if (toUnlock.length > 0) {
        await supabase
          .from('user_stickers')
          .insert(toUnlock.map((sticker_id) => ({ user_id: user.id, sticker_id })));
        const { data: stickerRows } = await supabase
          .from('stickers')
          .select('*')
          .in('id', toUnlock);
        if (stickerRows) setUnlockedStickers(stickerRows as Sticker[]);
      }
    }
  }

  // Vòng quay may mắn — chỉ hiện khi đạt tròn 3 sao, quay 1 lần duy nhất/phiên. Trả về số
  // biscuit thưởng được để UI xoay vòng quay dừng đúng vào miếng tương ứng kết quả.
  async function spinLuckyWheel() {
    if (!user || luckyWheelResult !== null) return 0;
    const amount = await spinLuckyWheelReward(user.id);
    setLuckyWheelResult(amount);
    await refreshProfile();
    return amount;
  }

  function goHome() {
    router.replace('/(kid)/home' as Href);
  }

  return {
    view,
    mission,
    steps,
    companion,
    currentStepIndex,
    expression,
    lastAiText,
    elapsedSec,
    showNudge,
    showHint,
    revealHint,
    isPaused,
    togglePause,
    timeUp,
    stars,
    unlockedStickers,
    biscuitsAwarded,
    showLuckyWheel,
    luckyWheelResult,
    spinLuckyWheel,
    savingMsg,
    errorMsg,
    endSession,
    goHome,
  };
}
