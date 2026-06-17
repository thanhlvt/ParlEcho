import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../providers/ThemeProvider';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <>
      <Stack.Screen options={{ title: 'Không tìm thấy' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Trang này không tồn tại.</Text>
        <Link href="/(app)" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Về trang chủ</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: colors.background },
  title: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginBottom: 20 },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
