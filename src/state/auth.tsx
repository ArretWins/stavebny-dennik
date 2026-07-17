import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';

const LOCAL_SESSION = '@stavebny-dennik/session';
type AuthContextValue = { userId?: string; email?: string; loading: boolean; signIn: (email: string, password: string) => Promise<void>; signUp: (email: string, password: string) => Promise<'signed_in' | 'confirmation_required'>; resetPassword: (email: string) => Promise<void>; signOut: () => Promise<void>; };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function localUserId(email: string): string { return `local_${email.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`; }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string }>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (active && data.session?.user) setUser({ id: data.session.user.id, email: data.session.user.email ?? '' });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user ? { id: session.user.id, email: session.user.email ?? '' } : undefined); });
        unsubscribe = () => listener.subscription.unsubscribe();
        if (active) setLoading(false);
        return;
      }
      const raw = await AsyncStorage.getItem(LOCAL_SESSION);
      if (active && raw) setUser(JSON.parse(raw));
      if (active) setLoading(false);
    })();
    return () => { active = false; unsubscribe?.(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    userId: user?.id, email: user?.email, loading,
    async signIn(email, password) {
      if (supabase) { const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; if (data.user) setUser({ id: data.user.id, email: data.user.email ?? email }); return; }
      if (!email.trim() || password.length < 6) throw new Error('AUTH_INVALID');
      const next = { id: localUserId(email), email: email.trim() }; await AsyncStorage.setItem(LOCAL_SESSION, JSON.stringify(next)); setUser(next);
    },
    async signUp(email, password) {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) return 'confirmation_required';
        setUser({ id: data.session.user.id, email: data.session.user.email ?? email });
        return 'signed_in';
      }
      if (!email.trim() || password.length < 6) throw new Error('AUTH_INVALID');
      const next = { id: localUserId(email), email: email.trim() }; await AsyncStorage.setItem(LOCAL_SESSION, JSON.stringify(next)); setUser(next); return 'signed_in';
    },
    async resetPassword(email) { if (supabase) { const { error } = await supabase.auth.resetPasswordForEmail(email.trim()); if (error) throw error; return; } await AsyncStorage.setItem('@stavebny-dennik/reset-request', email.trim()); },
    async signOut() { if (supabase) await supabase.auth.signOut(); await AsyncStorage.removeItem(LOCAL_SESSION); setUser(undefined); },
  }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider missing'); return context; }
