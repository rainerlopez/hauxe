import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface ContributionTier {
  id: string;
  label: string | null;
  amount: number;
  sort_order: number;
}

type State =
  | { phase: 'loading' }
  | { phase: 'empty' }
  | { phase: 'ready'; tiers: ContributionTier[] }
  | { phase: 'error'; message: string };

/**
 * Lista os valores de contribuição consciente de uma cerimônia,
 * ordenados por sort_order. RLS `tiers - read` cobre o acesso do participante.
 */
export function useContributionTiers(ceremonyId: string | null): State {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    if (!ceremonyId) {
      setState({ phase: 'empty' });
      return;
    }

    let cancelled = false;

    async function fetchTiers() {
      setState({ phase: 'loading' });
      try {
        const { data, error } = await supabase
          .from('contribution_tiers')
          .select('id, label, amount, sort_order')
          .eq('ceremony_id', ceremonyId!)
          .order('sort_order', { ascending: true });

        if (error) throw error;

        if (!cancelled) {
          setState(
            data && data.length > 0
              ? { phase: 'ready', tiers: data as ContributionTier[] }
              : { phase: 'empty' },
          );
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: e instanceof Error ? e.message : 'Erro ao carregar os valores.',
          });
        }
      }
    }

    fetchTiers();
    return () => {
      cancelled = true;
    };
  }, [ceremonyId]);

  return state;
}
