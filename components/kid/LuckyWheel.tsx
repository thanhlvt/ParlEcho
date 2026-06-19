import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface LuckyWheelProps {
  /** Kết quả sau khi quay (null = chưa quay) */
  result: number | null;
  onSpin: () => void;
}

// Vòng quay may mắn — thưởng thêm khi đạt tròn 3 sao (Reward System). Quay 1 lần/phiên,
// xoay nhiều vòng rồi dừng lại để tạo cảm giác hồi hộp trước khi hiện kết quả.
export function LuckyWheel({ result, onSpin }: LuckyWheelProps) {
  const rotate = useSharedValue(0);
  const [spinning, setSpinning] = useState(false);

  const handlePress = () => {
    if (spinning || result !== null) return;
    setSpinning(true);
    rotate.value = withTiming(360 * 4 + Math.random() * 360, { duration: 1800 });
    setTimeout(onSpin, 1800);
  };

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Tròn 3 sao! Quay vòng quay may mắn 🎡</Text>
      <TouchableOpacity
        onPress={handlePress}
        disabled={spinning || result !== null}
        activeOpacity={0.85}
      >
        <Animated.Text style={[styles.wheel, style]}>🎡</Animated.Text>
      </TouchableOpacity>
      {result !== null ? (
        <Text style={styles.resultText}>Con quay được +{result} 🍪</Text>
      ) : (
        <Text style={styles.hint}>{spinning ? 'Đang quay...' : 'Chạm vào vòng quay nhé!'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: '#c47f17', textAlign: 'center' },
  wheel: { fontSize: 64 },
  hint: { fontSize: 13, color: '#888' },
  resultText: { fontSize: 16, fontWeight: '800', color: '#c47f17' },
});
