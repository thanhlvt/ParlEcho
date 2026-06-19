import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Companion } from '../../components/kid/Companion';
import { useExplorationSession } from '../../components/kid/useExplorationSession';
import { useTheme } from '../../providers/ThemeProvider';

export default function ExplorationScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const session = useExplorationSession();

  if (session.view === 'loading' || session.view === 'connecting' || session.view === 'saving') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <Companion companionId={session.companion?.id} expression="thinking" size={120} />
          <Text style={styles.statusText}>
            {session.view === 'saving' ? session.savingMsg : 'Đang tìm ảnh để khám phá...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (session.view === 'error') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <Companion companionId={session.companion?.id} expression="surprised" size={120} />
          <Text style={styles.statusText}>{session.errorMsg || 'Có lỗi xảy ra.'}</Text>
          <TouchableOpacity style={styles.homeBtn} onPress={session.goHome} activeOpacity={0.85}>
            <Text style={styles.homeBtnText}>Về nhà</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (session.view === 'finished') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <Companion companionId={session.companion?.id} expression="cheering" size={140} />
          <Text style={styles.finishedTitle}>Khám phá xong rồi! 🎉</Text>
          <Text style={styles.statusText}>Con đã quan sát và trả lời rất giỏi đó!</Text>

          {session.vocabLearned.length > 0 ? (
            <View style={styles.rewardBox}>
              <Text style={styles.rewardTitle}>Từ mới con đã học</Text>
              <View style={styles.vocabRow}>
                {session.vocabLearned.map((w) => (
                  <View key={w} style={styles.vocabChip}>
                    <Text style={styles.vocabChipText}>{w}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={styles.homeBtn} onPress={session.goHome} activeOpacity={0.85}>
            <Text style={styles.homeBtnText}>Về nhà</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Khám phá ảnh 🖼️</Text>
      </View>

      <View style={styles.centerFull}>
        {session.imageUrl ? (
          <Image source={{ uri: session.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : null}

        <Companion companionId={session.companion?.id} expression={session.expression} size={120} />

        {session.lastAiText ? (
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{session.lastAiText}</Text>
          </View>
        ) : null}

        {session.timeUp ? (
          <View style={styles.nudge}>
            <Text style={styles.nudgeText}>Hết giờ rồi, mình nói xong câu này nhé! ⏰</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.endBtn} onPress={session.endSession} activeOpacity={0.85}>
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
    centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    statusText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    finishedTitle: { fontSize: 26, fontWeight: '800', color: colors.primary },

    header: { paddingHorizontal: 24, paddingTop: 16 },
    title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },

    image: {
      width: 220,
      height: 220,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.border,
    },

    bubble: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingVertical: 14,
      maxWidth: '90%',
    },
    bubbleText: { fontSize: 16, color: colors.textPrimary, textAlign: 'center', lineHeight: 22 },

    nudge: {
      backgroundColor: colors.warning,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    nudgeText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    homeBtn: {
      backgroundColor: colors.primary,
      borderRadius: 18,
      paddingHorizontal: 28,
      paddingVertical: 14,
    },
    homeBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

    rewardBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      paddingHorizontal: 20,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 8,
    },
    rewardTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
    vocabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    vocabChip: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    vocabChipText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    bottomRow: {
      flexDirection: 'row',
      gap: 12,
      marginHorizontal: 24,
      marginBottom: 24,
    },
    endBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.error,
      borderRadius: 18,
      paddingVertical: 14,
    },
    endBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
