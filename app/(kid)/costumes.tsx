import { Ionicons } from '@expo/vector-icons';
import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { purchaseCostume } from '../../lib/biscuits';
import { supabase } from '../../lib/supabase';
import { Costume } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function CostumesScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const { profile, refresh: refreshProfile, refreshActiveCostume } = useProfile();

  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [ownedCostumeIds, setOwnedCostumeIds] = useState<Set<string>>(new Set());
  const [wornCostumeId, setWornCostumeId] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [wearingId, setWearingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      if (profile?.companion_id) {
        supabase
          .from('costumes')
          .select('*')
          .eq('companion_id', profile.companion_id)
          .order('sort_order')
          .then(({ data }) => setCostumes((data as Costume[]) ?? []));

        supabase
          .from('companion_costume_state')
          .select('active_costume_id')
          .eq('user_id', user.id)
          .eq('companion_id', profile.companion_id)
          .maybeSingle()
          .then(({ data }) =>
            setWornCostumeId((data as { active_costume_id: string } | null)?.active_costume_id ?? null),
          );
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

  // Mua costume bằng biscuit — qua RPC purchase_costume (atomic, xem lib/biscuits.ts).
  async function buyCostume(costume: Costume) {
    if (!user || buyingId) return;
    setBuyingId(costume.id);
    const ok = await purchaseCostume(user.id, costume.id);
    if (ok) {
      setOwnedCostumeIds((prev) => new Set(prev).add(costume.id));
      await refreshProfile();
    } else {
      Alert.alert('Chưa đủ bánh', `Con cần ${costume.price_biscuits} 🍪 để mua trang phục này.`);
    }
    setBuyingId(null);
  }

  // Mặc/cởi trang phục — lưu riêng theo companion hiện tại trong companion_costume_state
  // (RLS "own" đã cho phép tự ghi), không đụng tới costume đang mặc của companion khác.
  // Chạm vào costume đang mặc để cởi ra (xoá row khỏi bảng).
  async function toggleWear(costume: Costume) {
    if (!user || !profile?.companion_id || wearingId) return;
    setWearingId(costume.id);
    const isCurrentlyWorn = wornCostumeId === costume.id;
    const { error } = isCurrentlyWorn
      ? await supabase
          .from('companion_costume_state')
          .delete()
          .eq('user_id', user.id)
          .eq('companion_id', profile.companion_id)
      : await supabase.from('companion_costume_state').upsert({
          user_id: user.id,
          companion_id: profile.companion_id,
          active_costume_id: costume.id,
        });
    if (!error) {
      setWornCostumeId(isCurrentlyWorn ? null : costume.id);
      await refreshActiveCostume();
    }
    setWearingId(null);
  }

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
        <Text style={styles.title}>Tủ trang phục 👕</Text>
        <Text style={styles.shopHint}>
          🍪 {profile?.biscuit_count ?? 0} — dùng bánh để mua trang phục
        </Text>

        <View style={styles.grid}>
          {costumes.map((c) => {
            const owned = ownedCostumeIds.has(c.id);
            const canAfford = (profile?.biscuit_count ?? 0) >= c.price_biscuits;
            const isWorn = wornCostumeId === c.id;
            return (
              <View key={c.id} style={[styles.cell, isWorn && styles.cellWorn]}>
                <View style={styles.cellEmojiArea}>
                  <Text style={[styles.cellEmoji, owned && styles.cellEmojiOwned]}>{c.emoji}</Text>
                </View>
                <Text style={styles.cellLabel}>{c.name}</Text>
                {owned ? (
                  <TouchableOpacity
                    style={[styles.wearBtn, isWorn && styles.wearBtnActive]}
                    onPress={() => toggleWear(c)}
                    disabled={wearingId === c.id}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.wearBtnText, isWorn && styles.wearBtnTextActive]}>
                      {isWorn ? 'Đang mặc ✓' : 'Mặc vào'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.buyBtn, !canAfford && styles.buyBtnDisabled]}
                    onPress={() => buyCostume(c)}
                    disabled={buyingId === c.id}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.buyBtnText, !canAfford && styles.buyBtnTextDisabled]}>
                      🍪 {c.price_biscuits}
                    </Text>
                  </TouchableOpacity>
                )}
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
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    cell: {
      width: 92,
      height: 140,
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      paddingVertical: 14,
    },
    cellEmojiArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    cellEmoji: { fontSize: 32, opacity: 0.45 },
    cellEmojiOwned: { fontSize: 48, opacity: 1 },
    cellLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'center',
    },
    shopHint: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 4 },
    buyBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 2,
    },
    buyBtnDisabled: { backgroundColor: colors.surfaceAlt },
    buyBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    buyBtnTextDisabled: { color: colors.textMuted },
    cellWorn: { borderColor: colors.primary },
    wearBtn: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 2,
    },
    wearBtnActive: { backgroundColor: colors.primary },
    wearBtnText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
    wearBtnTextActive: { color: '#fff' },
    empty: { fontSize: 14, color: colors.textMuted },
  });
