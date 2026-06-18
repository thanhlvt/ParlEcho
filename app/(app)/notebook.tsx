import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Stack, useFocusEffect } from 'expo-router';
import { useSidebar } from './_layout';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { supabase } from '../../lib/supabase';
import { SavedItem } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';

import { SavedItemCard } from '../../components/notebook/SavedItemCard';
import { FlashcardModal } from '../../components/notebook/FlashcardModal';
import { PronouncePracticeModal } from '../../components/notebook/PronouncePracticeModal';

type FilterType = 'all' | 'word' | 'phrase' | 'mistake';
type FilterLang = 'all' | 'en' | 'ja';

export default function NotebookScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const { toggleSidebar } = useSidebar();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterLang, setFilterLang] = useState<FilterLang>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // TTS states
  const [speakingItemId, setSpeakingItemId] = useState<string | null>(null);

  // Modal states
  const [practiceItem, setPracticeItem] = useState<SavedItem | null>(null);
  const [isFlashcardMode, setIsFlashcardMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchItems();
      return () => {
        Speech.stop();
        setSpeakingItemId(null);
      };
    }, [user?.id]),
  );

  async function fetchItems() {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data ?? []);
    } catch (err) {
      console.error(err);
      Alert.alert('Lỗi', 'Không thể tải danh sách sổ tay.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    fetchItems();
  }

  // ── Speech TTS ───────────────────────────────────────────────────────
  async function handleSpeak(item: SavedItem) {
    if (speakingItemId === item.id) {
      Speech.stop();
      setSpeakingItemId(null);
      return;
    }

    setSpeakingItemId(item.id);
    const options = {
      language: item.language_id === 'ja' ? 'ja-JP' : 'en-US',
      onDone: () => setSpeakingItemId(null),
      onError: () => setSpeakingItemId(null),
    };

    // Clean content to read only the main word (ignore translations/notes after delimiters)
    // 1. Split by common delimiters that have surrounding spaces (protect compound words like self-esteem)
    let speakText = item.content.split(/\s+[\-–—]\s+/)[0];
    // 2. Split by other delimiters with optional spaces (colon, tilde/wave tilde)
    speakText = speakText.split(/\s*[:：~～]\s*/)[0];
    // 3. Split by half-width and full-width open parentheses
    speakText = speakText.split(/[\(（]/)[0];

    Speech.speak(speakText.trim(), options);
  }

  // ── Delete Item ──────────────────────────────────────────────────────
  function handleDelete(item: SavedItem) {
    Alert.alert('Xác nhận xóa', 'Bạn có chắc chắn muốn xóa mục này khỏi Sổ tay ôn tập?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('saved_items').delete().eq('id', item.id);
            if (error) throw error;
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          } catch (err) {
            console.error(err);
            Alert.alert('Lỗi', 'Không thể xóa mục.');
          }
        },
      },
    ]);
  }

  // ── Filter Data ─────────────────────────────────────────────────────
  const filteredItems = items.filter((item) => {
    const typeMatch = filterType === 'all' || item.type === filterType;
    const langMatch = filterLang === 'all' || item.language_id === filterLang;
    const searchMatch =
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.translation && item.translation.toLowerCase().includes(searchQuery.toLowerCase()));
    return typeMatch && langMatch && searchMatch;
  });

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Header */}
      <View style={styles.customHeader}>
        <TouchableOpacity onPress={toggleSidebar} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="menu" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.customHeaderTitle}>Sổ tay ôn tập</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Filter bar */}
      <View style={styles.filterContainer}>
        {/* Search Input */}
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm kiếm từ vựng, mẫu câu..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Language selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <Pressable
            style={[styles.filterTab, filterLang === 'all' && styles.filterTabActive]}
            onPress={() => setFilterLang('all')}
          >
            <Text
              style={[styles.filterTabText, filterLang === 'all' && styles.filterTabTextActive]}
            >
              Tất cả ngôn ngữ
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterTab, filterLang === 'en' && styles.filterTabActive]}
            onPress={() => setFilterLang('en')}
          >
            <Text style={[styles.filterTabText, filterLang === 'en' && styles.filterTabTextActive]}>
              English
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterTab, filterLang === 'ja' && styles.filterTabActive]}
            onPress={() => setFilterLang('ja')}
          >
            <Text style={[styles.filterTabText, filterLang === 'ja' && styles.filterTabTextActive]}>
              Japanese
            </Text>
          </Pressable>
        </ScrollView>

        {/* Type selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <Pressable
            style={[styles.filterTabSub, filterType === 'all' && styles.filterTabSubActive]}
            onPress={() => setFilterType('all')}
          >
            <Text
              style={[
                styles.filterTabSubText,
                filterType === 'all' && styles.filterTabSubTextActive,
              ]}
            >
              Tất cả loại
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterTabSub, filterType === 'word' && styles.filterTabSubActive]}
            onPress={() => setFilterType('word')}
          >
            <Text
              style={[
                styles.filterTabSubText,
                filterType === 'word' && styles.filterTabSubTextActive,
              ]}
            >
              Từ vựng
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterTabSub, filterType === 'phrase' && styles.filterTabSubActive]}
            onPress={() => setFilterType('phrase')}
          >
            <Text
              style={[
                styles.filterTabSubText,
                filterType === 'phrase' && styles.filterTabSubTextActive,
              ]}
            >
              Mẫu câu
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterTabSub, filterType === 'mistake' && styles.filterTabSubActive]}
            onPress={() => setFilterType('mistake')}
          >
            <Text
              style={[
                styles.filterTabSubText,
                filterType === 'mistake' && styles.filterTabSubTextActive,
              ]}
            >
              Lỗi sai
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Header action button for Flashcards */}
      {filteredItems.length > 0 && (
        <TouchableOpacity
          style={styles.studyBtn}
          onPress={() => {
            setIsFlashcardMode(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="school" size={20} color="#fff" />
          <Text style={styles.studyBtnText}>Học Flashcard ({filteredItems.length})</Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />
      ) : filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>{items.length === 0 ? '📚' : '🔍'}</Text>
          <Text style={styles.emptyText}>
            {items.length === 0
              ? 'Chưa có mục nào được lưu trong Sổ tay.'
              : 'Không tìm thấy mục nào khớp với tìm kiếm.'}
          </Text>
          {items.length > 0 && (
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => {
                setSearchQuery('');
                setFilterType('all');
                setFilterLang('all');
              }}
            >
              <Text style={styles.resetBtnText}>Xóa bộ lọc</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SavedItemCard
              item={item}
              onSpeak={handleSpeak}
              speakingItemId={speakingItemId}
              onPractice={(i) => setPracticeItem(i)}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {/* ── MODAL: PRONUNCIATION PRACTICE ────────────────────────────────── */}
      <PronouncePracticeModal item={practiceItem} onClose={() => setPracticeItem(null)} />

      {/* ── MODAL: FLASHCARD STUDY ─────────────────────────────────────── */}
      <FlashcardModal
        visible={isFlashcardMode}
        onClose={() => setIsFlashcardMode(false)}
        items={filteredItems}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    loader: { flex: 1, justifyContent: 'center' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },

    // Filters
    filterContainer: {
      backgroundColor: colors.surface,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    filterScroll: {
      paddingHorizontal: 16,
      gap: 8,
      marginVertical: 4,
    },
    filterTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterTabText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    filterTabTextActive: {
      color: '#fff',
    },

    filterTabSub: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: '#F3F4F6',
    },
    filterTabSubActive: {
      backgroundColor: colors.primaryLight,
    },
    filterTabSubText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    filterTabSubTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },

    studyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      marginHorizontal: 16,
      marginVertical: 12,
      paddingVertical: 12,
      borderRadius: 12,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 3,
    },
    studyBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },

    listContent: {
      padding: 16,
      gap: 16,
      paddingBottom: 32,
    },

    customHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    customHeaderTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    backBtn: {
      padding: 4,
    },

    // Search Bar styles
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      padding: 0,
    },
    resetBtn: {
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      marginTop: 16,
    },
    resetBtnText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 13,
    },
  });
