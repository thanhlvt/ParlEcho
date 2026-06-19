import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { PriorityVocab } from '../../../lib/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useProfile } from '../../../providers/ProfileProvider';
import { useTheme } from '../../../providers/ThemeProvider';

export default function ParentVocabScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { user } = useAuth();
  const { profile } = useProfile();
  const [items, setItems] = useState<PriorityVocab[]>([]);
  const [input, setInput] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('priority_vocab')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setItems(data as PriorityVocab[]);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function addItem() {
    const content = input.trim();
    if (!content || !user) return;
    const { error } = await supabase.from('priority_vocab').insert({
      user_id: user.id,
      language_id: profile?.active_language_id ?? 'en',
      content,
    });
    if (!error) {
      setInput('');
      await load();
    }
  }

  async function removeItem(id: string) {
    await supabase.from('priority_vocab').delete().eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Từ vựng ưu tiên' }} />
      <Text style={styles.hint}>
        Nhiệm vụ liên quan đến từ/câu này sẽ được đẩy lên đầu danh sách nhiệm vụ của trẻ.
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Vd: ice cream, say hello..."
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={addItem}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addItem}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Chưa có từ vựng ưu tiên nào.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item.content}</Text>
            <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    hint: { fontSize: 13, color: colors.textSecondary, padding: 16, paddingBottom: 0 },
    inputRow: { flexDirection: 'row', gap: 10, padding: 16 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { paddingHorizontal: 16, gap: 8, paddingBottom: 24 },
    empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowText: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  });
