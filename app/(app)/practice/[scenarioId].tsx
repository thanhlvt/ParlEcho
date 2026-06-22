import {
  AudioPlayer,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { ExpoAudioStreamModule, useAudioRecorder } from '@siteed/audio-studio';
import { LegacyEventEmitter } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { supabase } from '../../../lib/supabase';
import { bytesToBase64, concatUint8Arrays, pcmToWav } from '../../../lib/audioFormat';
import { dedupeFlaggedWordsAcross } from '../../../lib/scoring';
import { PronounceApiResponse, Scenario, ScenarioLine } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { LineCard } from '../../../components/practice/LineCard';
import { clearActiveAudio, registerActiveAudio, stopActiveAudio } from '../../../lib/audioPlayback';

// ── Main screen ───────────────────────────────────────────────────────
export default function ShadowingScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const { user } = useAuth();

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [lines, setLines] = useState<ScenarioLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedItems, setSavedItems] = useState<
    { id: string; content: string; type: 'word' | 'phrase' | 'mistake' }[]
  >([]);

  // Recording state — only one line recorded at a time
  const [recordingLineId, setRecordingLineId] = useState<string | null>(null);
  const [processingLineId, setProcessingLineId] = useState<string | null>(null);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const [playingUserLineId, setPlayingUserLineId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, PronounceApiResponse>>({});
  const [recordedUris, setRecordedUris] = useState<Record<string, string>>({});

  const { startRecording, stopRecording, isRecording } = useAudioRecorder();
  const soundRef = useRef<AudioPlayer | null>(null);
  const userSoundRef = useRef<AudioPlayer | null>(null);
  // Mirror playingLineId/playingUserLineId synchronously — React state updates are
  // batched, so two rapid taps in the same tick would both read the stale value and
  // both try to start a new player instead of the second one toggling playback off.
  const playingLineIdRef = useRef<string | null>(null);
  const playingUserLineIdRef = useRef<string | null>(null);
  // Mic streaming (giống Live/Kid) — gom PCM chunk rồi đóng WAV khi dừng ghi, thay vì ghi
  // m4a/AAC (Azure Pronunciation Assessment chỉ nhận PCM WAV 16kHz/16-bit/mono).
  const audioEmitter = useRef(new LegacyEventEmitter(ExpoAudioStreamModule));
  const audioDataSubRef = useRef<{ remove: () => void } | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);

  const fetchData = useCallback(async () => {
    const [scenRes, linesRes, savedRes] = await Promise.all([
      supabase.from('scenarios').select('*').eq('id', scenarioId).single(),
      supabase.from('scenario_lines').select('*').eq('scenario_id', scenarioId).order('sort_order'),
      user
        ? supabase.from('saved_items').select('id, content, type').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
    ]);
    setScenario(scenRes.data);
    setLines(linesRes.data ?? []);
    setSavedItems(savedRes.data ?? []);
    setLoading(false);
  }, [scenarioId, user]);

  useEffect(() => {
    fetchData();
    return () => {
      soundRef.current?.pause();
      soundRef.current?.remove();
      userSoundRef.current?.pause();
      userSoundRef.current?.remove();
      audioDataSubRef.current?.remove();
    };
  }, [fetchData]);

  async function handleToggleSaveLine(line: ScenarioLine) {
    if (!user || !scenario) return;
    const existing = savedItems.find(
      (item) =>
        item.content.toLowerCase().trim() === line.text.toLowerCase().trim() &&
        item.type === 'phrase',
    );
    if (existing) {
      try {
        const { error } = await supabase.from('saved_items').delete().eq('id', existing.id);
        if (error) throw error;
        setSavedItems((prev) => prev.filter((item) => item.id !== existing.id));
      } catch (err) {
        console.error(err);
        Alert.alert('Lỗi', 'Không thể bỏ lưu.');
      }
    } else {
      try {
        const { data, error } = await supabase
          .from('saved_items')
          .insert({
            user_id: user.id,
            language_id: scenario.language_id,
            type: 'phrase',
            content: line.text,
            translation: line.translation,
          })
          .select('id, content, type')
          .single();
        if (error) throw error;
        if (data) {
          setSavedItems((prev) => [...prev, data]);
          Alert.alert('Thành công', 'Đã lưu mẫu câu vào Sổ tay.');
        }
      } catch (err) {
        console.error(err);
        Alert.alert('Lỗi', 'Không thể lưu mẫu câu.');
      }
    }
  }

  // ── TTS playback ────────────────────────────────────────────────────
  async function handlePlay(line: ScenarioLine) {
    if (soundRef.current) {
      soundRef.current.pause();
      soundRef.current.remove();
      soundRef.current = null;
    }
    // Toggle off — checked against the ref (updated synchronously below), not the
    // React state, so a rapid second tap in the same tick still sees the up-to-date value.
    if (playingLineIdRef.current === line.id) {
      stopActiveAudio();
      playingLineIdRef.current = null;
      setPlayingLineId(null);
      return;
    }

    const audioUrl = line.audio_url;

    if (!audioUrl) {
      Alert.alert('Chưa có audio', 'File audio chưa được tạo cho câu này.');
      return;
    }

    try {
      // Stop whatever else is playing (incl. own recording playback) BEFORE creating
      // the new player — tearing it down concurrently with loading a new one can
      // make the new one silently fail to play (observed when switching screens fast).
      stopActiveAudio();
      const player = createAudioPlayer(audioUrl);
      soundRef.current = player;
      registerActiveAudio(player, () => {
        playingLineIdRef.current = null;
        setPlayingLineId(null);
      });
      playingLineIdRef.current = line.id;
      setPlayingLineId(line.id);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          clearActiveAudio(player);
          player.remove();
          soundRef.current = null;
          playingLineIdRef.current = null;
          setPlayingLineId(null);
        }
      });
      player.play();
    } catch {
      playingLineIdRef.current = null;
      setPlayingLineId(null);
    }
  }

  // ── Recording ───────────────────────────────────────────────────────
  async function handleStartRecord(lineId: string) {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Cần quyền microphone',
        'Vào Cài đặt → ParlEcho → Microphone để cho phép ghi âm.',
      );
      return;
    }

    // Stop any playing sound before recording
    if (soundRef.current) {
      soundRef.current.pause();
      soundRef.current.remove();
      soundRef.current = null;
      playingLineIdRef.current = null;
      setPlayingLineId(null);
    }
    stopActiveAudio();

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    pcmChunksRef.current = [];
    audioDataSubRef.current = audioEmitter.current.addListener('AudioData', (event: any) => {
      if (event?.encoded) {
        const bytes = Uint8Array.from(atob(event.encoded), (c) => c.charCodeAt(0));
        pcmChunksRef.current.push(bytes);
      }
    });

    await startRecording({ sampleRate: 16000, channels: 1, encoding: 'pcm_16bit', interval: 100 });
    setRecordingLineId(lineId);
  }

  async function handleStopRecord(line: ScenarioLine) {
    if (!isRecording) return;

    setRecordingLineId(null);
    setProcessingLineId(line.id);

    try {
      await stopRecording();
      audioDataSubRef.current?.remove();
      audioDataSubRef.current = null;
      await setAudioModeAsync({ allowsRecording: false });

      const pcm = concatUint8Arrays(pcmChunksRef.current);
      if (pcm.length === 0) throw new Error('Không ghi được âm thanh');
      const wavBytes = pcmToWav(pcm, 16000, 16);

      // Lưu file cục bộ để người dùng nghe lại
      const localUri = `${FileSystem.cacheDirectory}practice-${line.id}-${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(localUri, bytesToBase64(wavBytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
      setRecordedUris((prev) => ({ ...prev, [line.id]: localUri }));

      // Upload → Storage "recordings" bucket
      const storagePath = await uploadRecording(wavBytes);

      // Gọi Edge Function /pronounce
      const { data, error } = await supabase.functions.invoke('pronounce', {
        body: {
          audio_storage_path: storagePath,
          reference_text: line.text,
          language_id: line.language_id,
          audio_mime_type: 'audio/wav',
          scenario_line_id: line.id,
        },
      });

      if (error) throw new Error(error.message);
      setResults((prev) => ({ ...prev, [line.id]: data as PronounceApiResponse }));
    } catch (err) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể chấm điểm');
    } finally {
      setProcessingLineId(null);
    }
  }

  async function uploadRecording(wavBytes: Uint8Array): Promise<string> {
    const fileName = `${user!.id}/${Date.now()}.wav`;
    const { error } = await supabase.storage
      .from('recordings')
      .upload(fileName, wavBytes.buffer as ArrayBuffer, { contentType: 'audio/wav' });

    if (error) throw new Error(error.message);
    return fileName;
  }

  // ── User recording playback ─────────────────────────────────────────
  async function handlePlayUserRecording(lineId: string, uri: string) {
    if (userSoundRef.current) {
      userSoundRef.current.pause();
      userSoundRef.current.remove();
      userSoundRef.current = null;
    }
    if (playingUserLineIdRef.current === lineId) {
      stopActiveAudio();
      playingUserLineIdRef.current = null;
      setPlayingUserLineId(null);
      return;
    }
    try {
      // Stop whatever else is playing (incl. the TTS line) BEFORE switching audio
      // mode / creating the new player — see handlePlay() comment for why.
      stopActiveAudio();
      await setAudioModeAsync({ allowsRecording: false });
      const player = createAudioPlayer(uri);
      userSoundRef.current = player;
      registerActiveAudio(player, () => {
        playingUserLineIdRef.current = null;
        setPlayingUserLineId(null);
      });
      playingUserLineIdRef.current = lineId;
      setPlayingUserLineId(lineId);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          clearActiveAudio(player);
          player.remove();
          userSoundRef.current = null;
          playingUserLineIdRef.current = null;
          setPlayingUserLineId(null);
        }
      });
      player.play();
    } catch {
      playingUserLineIdRef.current = null;
      setPlayingUserLineId(null);
    }
  }

  // Bỏ gợi ý sửa (word + tip) đã hiện ở dòng TRƯỚC trong cùng kịch bản — tránh lặp lại y
  // nguyên 1 lời khuyên nhiều lần khi cùng lỗi xảy ra ở nhiều câu (xem dedupeFlaggedWordsAcross).
  const displayResults = useMemo(() => {
    const flaggedLists = lines.map((line) => results[line.id]?.flagged_words ?? []);
    const deduped = dedupeFlaggedWordsAcross(flaggedLists, (fw) => `${fw.word}|||${fw.tip}`);
    const out: Record<string, PronounceApiResponse> = {};
    lines.forEach((line, i) => {
      const result = results[line.id];
      if (result) out[line.id] = { ...result, flagged_words: deduped[i] };
    });
    return out;
  }, [lines, results]);

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Đang tải...' }} />
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const userLines = lines.filter((l) => l.speaker === 'user');
  const doneCount = userLines.filter((l) => results[l.id]).length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: scenario?.title ?? 'Luyện phát âm' }} />

      {/* Progress bar */}
      {userLines.length > 0 && (
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${(doneCount / userLines.length) * 100}%` }]}
          />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {lines.map((line, index) => (
          <LineCard
            key={line.id}
            line={line}
            index={index}
            isPlaying={playingLineId === line.id}
            isRecording={recordingLineId === line.id}
            isProcessing={processingLineId === line.id}
            isPlayingUser={playingUserLineId === line.id}
            result={displayResults[line.id] ?? null}
            recordedUri={recordedUris[line.id] ?? null}
            onPlay={() => handlePlay(line)}
            onRecord={() => handleStartRecord(line.id)}
            onStopRecord={() => handleStopRecord(line)}
            onPlayUser={() => {
              const uri = recordedUris[line.id];
              if (uri) handlePlayUserRecording(line.id, uri);
            }}
            isSaved={savedItems.some(
              (item) => item.content === line.text && item.type === 'phrase',
            )}
            onSave={() => handleToggleSaveLine(line)}
          />
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    loader: { flex: 1 },

    progressBar: {
      height: 3,
      backgroundColor: colors.border,
      marginHorizontal: 0,
    },
    progressFill: {
      height: 3,
      backgroundColor: colors.primary,
      borderRadius: 2,
    },

    content: { padding: 16, gap: 12 },
  });
