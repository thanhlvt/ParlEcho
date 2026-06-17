import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Correction } from '../../lib/types';

interface CorrectionRowProps {
  correction: Correction;
  onSave?: () => void;
  isSaved?: boolean;
}

export function CorrectionRow({ correction, onSave, isSaved }: CorrectionRowProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.corrContainer}>
      <View style={styles.corrRow}>
        <View style={styles.corrBefore}>
          <Text style={styles.corrLabel}>Sai</Text>
          <Text style={styles.corrOriginal}>{correction.original}</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
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
            color={isSaved ? colors.primary : colors.textMuted}
          />
        </Pressable>
      )}
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  corrContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  corrRow: { gap: 4, flex: 1 },
  corrBefore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrAfter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, width: 28 },
  corrOriginal: { fontSize: 13, color: colors.error, textDecorationLine: 'line-through' },
  corrFixed: { fontSize: 13, color: colors.success, fontWeight: '600' },
  corrExplain: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  saveBtn: { padding: 4, alignSelf: 'flex-start', marginTop: 2 },
});
