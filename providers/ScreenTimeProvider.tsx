import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { useProfile } from './ProfileProvider';

interface ScreenTimeContextType {
  usedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
  limitReached: boolean;
  showWarning: boolean;
}

const ScreenTimeContext = createContext<ScreenTimeContextType>({
  usedSeconds: 0,
  limitSeconds: 20 * 60,
  remainingSeconds: 20 * 60,
  limitReached: false,
  showWarning: false,
});

export function useScreenTime() {
  return useContext(ScreenTimeContext);
}

const FLUSH_INTERVAL_SEC = 10;
const WARNING_THRESHOLD_SEC = 120;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Đếm thời lượng dùng Kid Mode/ngày, cộng dồn vào `daily_kid_usage` (Pha 4 — Screen Time).
// Bao toàn bộ nhánh (kid) ở _layout.tsx nên chạy nền xuyên suốt mọi màn hình con.
export function ScreenTimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [usedSeconds, setUsedSeconds] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // baseSeconds: đã lưu trong DB lúc tải; sessionSeconds: tích thêm từ lúc mount, chưa flush.
  const baseSecondsRef = useRef(0);
  const sessionSecondsRef = useRef(0);
  const lastFlushedRef = useRef(0);
  const dateRef = useRef(todayStr());

  const limitSeconds = (profile?.screen_time_limit_minutes ?? 20) * 60;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('daily_kid_usage')
      .select('seconds_used')
      .eq('user_id', user.id)
      .eq('activity_date', dateRef.current)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        baseSecondsRef.current = data?.seconds_used ?? 0;
        sessionSecondsRef.current = 0;
        lastFlushedRef.current = 0;
        setUsedSeconds(baseSecondsRef.current);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const flush = useCallback(async () => {
    if (!user || sessionSecondsRef.current === lastFlushedRef.current) return;
    const total = baseSecondsRef.current + sessionSecondsRef.current;
    lastFlushedRef.current = sessionSecondsRef.current;
    await supabase
      .from('daily_kid_usage')
      .upsert(
        { user_id: user.id, activity_date: dateRef.current, seconds_used: total },
        { onConflict: 'user_id,activity_date' },
      );
  }, [user]);

  useEffect(() => {
    if (!loaded) return;
    let appActive = AppState.currentState === 'active';

    const tick = setInterval(() => {
      if (!appActive) return;
      sessionSecondsRef.current += 1;
      setUsedSeconds(baseSecondsRef.current + sessionSecondsRef.current);
      if (sessionSecondsRef.current - lastFlushedRef.current >= FLUSH_INTERVAL_SEC) {
        flush();
      }
    }, 1000);

    const sub = AppState.addEventListener('change', (state) => {
      appActive = state === 'active';
      if (!appActive) flush();
    });

    return () => {
      clearInterval(tick);
      sub.remove();
      flush();
    };
  }, [loaded, flush]);

  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);
  const limitReached = loaded && remainingSeconds <= 0;
  const showWarning = loaded && remainingSeconds > 0 && remainingSeconds <= WARNING_THRESHOLD_SEC;

  return (
    <ScreenTimeContext.Provider
      value={{ usedSeconds, limitSeconds, remainingSeconds, limitReached, showWarning }}
    >
      {children}
    </ScreenTimeContext.Provider>
  );
}
