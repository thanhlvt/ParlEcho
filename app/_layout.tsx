import { Href, Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { ProfileProvider, useProfile } from '../providers/ProfileProvider';
import { ThemeProvider, useTheme } from '../providers/ThemeProvider';

function RouteGuard() {
  const { session, loading: authLoading } = useAuth();
  const { isKidMode, loading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    // segments[0] là route group hiện tại. Cast string vì typed-routes chưa
    // regenerate cho nhánh (kid) mới (sẽ tự cập nhật khi chạy expo start).
    const root = segments[0] as string | undefined;
    const inAuthGroup = root === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Đã đăng nhập — chờ profile để biết Kid Mode trước khi điều hướng theo mode.
    if (profileLoading) return;

    const inKidGroup = root === '(kid)';

    if (isKidMode) {
      // Trẻ chỉ được ở trong (kid); chặn (app) và (auth).
      // Dùng /(kid)/home (không phải index) để tránh đụng route '/' với (app).
      if (!inKidGroup) router.replace('/(kid)/home' as Href);
    } else {
      // Người lớn không được ở (kid); rời (auth) sau khi đăng nhập.
      if (inKidGroup || inAuthGroup) router.replace('/(app)');
    }
  }, [session, authLoading, profileLoading, isKidMode, segments, router]);

  return <Slot />;
}

function ThemeStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <AuthProvider>
        <ProfileProvider>
          <ThemeProvider>
            <ThemeStatusBar />
            <RouteGuard />
          </ThemeProvider>
        </ProfileProvider>
      </AuthProvider>
    </KeyboardProvider>
  );
}
