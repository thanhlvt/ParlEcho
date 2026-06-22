import { ExpoAudioStreamModule, useAudioRecorder } from '@siteed/audio-studio';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
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
import { calculateExplorationStars } from '../../lib/scoring';
import {
  bytesToBase64,
  EXPLORATION_OPENING_TEXT,
  LiveClient,
  LiveState,
  pcmToWav,
} from '../../lib/liveClient';
import { supabase } from '../../lib/supabase';
import { scoreUtterance } from '../../lib/pronunciationScoring';
import {
  Companion as CompanionType,
  Correction,
  ExplorationImage,
  LiveTurn,
  PronounceApiResponse,
  SessionReviewApiResponse,
} from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useScreenTime } from '../../providers/ScreenTimeProvider';
import { CompanionExpression } from './companionAssets';

// Phiên Image Exploration ngắn hơn Guided Conversation — chỉ là hỏi-đáp xoay quanh 1 ảnh.
const SESSION_LIMIT_MINUTES = 8;
const REACTION_DISPLAY_MS = 1600;
const TIME_UP_FALLBACK_MS = 20000;
// AI gọi tool `end_activity` (onActivityComplete) sau khi chào tạm biệt → tự kết thúc phiên
// thay vì chỉ chờ Gemini đóng socket (không đáng tin). `onAiAudioDone` kết thúc ngay khi nói
// xong; fallback này phòng khi model gọi tool mà không phát thêm audio (reset ở onAudioChunk).
const ACTIVITY_END_SILENCE_MS = 5000;
const IMAGE_POOL_SIZE = 50;
const IMAGE_MAX_DIMENSION = 1024;
// Không có bước/hint như Guided Conversation — tính sao theo điểm phát âm trung bình
// (/session-review): star 1 luôn có khi hoàn thành phiên, star 2/3 theo 2 ngưỡng điểm.
const PRONUNCIATION_STAR_THRESHOLD = 70;
const PRONUNCIATION_EXCELLENT_THRESHOLD = 85;

export type ExplorationView =
  | 'loading'
  | 'picking'
  | 'connecting'
  | 'live'
  | 'saving'
  | 'finished'
  | 'error';

export interface PickableImage {
  id: string;
  storagePath: string;
  url: string;
}

