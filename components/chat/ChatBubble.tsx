import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useTheme } from '../../providers/ThemeProvider';
import { LanguageId, Message } from '../../lib/types';
import { CorrectionRow } from './CorrectionRow';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { clearActiveAudio, registerActiveAudio, stopActiveAudio } from '../../lib/audioPlayback';

export type UIMessage = Pick<
  Message,
  | 'id'
  | 'role'
  | 'text'
  | 'translation'
  | 'furigana'
  | 'romaji'
  | 'corrections'
  | 'hints'
  | 'audio_url'
> & { pending?: boolean };

interface ChatBubbleProps {
  message: UIMessage;
  languageId: LanguageId;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function ChatBubble({ message, languageId, expanded, onToggleExpand }: ChatBubbleProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const isUser = message.role === 'user';
  const { user } = useAuth();
  const [showTranslation, setShowTranslation] = useState(false);
  const [savedPhrase, setSavedPhrase] = useState(false);
  const [savedCorrections, setSavedCorrections] = useState<Record<number, boolean>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<AudioPlayer | null>(null);
  // Mirrors isPlaying synchronously — React state batching means a rapid second tap
  // in the same tick would otherwise still read the stale value and start a new
  // player instead of toggling playback off.
  const isPlayingRef = useRef(false);

  useEffect(() => {
    return () => {
      soundRef.current?.pause();
      soundRef.current?.remove();
    };
  }, []);

  async function handlePlayAudio() {
    if (!message.audio_url) return;
    if (isPlayingRef.current) {
      stopActiveAudio();
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }
    if (soundRef.current) {
      soundRef.current.pause();
      soundRef.current.remove();
      soundRef.current = null;
    }
    try {
      // Stop whatever else is playing elsewhere (other bubbles, Practice, Live
      // history, Notebook…) BEFORE switching audio mode / creating the new player —
      // tearing down the old one concurrently with loading a new one can make the
      // new one silently fail to play (observed when switching screens fast).
      stopActiveAudio();
      // A prior Live session leaves the native audio session claimed for recording —
      // switch back to normal playback mode here, otherwise expo-audio can fail to
      // acquire audio focus (AudioFocusNotAcquiredException on Android).
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      const player = createAudioPlayer(message.audio_url);
      soundRef.current = player;
      registerActiveAudio(player, () => {
        isPlayingRef.current = false;
        setIsPlaying(false);
      });
      isPlayingRef.current = true;
      setIsPlaying(true);
      player.play();
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          clearActiveAudio(player);
          isPlayingRef.current = false;
          setIsPlaying(false);
          player.remove();
          soundRef.current = null;
        }
      });
    } catch (err) {
      console.error('Play audio error:', err);
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
  }

  async function handleSavePhrase() {
    if (!user) return;
    try {
      // Check duplicate
      const { data: existing, error: checkError } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .ilike('content', message.text.trim())
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        Alert.alert('Thông báo', 'Mẫu câu này đã tồn tại trong Sổ tay.');
        setSavedPhrase(true);
        return;
      }

      const isOptimistic = message.id.startsWith('opt-') || message.id.startsWith('ai-');
      const { error } = await supabase.from('saved_items').insert({
        user_id: user.id,
        language_id: languageId,
        type: 'phrase',
        content: message.text,
        translation: message.translation,
        source_message_id: isOptimistic ? null : message.id,
      });
      if (error) throw error;
      setSavedPhrase(true);
      Alert.alert('Thành công', 'Đã lưu mẫu câu vào Sổ tay.');
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể lưu mẫu câu.');
    }
  }

  async function handleSaveCorrection(
    c: { original: string; fixed: string; explanation: string },
    index: number,
  ) {
    if (!user) return;
    try {
      // Check duplicate
      const { data: existing, error: checkError } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .ilike('content', c.fixed.trim())
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        Alert.alert('Thông báo', 'Lỗi sai này đã tồn tại trong Sổ tay.');
        setSavedCorrections((prev) => ({ ...prev, [index]: true }));
        return;
      }

      const isOptimistic = message.id.startsWith('opt-') || message.id.startsWith('ai-');
      const { error } = await supabase.from('saved_items').insert({
        user_id: user.id,
        language_id: languageId,
        type: 'mistake',
        content: c.fixed,
        translation: c.original,
        note: c.explanation,
        source_message_id: isOptimistic ? null : message.id,
      });
      if (error) throw error;
      setSavedCorrections((prev) => ({ ...prev, [index]: true }));
      Alert.alert('Thành công', 'Đã lưu lỗi sai vào Sổ tay.');
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể lưu lỗi sai.');
    }
  }

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatarDot}>
          <Text style={{ fontSize: 14 }}>🤖</Text>
        </View>
      )}

      <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
        {/* Main bubble */}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.text}</Text>

          {/* User Play Audio */}
          {isUser && message.audio_url ? (
            <Pressable
              onPress={handlePlayAudio}
              style={{
                marginTop: 8,
                alignSelf: 'flex-end',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Nghe lại</Text>
              <Ionicons
                name={isPlaying ? 'volume-high' : 'volume-medium'}
                size={16}
                color="rgba(255,255,255,0.8)"
              />
            </Pressable>
          ) : null}

          {/* Japanese reading aids */}
          {!isUser && languageId === 'ja' && message.furigana ? (
            <Text style={styles.furigana}>{message.furigana}</Text>
          ) : null}
          {!isUser && languageId === 'ja' && message.romaji ? (
            <Text style={styles.romaji}>{message.romaji}</Text>
          ) : null}

          {/* Translation text */}
          {!isUser && showTranslation && message.translation ? (
            <Text style={styles.translationText}>{message.translation}</Text>
          ) : null}

          {/* Translation toggle & Save bookmark & Play audio */}
          {!isUser && (
            <View style={styles.bubbleActions}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {message.audio_url ? (
                  <Pressable onPress={handlePlayAudio} style={styles.transBtn} hitSlop={8}>
                    <Ionicons
                      name={isPlaying ? 'volume-high' : 'volume-medium'}
                      size={18}
                      color={colors.primary}
                    />
                  </Pressable>
                ) : null}
                {message.translation ? (
                  <Pressable onPress={() => setShowTranslation((v) => !v)} style={styles.transBtn}>
                    <Text style={styles.transBtnText}>
                      {showTranslation ? 'Ẩn dịch ▲' : 'Xem dịch ▼'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                onPress={handleSavePhrase}
                disabled={savedPhrase}
                style={styles.saveBubbleBtn}
                hitSlop={8}
              >
                <Ionicons
                  name={savedPhrase ? 'bookmark' : 'bookmark-outline'}
                  size={15}
                  color={savedPhrase ? colors.primary : colors.textMuted}
                />
              </Pressable>
            </View>
          )}
        </View>

        {/* Corrections chip */}
        {!isUser && message.corrections?.length ? (
          <Pressable style={styles.corrChip} onPress={onToggleExpand}>
            <Ionicons
              name={expanded ? 'checkmark-circle' : 'alert-circle-outline'}
              size={14}
              color={expanded ? colors.success : colors.warning}
            />
            <Text style={styles.corrChipText}>
              {message.corrections.length} lỗi cần sửa {expanded ? '▲' : '▼'}
            </Text>
          </Pressable>
        ) : null}

        {/* Corrections detail */}
        {!isUser && expanded && message.corrections?.length ? (
          <View style={styles.corrPanel}>
            {message.corrections.map((c, i) => (
              <CorrectionRow
                key={i}
                correction={c}
                onSave={() => handleSaveCorrection(c, i)}
                isSaved={!!savedCorrections[i]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    bubbleRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      maxWidth: '90%',
      alignSelf: 'flex-start',
    },
    bubbleRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
    avatarDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    bubbleWrap: { gap: 4, flex: 1 },
    bubbleWrapUser: { alignItems: 'flex-end' },

    // ── Bubble
    bubble: {
      borderRadius: 18,
      padding: 14,
      maxWidth: '100%',
    },
    bubbleUser: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    bubbleAI: {
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 4,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        android: {
          elevation: 1,
        },
      }),
    },
    bubbleText: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
    bubbleTextUser: { color: '#fff' },
    furigana: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
    romaji: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },
    transBtn: {},
    transBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
    translationText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      fontStyle: 'italic',
    },
    bubbleActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      gap: 8,
      minWidth: 100,
    },
    saveBubbleBtn: {
      padding: 4,
    },

    // ── Corrections
    corrChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    corrChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    corrPanel: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
  });
