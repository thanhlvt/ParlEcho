import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../lib/types';
import { useAuth } from './AuthProvider';

interface ProfileContextType {
  profile: Profile | null;
  isKidMode: boolean;
  loading: boolean;
  /** Emoji trang phục đang mặc của companion hiện tại (tra theo companion_costume_state),
   *  null = không mặc gì. Đổi companion sẽ tra lại, không bị lẫn costume của companion khác. */
  activeCostumeEmoji: string | null;
  /** Tải lại profile từ DB (gọi sau khi bật/tắt Kid Mode) để theme + route cập nhật. */
  refresh: () => Promise<void>;
  /** Tải lại costume đang mặc của companion hiện tại (gọi sau khi mặc/cởi ở (kid)/costumes.tsx). */
  refreshActiveCostume: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  isKidMode: false,
  loading: true,
  activeCostumeEmoji: null,
  refresh: async () => {},
  refreshActiveCostume: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCostumeEmoji, setActiveCostumeEmoji] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile((data as Profile) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    refresh();
  }, [authLoading, user, refresh]);

  // Tra emoji costume đang mặc của companion HIỆN TẠI trong companion_costume_state, để
  // Companion hiển thị mà không cần mỗi màn hình tự query lại. Lưu riêng theo companion_id
  // nên đổi companion sẽ tra ra costume khác (hoặc null nếu companion đó chưa mặc gì) —
  // không bị "mượn" costume của companion vừa đổi khỏi.
  const refreshActiveCostume = useCallback(async () => {
    if (!user || !profile?.companion_id) {
      setActiveCostumeEmoji(null);
      return;
    }
    const { data } = await supabase
      .from('companion_costume_state')
      .select('costumes(emoji)')
      .eq('user_id', user.id)
      .eq('companion_id', profile.companion_id)
      .maybeSingle();
    setActiveCostumeEmoji(
      (data as { costumes: { emoji: string } | null } | null)?.costumes?.emoji ?? null,
    );
  }, [user, profile?.companion_id]);

  useEffect(() => {
    refreshActiveCostume();
  }, [refreshActiveCostume]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isKidMode: profile?.is_kid_mode ?? false,
        loading,
        activeCostumeEmoji,
        refresh,
        refreshActiveCostume,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
