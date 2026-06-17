import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { SavedItem } from '../../lib/types';

interface FlashcardModalProps {
  visible: boolean;
  onClose: () => void;
  items: SavedItem[];
}

export const FlashcardModal: React.FC<FlashcardModalProps> = ({
  visible,
  onClose,
  items,
}) => {
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const currentFlashcard = items[flashcardIndex];

  function handleNextCard() {
    if (flashcardIndex < items.length - 1) {
      setFlashcardIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  }

  function handlePrevCard() {
    if (flashcardIndex > 0) {
      setFlashcardIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  }

  if (!currentFlashcard) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.flashcardContainer}>
          <View style={styles.flashcardHeader}>
            <Text style={styles.flashcardProgress}>
              Thẻ {flashcardIndex + 1} / {items.length}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Flip Card container */}
          <Pressable
            style={[styles.flashcard, isFlipped && styles.flashcardFlipped]}
            onPress={() => setIsFlipped(!isFlipped)}
          >
            {!isFlipped ? (
              // Mặt trước
              <View style={styles.cardFace}>
                <Text style={styles.cardFaceLang}>
                  {currentFlashcard.language_id === 'en' ? '🇬🇧 English' : '🇯🇵 Japanese'}
                </Text>
                <Text style={styles.cardFaceContent}>{currentFlashcard.content}</Text>
                <Text style={styles.cardFaceHint}>Chạm vào để xem nghĩa mặt sau</Text>
              </View>
            ) : (
              // Mặt sau
              <View style={styles.cardFace}>
                <Text style={styles.cardFaceLangBack}>Nghĩa & Ghi chú</Text>
                <Text style={styles.cardFaceContentBack}>
                  {currentFlashcard.translation || '(Không có dịch nghĩa)'}
                </Text>
                {currentFlashcard.note && (
                  <View style={styles.flashcardNote}>
                    <Text style={styles.flashcardNoteText}>📝 {currentFlashcard.note}</Text>
                  </View>
                )}
                <Text style={styles.cardFaceHint}>Chạm vào để quay lại mặt trước</Text>
              </View>
            )}
          </Pressable>

          {/* Navigation buttons */}
          <View style={styles.flashcardControls}>
            <TouchableOpacity
              style={[styles.flashcardControlBtn, flashcardIndex === 0 && styles.controlBtnDisabled]}
              disabled={flashcardIndex === 0}
              onPress={handlePrevCard}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
              <Text style={styles.controlBtnText}>Trước</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.flashcardControlBtn,
                flashcardIndex === items.length - 1 && styles.controlBtnDisabled,
              ]}
              disabled={flashcardIndex === items.length - 1}
              onPress={handleNextCard}
            >
              <Text style={styles.controlBtnText}>Tiếp theo</Text>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.doneFlashcardBtn}
            onPress={onClose}
          >
            <Text style={styles.doneFlashcardText}>Hoàn thành ôn tập</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  flashcardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
  },
  flashcardHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  flashcardProgress: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  flashcard: {
    width: '100%',
    height: 320,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 5,
  },
  flashcardFlipped: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  cardFace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  cardFaceLang: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  cardFaceLangBack: {
    fontSize: 14,
    color: Colors.success,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  cardFaceContent: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 24,
  },
  cardFaceContentBack: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 16,
  },
  flashcardNote: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 16,
  },
  flashcardNoteText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
  cardFaceHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 'auto',
  },
  flashcardControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 32,
    gap: 16,
  },
  flashcardControlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 14,
    borderRadius: 14,
  },
  controlBtnDisabled: {
    opacity: 0.3,
  },
  controlBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  doneFlashcardBtn: {
    marginTop: 40,
    paddingVertical: 12,
  },
  doneFlashcardText: {
    color: Colors.primaryLight,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
