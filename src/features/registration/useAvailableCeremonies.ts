import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { friendlyDbError } from '../../lib/friendlyDbError';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth';

export interface AvailableCeremony {
  id: string;
  title: string;
  description: string | null;
  arrival_at: string | null;
  starts_at: string;
  /** status da inscrição do usuário nesta cerimônia (null = nunca se inscreveu) */
  my_status: string | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'empty' }                              // nenhuma cerimônia aberta
  | { phase: 'ready'; ceremonies: AvailableCeremony[] }
  | { phase: 'error'; message: string };

/**
 * Cerimônias publicadas e futuras, com o status da inscrição do usuário
 * em cada uma (para diferenciar "inscrever" de "refazer inscrição").
 * RLS `ceremonies - read published` cobre o acesso do participante.
 * Revalida no foco — ao voltar de /cerimonia/[id] a lista pode ter mudado.
 */
export function useAvailableCeremonies(): State & { retry: () => void } {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [nonce, setNonce] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetch() {
        setState({ phase: 'loading' });
        try {
          const { data: cers, error: cerErr } = await supabase
            .from('ceremonies')
            .select('id, title, description, arrival_at, starts_at')
            .eq('status', 'publicada')
            .gte('starts_at', new Date().toISOString())
            .order('starts_at', { ascending: true });

          if (cerErr) throw cerErr;

          let myByCeremony = new Map<string, string>();
          if (user && cers && cers.length > 0) {
            const { data: regs, error: regErr } = await supabase
              .from('registrations')
              .select('ceremony_id, status')
              .eq('profile_id', user.id);
            if (regErr) throw regErr;
            myByCeremony = new Map(
              (regs ?? []).map((r) => [r.ceremony_id as string, r.status as string]),
            );
          }

          if (!cancelled) {
            const list: AvailableCeremony[] = (cers ?? []).map((c) => ({
              ...(c as Omit<AvailableCeremony, 'my_status'>),
              my_status: myByCeremony.get(c.id as string) ?? null,
            }));
            setState(list.length > 0 ? { phase: 'ready', ceremonies: list } : { phase: 'empty' });
          }
        } catch (e) {
          if (!cancelled) {
            setState({
              phase: 'error',
              message: e instanceof Error ? friendlyDbError(e.message) : 'Erro ao carregar as cerimônias.',
            });
          }
        }
      }

      fetch();
      return () => {
        cancelled = true;
      };
    }, [user, nonce]),
  );

  return { ...state, retry: () => setNonce((n) => n + 1) };
}
