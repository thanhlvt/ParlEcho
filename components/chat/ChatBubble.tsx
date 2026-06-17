import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { LanguageId, Message } from '../../lib/types';
import { CorrectionRow } from './CorrectionRow';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';

export type UIMessage = Pick<
  Message,
  'id' | 'role' | 'text' | 'translation' | 'furigana' | 'romaji' | 'corrections' | 'hints'
> & { pending?: boolean };

interface ChatBubbleProps {
  message: UIMessage;
  languageId: LanguageId;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function ChatBubble({
  message,
  languageId,
  expanded,
  onToggleExpand,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const { user } = useAuth();
  const [showTranslation, setShowTranslation] = useState(false);
  const [savedPhrase, setSavedPhrase] = useState(false);
  const [savedCorrections, setSavedCorrections] = useState<Record<number, boolean>>({});

  async function handleSavePhrase() {
    if (!user) return;
    try {
      // Check duplicate
      const { data: existing, error: checkError } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .ilike('content', message.text.trim())
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        Alert.alert('Thông báo', 'Mẫu câu này đã tồn tại trong Sổ tay.');
        setSavedPhrase(true);
        return;
      }

      const isOptimistic = message.id.startsWith('opt-') || message.id.startsWith('ai-');
      const { error } = await supabase.from('saved_items').insert({
        user_id: user.id,
        language_id: languageId,
        type: 'phrase',
        content: message.text,
        translation: message.translation,
        source_message_id: isOptimistic ? null : message.id,
      });
      if (error) throw error;
      setSavedPhrase(true);
      Alert.alert('Thành công', 'Đã lưu mẫu câu vào Sổ tay.');
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể lưu mẫu câu.');
    }
  }

  async function handleSaveCorrection(c: { original: string; fixed: string; explanation: string }, index: number) {
    if (!user) return;
    try {
      // Check duplicate
      const { data: existing, error: checkError } = await supabase
        .from('saved_items')
        .select('id')
        .eq('user_id', user.id)
        .ilike('content', c.fixed.trim())
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        Alert.alert('Thông báo', 'Lỗi sai này đã tồn tại trong Sổ tay.');
        setSavedCorrections(prev => ({ ...prev, [index]: true }));
        return;
      }

      const isOptimistic = message.id.startsWith('opt-') || message.id.startsWith('ai-');
      const { error } = await supabase.from('saved_items').insert({
        user_id: user.id,
        language_id: languageId,
        type: 'mistake',
        content: c.fixed,
        translation: c.original,
        note: c.explanation,
        source_message_id: isOptimistic ? null : message.id,
      });
      if (error) throw error;
      setSavedCorrections(prev => ({ ...prev, [index]: true }));
      Alert.alert('Thành công', 'Đã lưu lỗi sai vào Sổ tay.');
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể lưu lỗi sai.');
    }
  }

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatarDot}>
          <Text style={{ fontSize: 14 }}>🤖</Text>
        </View>
      )}

      <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
        {/* Main bubble */}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {message.text}
          </Text>

          {/* Japanese reading aids */}
          {!isUser && languageId === 'ja' && message.furigana ? (
            <Text style={styles.furigana}>{message.furigana}</Text>
          ) : null}
          {!isUser && languageId === 'ja' && message.romaji ? (
            <Text style={styles.romaji}>{message.romaji}</Text>
          ) : null}

          {/* Translation text */}
          {!isUser && showTranslation && message.translation ? (
            <Text style={styles.translationText}>{message.translation}</Text>
          ) : null}

          {/* Translation toggle & Save bookmark */}
          {!isUser && (
            <View style={styles.bubbleActions}>
              {message.translation ? (
                <Pressable onPress={() => setShowTranslation((v) => !v)} style={styles.transBtn}>
                  <Text style={styles.transBtnText}>
                    {showTranslation ? 'Ẩn dịch ▲' : 'Xem dịch ▼'}
                  </Text>
                </Pressable>
              ) : <View />}
              
              <Pressable onPress={handleSavePhrase} disabled={savedPhrase} style={styles.saveBubbleBtn} hitSlop={8}>
                <Ionicons 
                  name={savedPhrase ? 'bookmark' : 'bookmark-outline'} 
                  size={15} 
                  color={savedPhrase ? Colors.primary : Colors.textMuted} 
                />
              </Pressable>
            </View>
          )}
        </View>

        {/* Corrections chip */}
        {!isUser && message.corrections?.length ? (
          <Pressable style={styles.corrChip} onPress={onToggleExpand}>
            <Ionicons
              name={expanded ? 'checkmark-circle' : 'alert-circle-outline'}
              size={14}
              color={expanded ? Colors.success : Colors.warning}
            />
            <Text style={styles.corrChipText}>
              {message.corrections.length} lỗi cần sửa {expanded ? '▲' : '▼'}
            </Text>
          </Pressable>
        ) : null}

        {/* Corrections detail */}
        {!isUser && expanded && message.corrections?.length ? (
          <View style={styles.corrPanel}>
            {message.corrections.map((c, i) => (
              <CorrectionRow 
                key={i} 
                correction={c} 
                onSave={() => handleSaveCorrection(c, i)}
                isSaved={!!savedCorrections[i]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '90%',
    alignSelf: 'flex-start',
  },
  bubbleRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleWrap: { gap: 4, flex: 1 },
  bubbleWrapUser: { alignItems: 'flex-end' },

  // ── Bubble
  bubble: {
    borderRadius: 18,
    padding: 14,
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  bubbleText: { fontSize: 15, color: Colors.textPrimary, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  furigana: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  romaji: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  transBtn: {},
  transBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  translationText: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  bubbleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
    minWidth: 100,
  },
  saveBubbleBtn: {
    padding: 4,
  },

  // ── Corrections
  corrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  corrChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  corrPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
});
