import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth';

export interface RegistrationProgress {
  registration_id: string;
  ceremony_id: string;
  status: string;
  vaga_ok: boolean;
  ficha_ok: boolean;
  pagamento_ok: boolean;
}

export interface CeremonyInfo {
  id: string;
  title: string;
  starts_at: string;
}

export interface ActiveRegistration {
  progress: RegistrationProgress;
  ceremony: CeremonyInfo;
}

type State =
  | { phase: 'loading' }
  | { phase: 'none' }                    // sem inscrição ativa
  | { phase: 'ready'; data: ActiveRegistration }
  | { phase: 'error'; message: string };

/**
 * Busca a inscrição ativa do usuário corrente (status não-cancelado)
 * junto com os dados da cerimônia e o progresso da view registration_progress.
 * Retorna a mais próxima no tempo (primeira por starts_at asc).
 */
export function useRegistration(): State {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    if (!user) {
      setState({ phase: 'none' });
      return;
    }

    let cancelled = false;

    async function fetch() {
      setState({ phase: 'loading' });
      try {
        // Busca inscrições ativas com join na cerimônia
        const { data: regs, error: regErr } = await supabase
          .from('registrations')
          .select(`
            id,
            ceremony_id,
            status,
            ceremonies (
              id,
              title,
              starts_at
            )
          `)
          .eq('profile_id', user!.id)
          .not('status', 'in', '(cancelada)')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (regErr) {
          if (regErr.code === 'PGRST116') {
            // nenhuma linha encontrada
            if (!cancelled) setState({ phase: 'none' });
            return;
          }
          throw regErr;
        }

        // Busca o progresso na view
        const { data: prog, error: progErr } = await supabase
          .from('registration_progress')
          .select('registration_id, ceremony_id, status, vaga_ok, ficha_ok, pagamento_ok')
          .eq('registration_id', regs.id)
          .single();

        if (progErr) throw progErr;

        const ceremony = regs.ceremonies as unknown as CeremonyInfo;

        if (!cancelled) {
          setState({
            phase: 'ready',
            data: { progress: prog, ceremony },
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: e instanceof Error ? e.message : 'Erro ao carregar inscrição.',
          });
        }
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [user]);

  return state;
}
