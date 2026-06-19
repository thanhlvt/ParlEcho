import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, kidColors } from '../constants/Colors';
import { useProfile } from './ProfileProvider';

type ThemeMode = 'light' | 'dark' | 'system';
type ActiveTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  activeTheme: ActiveTheme;
  colors: Record<keyof typeof lightColors, string>;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  activeTheme: 'light',
  colors: lightColors as any,
  isDark: false,
  setThemeMode: async () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { isKidMode } = useProfile();
  const segments = useSegments();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  // Load saved theme mode from AsyncStorage on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const savedMode = await AsyncStorage.getItem('theme_mode');
        if (savedMode) {
          setThemeModeState(savedMode as ThemeMode);
        }
      } catch (err) {
        console.warn('[ThemeProvider] Failed to load theme mode:', err);
      }
    }
    loadTheme();
  }, []);

  // Tính activeTheme đồng bộ trực tiếp trong lúc render
  const activeTheme: ActiveTheme =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;

  const setThemeMode = async (mode: ThemeMode) => {
    console.log('[ThemeProvider] setThemeMode called with:', mode);
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem('theme_mode', mode);
      console.log('[ThemeProvider] Successfully saved theme_mode to AsyncStorage:', mode);
    } catch (err) {
      console.warn('[ThemeProvider] Failed to save theme mode to AsyncStorage:', err);
    }
  };

  // Kid Mode dùng palette tươi sáng cố định, bỏ qua light/dark — chỉ áp dụng
  // khi đang thực sự ở trong nhánh (kid), không phải chỉ vì is_kid_mode=true
  // (phụ huynh vẫn ở (app) để thiết lập sau khi bật Kid Mode/đặt PIN).
  // Cast string vì typed-routes chưa regenerate cho nhánh (kid) (giống app/_layout.tsx).
  const inKidRoute = (segments[0] as string | undefined) === '(kid)';
  const useKidTheme = isKidMode && inKidRoute;
  const baseColors = activeTheme === 'dark' ? darkColors : lightColors;
  const colors = (useKidTheme ? kidColors : baseColors) as Record<keyof typeof lightColors, string>;
  const isDark = !useKidTheme && activeTheme === 'dark';

  return (
    <ThemeContext.Provider value={{ themeMode, activeTheme, colors, isDark, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
