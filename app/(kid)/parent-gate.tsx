import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hashPin } from '../../lib/pin';
import { useProfile } from '../../providers/ProfileProvider';
import { useTheme } from '../../providers/ThemeProvider';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// Cổng PIN phụ huynh — không hiện trong UI Kid, chỉ truy cập qua nút ẩn ở (kid)/home.
export default function ParentGateScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { profile } = useProfile();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleKeyPress(key: string) {
    if (checking) return;
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      setError(false);
      return;
    }
    if (key === '' || pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      setChecking(true);
      const hashed = await hashPin(next);
      if (profile?.parent_pin && hashed === profile.parent_pin) {
        router.replace('/(kid)/parent/dashboard' as Href);
      } else {
        setError(true);
        setPin('');
      }
      setChecking(false);
    }
  }

  if (!profile?.parent_pin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFull}>
          <Text style={styles.title}>Chưa đặt mã PIN</Text>
          <Text style={styles.subtitle}>
            Vào Hồ sơ (chế độ người lớn) để đặt mã PIN phụ huynh trước.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centerFull}>
        <Text style={styles.title}>Mã PIN phụ huynh</Text>
        <View style={styles.dotsRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </View>
        {error ? <Text style={styles.errorText}>Mã PIN không đúng, thử lại nhé.</Text> : null}

        <View style={styles.keypad}>
          {KEYS.map((key, i) => (
            <TouchableOpacity
              key={i}
              style={styles.key}
              disabled={key === ''}
              onPress={() => handleKeyPress(key)}
              activeOpacity={0.7}
            >
              {key === 'del' ? (
                <Ionicons name="backspace-outline" size={22} color={colors.textPrimary} />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 },
    title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
    subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    dotsRow: { flexDirection: 'row', gap: 14 },
    dot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.border,
    },
    dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
    errorText: { fontSize: 13, color: colors.error, fontWeight: '600' },
    keypad: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      width: 240,
      justifyContent: 'space-between',
    },
    key: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    keyText: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
    backBtn: { marginTop: 8, padding: 8 },
    backBtnText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  });
