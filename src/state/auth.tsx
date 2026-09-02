import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/services/supabase";

const PASSWORD_RECOVERY_URL = "https://stavuno.pages.dev/reset-password";

type AuthContextValue = {
  userId?: string;
  email?: string;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<"signed_in" | "confirmation_required">;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

type AuthUser = { id: string; email: string };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAuthUser(user: { id: string; email?: string } | null): AuthUser | undefined {
  return user ? { id: user.id, email: user.email ?? "" } : undefined;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!supabase) {
        if (active) setLoading(false);
        return undefined;
      }
      const { data } = await supabase.auth.getSession();
      if (active) {
        setUser(toAuthUser(data.session?.user ?? null));
        setLoading(false);
      }
      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (active) setUser(toAuthUser(session?.user ?? null));
        },
      );
      return () => listener.subscription.unsubscribe();
    };
    let unsubscribe: (() => void) | undefined;
    void initialize().then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup?.();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      userId: user?.id,
      email: user?.email,
      loading,
      async signIn(email, password) {
        if (!supabase) throw new Error("AUTH_CONFIG_MISSING");
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setUser(toAuthUser(data.user));
      },
      async signUp(email, password) {
        if (!supabase) throw new Error("AUTH_CONFIG_MISSING");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (!data.session) return "confirmation_required";
        setUser(toAuthUser(data.session.user));
        return "signed_in";
      },
      async resetPassword(email) {
        if (!supabase) throw new Error("AUTH_CONFIG_MISSING");
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: PASSWORD_RECOVERY_URL },
        );
        if (error) throw error;
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut();
        setUser(undefined);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider missing");
  return context;
}
