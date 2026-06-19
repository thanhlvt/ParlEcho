import { Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Companion } from '../../components/kid/Companion';
import { supabase } from '../../lib/supabase';
import { Companion as CompanionType } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

export default function KidOnboarding() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useProfile();

  const [companions, setCompanions] = useState<CompanionType[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('companions')
      .select('*')
      .order('sort_order')
      .then(({ data }) => {
        if (data) setCompanions(data as CompanionType[]);
      });
  }, []);

  async function confirm() {
    if (!user || !selected) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ companion_id: selected })
      .eq('id', user.id);
    setSaving(false);
    if (!error) {
      await refresh();
      router.replace('/(kid)/home' as Href);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Chọn người bạn của con!</Text>
      <Text style={styles.subtitle}>Bạn ấy sẽ cùng con học mỗi ngày 💫</Text>

      <ScrollView contentContainerStyle={styles.grid}>
        {companions.map((c) => {
          const isSel = selected === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              activeOpacity={0.85}
              onPress={() => setSelected(c.id)}
              style={[
                styles.card,
                { borderColor: isSel ? c.accent_color : colors.border },
                isSel && { backgroundColor: c.accent_color + '1A' },
              ]}
            >
              <Companion companionId={c.id} expression={isSel ? 'happy' : 'idle'} size={104} />
              <Text style={styles.name}>{c.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.confirmBtn, (!selected || saving) && styles.confirmBtnDisabled]}
        onPress={confirm}
        disabled={!selected || saving}
        activeOpacity={0.85}
      >
        <Text style={styles.confirmText}>{saving ? 'Đang lưu...' : 'Chọn bạn này!'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 24 },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.primary,
      textAlign: 'center',
      marginTop: 12,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 8,
    },
    card: {
      width: 150,
      alignItems: 'center',
      paddingVertical: 18,
      borderRadius: 24,
      borderWidth: 3,
      backgroundColor: colors.surface,
    },
    name: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 8 },
    confirmBtn: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingVertical: 18,
      alignItems: 'center',
      marginTop: 8,
    },
    confirmBtnDisabled: { opacity: 0.4 },
    confirmText: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  });
