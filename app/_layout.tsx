import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AuthProvider, useAuth } from '../providers/AuthProvider';

function RouteGuard() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [session, loading, segments]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <AuthProvider>
        <RouteGuard />
      </AuthProvider>
    </KeyboardProvider>
  );
}
