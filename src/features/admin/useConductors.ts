import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

export interface Conductor {
  id: string;
  org_id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

type ConductorsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; conductors: Conductor[] };

export function useConductors(orgId: string | null): ConductorsState {
  const [state, setState] = useState<ConductorsState>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (!orgId) {
        setState({ status: 'ready', conductors: [] });
        return;
      }

      let cancelled = false;

      async function load() {
        setState({ status: 'loading' });

        const { data, error } = await supabase
          .from('conductors')
          .select('*')
          .eq('org_id', orgId)
          .order('active', { ascending: false })
          .order('name', { ascending: true });

        if (cancelled) return;

        if (error) {
          setState({ status: 'error', message: error.message });
          return;
        }

        setState({ status: 'ready', conductors: (data ?? []) as Conductor[] });
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [orgId]),
  );

  return state;
}
