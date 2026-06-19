export const lightColors = {
  primary: '#5B4CF5',
  primaryLight: '#EEF2FF',
  secondary: '#FF6B6B',

  background: '#F7F8FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F9',

  textPrimary: '#1A1A2E',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',

  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',

  border: '#E5E7EB',

  /** Accent màu cho badge ngôn ngữ */
  en: '#3B82F6',
  ja: '#EF4444',
} as const;

export const darkColors = {
  primary: '#7467FF',
  primaryLight: '#1E1B4B',
  secondary: '#FF8787',

  background: '#0F0F1A',
  surface: '#181829',
  surfaceAlt: '#23233B',

  textPrimary: '#F3F4F6',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',

  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',

  border: '#2E2E47',

  /** Accent màu cho badge ngôn ngữ */
  en: '#60A5FA',
  ja: '#F87171',
} as const;

// Kid Mode — palette tươi sáng, tương phản cao, chữ to (dùng chung mọi màn Kid).
// Phải có ĐỦ key như lightColors để getStyles(colors) hoạt động mọi nơi.
export const kidColors: Record<keyof typeof lightColors, string> = {
  primary: '#FF8A3D', // cam ấm, vui
  primaryLight: '#FFF1E6',
  secondary: '#3DC1FF', // xanh dương tươi

  background: '#FFFDF6',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF4DF',

  textPrimary: '#27314E',
  textSecondary: '#5A6480',
  textMuted: '#9AA3BC',

  success: '#34D399',
  warning: '#FBBF24',
  error: '#FB7185',

  border: '#FFE2C2',

  en: '#3DC1FF',
  ja: '#FF6B9D',
};

// Cung cấp Colors mặc định để tránh lỗi trước khi migrate xong
export const Colors = lightColors;
