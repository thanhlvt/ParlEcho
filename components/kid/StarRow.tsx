import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

interface StarRowProps {
  /** Số sao đạt được (0-3) */
  stars: number;
  size?: number;
}

function FlyingStar({ filled, delay, size }: { filled: boolean; delay: number; size: number }) {
  const scale = useSharedValue(0);
  const translateY = useSharedValue(-30);

  useEffect(() => {
    if (!filled) {
      scale.value = withDelay(delay, withSpring(1));
      return;
    }
    translateY.value = withDelay(delay, withSequence(withSpring(0)));
    scale.value = withDelay(
      delay,
      withSequence(withSpring(1.4, { damping: 6 }), withSpring(1, { damping: 8 })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  return <Animated.Text style={[{ fontSize: size }, style]}>{filled ? '⭐' : '☆'}</Animated.Text>;
}

export function StarRow({ stars, size = 48 }: StarRowProps) {
  return (
    <View style={styles.row}>
      {[0, 1, 2].map((i) => (
        <FlyingStar key={i} filled={i < stars} delay={i * 220} size={size} />
      ))}
      {stars === 0 ? <Text style={styles.encourage}>Cố lên lần sau nhé!</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  encourage: { fontSize: 13, color: '#888', marginLeft: 8 },
});
