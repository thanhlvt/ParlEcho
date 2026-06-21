import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BiscuitReward } from '../../components/kid/BiscuitReward';
import { Companion } from '../../components/kid/Companion';
import { LuckyWheel } from '../../components/kid/LuckyWheel';
import { StarRow } from '../../components/kid/StarRow';
import { useMissionSession } from '../../components/kid/useMissionSession';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function MissionLiveScreen() {
  const { missionId } = useLocalSearchParams<{ missionId: string }>();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const session = useMissionSession(missionId);
  const { activeCostumeEmoji } = useProfile();

  if (session.view === 'loading' || session.view === 'connecting' || session.view === 'saving') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <Companion
            companionId={session.companion?.id}
            expression="thinking"
            size={120}
            costumeEmoji={activeCostumeEmoji}
          />
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
          <Companion
            companionId={session.companion?.id}
            expression="surprised"
            size={120}
            costumeEmoji={activeCostumeEmoji}
          />
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
        <ScrollView contentContainerStyle={styles.finishedScroll}>
          <Companion
            companionId={session.companion?.id}
            expression="cheering"
            size={140}
            costumeEmoji={activeCostumeEmoji}
          />
          <Text style={styles.finishedTitle}>Tuyệt vời! 🎉</Text>
          <Text style={styles.statusText}>Con đã hoàn thành nhiệm vụ rồi đó!</Text>

          {session.scoring ? (
            <View style={styles.scoringBox}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.scoringText}>Đang chấm điểm...</Text>
            </View>
          ) : (
            <>
              <StarRow stars={session.stars} />
              <BiscuitReward amount={session.biscuitsAwarded} />
              {session.showLuckyWheel ? (
                <LuckyWheel result={session.luckyWheelResult} onSpin={session.spinLuckyWheel} />
              ) : null}

              {session.unlockedStickers.length > 0 ? (
                <View style={styles.rewardBox}>
                  <Text style={styles.rewardTitle}>Phần thưởng mới!</Text>
                  <View style={styles.rewardRow}>
                    {session.unlockedStickers.map((s) => (
                      <Text key={s.id} style={styles.rewardEmoji}>
                        {s.emoji}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}

          <TouchableOpacity style={styles.homeBtn} onPress={session.goHome} activeOpacity={0.85}>
            <Text style={styles.homeBtnText}>Về nhà</Text>
          </TouchableOpacity>
        </ScrollView>
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
              // Khớp với nhãn "Bước {stepNum}/{totalSteps}": đang ở bước K thì thanh đầy K/N
              // (không phải (K-1)/N "số bước đã xong" — lệch 1 đoạn so với nhãn).
              { width: `${(stepNum / Math.max(totalSteps, 1)) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>
          Bước {stepNum}/{totalSteps}
        </Text>
      </View>

      <View style={styles.centerFull}>
        <Companion
          companionId={session.companion?.id}
          expression={session.expression}
          size={170}
          costumeEmoji={activeCostumeEmoji}
        />

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
          <Ionicons name="bulb" size={18} color={colors.primary} />
          <Text style={styles.hintBtnText} numberOfLines={1}>
            Gợi ý
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pauseBtn, session.isPaused && styles.resumeBtn]}
          onPress={session.togglePause}
          activeOpacity={0.85}
        >
          <Ionicons
            name={session.isPaused ? 'play' : 'pause'}
            size={18}
            color={session.isPaused ? '#fff' : colors.primary}
          />
          <Text style={[styles.pauseBtnText, session.isPaused && styles.resumeBtnText]} numberOfLines={1}>
            {session.isPaused ? 'Tiếp tục' : 'Tạm dừng'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endBtn} onPress={session.endSession} activeOpacity={0.85}>
          <Ionicons name="stop-circle" size={18} color="#fff" />
          <Text style={styles.endBtnText} numberOfLines={1}>
            Kết thúc
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    finishedScroll: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 24,
    },
    statusText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
    finishedTitle: { fontSize: 26, fontWeight: '800', color: colors.primary },
    scoringBox: { alignItems: 'center', gap: 10, paddingVertical: 12 },
    scoringText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },

    header: { paddingHorizontal: 24, paddingTop: 16, gap: 8 },
    missionTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
    progressTrack: {
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      // Chừa khoảng trống bên phải để không bị đè bởi BiscuitBadge (góc phải màn hình).
      marginRight: 64,
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
      marginTop: 16,
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
      marginTop: 16,
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
      gap: 8,
      marginHorizontal: 24,
      marginBottom: 24,
    },
    hintBtn: {
      flex: 0.9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 14,
    },
    hintBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },

    pauseBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      paddingHorizontal: 10,
      paddingVertical: 14,
    },
    pauseBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    resumeBtn: { backgroundColor: colors.primary, borderColor: colors.primary },
    resumeBtnText: { color: '#fff' },

    endBtn: {
      flex: 1.1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.error,
      borderRadius: 18,
      paddingHorizontal: 6,
      paddingVertical: 14,
    },
    endBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
