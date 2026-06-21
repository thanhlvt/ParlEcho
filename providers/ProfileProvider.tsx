import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../lib/types';
import { useAuth } from './AuthProvider';

interface ProfileContextType {
  profile: Profile | null;
  isKidMode: boolean;
  loading: boolean;
  /** Emoji trang phục đang mặc (tra theo profile.active_costume_id), null = không mặc gì. */
  activeCostumeEmoji: string | null;
  /** Tải lại profile từ DB (gọi sau khi bật/tắt Kid Mode) để theme + route cập nhật. */
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  isKidMode: false,
  loading: true,
  activeCostumeEmoji: null,
  refresh: async () => {},
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

  // Tra emoji của costume đang mặc mỗi khi active_costume_id đổi, để Companion hiển thị
  // trang phục mà không cần mỗi màn hình tự query lại bảng costumes.
  useEffect(() => {
    if (!profile?.active_costume_id) {
      setActiveCostumeEmoji(null);
      return;
    }
    supabase
      .from('costumes')
      .select('emoji')
      .eq('id', profile.active_costume_id)
      .single()
      .then(({ data }) => setActiveCostumeEmoji((data as { emoji: string } | null)?.emoji ?? null));
  }, [profile?.active_costume_id]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isKidMode: profile?.is_kid_mode ?? false,
        loading,
        activeCostumeEmoji,
        refresh,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
