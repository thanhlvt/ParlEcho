import { Ionicons } from '@expo/vector-icons';
import { Href, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  useFocusEffect(
    useCallback(() => {
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
    }, [user]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Các phiên hội thoại' }} />
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có phiên nào.</Text>}
        renderItem={({ item }) => (
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
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
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
