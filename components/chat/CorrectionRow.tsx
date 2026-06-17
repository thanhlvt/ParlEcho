import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Correction } from '../../lib/types';

interface CorrectionRowProps {
  correction: Correction;
  onSave?: () => void;
  isSaved?: boolean;
}

export function CorrectionRow({ correction, onSave, isSaved }: CorrectionRowProps) {
  return (
    <View style={styles.corrContainer}>
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
      {onSave && (
        <Pressable onPress={onSave} disabled={isSaved} style={styles.saveBtn} hitSlop={8}>
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={isSaved ? Colors.primary : Colors.textMuted}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  corrContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  corrRow: { gap: 4, flex: 1 },
  corrBefore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrAfter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, width: 28 },
  corrOriginal: { fontSize: 13, color: Colors.error, textDecorationLine: 'line-through' },
  corrFixed: { fontSize: 13, color: Colors.success, fontWeight: '600' },
  corrExplain: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  saveBtn: { padding: 4, alignSelf: 'flex-start', marginTop: 2 },
});
