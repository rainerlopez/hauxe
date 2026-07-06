import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { AnamneseData } from '../anamnese/useAnamnese';

type State =
  | { phase: 'loading' }
  | { phase: 'empty' }                       // participante ainda não preencheu
  | { phase: 'ready'; data: AnamneseData }
  | { phase: 'error'; message: string };

/**
 * Leitura de ficha de saúde pela STAFF (console). LGPD:
 *   1. registra a visualização em audit_log via RPC log_anamnese_view
 *      (SECURITY DEFINER; nega quem não é staff de org com inscrição ativa);
 *   2. só então lê a anamnese (policy "anamnese - org staff when registered",
 *      limitada a inscrições não canceladas desde a v13).
 * A ordem importa: sem trilha, sem leitura.
 */
export function useAnamneseFor(profileId: string | null): State {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    if (!profileId) {
      setState({ phase: 'empty' });
      return;
    }

    let cancelled = false;

    async function fetch() {
      setState({ phase: 'loading' });
      try {
        const { error: logErr } = await supabase.rpc('log_anamnese_view', {
          p_profile_id: profileId,
        });
        if (logErr) throw new Error('Sem permissão para visualizar esta ficha.');

        const { data, error } = await supabase
          .from('anamneses')
          .select(
            'emergency_contact_name, emergency_contact_phone, uses_medication, medications, ' +
              'psychiatric_history, psychiatric_details, cardiac_history, cardiac_details, ' +
              'other_conditions, pregnant, allergies, previous_experience, ' +
              'consent_health_data, consent_at',
          )
          .eq('profile_id', profileId!)
          .maybeSingle();
        if (error) throw error;

        if (!cancelled) {
          setState(
            data
              ? { phase: 'ready', data: data as unknown as AnamneseData }
              : { phase: 'empty' },
          );
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: e instanceof Error ? e.message : 'Erro ao carregar a ficha.',
          });
        }
      }
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return state;
}
