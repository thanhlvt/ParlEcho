import {
  AudioPlayer,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../providers/ThemeProvider';
import { supabase } from '../../../lib/supabase';
import { PronounceApiResponse, Scenario, ScenarioLine } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { LineCard } from '../../../components/practice/LineCard';

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

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const soundRef = useRef<AudioPlayer | null>(null);
  const userSoundRef = useRef<AudioPlayer | null>(null);

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
      soundRef.current?.remove();
      userSoundRef.current?.remove();
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

  async function handleSaveWord(word: string, isMispronounced: boolean) {
    if (!user || !scenario) return;
    const cleanWord = word.trim();
    if (!cleanWord) return;

    const existing = savedItems.find(
      (item) =>
        item.content.toLowerCase().trim() === cleanWord.toLowerCase() && item.type === 'word',
    );
    if (existing) {
      Alert.alert('Thông tin', `Từ "${cleanWord}" đã có trong Sổ tay.`);
      return;
    }

    Alert.alert(
      isMispronounced ? 'Từ phát âm chưa chuẩn' : 'Lưu từ vựng',
      `Bạn có muốn lưu từ "${cleanWord}" vào Sổ tay ôn tập không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Lưu',
          onPress: async () => {
            try {
              const { data, error } = await supabase
                .from('saved_items')
                .insert({
                  user_id: user.id,
                  language_id: scenario.language_id,
                  type: 'word',
                  content: cleanWord,
                  note: isMispronounced ? 'Luyện phát âm lại (từ bị phát âm sai)' : undefined,
                })
                .select('id, content, type')
                .single();
              if (error) throw error;
              if (data) {
                setSavedItems((prev) => [...prev, data]);
                Alert.alert('Thành công', `Đã lưu từ "${cleanWord}" vào Sổ tay.`);
              }
            } catch (err) {
              console.error(err);
              Alert.alert('Lỗi', 'Không thể lưu từ vựng.');
            }
          },
        },
      ],
    );
  }

  // ── TTS playback ────────────────────────────────────────────────────
  async function handlePlay(line: ScenarioLine) {
    if (soundRef.current) {
      soundRef.current.remove();
      soundRef.current = null;
    }
    // Toggle off
    if (playingLineId === line.id) {
      setPlayingLineId(null);
      return;
    }

    setPlayingLineId(line.id);
    const audioUrl = line.audio_url;

    if (!audioUrl) {
      Alert.alert('Chưa có audio', 'File audio chưa được tạo cho câu này.');
      setPlayingLineId(null);
      return;
    }

    try {
      const player = createAudioPlayer(audioUrl);
      soundRef.current = player;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          player.remove();
          soundRef.current = null;
          setPlayingLineId(null);
        }
      });
      player.play();
    } catch {
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
      soundRef.current.remove();
      soundRef.current = null;
      setPlayingLineId(null);
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordingLineId(lineId);
  }

  async function handleStopRecord(line: ScenarioLine) {
    if (!recorder.isRecording) return;

    setRecordingLineId(null);
    setProcessingLineId(line.id);

    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });

      const uri = recorder.uri;
      if (!uri) throw new Error('Không lấy được file ghi âm');

      // Save URI so user can replay their recording
      setRecordedUris((prev) => ({ ...prev, [line.id]: uri }));

      // Upload → Storage "recordings" bucket
      const storagePath = await uploadRecording(uri);

      // Gọi Edge Function /pronounce
      const { data, error } = await supabase.functions.invoke('pronounce', {
        body: {
          audio_storage_path: storagePath,
          reference_text: line.text,
          language_id: line.language_id,
          audio_mime_type: 'audio/mp4',
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

  async function uploadRecording(uri: string): Promise<string> {
    const fileName = `${user!.id}/${Date.now()}.m4a`;

    // Thử fetch trực tiếp (không qua blob)
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());
    } catch {
      // Fallback: XHR (đáng tin cậy hơn trên một số thiết bị Android)
      arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', uri, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = () => resolve(xhr.response as ArrayBuffer);
        xhr.onerror = () => reject(new Error('Không đọc được file ghi âm'));
        xhr.send();
      });
    }

    const { error } = await supabase.storage
      .from('recordings')
      .upload(fileName, arrayBuffer, { contentType: 'audio/mp4' });

    if (error) throw new Error(error.message);
    return fileName;
  }

  // ── User recording playback ─────────────────────────────────────────
  async function handlePlayUserRecording(lineId: string, uri: string) {
    if (userSoundRef.current) {
      userSoundRef.current.remove();
      userSoundRef.current = null;
    }
    if (playingUserLineId === lineId) {
      setPlayingUserLineId(null);
      return;
    }
    setPlayingUserLineId(lineId);
    try {
      await setAudioModeAsync({ allowsRecording: false });
      const player = createAudioPlayer(uri);
      userSoundRef.current = player;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          player.remove();
          userSoundRef.current = null;
          setPlayingUserLineId(null);
        }
      });
      player.play();
    } catch {
      setPlayingUserLineId(null);
    }
  }

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
            result={results[line.id] ?? null}
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
            onWordPress={handleSaveWord}
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