export function useExplorationSession() {
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();
  const { limitReached: dailyLimitReached } = useScreenTime();
  const router = useRouter();

  const [view, setView] = useState<ExplorationView>('loading');
  const [companion, setCompanion] = useState<CompanionType | null>(null);
  const [pickableImages, setPickableImages] = useState<PickableImage[]>([]);
  const [bestStarsByImage, setBestStarsByImage] = useState<Record<string, number>>({});
  const [pickingImageId, setPickingImageId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [expression, setExpression] = useState<CompanionExpression>('idle');
  const [lastAiText, setLastAiText] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [savingMsg, setSavingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [vocabLearned, setVocabLearned] = useState<string[]>([]);
  const [timeUp, setTimeUp] = useState(false);
  const [stars, setStars] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [biscuitsAwarded, setBiscuitsAwarded] = useState(0);
  const [showLuckyWheel, setShowLuckyWheel] = useState(false);
  const [luckyWheelResult, setLuckyWheelResult] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const clientRef = useRef<LiveClient | null>(null);
  // Chống mở 2 phiên Live (2 WebSocket cùng hỏi → AI nói song song). Effect 'connecting' có thể
  // chạy 2 lần (React strict mode dev, hoặc re-render) — chỉ cho startSession chạy 1 lần.
  const sessionStartedRef = useRef(false);
  const isPausedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeUpFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityEndFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityCompletedRef = useRef(false);
  const turnsRef = useRef<LiveTurn[]>([]);
  const timeUpPendingRef = useRef(false);
  const imageBase64Ref = useRef<string | null>(null);
  const pickedImageIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<InstanceType<typeof AudioContext> | null>(null);
  const audioQueueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const audioEmitter = useRef(new LegacyEventEmitter(ExpoAudioStreamModule));
  const { startRecording, stopRecording } = useAudioRecorder();
  // Chấm phát âm Azure (unscripted) ngay khi từng câu nói xong, key = sort_order của turn —
  // map sang message_id sau khi lưu messages (xem onUserUtterance + endSession).
  const pronunciationScoresRef = useRef<Map<number, PronounceApiResponse>>(new Map());
  // Mỗi onUserUtterance đẩy 1 promise vào đây — endSession PHẢI await hết trước khi đọc
  // pronunciationScoresRef, nếu không lượt nói cuối cùng (chấm điểm bắt đầu đúng lúc
  // client.stop()) có thể chưa kịp có kết quả khi attemptRows được build, bị bỏ sót.
  const pendingScoringRef = useRef<Promise<void>[]>([]);

  const setReaction = useCallback((expr: CompanionExpression, durationMs: number) => {
    setExpression(expr);
    if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = setTimeout(() => setExpression('idle'), durationMs);
  }, []);

  const togglePause = useCallback(() => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (next) audioQueueRef.current?.clearBuffers();
  }, []);

  // ── Tải companion + danh sách ảnh đã duyệt để trẻ tự chọn ─────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (profile?.companion_id) {
        const { data: comp } = await supabase
          .from('companions')
          .select('*')
          .eq('id', profile.companion_id)
          .single();
        if (!cancelled && comp) setCompanion(comp as CompanionType);
      }

      const { data: images, error: imagesErr } = await supabase
        .from('exploration_images')
        .select('*')
        .eq('is_approved', true)
        .limit(IMAGE_POOL_SIZE);

      if (cancelled) return;
      if (imagesErr || !images || images.length === 0) {
        setErrorMsg('Chưa có ảnh nào để khám phá. Hãy nhờ bố mẹ thêm ảnh nhé!');
        setView('error');
        return;
      }

      const pickable = (images as ExplorationImage[]).map((img) => ({
        id: img.id,
        storagePath: img.storage_path,
        url: supabase.storage.from('exploration-images').getPublicUrl(img.storage_path).data
          .publicUrl,
      }));
      setPickableImages(pickable);
      setView('picking');

      if (user) {
        const { data: results } = await supabase
          .from('exploration_results')
          .select('exploration_image_id, stars')
          .eq('user_id', user.id);
        if (cancelled) return;
        const best: Record<string, number> = {};
        for (const r of (results as { exploration_image_id: string; stars: number }[]) ?? []) {
          best[r.exploration_image_id] = Math.max(best[r.exploration_image_id] ?? 0, r.stars);
        }
        setBestStarsByImage(best);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Trẻ chọn 1 ảnh trong danh sách → resize/nén ảnh đó trước khi mở WS ────
  async function pickImage(image: PickableImage) {
    setPickingImageId(image.id);
    pickedImageIdRef.current = image.id;
    try {
      const result = await manipulateAsync(
        image.url,
        [{ resize: { width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION } }],
        { compress: 0.7, format: SaveFormat.JPEG, base64: true },
      );
      if (!result.base64) throw new Error('Không nén được ảnh');
      imageBase64Ref.current = result.base64;
      setImageUrl(result.uri);
      setView('connecting');
    } catch (err) {
      console.error('[ExplorationSession] image pick error', err);
      setErrorMsg('Không tải được ảnh. Hãy thử lại nhé!');
      setView('error');
    } finally {
      setPickingImageId(null);
    }
  }

  // ── Mở kết nối Live khi đã có ảnh sẵn sàng ────────────────────────────
  useEffect(() => {
    if (view !== 'connecting' || !imageBase64Ref.current) return;
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Hết giờ chơi phiên (Pha 4): không cắt ngay, chờ AI nói xong lượt hiện tại.
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
      if (timeUpFallbackRef.current) clearTimeout(timeUpFallbackRef.current);
      if (activityEndFallbackRef.current) clearTimeout(activityEndFallbackRef.current);
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
    }).catch((e) => console.warn('[ExplorationSession] startRecording error', e));

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
      console.error('[ExplorationSession] permission error', err);
      setView('error');
      return;
    }

    turnsRef.current = [];
    timeUpPendingRef.current = false;
    activityCompletedRef.current = false;
    setElapsedSec(0);
    setTimeUp(false);
    setIsPaused(false);
    isPausedRef.current = false;
    pronunciationScoresRef.current.clear();
    pendingScoringRef.current = [];

    const client = new LiveClient({
      onStateChange: (s: LiveState) => {
        if (s === 'live') {
          setView('live');
          client.sendImageTurn(
            imageBase64Ref.current as string,
            'image/jpeg',
            EXPLORATION_OPENING_TEXT,
          );
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
        // Gemini tự đóng phiên bình thường (code 1000) — trước đây bỏ sót case này khiến app
        // đứng yên ở màn live mãi nếu không có gì khác chủ động gọi endSession().
        if (s === 'ended') {
          if (timerRef.current) clearInterval(timerRef.current);
          endSession();
        }
      },
      onAudioChunk: async (pcm24Base64) => {
        if (isPausedRef.current) return;
        // AI vẫn đang nói lời tạm biệt sau end_activity → đẩy lùi fallback để không cắt ngang;
        // onAiAudioDone sẽ kết thúc ngay khi nói xong.
        if (activityCompletedRef.current && activityEndFallbackRef.current) {
          clearTimeout(activityEndFallbackRef.current);
          activityEndFallbackRef.current = setTimeout(() => endSession(), ACTIVITY_END_SILENCE_MS);
        }
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
          console.warn('[ExplorationSession] playback enqueue error', e);
        }
      },
      onInterrupted: () => {
        audioQueueRef.current?.clearBuffers();
      },
      // AI báo đã chào tạm biệt xong (tool end_activity) → đợi nói hết audio rồi tự kết thúc.
      onActivityComplete: () => {
        activityCompletedRef.current = true;
        if (activityEndFallbackRef.current) clearTimeout(activityEndFallbackRef.current);
        activityEndFallbackRef.current = setTimeout(() => endSession(), ACTIVITY_END_SILENCE_MS);
      },
      onAiAudioDone: () => {
        if (activityCompletedRef.current) {
          if (activityEndFallbackRef.current) clearTimeout(activityEndFallbackRef.current);
          endSession();
        }
      },
      onTranscriptUpdate: (t) => {
        const prevLen = turnsRef.current.length;
        turnsRef.current = t;
        const lastAi = [...t].reverse().find((turn) => turn.role === 'assistant');
        if (lastAi) {
          setLastAiText(lastAi.text);
          setReaction('cheering', REACTION_DISPLAY_MS);
        }
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
        console.warn('[ExplorationSession] error', msg);
      },
      onUserUtterance: (pcm, _text, order) => {
        if (!user) return;
        const languageId = profile?.active_language_id ?? 'en';
        // Fire-and-forget — không await trong message loop của LiveClient. Promise lưu lại để
        // endSession await hết trước khi đọc pronunciationScoresRef (xem khai báo ref).
        const p = scoreUtterance(user.id, pcm, languageId).then((score) => {
          if (score) pronunciationScoresRef.current.set(order, score);
        });
        pendingScoringRef.current.push(p);
      },
    });

    clientRef.current = client;
    await client.start({
      languageId: profile?.active_language_id ?? 'en',
      mode: 'kid_exploration',
      companionName: companion?.name,
      companionPersonality: companion?.personality,
      childLevel: profile?.child_level ?? 'beginner',
    });
  }

  async function endSession() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activityEndFallbackRef.current) clearTimeout(activityEndFallbackRef.current);
    const client = clientRef.current;
    if (!client || !user) {
      setView('finished');
      return;
    }

    // Null TRƯỚC khi gọi stop(): stop() tự bắn lại onStateChange('ended') không điều kiện —
    // nếu endSession() được gọi LẠI từ đó (case 'ended' ở onStateChange phía dưới) mà
    // clientRef.current chưa null thì sẽ đệ quy vô hạn (stop() → 'ended' → endSession() →
    // stop() → 'ended' → ...). Null trước để lần gọi lại đó rơi vào early-return ở trên.
    clientRef.current = null;
    const { turns: finalTurns, rawUserSegments, rawAiSegments } = client.stop();

    // client.stop() flush lượt nói cuối cùng (nếu có) → bắn onUserUtterance đồng bộ ngay trên,
    // đẩy 1 promise mới vào pendingScoringRef — PHẢI await hết trước khi đọc
    // pronunciationScoresRef bên dưới, nếu không lượt cuối có thể chưa kịp chấm điểm xong.
    await Promise.all(pendingScoringRef.current);

    // Vào màn kết quả (Companion chúc mừng) NGAY — không bắt trẻ chờ ở màn "đang lưu" trống.
    // Chỗ sao báo "đang chấm điểm" (cờ scoring) cho tới khi session-review xong, rồi lộ TOÀN BỘ
    // sao + biscuit/vòng quay một lần kèm animation (không hiện sao lẻ rồi đổi).
    setView('finished');
    setScoring(true);

    if (finalTurns.length === 0) {
      setScoring(false);
      return;
    }

    try {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          language_id: profile?.active_language_id ?? 'en',
          mode: 'kid_exploration',
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

      const languageId = profile?.active_language_id ?? 'en';

      // Lưu pronunciation_attempts từ điểm đã chấm trong lúc phiên diễn ra (xem
      // onUserUtterance) — không gọi lại Azure, chỉ map order → message_id vừa lưu.
      const attemptRows = [];
      for (const [order, score] of pronunciationScoresRef.current.entries()) {
        const messageId = messageIdByOrder.get(order);
        if (!messageId) continue;
        const turnText = finalTurns.find((t) => t.sort_order === order && t.role === 'user')?.text;
        attemptRows.push({
          user_id: user.id,
          language_id: languageId,
          message_id: messageId,
          recognized_text: turnText ?? score.transcript,
          overall_score: score.overall_score,
          accuracy_score: score.clarity,
          fluency_score: score.fluency,
          completeness_score: null,
          word_scores: score.flagged_words.map((fw) => ({
            word: fw.word,
            score: 0,
            error_type: fw.tip,
          })),
        });
      }
      if (attemptRows.length > 0) {
        const { error: attemptsErr } = await supabase
          .from('pronunciation_attempts')
          .insert(attemptRows);
        if (attemptsErr)
          console.warn('[ExplorationSession] pronunciation_attempts insert error:', attemptsErr);
      }

      await supabase
        .from('conversations')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', conversationId);

      setSavingMsg('Đang xem con học được gì...');
      try {
        const { data: reviewData, error: reviewErr } = await supabase.functions.invoke(
          'session-review',
          {
            body: {
              conversation_id: conversationId,
              language_id: languageId,
              transcript: finalTurns.map((t) => ({ role: t.role, text: t.text })),
            },
          },
        );
        if (reviewErr) console.warn('[ExplorationSession] session-review error:', reviewErr);
        const review = reviewData as SessionReviewApiResponse | null;
        if (review) {
          await saveLearnedItems(review);
          // Lưu feedback/lỗi ngữ pháp/từ vựng/điểm vào summary jsonb — trước đó màn này không
          // bao giờ set summary nên Parent Dashboard không thấy được gì ngoài ended_at.
          await supabase
            .from('conversations')
            .update({
              summary: {
                avg_pronunciation: review.avg_pronunciation,
                overall_feedback: review.overall_feedback,
                fluency_notes: review.fluency_notes,
                corrections: review.corrections,
                words_to_learn: review.vocab_to_learn,
              },
            })
            .eq('id', conversationId);
        }
        // Tính sao cuối + biscuit/vòng quay; setScoring(false) ở finally sẽ lộ tất cả 1 lần.
        await awardExplorationResult(review?.avg_pronunciation ?? null, conversationId);
      } catch (reviewErr) {
        console.warn('[ExplorationSession] session-review call failed:', reviewErr);
      }
    } catch (err) {
      console.error('[ExplorationSession] endSession error:', err);
    } finally {
      setScoring(false);
    }
  }

  // Kid Mode chưa có UI sửa ngữ pháp riêng — tự lưu từ vựng/lỗi lặp vào saved_items
  // ngay sau session-review (khác với Live tự do của adult, nơi người dùng tự bấm lưu).
  async function saveLearnedItems(review: SessionReviewApiResponse) {
    if (!user) return;
    const languageId = profile?.active_language_id ?? 'en';
    const learned: string[] = [];

    for (const word of review.vocab_to_learn ?? []) {
      const { data: existing } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('language_id', languageId)
        .eq('type', 'word')
        .ilike('content', word)
        .maybeSingle();
      if (existing) continue;
      const { error } = await supabase.from('saved_items').insert({
        user_id: user.id,
        language_id: languageId,
        type: 'word',
        content: word,
      });
      if (!error) learned.push(word);
    }

    for (const correction of (review.corrections ?? []) as Correction[]) {
      const { data: existing } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('language_id', languageId)
        .eq('type', 'mistake')
        .ilike('content', correction.original)
        .maybeSingle();
      if (existing) continue;
      await supabase.from('saved_items').insert({
        user_id: user.id,
        language_id: languageId,
        type: 'mistake',
        content: correction.original,
        translation: correction.fixed,
        note: correction.explanation,
      });
    }

    setVocabLearned(learned);
  }

  // Tính sao theo điểm phát âm + thưởng biscuit — Image Exploration không có bước/hint
  // như Guided Conversation nên không dùng mission_results, chỉ thưởng biscuit/biscuit_count.
  async function awardExplorationResult(avgPronunciation: number | null, conversationId: string) {
    if (!user) return;
    const earnedStars = calculateExplorationStars({
      avgPronunciation,
      goodThreshold: PRONUNCIATION_STAR_THRESHOLD,
      excellentThreshold: PRONUNCIATION_EXCELLENT_THRESHOLD,
    });
    setStars(earnedStars);

    if (pickedImageIdRef.current) {
      await supabase.from('exploration_results').insert({
        user_id: user.id,
        exploration_image_id: pickedImageIdRef.current,
        conversation_id: conversationId,
        stars: earnedStars,
      });
    }

    const amount = await awardBiscuits(user.id, earnedStars);
    setBiscuitsAwarded(amount);
    await refreshProfile();
    if (earnedStars === 3) setShowLuckyWheel(true);
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
    companion,
    pickableImages,
    bestStarsByImage,
    pickingImageId,
    pickImage,
    imageUrl,
    expression,
    lastAiText,
    elapsedSec,
    isPaused,
    togglePause,
    timeUp,
    vocabLearned,
    stars,
    scoring,
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
