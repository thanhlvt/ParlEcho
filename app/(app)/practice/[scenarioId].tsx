import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { Colors } from '../../../constants/Colors';
import { supabase } from '../../../lib/supabase';
import { PronounceApiResponse, Scenario, ScenarioLine } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';

// ── Main screen ───────────────────────────────────────────────────────
export default function ShadowingScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const { user } = useAuth();

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [lines, setLines] = useState<ScenarioLine[]>([]);
  const [loading, setLoading] = useState(true);

  // Recording state — only one line recorded at a time
  const [recordingLineId, setRecordingLineId] = useState<string | null>(null);
  const [processingLineId, setProcessingLineId] = useState<string | null>(null);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const [playingUserLineId, setPlayingUserLineId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, PronounceApiResponse>>({});
  const [recordedUris, setRecordedUris] = useState<Record<string, string>>({});

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const userSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    fetchData();
    return () => {
      soundRef.current?.unloadAsync();
      userSoundRef.current?.unloadAsync();
    };
  }, [scenarioId]);

  async function fetchData() {
    const [scenRes, linesRes] = await Promise.all([
      supabase.from('scenarios').select('*').eq('id', scenarioId).single(),
      supabase
        .from('scenario_lines')
        .select('*')
        .eq('scenario_id', scenarioId)
        .order('sort_order'),
    ]);
    setScenario(scenRes.data);
    setLines(linesRes.data ?? []);
    setLoading(false);
  }

  // ── TTS playback ────────────────────────────────────────────────────
  async function handlePlay(line: ScenarioLine) {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
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
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
          setPlayingLineId(null);
        }
      });
      await sound.playAsync();
    } catch {
      setPlayingLineId(null);
    }
  }

  // ── Recording ───────────────────────────────────────────────────────
  async function handleStartRecord(lineId: string) {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Cần quyền microphone',
        'Vào Cài đặt → ParlEcho → Microphone để cho phép ghi âm.',
      );
      return;
    }

    // Stop any playing sound before recording
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      setPlayingLineId(null);
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    recordingRef.current = recording;
    setRecordingLineId(lineId);
  }

  async function handleStopRecord(line: ScenarioLine) {
    const rec = recordingRef.current;
    if (!rec) return;

    setRecordingLineId(null);
    setProcessingLineId(line.id);

    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;

      const uri = rec.getURI();
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
      await userSoundRef.current.unloadAsync();
      userSoundRef.current = null;
    }
    if (playingUserLineId === lineId) {
      setPlayingUserLineId(null);
      return;
    }
    setPlayingUserLineId(lineId);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const { sound } = await Audio.Sound.createAsync({ uri });
      userSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          userSoundRef.current = null;
          setPlayingUserLineId(null);
        }
      });
      await sound.playAsync();
    } catch {
      setPlayingUserLineId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Đang tải...' }} />
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
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
            style={[
              styles.progressFill,
              { width: `${(doneCount / userLines.length) * 100}%` },
            ]}
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
          />
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Line Card ─────────────────────────────────────────────────────────
function LineCard({
  line,
  index,
  isPlaying,
  isRecording,
  isProcessing,
  isPlayingUser,
  result,
  recordedUri,
  onPlay,
  onRecord,
  onStopRecord,
  onPlayUser,
}: {
  line: ScenarioLine;
  index: number;
  isPlaying: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  isPlayingUser: boolean;
  result: PronounceApiResponse | null;
  recordedUri: string | null;
  onPlay: () => void;
  onRecord: () => void;
  onStopRecord: () => void;
  onPlayUser: () => void;
}) {
  const isPartner = line.speaker === 'partner';

  return (
    <View style={[styles.card, isPartner ? styles.cardPartner : styles.cardUser]}>
      {/* Speaker label */}
      <View style={styles.speakerRow}>
        <Text style={styles.speakerLabel}>{isPartner ? '🤝 Partner' : '👤 Bạn'}</Text>
        <Text style={styles.lineNum}>#{index + 1}</Text>
      </View>

      {/* Text — highlighted after scoring */}
      {result ? (
        <WordHighlight text={line.text} wordScores={result.word_scores} />
      ) : (
        <Text style={styles.lineText}>{line.text}</Text>
      )}

      {/* Japanese reading aids */}
      {line.furigana ? <Text style={styles.furigana}>{line.furigana}</Text> : null}
      {line.romaji ? <Text style={styles.romaji}>{line.romaji}</Text> : null}

      {/* Translation */}
      {line.translation ? (
        <Text style={styles.translation}>{line.translation}</Text>
      ) : null}

      {/* Score result */}
      {result ? <ScorePanel result={result} /> : null}

      {/* Action buttons */}
      <View style={styles.actions}>
        {/* TTS play button */}
        <TouchableOpacity style={styles.playBtn} onPress={onPlay} activeOpacity={0.7}>
          <Ionicons
            name={isPlaying ? 'pause-circle' : 'play-circle'}
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.playBtnText}>
            {isPlaying ? 'Đang phát' : isPartner ? 'Nghe' : 'Nghe mẫu'}
          </Text>
        </TouchableOpacity>

        {/* Record button — only for user lines */}
        {!isPartner && (
          <>
            {isProcessing ? (
              <View style={[styles.recordBtn, { backgroundColor: Colors.textMuted }]}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.recordBtnText}>Đang xử lý</Text>
              </View>
            ) : isRecording ? (
              <TouchableOpacity
                style={[styles.recordBtn, { backgroundColor: Colors.error }]}
                onPress={onStopRecord}
                activeOpacity={0.8}
              >
                <Ionicons name="stop-circle" size={18} color="#fff" />
                <Text style={styles.recordBtnText}>Dừng</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.recordBtn}
                onPress={onRecord}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={18} color="#fff" />
                <Text style={styles.recordBtnText}>{result ? 'Thử lại' : 'Ghi âm'}</Text>
              </TouchableOpacity>
            )}

            {/* Replay own recording */}
            {recordedUri && !isRecording && !isProcessing && (
              <TouchableOpacity
                style={[styles.playBtn, isPlayingUser && styles.replayBtnActive]}
                onPress={onPlayUser}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isPlayingUser ? 'pause-circle' : 'ear'}
                  size={18}
                  color={isPlayingUser ? Colors.surface : Colors.primary}
                />
                <Text style={[styles.playBtnText, isPlayingUser && { color: Colors.surface }]}>
                  {isPlayingUser ? 'Đang phát' : 'Nghe lại'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ── Word Highlight ────────────────────────────────────────────────────
function WordHighlight({
  text,
  wordScores,
}: {
  text: string;
  wordScores: PronounceApiResponse['word_scores'];
}) {
  const words = text.trim().split(/\s+/);
  return (
    <Text style={styles.lineText}>
      {words.map((word, i) => {
        const ws = wordScores[i];
        const color =
          !ws || ws.error_type === 'Omission'
            ? Colors.error
            : ws.score >= 85
            ? Colors.success
            : ws.score >= 60
            ? Colors.warning
            : Colors.error;
        return (
          <Text key={i} style={{ color, fontWeight: '700' }}>
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </Text>
        );
      })}
    </Text>
  );
}

// ── Score Panel ───────────────────────────────────────────────────────
function ScorePanel({ result }: { result: PronounceApiResponse }) {
  const score = result.overall_score ?? 0;
  const color =
    score >= 80 ? Colors.success : score >= 60 ? Colors.warning : Colors.error;
  const label =
    score >= 80 ? '🎉 Tốt lắm!' : score >= 60 ? '👍 Khá!' : '💪 Luyện thêm!';

  return (
    <View style={styles.scorePanel}>
      <View style={styles.scoreHeader}>
        <Text style={[styles.scoreNum, { color }]}>{Math.round(score)}</Text>
        <Text style={styles.scoreDen}>/100</Text>
        <Text style={styles.scoreLabel}>{label}</Text>
      </View>

      <View style={styles.scoreRow}>
        {[
          { label: 'Chính xác', value: result.accuracy_score },
          { label: 'Trôi chảy', value: result.fluency_score },
          { label: 'Đầy đủ', value: result.completeness_score },
        ].map(({ label, value }) => (
          <View key={label} style={styles.scorePill}>
            <Text style={styles.pillLabel}>{label}</Text>
            <Text style={styles.pillValue}>{Math.round(value ?? 0)}</Text>
          </View>
        ))}
      </View>

      {result.recognized_text ? (
        <Text style={styles.recognized}>
          Nhận ra: "{result.recognized_text}"
        </Text>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1 },

  progressBar: {
    height: 3,
    backgroundColor: Colors.border,
    marginHorizontal: 0,
  },
  progressFill: {
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },

  content: { padding: 16, gap: 12 },

  // Cards
  card: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPartner: { backgroundColor: Colors.surfaceAlt },
  cardUser: { backgroundColor: Colors.surface },

  speakerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  speakerLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  lineNum: { fontSize: 11, color: Colors.border },

  lineText: {
    fontSize: 18,
    color: Colors.textPrimary,
    lineHeight: 28,
    marginBottom: 6,
  },
  furigana: { fontSize: 13, color: Colors.textMuted, marginBottom: 2 },
  romaji: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  translation: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  replayBtnActive: { backgroundColor: Colors.primary },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recordBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },

  // Score panel
  scorePanel: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 8,
    gap: 8,
  },
  scoreHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  scoreNum: { fontSize: 28, fontWeight: '800' },
  scoreDen: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  scoreLabel: { marginLeft: 8, fontSize: 14 },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scorePill: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  pillLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  pillValue: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  recognized: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
