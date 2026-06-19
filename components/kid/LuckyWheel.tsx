import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

interface LuckyWheelProps {
  /** Kết quả sau khi quay (null = chưa quay) */
  result: number | null;
  /** Thực hiện quay (gọi RPC thưởng biscuit), trả về số biscuit nhận được */
  onSpin: () => Promise<number>;
}

const SIZE = 220;
const RADIUS = SIZE / 2;
const SLICES = [
  { amount: 1, emoji: '🍪', color: '#FFD166' },
  { amount: 2, emoji: '🍬', color: '#FF6B6B' },
  { amount: 3, emoji: '🍭', color: '#6FCF97' },
  { amount: 4, emoji: '🧁', color: '#56CCF2' },
  { amount: 5, emoji: '🎉', color: '#BB6BD9' },
];
const STEP = 360 / SLICES.length;

function pointOnCircle(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: RADIUS + r * Math.sin(rad), y: RADIUS - r * Math.cos(rad) };
}

function angleForAmount(amount: number) {
  const index = SLICES.findIndex((s) => s.amount === amount);
  const safeIndex = index >= 0 ? index : 0;
  return safeIndex * STEP + STEP / 2;
}

// Vòng quay may mắn — thưởng thêm khi đạt tròn 3 sao (Reward System). Gọi RPC lấy số
// biscuit thưởng được TRƯỚC, rồi xoay nhiều vòng và dừng đúng vào miếng tương ứng kết
// quả, để cảm giác "trúng thật" thay vì dừng ngẫu nhiên không liên quan tới kết quả.
export function LuckyWheel({ result, onSpin }: LuckyWheelProps) {
  const rotate = useSharedValue(0);
  const [spinning, setSpinning] = useState(false);
  const didInit = useRef(false);

  // Mở lại màn hình khi đã quay rồi (result có sẵn) → đặt kim chỉ đúng miếng luôn, không xoay lại.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (result !== null) {
      rotate.value = (360 - angleForAmount(result)) % 360;
    }
  }, [result, rotate]);

  const handlePress = async () => {
    if (spinning || result !== null) return;
    setSpinning(true);
    const amount = await onSpin();
    const offset = (360 - angleForAmount(amount || 1)) % 360;
    rotate.value = withTiming(360 * 4 + offset, { duration: 1800 });
    setTimeout(() => setSpinning(false), 1800);
  };

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Tròn 3 sao! Quay vòng quay may mắn 🎡</Text>

      <View style={styles.wheelArea}>
        <View style={styles.pointer} />
        <Animated.View style={[styles.wheel, wheelStyle]}>
          <Svg width={SIZE} height={SIZE}>
            {SLICES.map((s, i) => {
              const start = pointOnCircle(i * STEP, RADIUS);
              const end = pointOnCircle((i + 1) * STEP, RADIUS);
              return (
                <Path
                  key={s.amount}
                  d={`M${RADIUS},${RADIUS} L${start.x},${start.y} A${RADIUS},${RADIUS} 0 0,1 ${end.x},${end.y} Z`}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={2}
                />
              );
            })}
            <Circle cx={RADIUS} cy={RADIUS} r={RADIUS * 0.16} fill="#fff" />
          </Svg>
          {SLICES.map((s, i) => {
            const mid = i * STEP + STEP / 2;
            const pos = pointOnCircle(mid, RADIUS * 0.62);
            return (
              <Text
                key={s.amount}
                style={[styles.sliceEmoji, { left: pos.x - 16, top: pos.y - 16 }]}
              >
                {s.emoji}
              </Text>
            );
          })}
        </Animated.View>

        <TouchableOpacity
          style={styles.spinBtn}
          onPress={handlePress}
          disabled={spinning || result !== null}
          activeOpacity={0.85}
        >
          <Text style={styles.spinBtnText}>{spinning ? '...' : 'Quay'}</Text>
        </TouchableOpacity>
      </View>

      {result !== null && !spinning ? (
        <Text style={styles.resultText}>Con quay được +{result} 🍪</Text>
      ) : (
        <Text style={styles.hint}>{spinning ? 'Đang quay...' : 'Chạm vào nút Quay nhé!'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: '#c47f17', textAlign: 'center' },
  wheelArea: { width: SIZE, height: SIZE + 16, alignItems: 'center' },
  wheel: { position: 'absolute', top: 16, width: SIZE, height: SIZE },
  sliceEmoji: { position: 'absolute', fontSize: 26, width: 32, height: 32, textAlign: 'center' },
  pointer: {
    position: 'absolute',
    top: 6,
    left: SIZE / 2 - 12,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#c47f17',
    zIndex: 2,
  },
  spinBtn: {
    position: 'absolute',
    top: 16 + RADIUS - 30,
    left: SIZE / 2 - 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#c47f17',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    elevation: 4,
  },
  spinBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  hint: { fontSize: 13, color: '#888' },
  resultText: { fontSize: 16, fontWeight: '800', color: '#c47f17' },
});
