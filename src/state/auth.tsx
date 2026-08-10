import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/services/supabase';

type AuthContextValue = { userId?: string; email?: string; loading: boolean; signIn: (email: string, password: string) => Promise<void>; signUp: (email: string, password: string) => Promise<'signed_in' | 'confirmation_required'>; resetPassword: (email: string) => Promise<void>; signOut: () => Promise<void>; };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
      if (active) setUser(undefined);
      if (active) setLoading(false);
    })();
    return () => { active = false; unsubscribe?.(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    userId: user?.id, email: user?.email, loading,
    async signIn(email, password) {
      if (supabase) { const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; if (data.user) setUser({ id: data.user.id, email: data.user.email ?? email }); return; }
      throw new Error('AUTH_CONFIG_MISSING');
    },
    async signUp(email, password) {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) return 'confirmation_required';
        setUser({ id: data.session.user.id, email: data.session.user.email ?? email });
        return 'signed_in';
      }
      throw new Error('AUTH_CONFIG_MISSING');
    },
    async resetPassword(email) { if (supabase) { const { error } = await supabase.auth.resetPasswordForEmail(email.trim()); if (error) throw error; return; } throw new Error('AUTH_CONFIG_MISSING'); },
    async signOut() { if (supabase) await supabase.auth.signOut(); setUser(undefined); },
  }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider missing'); return context; }
