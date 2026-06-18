import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';

interface StatusViewProps {
  message: string;
}

export function StatusView({ message }: StatusViewProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centerFull}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.connectingText}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    connectingText: { fontSize: 15, color: colors.textMuted },
  });
