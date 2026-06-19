import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Companion } from '../../components/kid/Companion';
import { CompanionExpression } from '../../components/kid/companionAssets';
import { supabase } from '../../lib/supabase';
import { Companion as CompanionType } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function KidHome() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const { profile, refresh } = useProfile();

  const [companion, setCompanion] = useState<CompanionType | null>(null);
  const [expression, setExpression] = useState<CompanionExpression>('idle');
  const reactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chưa chọn nhân vật → sang màn onboarding.
  useEffect(() => {
    if (profile && !profile.companion_id) {
      router.replace('/(kid)/onboarding' as Href);
    }
  }, [profile, router]);

  // Tải thông tin nhân vật đã chọn.
  useEffect(() => {
    if (!profile?.companion_id) return;
    supabase
      .from('companions')
      .select('*')
      .eq('id', profile.companion_id)
      .single()
      .then(({ data }) => setCompanion((data as CompanionType) ?? null));
  }, [profile?.companion_id]);

  useEffect(() => {
    return () => {
      if (reactTimer.current) clearTimeout(reactTimer.current);
    };
  }, []);

  // Chạm vào nhân vật → cổ vũ một lúc rồi về idle.
  const react = useCallback(() => {
    setExpression('cheering');
    if (reactTimer.current) clearTimeout(reactTimer.current);
    reactTimer.current = setTimeout(() => setExpression('idle'), 1600);
  }, []);

  // TẠM THỜI (Pha 0): nút thoát Kid Mode. Pha 6 sẽ thay bằng cổng PIN phụ huynh.
  async function exitKidMode() {
    if (!user) return;
    await supabase.from('profiles').update({ is_kid_mode: false }).eq('id', user.id);
    await refresh();
  }

  const childName = profile?.child_name ?? profile?.name ?? 'bạn nhỏ';

  return (
    <SafeAreaView style={styles.container}>
      {/* Cổng phụ huynh — không phải nút nổi bật, không có chữ gợi ý cho trẻ. */}
      <TouchableOpacity
        style={styles.parentGateBtn}
        onPress={() => router.push('/(kid)/parent-gate' as Href)}
        hitSlop={10}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.center}>
        <TouchableOpacity activeOpacity={0.9} onPress={react}>
          <Companion companionId={profile?.companion_id} expression={expression} size={180} />
        </TouchableOpacity>

        <Text style={styles.greeting}>
          {companion ? `${companion.name} chào ${childName}!` : `Xin chào ${childName}!`}
        </Text>
        <Text style={styles.note}>Cùng nhau học vui nhé! Chạm vào bạn ấy thử xem 👆</Text>

        <TouchableOpacity
          style={styles.missionBtn}
          onPress={() => router.push('/(kid)/missions' as Href)}
          activeOpacity={0.85}
        >
          <Text style={styles.missionBtnText}>Bắt đầu nhiệm vụ 🎯</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.collectionBtn}
          onPress={() => router.push('/(kid)/exploration' as Href)}
          activeOpacity={0.85}
        >
          <Text style={styles.collectionBtnText}>Khám phá ảnh 🖼️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.collectionBtn}
          onPress={() => router.push('/(kid)/collection' as Href)}
          activeOpacity={0.85}
        >
          <Text style={styles.collectionBtnText}>Bộ sưu tập 🎁</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.exitBtn} onPress={exitKidMode} activeOpacity={0.8}>
        <Text style={styles.exitText}>(Tạm) Thoát Kid Mode</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'space-between',
      paddingBottom: 24,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    parentGateBtn: {
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 1,
      padding: 10,
      opacity: 0.5,
    },
    greeting: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.primary,
      marginTop: 24,
      textAlign: 'center',
    },
    note: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: 12 },
    missionBtn: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingHorizontal: 32,
      paddingVertical: 16,
      marginTop: 28,
    },
    missionBtnText: { fontSize: 18, fontWeight: '800', color: '#fff' },
    collectionBtn: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.border,
      paddingHorizontal: 32,
      paddingVertical: 14,
      marginTop: 14,
    },
    collectionBtnText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    exitBtn: {
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
    },
    exitText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  });
