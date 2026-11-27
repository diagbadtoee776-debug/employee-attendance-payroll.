"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Role = "admin" | "hr" | "payroll" | "employee";

type Profile = { userId: string; role: Role | null; fullName: string | null };

type AuthState = {
  user: User | null;
  role: Role | null;
  fullName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [prof, setProf] = useState<Profile | null>(null);
  const userId = user?.id ?? null;

  // 1. Track the Supabase session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 2. Load the user's role and name (RLS lets each user read only their own)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [p, e] = await Promise.all([
        supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("employees").select("first_name, last_name").eq("user_id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      setProf({
        userId,
        role: (p.data?.role as Role | undefined) ?? null,
        fullName: e.data ? `${e.data.first_name} ${e.data.last_name}` : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const profile = userId && prof?.userId === userId ? prof : null;
  const loading = !authReady || (userId !== null && profile === null);

  const value: AuthState = {
    user,
    role: profile?.role ?? null,
    fullName: profile?.fullName ?? null,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}