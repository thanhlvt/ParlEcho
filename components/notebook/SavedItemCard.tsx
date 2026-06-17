import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { SavedItem } from '../../lib/types';

interface SavedItemCardProps {
  item: SavedItem;
  onSpeak: (item: SavedItem) => void;
  speakingItemId: string | null;
  onPractice: (item: SavedItem) => void;
  onDelete: (item: SavedItem) => void;
}

export const SavedItemCard: React.FC<SavedItemCardProps> = ({
  item,
  onSpeak,
  speakingItemId,
  onPractice,
  onDelete,
}) => {
  const isEn = item.language_id === 'en';
  const typeLabel =
    item.type === 'word' ? 'Từ vựng' : item.type === 'phrase' ? 'Mẫu câu' : 'Lỗi sai';
  const typeColor =
    item.type === 'word'
      ? '#3B82F6'
      : item.type === 'phrase'
      ? '#10B981'
      : '#F59E0B';

  const dateStr = new Date(item.created_at).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: isEn ? '#EEF2FF' : '#FFF5F5' }]}>
            <Text style={[styles.badgeText, { color: isEn ? Colors.en : Colors.ja }]}>
              {isEn ? '🇬🇧 Tiếng Anh' : '🇯🇵 Tiếng Nhật'}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: typeColor + '15' }]}>
            <Text style={[styles.badgeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
        </View>
        <Text style={styles.dateText}>{dateStr}</Text>
      </View>

      <Text style={styles.cardContent}>{item.content}</Text>

      {item.translation && (
        <Text style={styles.cardTranslation}>{item.translation}</Text>
      )}

      {item.note && (
        <View style={styles.noteBox}>
          <Text style={styles.noteText} numberOfLines={3}>
            📝 {item.note}
          </Text>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onSpeak(item)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={speakingItemId === item.id ? 'stop-circle' : 'volume-high-outline'}
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.actionBtnText}>Nghe</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onPractice(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="mic-outline" size={18} color={Colors.primary} />
          <Text style={styles.actionBtnText}>Luyện đọc</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { marginLeft: 'auto' }]}
          onPress={() => onDelete(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  cardContent: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: 6,
  },
  cardTranslation: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  noteBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
});
