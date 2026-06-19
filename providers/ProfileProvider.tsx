import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../lib/types';
import { useAuth } from './AuthProvider';

interface ProfileContextType {
  profile: Profile | null;
  isKidMode: boolean;
  loading: boolean;
  /** Tải lại profile từ DB (gọi sau khi bật/tắt Kid Mode) để theme + route cập nhật. */
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  isKidMode: false,
  loading: true,
  refresh: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <ProfileContext.Provider
      value={{ profile, isKidMode: profile?.is_kid_mode ?? false, loading, refresh }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
