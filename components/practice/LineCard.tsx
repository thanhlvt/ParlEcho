import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { PronounceApiResponse, ScenarioLine } from '../../lib/types';
import { ScorePanel } from './ScorePanel';
import { WordHighlight } from './WordHighlight';

interface LineCardProps {
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
  isSaved?: boolean;
  onSave?: () => void;
  onWordPress?: (word: string, isMispronounced: boolean) => void;
}

export function LineCard({
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
  isSaved = false,
  onSave,
  onWordPress,
}: LineCardProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const isPartner = line.speaker === 'partner';

  return (
    <View style={[styles.card, isPartner ? styles.cardPartner : styles.cardUser]}>
      {/* Speaker label */}
      <View style={styles.speakerRow}>
        <View style={styles.speakerBadge}>
          <Text style={styles.speakerEmoji}>{isPartner ? '🤝' : '👤'}</Text>
          <Text style={styles.speakerLabel}>{isPartner ? 'Partner' : 'Bạn'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.lineNum}>#{index + 1}</Text>
          {onSave && (
            <TouchableOpacity onPress={onSave} style={{ padding: 2 }} hitSlop={8}>
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={16}
                color={isSaved ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Text — highlighted after scoring */}
      {result ? (
        <WordHighlight text={line.text} wordScores={result.word_scores} onWordPress={onWordPress} />
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
            color={colors.primary}
          />
          <Text style={styles.playBtnText}>
            {isPlaying ? 'Đang phát' : isPartner ? 'Nghe' : 'Nghe mẫu'}
          </Text>
        </TouchableOpacity>

        {/* Record button — only for user lines */}
        {!isPartner && (
          <>
            {isProcessing ? (
              <View style={[styles.recordBtn, { backgroundColor: colors.textMuted }]}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.recordBtnText}>Đang xử lý</Text>
              </View>
            ) : isRecording ? (
              <TouchableOpacity
                style={[styles.recordBtn, { backgroundColor: colors.error }]}
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
                  color={isPlayingUser ? colors.surface : colors.primary}
                />
                <Text style={[styles.playBtnText, isPlayingUser && { color: colors.surface }]}>
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

const getStyles = (colors: any) => StyleSheet.create({
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
  cardPartner: { backgroundColor: colors.surfaceAlt },
  cardUser: { backgroundColor: colors.surface },

  speakerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  speakerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  speakerEmoji: {
    fontSize: 14,
  },
  speakerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  lineNum: { fontSize: 11, color: colors.border },

  lineText: {
    fontSize: 18,
    color: colors.textPrimary,
    lineHeight: 28,
    marginBottom: 6,
  },
  furigana: { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  romaji: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  translation: {
    fontSize: 13,
    color: colors.textSecondary,
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
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
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  replayBtnActive: { backgroundColor: colors.primary },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recordBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
