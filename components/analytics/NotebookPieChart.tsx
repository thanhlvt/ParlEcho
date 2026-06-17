import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { ProgressRing } from './ProgressRing';

interface NotebookPieChartProps {
  wordCount: number;
  phraseCount: number;
  mistakeCount: number;
}

export function NotebookPieChart({
  wordCount,
  phraseCount,
  mistakeCount,
}: NotebookPieChartProps) {
  const total = wordCount + phraseCount + mistakeCount;

  // Tính tỷ lệ và phần trăm cân bằng (Largest Remainder Method)
  let pctWord = 0;
  let pctPhrase = 0;
  let pctMistake = 0;

  if (total > 0) {
    const rawWord = (wordCount / total) * 100;
    const rawPhrase = (phraseCount / total) * 100;
    const rawMistake = (mistakeCount / total) * 100;

    const floorWord = Math.floor(rawWord);
    const floorPhrase = Math.floor(rawPhrase);
    const floorMistake = Math.floor(rawMistake);

    const remWord = rawWord - floorWord;
    const remPhrase = rawPhrase - floorPhrase;
    const remMistake = rawMistake - floorMistake;

    const sumFloor = floorWord + floorPhrase + floorMistake;
    const diff = 100 - sumFloor;

    let pW = floorWord;
    let pP = floorPhrase;
    let pM = floorMistake;

    if (diff > 0) {
      const items = [];
      if (wordCount > 0) items.push({ key: 'word', rem: remWord });
      if (phraseCount > 0) items.push({ key: 'phrase', rem: remPhrase });
      if (mistakeCount > 0) items.push({ key: 'mistake', rem: remMistake });

      // Sắp xếp giảm dần theo phần dư
      items.sort((a, b) => b.rem - a.rem);

      for (let i = 0; i < diff && i < items.length; i++) {
        if (items[i].key === 'word') pW += 1;
        else if (items[i].key === 'phrase') pP += 1;
        else if (items[i].key === 'mistake') pM += 1;
      }
    }

    pctWord = pW;
    pctPhrase = pP;
    pctMistake = pM;
  }

  // Tính tỷ lệ thực tế cho việc vẽ cung tròn
  const pWord = total > 0 ? wordCount / total : 0;
  const pPhrase = total > 0 ? phraseCount / total : 0;
  const pMistake = total > 0 ? mistakeCount / total : 0;

  // Tính góc xoay tích lũy (độ)
  const rotWord = 0;
  const rotPhrase = pWord * 360;
  const rotMistake = (pWord + pPhrase) * 360;

  const size = 130;
  const strokeWidth = 14;

  const categories = [
    {
      key: 'word',
      label: 'Từ vựng',
      count: wordCount,
      percentage: pctWord,
      color: Colors.success,
      icon: '📝',
    },
    {
      key: 'phrase',
      label: 'Mẫu câu',
      count: phraseCount,
      percentage: pctPhrase,
      color: Colors.warning,
      icon: '💬',
    },
    {
      key: 'mistake',
      label: 'Lỗi sai',
      count: mistakeCount,
      percentage: pctMistake,
      color: Colors.error,
      icon: '⚠️',
    },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Cơ cấu Sổ tay ôn tập</Text>

      <View style={styles.chartContainer}>
        {/* Biểu đồ Donut bằng CSS xoay xếp lớp */}
        <View style={[styles.donutWrapper, { width: size, height: size }]}>
          {total === 0 ? (
            // Trạng thái trống (Chưa có dữ liệu)
            <ProgressRing
              size={size}
              progress={1}
              strokeWidth={strokeWidth}
              color="#E5E7EB"
              backgroundColor="transparent"
            >
              <Text style={styles.centerText}>0 mục</Text>
            </ProgressRing>
          ) : (
            <>
              {/* Lớp nền xám của track */}
              <View
                style={[
                  styles.absoluteTrack,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: strokeWidth,
                    borderColor: Colors.surfaceAlt,
                  },
                ]}
              />

              {/* Phân khúc 1: Từ vựng */}
              {wordCount > 0 && (
                <View style={[styles.absoluteSegment, { transform: [{ rotate: `${rotWord}deg` }] }]}>
                  <ProgressRing
                    size={size}
                    progress={pWord}
                    strokeWidth={strokeWidth}
                    color={Colors.success}
                    backgroundColor="transparent"
                  />
                </View>
              )}

              {/* Phân khúc 2: Mẫu câu */}
              {phraseCount > 0 && (
                <View style={[styles.absoluteSegment, { transform: [{ rotate: `${rotPhrase}deg` }] }]}>
                  <ProgressRing
                    size={size}
                    progress={pPhrase}
                    strokeWidth={strokeWidth}
                    color={Colors.warning}
                    backgroundColor="transparent"
                  />
                </View>
              )}

              {/* Phân khúc 3: Lỗi sai */}
              {mistakeCount > 0 && (
                <View style={[styles.absoluteSegment, { transform: [{ rotate: `${rotMistake}deg` }] }]}>
                  <ProgressRing
                    size={size}
                    progress={pMistake}
                    strokeWidth={strokeWidth}
                    color={Colors.error}
                    backgroundColor="transparent"
                  />
                </View>
              )}

              {/* Nội dung chính giữa Donut */}
              <View style={styles.centerValueContainer}>
                <Text style={styles.centerCount}>{total}</Text>
                <Text style={styles.centerLabel}>mục đã lưu</Text>
              </View>
            </>
          )}
        </View>

        {/* Bảng chú giải (Legend) */}
        <View style={styles.legendContainer}>
          {categories.map((cat) => (
            <View key={cat.key} style={styles.legendRow}>
              <View style={[styles.colorIndicator, { backgroundColor: cat.color }]} />
              <View style={styles.legendDetails}>
                <Text style={styles.legendLabel}>
                  {cat.icon} {cat.label}
                </Text>
                <Text style={styles.legendValue}>
                  {cat.count} mục ({cat.percentage}%)
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 16,
  },
  donutWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  absoluteTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  absoluteSegment: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  centerText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  centerValueContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerCount: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  centerLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  legendContainer: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorIndicator: {
    width: 6,
    height: 24,
    borderRadius: 3,
  },
  legendDetails: {
    flex: 1,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  legendValue: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
