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
import { sanitizeCpf } from './cpf';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * Login com e-mail (usuário) + CPF (senha). O CPF é normalizado para os
   * 11 dígitos antes de ir ao Supabase, então pontuação não afeta o login.
   */
  signIn: (email: string, cpf: string) => Promise<void>;
  /**
   * Cria a conta com e-mail + CPF (senha). fullName é gravado nos metadados
   * e lido pelo trigger handle_new_user() para popular profiles.full_name.
   * Retorna se ainda falta confirmar o e-mail (depende da config "Confirm
   * email" do projeto Supabase): sessão nula = confirmação pendente.
   */
  signUp: (
    email: string,
    cpf: string,
    fullName: string,
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  /**
   * Reenvia o e-mail de confirmação de cadastro. O e-mail traz um LINK de
   * confirmação e — se o template incluir {{ .Token }} — também um código
   * de 6 dígitos (fallback).
   */
  resendConfirmation: (email: string) => Promise<void>;
  /**
   * Fallback: confirma o cadastro com o código de 6 dígitos digitado
   * manualmente.
   */
  confirmSignUpCode: (email: string, token: string) => Promise<void>;
  /**
   * Troca o `code` do link de confirmação (PKCE) por uma sessão. Usado na
   * rota /callback.
   */
  completeEmailLink: (code: string) => Promise<void>;
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

      signIn: async (email, cpf) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: sanitizeCpf(cpf),
        });
        if (error) throw error;
      },

      signUp: async (email, cpf, fullName) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: sanitizeCpf(cpf),
          options: {
            // Para onde o link de confirmação redireciona (web/nativo).
            emailRedirectTo: resolveRedirectUrl(),
            // Lido pelo trigger handle_new_user() para popular profiles.full_name
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        return { needsEmailConfirmation: !data.session };
      },

      resendConfirmation: async (email) => {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: resolveRedirectUrl() },
        });
        if (error) throw error;
      },

      confirmSignUpCode: async (email, token) => {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'signup',
        });
        if (error) throw error;
      },

      completeEmailLink: async (code) => {
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
