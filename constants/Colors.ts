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

// Cung cấp Colors mặc định để tránh lỗi trước khi migrate xong
export const Colors = lightColors;
