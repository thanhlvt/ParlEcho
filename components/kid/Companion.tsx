import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { baseEmojiFor, CompanionExpression, EXPRESSION_BADGE } from './companionAssets';

interface CompanionProps {
  companionId: string | null | undefined;
  /** Biểu cảm theo ngữ cảnh: vui khi đúng, ngạc nhiên khi im lặng, cổ vũ khi sắp xong... */
  expression?: CompanionExpression;
  size?: number;
}

export function Companion({ companionId, expression = 'idle', size = 120 }: CompanionProps) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(translateY);
    cancelAnimation(scale);
    cancelAnimation(rotate);
    translateY.value = 0;
    scale.value = 1;
    rotate.value = 0;

    const easeInOut = Easing.inOut(Easing.ease);
    switch (expression) {
      case 'happy':
        scale.value = withRepeat(
          withSequence(withTiming(1.12, { duration: 260 }), withTiming(1, { duration: 260 })),
          -1,
          true,
        );
        break;
      case 'cheering':
        translateY.value = withRepeat(
          withSequence(withTiming(-12, { duration: 200 }), withTiming(0, { duration: 200 })),
          -1,
          true,
        );
        rotate.value = withRepeat(
          withSequence(withTiming(-0.12, { duration: 180 }), withTiming(0.12, { duration: 180 })),
          -1,
          true,
        );
        break;
      case 'surprised':
        scale.value = withSequence(
          withTiming(1.25, { duration: 140 }),
          withTiming(1, { duration: 240 }),
        );
        break;
      case 'thinking':
        rotate.value = withRepeat(
          withSequence(
            withTiming(-0.06, { duration: 900, easing: easeInOut }),
            withTiming(0.06, { duration: 900, easing: easeInOut }),
          ),
          -1,
          true,
        );
        break;
      case 'idle':
      default:
        translateY.value = withRepeat(
          withSequence(
            withTiming(-8, { duration: 1100, easing: easeInOut }),
            withTiming(0, { duration: 1100, easing: easeInOut }),
          ),
          -1,
          true,
        );
        break;
    }

    return () => {
      cancelAnimation(translateY);
      cancelAnimation(scale);
      cancelAnimation(rotate);
    };
  }, [expression, translateY, scale, rotate]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}rad` },
    ],
  }));

  const badge = EXPRESSION_BADGE[expression];

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.Text style={[{ fontSize: size * 0.78 }, animStyle]}>
        {baseEmojiFor(companionId)}
      </Animated.Text>
      {badge ? <Text style={[styles.badge, { fontSize: size * 0.3 }]}>{badge}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0 },
});
