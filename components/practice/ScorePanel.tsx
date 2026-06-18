import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { PronounceApiResponse } from '../../lib/types';

interface ScorePanelProps {
  result: PronounceApiResponse;
}

export function ScorePanel({ result }: ScorePanelProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const score = result.overall_score ?? 0;
  const color = score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.error;
  const label = score >= 80 ? '🎉 Tốt lắm!' : score >= 60 ? '👍 Khá!' : '💪 Luyện thêm!';

  return (
    <View style={styles.scorePanel}>
      <View style={styles.scoreHeader}>
        <Text style={[styles.scoreNum, { color }]}>{Math.round(score)}</Text>
        <Text style={styles.scoreDen}>/100</Text>
        <Text style={styles.scoreLabel}>{label}</Text>
      </View>

      <View style={styles.scoreRow}>
        {[
          { label: 'Chính xác', value: result.accuracy_score },
          { label: 'Trôi chảy', value: result.fluency_score },
          { label: 'Đầy đủ', value: result.completeness_score },
        ].map(({ label, value }) => (
          <View key={label} style={styles.scorePill}>
            <Text style={styles.pillLabel}>{label}</Text>
            <Text style={styles.pillValue}>{Math.round(value ?? 0)}</Text>
          </View>
        ))}
      </View>

      {result.recognized_text ? (
        <Text style={styles.recognized}>Nhận ra: &quot;{result.recognized_text}&quot;</Text>
      ) : null}
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    scorePanel: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      padding: 12,
      marginTop: 10,
      marginBottom: 8,
      gap: 8,
    },
    scoreHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    scoreNum: { fontSize: 28, fontWeight: '800' },
    scoreDen: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
    scoreLabel: { marginLeft: 8, fontSize: 14 },
    scoreRow: { flexDirection: 'row', gap: 8 },
    scorePill: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 8,
      alignItems: 'center',
    },
    pillLabel: { fontSize: 10, color: colors.textMuted, marginBottom: 2 },
    pillValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
    recognized: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
  });
