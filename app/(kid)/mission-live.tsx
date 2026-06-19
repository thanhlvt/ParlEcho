import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Companion } from '../../components/kid/Companion';
import { StarRow } from '../../components/kid/StarRow';
import { useMissionSession } from '../../components/kid/useMissionSession';
import { useTheme } from '../../providers/ThemeProvider';

export default function MissionLiveScreen() {
  const { missionId } = useLocalSearchParams<{ missionId: string }>();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const session = useMissionSession(missionId);

  if (session.view === 'loading' || session.view === 'connecting' || session.view === 'saving') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <Companion companionId={session.companion?.id} expression="thinking" size={120} />
          <Text style={styles.statusText}>
            {session.view === 'saving' ? session.savingMsg : 'Đang chuẩn bị nhiệm vụ...'}
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
          <Text style={styles.finishedTitle}>Tuyệt vời! 🎉</Text>
          <Text style={styles.statusText}>Con đã hoàn thành một phần nhiệm vụ rồi đó!</Text>

          <StarRow stars={session.stars} />

          {session.unlockedStickers.length > 0 || session.unlockedCostume ? (
            <View style={styles.rewardBox}>
              <Text style={styles.rewardTitle}>Phần thưởng mới!</Text>
              <View style={styles.rewardRow}>
                {session.unlockedStickers.map((s) => (
                  <Text key={s.id} style={styles.rewardEmoji}>
                    {s.emoji}
                  </Text>
                ))}
                {session.unlockedCostume ? (
                  <Text style={styles.rewardEmoji}>{session.unlockedCostume.emoji}</Text>
                ) : null}
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

  const totalSteps = session.steps.length;
  const stepNum = Math.min(session.currentStepIndex + 1, totalSteps);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.missionTitle}>{session.mission?.title}</Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(session.currentStepIndex / Math.max(totalSteps, 1)) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>
          Bước {stepNum}/{totalSteps}
        </Text>
      </View>

      <View style={styles.centerFull}>
        <Companion companionId={session.companion?.id} expression={session.expression} size={170} />

        {session.lastAiText ? (
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{session.lastAiText}</Text>
          </View>
        ) : null}

        {session.showNudge ? (
          <View style={styles.nudge}>
            <Text style={styles.nudgeText}>Con thử nói lại nhé! 🎤</Text>
          </View>
        ) : null}

        {session.showHint ? (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>
              {session.steps[session.currentStepIndex]?.target_sentence}
            </Text>
          </View>
        ) : null}

        {session.timeUp ? (
          <View style={styles.nudge}>
            <Text style={styles.nudgeText}>Hết giờ rồi, mình nói xong câu này nhé! ⏰</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.hintBtn} onPress={session.revealHint} activeOpacity={0.85}>
          <Ionicons name="bulb" size={20} color={colors.primary} />
          <Text style={styles.hintBtnText}>Gợi ý</Text>
        </TouchableOpacity>

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

    header: { paddingHorizontal: 24, paddingTop: 16, gap: 8 },
    missionTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
    progressTrack: {
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 7, backgroundColor: colors.primary },
    progressLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },

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

    hintBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    hintText: { fontSize: 14, fontWeight: '700', color: colors.primary, textAlign: 'center' },

    rewardBox: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      paddingHorizontal: 20,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 8,
    },
    rewardTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
    rewardRow: { flexDirection: 'row', gap: 10 },
    rewardEmoji: { fontSize: 32 },

    bottomRow: {
      flexDirection: 'row',
      gap: 12,
      marginHorizontal: 24,
      marginBottom: 24,
    },
    hintBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    hintBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },

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
