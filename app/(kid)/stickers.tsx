import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Mission, Sticker } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function StickersScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [ownedStickerIds, setOwnedStickerIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      const languageId = profile?.active_language_id ?? 'en';

      Promise.all([
        supabase.from('missions').select('*').eq('language_id', languageId).order('created_at'),
        user
          ? supabase
              .from('priority_vocab')
              .select('content')
              .eq('user_id', user.id)
              .eq('language_id', languageId)
          : Promise.resolve({ data: [] as { content: string }[] }),
        supabase.from('stickers').select('*'),
        user
          ? supabase.from('user_stickers').select('sticker_id').eq('user_id', user.id)
          : Promise.resolve({ data: [] as { sticker_id: string }[] }),
      ]).then(([missionsRes, vocabRes, stickersRes, userStickersRes]) => {
        // Handle owned stickers
        const ownedIds = new Set(
          (userStickersRes.data ?? []).map((r: { sticker_id: string }) => r.sticker_id)
        );
        setOwnedStickerIds(ownedIds);

        // Sort missions just like in missions.tsx
        const allMissions = (missionsRes.data as Mission[]) ?? [];
        const terms = (vocabRes.data ?? []).map((v) => v.content.toLowerCase());

        const matchedIds = new Set(
          allMissions
            .filter((m) =>
              terms.some(
                (t) => m.title.toLowerCase().includes(t) || m.topic.toLowerCase().includes(t),
              ),
            )
            .map((m) => m.id),
        );

        const sortedMissions = [...allMissions].sort((a, b) => {
          const aPriority = matchedIds.has(a.id) ? 1 : 0;
          const bPriority = matchedIds.has(b.id) ? 1 : 0;
          return bPriority - aPriority;
        });

        // Collect sticker IDs in order of sorted missions
        const orderedStickerIds: string[] = [];
        const seen = new Set<string>();
        for (const m of sortedMissions) {
          const pool = m.sticker_pool ?? [];
          for (const id of pool) {
            if (!seen.has(id)) {
              seen.add(id);
              orderedStickerIds.push(id);
            }
          }
        }

        // Map stickers to their sorted order
        const stickersMap = new Map<string, Sticker>();
        const allStickers = (stickersRes.data as Sticker[]) ?? [];
        allStickers.forEach((s) => stickersMap.set(s.id, s));

        const orderedStickers: Sticker[] = [];
        // First add stickers that belong to the missions
        orderedStickerIds.forEach((id) => {
          const sticker = stickersMap.get(id);
          if (sticker) {
            orderedStickers.push(sticker);
          }
        });
        // Then add any remaining stickers not in the mission pool (preserving sort_order)
        const remainingStickers = allStickers
          .filter((s) => !seen.has(s.id))
          .sort((a, b) => a.sort_order - b.sort_order);
        
        orderedStickers.push(...remainingStickers);

        setStickers(orderedStickers);
      });
    }, [profile?.active_language_id, user]),
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
        <Text style={styles.title}>Album sticker 🎴</Text>

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
