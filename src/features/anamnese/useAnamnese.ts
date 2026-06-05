import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth';

/**
 * Campos da ficha de saúde (anamnese). Espelha as colunas relevantes
 * da tabela `anamneses`. Dado sensível de saúde — LGPD Art. 5, II.
 */
export interface AnamneseData {
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  uses_medication: boolean | null;
  medications: string | null;
  psychiatric_history: boolean | null;
  psychiatric_details: string | null;
  cardiac_history: boolean | null;
  cardiac_details: string | null;
  other_conditions: string | null;
  pregnant: boolean | null;
  allergies: string | null;
  previous_experience: boolean | null;
  consent_health_data: boolean;
  consent_at: string | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'empty' }                       // ainda não existe ficha
  | { phase: 'ready'; data: AnamneseData }   // ficha já preenchida
  | { phase: 'error'; message: string };

const COLUMNS =
  'emergency_contact_name, emergency_contact_phone, uses_medication, medications, ' +
  'psychiatric_history, psychiatric_details, cardiac_history, cardiac_details, ' +
  'other_conditions, pregnant, allergies, previous_experience, ' +
  'consent_health_data, consent_at';

/**
 * Busca a anamnese do usuário corrente (uma por profile) e expõe `save`,
 * que faz upsert por `profile_id`. Quando o consentimento LGPD passa a
 * `true`, grava `consent_at` — o trigger `trg_anamnese_status_sync`
 * reavalia as inscrições automaticamente.
 */
export function useAnamnese() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setState({ phase: 'empty' });
      return;
    }

    let cancelled = false;

    async function fetchAnamnese() {
      setState({ phase: 'loading' });
      try {
        const { data, error } = await supabase
          .from('anamneses')
          .select(COLUMNS)
          .eq('profile_id', user!.id)
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

    fetchAnamnese();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = useCallback(
    async (input: Partial<AnamneseData>): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Sessão expirada. Entre novamente.' };

      setSaving(true);
      try {
        // Só carimba consent_at na transição para consentido; preserva o existente.
        const alreadyConsented =
          state.phase === 'ready' && state.data.consent_health_data;
        const consent_at =
          input.consent_health_data && !alreadyConsented
            ? new Date().toISOString()
            : undefined;

        const payload: Record<string, unknown> = {
          profile_id: user.id,
          ...input,
        };
        if (consent_at) payload.consent_at = consent_at;

        const { error } = await supabase
          .from('anamneses')
          .upsert(payload, { onConflict: 'profile_id' });

        if (error) return { error: error.message };
        return { error: null };
      } finally {
        setSaving(false);
      }
    },
    [user, state],
  );

  return { state, save, saving };
}
