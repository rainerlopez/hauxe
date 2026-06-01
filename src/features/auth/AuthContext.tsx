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

interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** `true` enquanto a sessão inicial ainda está sendo restaurada do storage. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Retorna `needsConfirmation = true` quando o Supabase exige verificação de e-mail. */
  signUp: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restaura a sessão persistida ao iniciar.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Mantém o estado sincronizado com login/logout/refresh.
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
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async ({ email, password, fullName }) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Lido pelo trigger handle_new_user() para popular profiles.full_name.
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        return { needsConfirmation: data.session === null };
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
