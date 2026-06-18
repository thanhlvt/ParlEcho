import { Ionicons } from '@expo/vector-icons';
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { LiveState } from '../../lib/liveClient';
import { LanguageId, LiveTurn } from '../../lib/types';

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface LiveConversationViewProps {
  flatRef: React.RefObject<FlatList<LiveTurn> | null>;
  turns: LiveTurn[];
  liveState: LiveState;
  isPaused: boolean;
  elapsedSec: number;
  languageId: LanguageId;
  onTogglePause: () => void;
  onEndSession: () => void;
}

export function LiveConversationView({
  flatRef,
  turns,
  liveState,
  isPaused,
  elapsedSec,
  languageId,
  onTogglePause,
  onEndSession,
}: LiveConversationViewProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const isListening = liveState === 'live';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.liveHeader}>
        <View style={styles.liveIndicatorWrap}>
          <View
            style={[
              styles.liveDot,
              isListening && !isPaused && styles.liveDotActive,
              isPaused && styles.liveDotPaused,
            ]}
          />
          <Text style={styles.liveLabel}>
            {isPaused ? 'Đang tạm dừng' : isListening ? 'Đang kết nối' : 'Đang xử lý'}
          </Text>
        </View>
        <Text style={styles.timer}>{formatTime(elapsedSec)}</Text>
        <Text style={styles.langChip}>{languageId === 'en' ? '🇺🇸 EN' : '🇯🇵 JP'}</Text>
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
          <View
            style={[styles.turnRow, item.role === 'user' ? styles.turnRowUser : styles.turnRowAI]}
          >
            <Text
              style={[
                styles.turnText,
                item.role === 'user' ? styles.turnTextUser : styles.turnTextAI,
              ]}
            >
              {item.text}
            </Text>
          </View>
        )}
      />

      {/* End / Control bar */}
      <View style={styles.endBar}>
        <TouchableOpacity
          style={[styles.pauseBtn, isPaused && styles.resumeBtn]}
          onPress={onTogglePause}
          activeOpacity={0.85}
        >
          <Ionicons
            name={isPaused ? 'play' : 'pause'}
            size={20}
            color={isPaused ? '#fff' : colors.primary}
          />
          <Text style={[styles.pauseBtnText, isPaused && styles.resumeBtnText]}>
            {isPaused ? 'Tiếp tục' : 'Tạm dừng'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endBtn} onPress={onEndSession} activeOpacity={0.85}>
          <Ionicons name="stop-circle" size={22} color="#fff" />
          <Text style={styles.endBtnText}>Kết thúc</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },

    liveHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    liveIndicatorWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
    liveDotActive: { backgroundColor: colors.error },
    liveDotPaused: { backgroundColor: colors.textMuted },
    liveLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    timer: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    langChip: { fontSize: 13, fontWeight: '600', color: colors.textMuted },

    transcriptList: { padding: 16, gap: 10, paddingBottom: 8 },
    emptyTranscript: { paddingTop: 60, alignItems: 'center' },
    emptyTranscriptText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

    turnRow: { maxWidth: '85%', borderRadius: 16, padding: 12 },
    turnRowUser: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    turnRowAI: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 4,
      ...(Platform.OS !== 'android' && {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      }),
      elevation: 1,
    },
    turnText: { fontSize: 15, lineHeight: 22 },
    turnTextUser: { color: '#fff' },
    turnTextAI: { color: colors.textPrimary },

    endBar: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    pauseBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 16,
      backgroundColor: colors.surface,
      paddingVertical: 14,
    },
    pauseBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.primary,
    },
    resumeBtn: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    resumeBtnText: {
      color: '#fff',
    },
    endBtn: {
      flex: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.error,
      borderRadius: 16,
      paddingVertical: 14,
    },
    endBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
