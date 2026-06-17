import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Colors } from '../../constants/Colors';
import { WordScore } from '../../lib/types';

interface WordHighlightProps {
  text: string;
  wordScores: WordScore[];
}

export function WordHighlight({ text, wordScores }: WordHighlightProps) {
  const words = text.trim().split(/\s+/);
  return (
    <Text style={styles.lineText}>
      {words.map((word, i) => {
        const ws = wordScores[i];
        const color =
          !ws || ws.error_type === 'Omission'
            ? Colors.error
            : ws.score >= 85
            ? Colors.success
            : ws.score >= 60
            ? Colors.warning
            : Colors.error;
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

const styles = StyleSheet.create({
  lineText: {
    fontSize: 18,
    color: Colors.textPrimary,
    lineHeight: 28,
    marginBottom: 6,
  },
});
