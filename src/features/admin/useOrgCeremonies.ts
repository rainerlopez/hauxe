import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

export type CeremonyStatus = 'rascunho' | 'publicada' | 'encerrada' | 'cancelada';

/** Labels PT-BR compartilhados entre a lista e o formulário de cerimônias. */
export const CEREMONY_STATUS_LABEL: Record<CeremonyStatus, string> = {
  rascunho: 'Rascunho',
  publicada: 'Publicada',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
};

export interface OrgCeremony {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  status: CeremonyStatus;
  arrival_at: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  food_donation_kg: number | null;
  orientations: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Inscritos ativos (status <> 'cancelada'). `null` quando a contagem não
   * pôde ser obtida — a lista nunca fica bloqueada por causa dela.
   */
  active_registrations_count: number | null;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; ceremonies: OrgCeremony[] };

const CEREMONY_COLUMNS =
  'id, org_id, title, description, status, arrival_at, starts_at, ends_at, capacity, food_donation_kg, orientations, created_at, updated_at';

/**
 * Cerimônias da org (mais recentes primeiro), com contagem de inscritos
 * ativos quando viável em uma única consulta (agregação de recurso
 * relacionado do PostgREST: `registrations(count)` filtrado por
 * `registrations.status=neq.cancelada`). Se o formato não for suportado
 * pelo projeto, cai para a mesma consulta sem a contagem — nunca quebra a
 * lista por causa disso (fallback é a 2ª chamada só quando a 1ª falha).
 */
export function useOrgCeremonies(orgId: string | null): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (!orgId) {
        setState({ status: 'ready', ceremonies: [] });
        return;
      }

      let cancelled = false;

      async function load() {
        setState({ status: 'loading' });

        const withCount = await supabase
          .from('ceremonies')
          .select(`${CEREMONY_COLUMNS}, registrations(count)`)
          .eq('org_id', orgId)
          .neq('registrations.status', 'cancelada')
          .order('starts_at', { ascending: false });

        if (cancelled) return;

        if (!withCount.error && withCount.data) {
          setState({
            status: 'ready',
            ceremonies: withCount.data.map((row) => {
              const rec = row as unknown as Record<string, unknown>;
              const rel = rec.registrations as Array<{ count: number }> | undefined;
              return {
                ...(rec as unknown as OrgCeremony),
                active_registrations_count: rel?.[0]?.count ?? 0,
              };
            }),
          });
          return;
        }

        // Fallback: sem contagem (formato de agregação indisponível).
        const plain = await supabase
          .from('ceremonies')
          .select(CEREMONY_COLUMNS)
          .eq('org_id', orgId)
          .order('starts_at', { ascending: false });

        if (cancelled) return;

        if (plain.error) {
          setState({ status: 'error', message: plain.error.message });
          return;
        }

        setState({
          status: 'ready',
          ceremonies: (plain.data ?? []).map((row) => ({
            ...(row as unknown as OrgCeremony),
            active_registrations_count: null,
          })),
        });
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [orgId]),
  );

  return state;
}
