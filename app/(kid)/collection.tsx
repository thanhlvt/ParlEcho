import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Costume, Sticker } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function CollectionScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [ownedStickerIds, setOwnedStickerIds] = useState<Set<string>>(new Set());
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [ownedCostumeIds, setOwnedCostumeIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase
        .from('stickers')
        .select('*')
        .order('sort_order')
        .then(({ data }) => setStickers((data as Sticker[]) ?? []));

      supabase
        .from('user_stickers')
        .select('sticker_id')
        .eq('user_id', user.id)
        .then(({ data }) =>
          setOwnedStickerIds(
            new Set((data ?? []).map((r: { sticker_id: string }) => r.sticker_id)),
          ),
        );

      if (profile?.companion_id) {
        supabase
          .from('costumes')
          .select('*')
          .eq('companion_id', profile.companion_id)
          .order('sort_order')
          .then(({ data }) => setCostumes((data as Costume[]) ?? []));
      }

      supabase
        .from('user_costumes')
        .select('costume_id')
        .eq('user_id', user.id)
        .then(({ data }) =>
          setOwnedCostumeIds(
            new Set((data ?? []).map((r: { costume_id: string }) => r.costume_id)),
          ),
        );
    }, [user, profile?.companion_id]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace('/(kid)/home' as Href)}
      >
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        <Text style={styles.backText}>Về nhà</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Bộ sưu tập 🎁</Text>

        <Text style={styles.sectionTitle}>Album sticker</Text>
        <View style={styles.grid}>
          {stickers.map((s) => {
            const owned = ownedStickerIds.has(s.id);
            return (
              <View key={s.id} style={[styles.cell, !owned && styles.cellLocked]}>
                <Text style={styles.cellEmoji}>{owned ? s.emoji : '❓'}</Text>
                <Text style={styles.cellLabel}>{owned ? s.name : '???'}</Text>
              </View>
            );
          })}
          {stickers.length === 0 ? (
            <Text style={styles.empty}>Chưa có sticker nào, hoàn thành nhiệm vụ để mở khoá!</Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Tủ trang phục</Text>
        <View style={styles.grid}>
          {costumes.map((c) => {
            const owned = ownedCostumeIds.has(c.id);
            return (
              <View key={c.id} style={[styles.cell, !owned && styles.cellLocked]}>
                <Text style={styles.cellEmoji}>{owned ? c.emoji : '❓'}</Text>
                <Text style={styles.cellLabel}>{owned ? c.name : '???'}</Text>
              </View>
            );
          })}
          {costumes.length === 0 ? (
            <Text style={styles.empty}>Chưa chọn nhân vật đồng hành.</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    backText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    scroll: { padding: 24, gap: 8 },
    title: { fontSize: 26, fontWeight: '800', color: colors.primary, marginBottom: 8 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: 20,
      marginBottom: 12,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    cell: {
      width: 92,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      paddingVertical: 14,
      gap: 6,
    },
    cellLocked: { opacity: 0.45 },
    cellEmoji: { fontSize: 32 },
    cellLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'center',
    },
    empty: { fontSize: 14, color: colors.textMuted },
  });
