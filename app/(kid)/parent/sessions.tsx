import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SwipeableRow } from '../../../components/SwipeableRow';
import { supabase } from '../../../lib/supabase';
import { Conversation } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useTheme } from '../../../providers/ThemeProvider';

const KID_MODES = ['kid_guided', 'kid_exploration'];
const MODE_LABEL: Record<string, string> = {
  kid_guided: 'Nhiệm vụ hội thoại',
  kid_exploration: 'Khám phá ảnh',
};

export default function ParentSessionsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const loadConversations = useCallback(() => {
    if (!user) return;
    supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .in('mode', KID_MODES)
      .order('started_at', { ascending: false })
      .then(({ data }) => {
        if (data) setConversations(data as Conversation[]);
      });
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations]),
  );

  function confirmDeleteSession(conversationId: string) {
    Alert.alert('Xoá phiên hội thoại', 'Bạn có chắc chắn muốn xoá phiên hội thoại này không?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá', style: 'destructive', onPress: () => deleteSession(conversationId) },
    ]);
  }

  async function deleteSession(conversationId: string) {
    try {
      const { error } = await supabase.from('conversations').delete().eq('id', conversationId);
      if (error) throw error;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    } catch (err: any) {
      console.error('[ParentSessions] delete error:', err);
      Alert.alert('Lỗi', 'Không thể xoá phiên hội thoại: ' + err.message);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/(kid)/parent/dashboard' as Href)}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Các phiên hội thoại</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có phiên nào.</Text>}
        renderItem={({ item }) => (
          <SwipeableRow
            onDelete={() => confirmDeleteSession(item.id)}
            isOpen={openRowId === item.id}
            onSwipeOpen={() => setOpenRowId(item.id)}
            onSwipeClose={() => {
              if (openRowId === item.id) setOpenRowId(null);
            }}
          >
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/(kid)/parent/session/${item.id}` as Href)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{MODE_LABEL[item.mode] ?? item.mode}</Text>
                <Text style={styles.cardMeta}>
                  {new Date(item.started_at).toLocaleString('vi-VN')}
                </Text>
                {item.summary?.offtopic_turns?.length ? (
                  <Text style={styles.offtopicTag}>
                    ⚠️ {item.summary.offtopic_turns.length} lượt lạc đề
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </SwipeableRow>
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    list: { padding: 16, gap: 10 },
    empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    offtopicTag: { fontSize: 11, color: colors.warning, marginTop: 4, fontWeight: '600' },
  });
