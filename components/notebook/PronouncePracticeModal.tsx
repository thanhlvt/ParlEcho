import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioPlayer,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { ExpoAudioStreamModule, useAudioRecorder } from '@siteed/audio-studio';
import { LegacyEventEmitter } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../providers/ThemeProvider';
import { SavedItem, PronounceApiResponse } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { compareWords } from '../../lib/wordDiff';
import { bytesToBase64, concatUint8Arrays, pcmToWav } from '../../lib/audioFormat';
import { ScorePanel } from '../practice/ScorePanel';
import { WordHighlight } from '../practice/WordHighlight';
import { clearActiveAudio, registerActiveAudio, stopActiveAudio } from '../../lib/audioPlayback';

interface PronouncePracticeModalProps {
  item: SavedItem | null;
  onClose: () => void;
}

export const PronouncePracticeModal: React.FC<PronouncePracticeModalProps> = ({
  item,
  onClose,
}) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isPlayingUser, setIsPlayingUser] = useState(false);
  const [pronounceResult, setPronounceResult] = useState<PronounceApiResponse | null>(null);

  const {
    startRecording: startCapture,
    stopRecording: stopCapture,
    isRecording: isCapturing,
  } = useAudioRecorder();
  const userSoundRef = useRef<AudioPlayer | null>(null);
  // Mirrors isPlayingUser synchronously — React state batching means a rapid second
  // tap in the same tick would otherwise still read the stale value.
  const isPlayingUserRef = useRef(false);
  // Mic streaming (giống Live/Kid) — gom PCM chunk rồi đóng WAV khi dừng ghi, thay vì ghi
  // m4a/AAC (Azure Pronunciation Assessment chỉ nhận PCM WAV 16kHz/16-bit/mono).
  const audioEmitter = useRef(new LegacyEventEmitter(ExpoAudioStreamModule));
  const audioDataSubRef = useRef<{ remove: () => void } | null>(null);
  const pcmChunksRef = useRef<Uint8Array[]>([]);

  useEffect(() => {
    return () => {
      userSoundRef.current?.pause();
      userSoundRef.current?.remove();
      audioDataSubRef.current?.remove();
    };
  }, []);

  async function startRecording() {
    if (!item) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Quyền ghi âm', 'Vui lòng cấp quyền micro để luyện phát âm.');
        return;
      }

      // Stop any audio/speech playing elsewhere before claiming the mic.
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

      await startCapture({ sampleRate: 16000, channels: 1, encoding: 'pcm_16bit', interval: 100 });
      setIsRecording(true);
      setPronounceResult(null);
      setRecordedUri(null);
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể bắt đầu ghi âm.');
    }
  }

  async function stopRecording() {
    if (!item || !user) return;
    if (!isCapturing) return;

    setIsRecording(false);
    setIsProcessing(true);

    try {
      await stopCapture();
      audioDataSubRef.current?.remove();
      audioDataSubRef.current = null;
      await setAudioModeAsync({ allowsRecording: false });

      const pcm = concatUint8Arrays(pcmChunksRef.current);
      if (pcm.length === 0) throw new Error('Không ghi được âm thanh');
      const wavBytes = pcmToWav(pcm, 16000, 16);

      // Lưu file cục bộ để người dùng nghe lại
      const localUri = `${FileSystem.cacheDirectory}notebook-${item.id}-${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(localUri, bytesToBase64(wavBytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
      setRecordedUri(localUri);

      // Upload to supabase storage
      const storagePath = await uploadRecording(wavBytes);

      // Resolve a valid scenario_line_id or message_id to satisfy check and foreign key constraints
      let scenarioLineId = null;
      let messageId = null;

      // 1. Try to find a scenario line matching the text
      const { data: line } = await supabase
        .from('scenario_lines')
        .select('id')
        .eq('text', item.content)
        .limit(1)
        .maybeSingle();

      if (line) {
        scenarioLineId = line.id;
      } else {
        // 2. Try to find a message matching the text
        const { data: msg } = await supabase
          .from('messages')
          .select('id')
          .eq('text', item.content)
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (msg) {
          messageId = msg.id;
        } else {
          // 3. Fallback to any user message
          const { data: anyMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (anyMsg) {
            messageId = anyMsg.id;
          } else {
            // 4. Try any scenario line
            const { data: anyLine } = await supabase
              .from('scenario_lines')
              .select('id')
              .limit(1)
              .maybeSingle();
            if (anyLine) {
              scenarioLineId = anyLine.id;
            }
          }
        }
      }

      if (!scenarioLineId && !messageId) {
        throw new Error(
          'Chưa có tin nhắn hoặc hội thoại nào để đối chiếu trong cơ sở dữ liệu. Hãy chat với AI trước.',
        );
      }

      // Call edge function
      const { data, error } = await supabase.functions.invoke('pronounce', {
        body: {
          audio_storage_path: storagePath,
          reference_text: item.content,
          language_id: item.language_id,
          audio_mime_type: 'audio/wav',
          scenario_line_id: scenarioLineId,
          message_id: messageId,
        },
      });

      if (error) throw new Error(error.message);
      setPronounceResult(data as PronounceApiResponse);
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi chấm điểm', err instanceof Error ? err.message : 'Không thể chấm điểm.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function uploadRecording(wavBytes: Uint8Array): Promise<string> {
    if (!user) throw new Error('User is not authenticated');
    const fileName = `${user.id}/review-${Date.now()}.wav`;
    const { error } = await supabase.storage
      .from('recordings')
      .upload(fileName, wavBytes.buffer as ArrayBuffer, { contentType: 'audio/wav' });

    if (error) throw new Error(error.message);
    return fileName;
  }

  async function playUserRecording() {
    if (!recordedUri) return;
    if (userSoundRef.current) {
      userSoundRef.current.pause();
      userSoundRef.current.remove();
      userSoundRef.current = null;
    }
    if (isPlayingUserRef.current) {
      stopActiveAudio();
      isPlayingUserRef.current = false;
      setIsPlayingUser(false);
      return;
    }

    try {
      // Stop whatever else is playing elsewhere in the app BEFORE creating the new
      // player — tearing down the old one concurrently with loading a new one can
      // make the new one silently fail to play (observed when switching screens fast).
      stopActiveAudio();
      const player = createAudioPlayer(recordedUri);
      userSoundRef.current = player;
      registerActiveAudio(player, () => {
        isPlayingUserRef.current = false;
        setIsPlayingUser(false);
      });
      isPlayingUserRef.current = true;
      setIsPlayingUser(true);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          clearActiveAudio(player);
          player.remove();
          userSoundRef.current = null;
          isPlayingUserRef.current = false;
          setIsPlayingUser(false);
        }
      });
      player.play();
    } catch (err) {
      console.error(err);
      isPlayingUserRef.current = false;
      setIsPlayingUser(false);
    }
  }

  return (
    <Modal visible={!!item} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Luyện phát âm</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.practiceCard}>
              {pronounceResult ? (
                <WordHighlight
                  text={item?.content || ''}
                  wordScores={compareWords(item?.content || '', pronounceResult.transcript)}
                />
              ) : (
                <Text style={styles.practiceText}>{item?.content}</Text>
              )}
              {item?.translation && (
                <Text style={styles.practiceTranslation}>{item.translation}</Text>
              )}
            </View>

            {pronounceResult && <ScorePanel result={pronounceResult} />}

            {/* Microphone Controls */}
            <View style={styles.micControlRow}>
              {isProcessing ? (
                <View style={styles.bigMicBtnProcessing}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.micBtnText}>Đang xử lý...</Text>
                </View>
              ) : isRecording ? (
                <TouchableOpacity
                  style={styles.bigMicBtnRecording}
                  onPress={stopRecording}
                  activeOpacity={0.8}
                >
                  <Ionicons name="stop-circle" size={32} color="#fff" />
                  <Text style={styles.micBtnText}>Dừng</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.bigMicBtn}
                  onPress={startRecording}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mic" size={32} color="#fff" />
                  <Text style={styles.micBtnText}>Bấm để Nói</Text>
                </TouchableOpacity>
              )}

              {recordedUri && !isRecording && !isProcessing && (
                <TouchableOpacity
                  style={[styles.replayBtn, isPlayingUser && styles.replayBtnActive]}
                  onPress={playUserRecording}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isPlayingUser ? 'pause' : 'play'}
                    size={20}
                    color={isPlayingUser ? '#fff' : colors.primary}
                  />
                  <Text style={[styles.replayText, isPlayingUser && { color: '#fff' }]}>
                    {isPlayingUser ? 'Đang phát' : 'Nghe lại giọng bạn'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
      minHeight: '50%',
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    sheetContent: {
      padding: 16,
      gap: 16,
    },
    practiceCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    practiceText: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 28,
    },
    practiceTranslation: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 8,
      fontStyle: 'italic',
    },
    micControlRow: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      marginVertical: 16,
    },
    bigMicBtn: {
      backgroundColor: colors.primary,
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
    },
    bigMicBtnRecording: {
      backgroundColor: colors.error,
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.error,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
    },
    bigMicBtnProcessing: {
      backgroundColor: colors.textMuted,
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    micBtnText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
      marginTop: 8,
    },
    replayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    replayBtnActive: {
      backgroundColor: colors.primary,
    },
    replayText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '600',
    },
  });
