import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { WordScore } from '../../lib/types';

interface WordHighlightProps {
  text: string;
  wordScores: WordScore[];
}

export function WordHighlight({ text, wordScores }: WordHighlightProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const words = text.trim().split(/\s+/);
  return (
    <Text style={styles.lineText}>
      {words.map((word, i) => {
        const ws = wordScores[i];
        const color =
          !ws || ws.error_type === 'Omission'
            ? colors.error
            : ws.score >= 85
              ? colors.success
              : ws.score >= 60
                ? colors.warning
                : colors.error;
        return (
          <Text key={i} style={{ color, fontWeight: '700' }}>
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </Text>
        );
      })}
    </Text>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    lineText: {
      fontSize: 18,
      color: colors.textPrimary,
      lineHeight: 28,
      marginBottom: 6,
    },
  });
