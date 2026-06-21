import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BiscuitReward } from '../../components/kid/BiscuitReward';
import { Companion } from '../../components/kid/Companion';
import { LuckyWheel } from '../../components/kid/LuckyWheel';
import { StarRow } from '../../components/kid/StarRow';
import { useExplorationSession } from '../../components/kid/useExplorationSession';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function ExplorationScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const session = useExplorationSession();
  const { activeCostumeEmoji } = useProfile();

  if (session.view === 'loading' || session.view === 'connecting' || session.view === 'saving') {
    return (
      <SafeAreaView style={styles.safe}>
        {session.view !== 'saving' ? (
          <TouchableOpacity style={styles.backBtn} onPress={session.goHome}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            <Text style={styles.backText}>Về nhà</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.centerFull}>
          <Companion
            companionId={session.companion?.id}
            expression="thinking"
            size={120}
            costumeEmoji={activeCostumeEmoji}
          />
          <Text style={styles.statusText}>
            {session.view === 'saving' ? session.savingMsg : 'Đang tìm ảnh để khám phá...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (session.view === 'picking') {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.backBtn} onPress={session.goHome}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={styles.backText}>Về nhà</Text>
        </TouchableOpacity>
        <View style={styles.header}>
          <Text style={styles.title}>Con muốn khám phá ảnh nào? 🖼️</Text>
        </View>
        <FlatList
          data={session.pickableImages}
          keyExtractor={(img) => img.id}
          numColumns={2}
          contentContainerStyle={styles.pickList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.pickCard}
              onPress={() => session.pickImage(item)}
              disabled={session.pickingImageId !== null}
              activeOpacity={0.85}
            >
              <Image source={{ uri: item.url }} style={styles.pickThumb} resizeMode="cover" />
              {session.bestStarsByImage[item.id] ? (
                <View style={styles.pickStarsBadge}>
                  <Text style={styles.pickStarsText}>
                    {'⭐'.repeat(session.bestStarsByImage[item.id])}
                  </Text>
                </View>
              ) : null}
              {session.pickingImageId === item.id ? (
                <View style={styles.pickOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        />
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
          <Text style={styles.finishedTitle}>Khám phá xong rồi! 🎉</Text>
          <Text style={styles.statusText}>Con đã quan sát và trả lời rất giỏi đó!</Text>

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
            </>
          )}

          <TouchableOpacity style={styles.homeBtn} onPress={session.goHome} activeOpacity={0.85}>
            <Text style={styles.homeBtnText}>Về nhà</Text>
          </TouchableOpacity>
        </ScrollView>
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

        <Companion
          companionId={session.companion?.id}
          expression={session.expression}
          size={120}
          costumeEmoji={activeCostumeEmoji}
        />

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
        <TouchableOpacity
          style={[styles.pauseBtn, session.isPaused && styles.resumeBtn]}
          onPress={session.togglePause}
          activeOpacity={0.85}
        >
          <Ionicons
            name={session.isPaused ? 'play' : 'pause'}
            size={20}
            color={session.isPaused ? '#fff' : colors.primary}
          />
          <Text style={[styles.pauseBtnText, session.isPaused && styles.resumeBtnText]}>
            {session.isPaused ? 'Tiếp tục' : 'Tạm dừng'}
          </Text>
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
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    backText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
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

    header: { paddingHorizontal: 24, paddingTop: 16 },
    title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },

    pickList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 12 },
    pickCard: {
      flex: 1,
      margin: 6,
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.border,
    },
    pickThumb: { width: '100%', height: '100%' },
    pickStarsBadge: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pickStarsText: { fontSize: 12 },
    pickOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },

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
    pauseBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      paddingVertical: 14,
    },
    pauseBtnText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    resumeBtn: { backgroundColor: colors.primary, borderColor: colors.primary },
    resumeBtnText: { color: '#fff' },
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
