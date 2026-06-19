import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
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

// Easing nối 2 đoạn quay với vận tốc đầu/cuối cho trước (động học gia tốc đều) — đảm bảo
// vận tốc tại điểm nối giữa 2 đoạn liên tục, không bị "giật" tốc độ (đột ngột nhanh/chậm
// lại) như khi ghép các Easing chuẩn (in/out/linear) có vận tốc biên không khớp nhau.
function accelEasing(vStart: number, vEnd: number) {
  const a = vStart + vEnd === 0 ? 1 : (2 * vStart) / (vStart + vEnd);
  return (t: number) => {
    'worklet';
    return a * t + (1 - a) * t * t;
  };
}

const CELEBRATION_EMOJIS = ['✨', '🎉', '⭐', '🎈', '💖', '🍪', '🍬', '🍭', '🧁'];

function getParticlesFor(result: number) {
  const wonEmoji = SLICES.find((s) => s.amount === result)?.emoji || '🍪';
  const list: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (Math.random() < 0.5) {
      list.push(wonEmoji);
    } else {
      const idx = Math.floor(Math.random() * CELEBRATION_EMOJIS.length);
      list.push(CELEBRATION_EMOJIS[idx]);
    }
  }
  return list;
}

function ConfettiParticle({ emoji }: { emoji: string }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const angle = Math.random() * 2 * Math.PI;
    const distance = 40 + Math.random() * 90;
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance - 40;

    scale.value = withSpring(0.7 + Math.random() * 0.6, { damping: 8 });
    rotate.value = withTiming((Math.random() - 0.5) * 1080, { duration: 1600 });
    x.value = withSpring(targetX, { damping: 10, stiffness: 60 });
    y.value = withSpring(targetY, { damping: 10, stiffness: 60 });

    y.value = withDelay(
      250,
      withTiming(targetY + 240 + Math.random() * 100, {
        duration: 1200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );

    opacity.value = withDelay(1000, withTiming(0, { duration: 500 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={style}>
      <Text style={{ fontSize: 24 }}>{emoji}</Text>
    </Animated.View>
  );
}

function ResultCard({ result }: { result: number }) {
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.3, { damping: 7, stiffness: 120 }),
      withSpring(1, { damping: 9, stiffness: 90 })
    );
    rotate.value = withSequence(
      withDelay(150, withSpring(-6, { damping: 4 })),
      withSpring(6, { damping: 4 }),
      withSpring(0, { damping: 5 })
    );
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  const wonEmoji = '🍪';

  return (
    <Animated.View style={[styles.resultCard, cardStyle]}>
      <Text style={styles.resultCardTitle}>🎉 CON QUAY ĐƯỢC 🎉</Text>
      <View style={styles.resultRow}>
        <Text style={styles.resultAmount}>+{result}</Text>
        <Text style={styles.resultEmoji}>{wonEmoji}</Text>
      </View>
    </Animated.View>
  );
}

interface LuckyWheelProps {
  /** Kết quả sau khi quay (null = chưa quay) */
  result: number | null;
  /** Thực hiện quay (gọi RPC thưởng biscuit), trả về số biscuit nhận được */
  onSpin: () => Promise<number>;
}

// Vòng quay may mắn — thưởng thêm khi đạt tròn 3 sao (Reward System). Gọi RPC lấy số
// biscuit thưởng được TRƯỚC, rồi xoay nhiều vòng và dừng đúng vào miếng tương ứng kết
// quả, để cảm giác "trúng thật" thay vì dừng ngẫu nhiên không liên quan tới kết quả.
export function LuckyWheel({ result, onSpin }: LuckyWheelProps) {
  const rotate = useSharedValue(0);
  const [spinning, setSpinning] = useState(false);
  const [particles, setParticles] = useState<string[]>([]);
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
    setParticles([]);
    const amount = await onSpin();

    const currentRot = rotate.value % 360;
    rotate.value = currentRot;

    const offset = (360 - angleForAmount(amount || 1)) % 360;

    // 3 giai đoạn theo động học gia tốc đều, vận tốc liên tục giữa các đoạn:
    // (1) quay nhanh: tăng tốc từ 0 lên đỉnh V1; (2) quay chậm lại: giảm tốc V1 → V2;
    // (3) chuẩn bị dừng: giảm tốc V2 → 0, dừng đúng vào miếng kết quả.
    const D1 = 3 * 360;
    const T1 = 1200;
    const V1 = (2 * D1) / T1;

    const D3 = 2 * 360 + offset;
    const T3 = 1800;
    const V2 = (2 * D3) / T3;

    const D2 = 5 * 360;
    const T2 = (2 * D2) / (V1 + V2);

    rotate.value = withSequence(
      withTiming(currentRot + D1, { duration: T1, easing: Easing.in(Easing.quad) }),
      withTiming(currentRot + D1 + D2, { duration: T2, easing: accelEasing(V1, V2) }),
      withTiming(currentRot + D1 + D2 + D3, { duration: T3, easing: Easing.out(Easing.quad) })
    );

    setTimeout(() => {
      setSpinning(false);
      setParticles(getParticlesFor(amount || 1));
    }, T1 + T2 + T3);
  };

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={[styles.wrap, result !== null && !spinning && styles.wrapWithResult]}>
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

        {particles.length > 0 && (
          <View style={styles.particleContainer} pointerEvents="none">
            {particles.map((emoji, index) => (
              <ConfettiParticle key={index} emoji={emoji} />
            ))}
          </View>
        )}
      </View>

      {result !== null && !spinning ? (
        <ResultCard result={result} />
      ) : (
        <Text style={styles.hint}>{spinning ? 'Đang quay...' : 'Chạm vào nút Quay nhé!'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, marginBottom: 16 },
  wrapWithResult: { marginBottom: 32 },
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
  resultCard: {
    backgroundColor: '#fffdf6',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#FFD166',
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#c47f17',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    marginTop: 8,
  },
  resultCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF6B6B',
    letterSpacing: 1.2,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#c47f17',
  },
  resultEmoji: {
    fontSize: 32,
  },
  particleContainer: {
    position: 'absolute',
    top: 16 + RADIUS,
    left: SIZE / 2,
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
