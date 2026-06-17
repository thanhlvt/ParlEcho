import React from 'react';
import { View, StyleSheet } from 'react-native';

interface ProgressRingProps {
  size: number;
  progress: number; // Tỷ lệ từ 0 đến 1
  strokeWidth: number;
  color: string;
  backgroundColor: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  size,
  progress,
  strokeWidth,
  color,
  backgroundColor,
  children,
}: ProgressRingProps) {
  const percent = Math.min(Math.max(progress, 0), 1);
  const degrees = percent * 360;

  // Chia làm 2 nửa cung xoay: nửa phải (0 - 180 độ) và nửa trái (180 - 360 độ)
  const rightDegrees = Math.min(degrees, 180);
  const leftDegrees = Math.max(0, degrees - 180);

  const halfSize = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Vòng nền phía dưới */}
      <View
        style={[
          styles.track,
          {
            width: size,
            height: size,
            borderRadius: halfSize,
            borderWidth: strokeWidth,
            borderColor: backgroundColor,
          },
        ]}
      />

      {/* Cung bên phải (hoạt động từ 0% đến 50%) */}
      {degrees > 0 && (
        <View
          style={[
            styles.halfWrapper,
            {
              width: halfSize,
              height: size,
              right: 0,
            },
          ]}
        >
          <View
            style={[
              styles.halfCircle,
              {
                width: size,
                height: size,
                borderRadius: halfSize,
                borderWidth: strokeWidth,
                borderColor: color,
                borderLeftColor: 'transparent',
                borderBottomColor: 'transparent',
                left: -halfSize,
                transform: [{ rotate: `${rightDegrees - 135}deg` }],
              },
            ]}
          />
        </View>
      )}

      {/* Cung bên trái (hoạt động từ 50% đến 100%) */}
      {degrees > 180 && (
        <View
          style={[
            styles.halfWrapper,
            {
              width: halfSize,
              height: size,
              left: 0,
            },
          ]}
        >
          <View
            style={[
              styles.halfCircle,
              {
                width: size,
                height: size,
                borderRadius: halfSize,
                borderWidth: strokeWidth,
                borderColor: color,
                borderRightColor: 'transparent',
                borderTopColor: 'transparent',
                left: 0,
                transform: [{ rotate: `${leftDegrees - 135}deg` }],
              },
            ]}
          />
        </View>
      )}

      {/* Khoảng trống ở giữa chứa nội dung */}
      <View
        style={[
          styles.innerRing,
          {
            width: size - strokeWidth * 2,
            height: size - strokeWidth * 2,
            borderRadius: halfSize - strokeWidth,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  track: {
    position: 'absolute',
  },
  halfWrapper: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  halfCircle: {
    position: 'absolute',
    top: 0,
  },
  innerRing: {
    position: 'absolute',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
