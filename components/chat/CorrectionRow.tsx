import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Correction } from '../../lib/types';

interface CorrectionRowProps {
  correction: Correction;
}

export function CorrectionRow({ correction }: CorrectionRowProps) {
  return (
    <View style={styles.corrRow}>
      <View style={styles.corrBefore}>
        <Text style={styles.corrLabel}>Sai</Text>
        <Text style={styles.corrOriginal}>{correction.original}</Text>
      </View>
      <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} style={{ marginTop: 2 }} />
      <View style={styles.corrAfter}>
        <Text style={styles.corrLabel}>Đúng</Text>
        <Text style={styles.corrFixed}>{correction.fixed}</Text>
      </View>
      {correction.explanation ? (
        <Text style={styles.corrExplain}>{correction.explanation}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  corrRow: { gap: 4 },
  corrBefore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrAfter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, width: 28 },
  corrOriginal: { fontSize: 13, color: Colors.error, textDecorationLine: 'line-through' },
  corrFixed: { fontSize: 13, color: Colors.success, fontWeight: '600' },
  corrExplain: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },
});
