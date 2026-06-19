import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Mission } from '../../lib/types';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Mới bắt đầu',
  intermediate: 'Khá',
  advanced: 'Giỏi',
};

export default function MissionsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { profile } = useProfile();

  const [missions, setMissions] = useState<Mission[]>([]);

  useFocusEffect(
    useCallback(() => {
      const languageId = profile?.active_language_id ?? 'en';
      supabase
        .from('missions')
        .select('*')
        .eq('language_id', languageId)
        .order('created_at')
        .then(({ data }) => {
          if (data) setMissions(data as Mission[]);
        });
    }, [profile?.active_language_id]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Chọn nhiệm vụ 🎯</Text>
      <Text style={styles.subtitle}>Cùng bạn đồng hành hoàn thành nhiệm vụ nhé!</Text>

      <FlatList
        data={missions}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Chưa có nhiệm vụ nào, quay lại sau nhé!</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/(kid)/mission-live?missionId=${item.id}` as Href)}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardMeta}>{LEVEL_LABEL[item.level] ?? item.level}</Text>
              <Text style={styles.cardMeta}>{item.step_count} bước</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 24 },
    title: { fontSize: 26, fontWeight: '800', color: colors.primary, marginTop: 12 },
    subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 6, marginBottom: 8 },
    list: { paddingVertical: 8, gap: 12 },
    empty: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.border,
      padding: 18,
    },
    cardTitle: { fontSize: 19, fontWeight: '800', color: colors.textPrimary },
    cardMetaRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
    cardMeta: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  });
