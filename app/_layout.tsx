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

    // Đã đăng nhập — chờ profile để biết Kid Mode trước khi điều hướng.
    if (profileLoading) return;

    const inKidGroup = root === '(kid)';

    // Rời màn đăng nhập sau khi đăng nhập thành công — vào (kid) nếu Kid Mode
    // đang bật (giao máy cho trẻ), ngược lại vào (app).
    if (inAuthGroup) {
      router.replace((isKidMode ? '/(kid)/home' : '/(app)') as Href);
      return;
    }

    // Không tự động đẩy người dùng vào (kid) chỉ vì is_kid_mode=true — phụ huynh
    // tự điều hướng vào Kid Mode khi sẵn sàng giao máy (xem nút ở profile.tsx),
    // tránh bị "nhốt" ngoài Profile sau khi vừa bật Kid Mode/đặt PIN.
    if (!isKidMode && inKidGroup) {
      console.log('[RouteGuard] bounce (kid)→(app), isKidMode=', isKidMode, 'segments=', segments);
      router.replace('/(app)');
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
