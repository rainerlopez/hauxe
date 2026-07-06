import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth';

export interface EnrollResult {
  error: string | null;
  /** true quando o bloqueio foi por lotação (trigger ceremony_full) */
  full?: boolean;
}

/**
 * Garante a vaga do usuário numa cerimônia.
 *
 * - Sem inscrição prévia → INSERT (nasce 'reservada'; guard v13 impede outro status).
 * - Inscrição 'cancelada' → UPDATE de volta para 'reservada' (fluxo B6:
 *   UNIQUE (ceremony_id, profile_id) impede um segundo INSERT).
 * - Inscrição ativa → no-op (já tem vaga).
 *
 * A capacidade é responsabilidade do trigger `check_ceremony_capacity`
 * (FOR UPDATE, anti-race). Quando a cerimônia lota, o INSERT/UPDATE falha
 * com 'ceremony_full' — devolvemos `full: true` para a UI acolher sem pressão.
 */
export function useEnroll() {
  const { user } = useAuth();
  const [enrolling, setEnrolling] = useState(false);

  const enroll = useCallback(
    async (ceremonyId: string): Promise<EnrollResult> => {
      if (!user) return { error: 'Sessão expirada. Entre novamente.' };

      setEnrolling(true);
      try {
        const { data: existing, error: exErr } = await supabase
          .from('registrations')
          .select('id, status')
          .eq('ceremony_id', ceremonyId)
          .eq('profile_id', user.id)
          .maybeSingle();
        if (exErr) throw exErr;

        if (existing && existing.status !== 'cancelada') {
          return { error: null }; // já tem vaga
        }

        if (existing) {
          const { error } = await supabase
            .from('registrations')
            .update({ status: 'reservada' })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('registrations')
            .insert({ ceremony_id: ceremonyId, profile_id: user.id });
          if (error) throw error;
        }
        return { error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao garantir a vaga.';
        if (msg.includes('ceremony_full')) {
          return { error: 'As vagas desta cerimônia se completaram por agora.', full: true };
        }
        return { error: msg };
      } finally {
        setEnrolling(false);
      }
    },
    [user],
  );

  return { enroll, enrolling };
}
