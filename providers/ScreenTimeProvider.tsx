import { useSegments } from 'expo-router';
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

// Đếm thời lượng dùng Kid Mode TRONG 1 PHIÊN (từ lúc mount provider này, tức lúc vào
// nhánh (kid), tới lúc rời/đóng app) — giới hạn áp theo phiên, KHÔNG cộng dồn nhiều
// phiên trong ngày (vào lại Kid Mode là được tính lại từ đầu). Vẫn cộng dồn ghi vào
// `daily_kid_usage` để có số liệu tổng/ngày cho phụ huynh tham khảo, nhưng cột đó
// KHÔNG được dùng để tính limitReached/remainingSeconds.
// Bao toàn bộ nhánh (kid) ở _layout.tsx nên chạy nền xuyên suốt mọi màn hình con.
export function ScreenTimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const segments = useSegments();
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Dừng đếm giờ khi phụ huynh đang ở Parent Dashboard (parent-gate/parent/*) — đây là
  // thời gian phụ huynh dùng máy, không phải thời gian trẻ chơi.
  const screen = segments[1] as string | undefined;
  const paused = screen === 'parent-gate' || screen === 'parent';

  // baseSeconds: tổng đã lưu trong DB hôm nay lúc tải — chỉ dùng để ghi cộng dồn cho
  // thống kê, KHÔNG dùng để tính giới hạn của phiên hiện tại.
  const baseSecondsRef = useRef(0);
  const sessionSecondsRef = useRef(0);
  const lastFlushedRef = useRef(0);
  const dateRef = useRef(todayStr());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

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
        setSessionSeconds(0);
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
      if (!appActive || pausedRef.current) return;
      sessionSecondsRef.current += 1;
      setSessionSeconds(sessionSecondsRef.current);
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

  const remainingSeconds = Math.max(0, limitSeconds - sessionSeconds);
  const limitReached = loaded && remainingSeconds <= 0;
  const showWarning = loaded && remainingSeconds > 0 && remainingSeconds <= WARNING_THRESHOLD_SEC;

  return (
    <ScreenTimeContext.Provider
      value={{
        usedSeconds: sessionSeconds,
        limitSeconds,
        remainingSeconds,
        limitReached,
        showWarning,
      }}
    >
      {children}
    </ScreenTimeContext.Provider>
  );
}
