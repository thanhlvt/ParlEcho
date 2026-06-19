import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

interface BiscuitRewardProps {
  /** Số biscuit vừa thưởng — không render gì nếu <= 0 */
  amount: number;
}

// Animation vui mắt khi thưởng biscuit (Reward System) — bánh nảy lên + chữ "+N" bay vào,
// theo cùng cách tiếp cận reanimated với StarRow.tsx.
export function BiscuitReward({ amount }: BiscuitRewardProps) {
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (amount <= 0) return;
    scale.value = withDelay(
      300,
      withSequence(withSpring(1.5, { damping: 5 }), withSpring(1, { damping: 8 })),
    );
    rotate.value = withDelay(
      300,
      withSequence(withSpring(-1, { damping: 4 }), withSpring(1, { damping: 4 }), withSpring(0)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value * 15}deg` }],
  }));

  if (amount <= 0) return null;

  return (
    <Animated.View style={[styles.row, style]}>
      <Text style={styles.emoji}>🍪</Text>
      <Text style={styles.amount}>+{amount}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 36 },
  amount: { fontSize: 24, fontWeight: '800', color: '#c47f17' },
});
