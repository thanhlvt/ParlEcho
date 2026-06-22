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
import {
  baseEmojiFor,
  CompanionExpression,
  CostumeLayout,
  EXPRESSION_BADGE,
  layoutForCostume,
} from './companionAssets';

interface CompanionProps {
  companionId: string | null | undefined;
  /** Biểu cảm theo ngữ cảnh: vui khi đúng, ngạc nhiên khi im lặng, cổ vũ khi sắp xong... */
  expression?: CompanionExpression;
  size?: number;
  /** Emoji trang phục đang mặc của companion này (companion_costume_state → costumes.emoji), null = không mặc gì. */
  costumeEmoji?: string | null;
}

// Khi có trang phục, khung ngoài cần rộng hơn để chứa phần trang phục lồi ra (mũ phía trên
// đầu, cánh/áo choàng hai bên) mà không bị layout xung quanh cắt mất.
const COSTUME_SPACE_FACTOR = 1.4;

export function Companion({
  companionId,
  expression = 'idle',
  size = 120,
  costumeEmoji,
}: CompanionProps) {
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
  const layout = layoutForCostume(costumeEmoji);
  const stageSize = costumeEmoji ? size * COSTUME_SPACE_FACTOR : size;

  // count = 2: vẽ thêm 1 bản sao theo `second` (override 1 phần layout, vd đổi `left` để đặt
  // sang bên kia thân nhân vật — bao tay/giày mỗi bên 1 cái).
  function renderCostumeIcon(part: CostumeLayout, key: string) {
    const iconSize = size * part.sizeRatio;
    return (
      <Text
        key={key}
        style={[
          styles.costume,
          {
            top: `${part.top}%`,
            left: `${part.left}%`,
            fontSize: iconSize,
            transform: [
              { translateX: -iconSize / 2 },
              { translateY: -iconSize / 2 },
              ...(part.rotate ? [{ rotate: `${part.rotate}rad` }] : []),
              ...(part.flip ? [{ scaleX: -1 }] : []),
            ],
          },
        ]}
      >
        {costumeEmoji}
      </Text>
    );
  }

  const costumeNode =
    costumeEmoji && layout ? (
      <>
        {renderCostumeIcon(layout, 'costume-1')}
        {layout.count === 2 ? renderCostumeIcon({ ...layout, ...layout.second }, 'costume-2') : null}
      </>
    ) : null;

  return (
    <View style={[styles.reserve, { width: stageSize, height: stageSize }]}>
      <View style={[styles.wrap, { width: size, height: size }]}>
        {/* Trang phục nằm trong cùng Animated.View với thân nhân vật nên luôn animate
            đồng bộ (cùng transform, cùng tâm xoay) chứ không cần lặp lại animation. */}
        <Animated.View style={[styles.stage, { width: size, height: size }, animStyle]}>
          {layout?.behind ? costumeNode : null}
          <Text style={{ fontSize: size * 0.78 }}>{baseEmojiFor(companionId)}</Text>
          {!layout?.behind ? costumeNode : null}
        </Animated.View>
        {badge ? <Text style={[styles.badge, { fontSize: size * 0.3 }]}>{badge}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reserve: { alignItems: 'center', justifyContent: 'center' },
  wrap: { alignItems: 'center', justifyContent: 'center' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0 },
  costume: { position: 'absolute' },
});
