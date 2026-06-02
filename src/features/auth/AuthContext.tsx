import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { resolveRedirectUrl } from './redirect';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * Envia o e-mail de autenticação. O e-mail traz um MAGIC LINK (clica e entra)
   * e — se o template incluir {{ .Token }} — também um código de 6 dígitos (fallback).
   * Cria o usuário se não existir (shouldCreateUser=true).
   * fullName é gravado nos metadados e lido pelo trigger handle_new_user().
   */
  sendOtp: (email: string, fullName?: string) => Promise<void>;
  /**
   * Fallback: verifica o código de 6 dígitos digitado manualmente.
   */
  verifyOtp: (email: string, token: string) => Promise<void>;
  /**
   * Troca o `code` do magic link (PKCE) por uma sessão. Usado na rota /callback.
   */
  completeMagicLink: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,

      sendOtp: async (email, fullName) => {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            // Para onde o magic link redireciona após confirmar (web/nativo).
            emailRedirectTo: resolveRedirectUrl(),
            // Lido pelo trigger handle_new_user() para popular profiles.full_name
            ...(fullName ? { data: { full_name: fullName } } : {}),
          },
        });
        if (error) throw error;
      },

      verifyOtp: async (email, token) => {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'email',
        });
        if (error) throw error;
      },

      completeMagicLink: async (code) => {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      },

      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
