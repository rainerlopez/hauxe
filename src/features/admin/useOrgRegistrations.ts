import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

export interface OrgCeremony {
  id: string;
  title: string;
  starts_at: string;
  capacity: number | null;
}

export interface OrgRegistration {
  id: string;
  profile_id: string;
  status: string;
  brings_food: boolean | null;
  notes: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  ficha_ok: boolean;
  pagamento_ok: boolean;
}

type State =
  | { phase: 'loading' }
  | { phase: 'empty' }                    // sem cerimônia futura
  | { phase: 'ready'; ceremony: OrgCeremony; registrations: OrgRegistration[] }
  | { phase: 'error'; message: string };

/**
 * Inscritos da próxima cerimônia da org, com progresso (ficha/pagamento).
 * Tudo coberto por RLS de staff: registrations/profiles/payments/anamneses
 * "org staff read" + view registration_progress (SECURITY INVOKER).
 * Revalida no foco (check-in/refresh ao voltar do detalhe).
 */
export function useOrgRegistrations(): State {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetch() {
        setState({ phase: 'loading' });
        try {
          // Próxima cerimônia (inclui o dia de hoje — check-in acontece no dia).
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: cer, error: cerErr } = await supabase
            .from('ceremonies')
            .select('id, title, starts_at, capacity')
            .gte('starts_at', since)
            .order('starts_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (cerErr) throw cerErr;
          if (!cer) {
            if (!cancelled) setState({ phase: 'empty' });
            return;
          }

          const { data: regs, error: regErr } = await supabase
            .from('registrations')
            .select('id, profile_id, status, brings_food, notes, profiles ( full_name, email, phone )')
            .eq('ceremony_id', cer.id);
          if (regErr) throw regErr;

          const ids = (regs ?? []).map((r) => r.id as string);
          let progressById = new Map<string, { ficha_ok: boolean; pagamento_ok: boolean }>();
          if (ids.length > 0) {
            const { data: prog, error: progErr } = await supabase
              .from('registration_progress')
              .select('registration_id, ficha_ok, pagamento_ok')
              .in('registration_id', ids);
            if (progErr) throw progErr;
            progressById = new Map(
              (prog ?? []).map((p) => [
                p.registration_id as string,
                { ficha_ok: !!p.ficha_ok, pagamento_ok: !!p.pagamento_ok },
              ]),
            );
          }

          const list: OrgRegistration[] = (regs ?? [])
            .map((r) => {
              const profile = r.profiles as unknown as {
                full_name: string | null;
                email: string | null;
                phone: string | null;
              } | null;
              const prog = progressById.get(r.id as string);
              return {
                id: r.id as string,
                profile_id: r.profile_id as string,
                status: r.status as string,
                brings_food: r.brings_food as boolean | null,
                notes: r.notes as string | null,
                full_name: profile?.full_name ?? null,
                email: profile?.email ?? null,
                phone: profile?.phone ?? null,
                ficha_ok: prog?.ficha_ok ?? false,
                pagamento_ok: prog?.pagamento_ok ?? false,
              };
            })
            .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR'));

          if (!cancelled) {
            setState({
              phase: 'ready',
              ceremony: cer as OrgCeremony,
              registrations: list,
            });
          }
        } catch (e) {
          if (!cancelled) {
            setState({
              phase: 'error',
              message: e instanceof Error ? e.message : 'Erro ao carregar os inscritos.',
            });
          }
        }
      }

      fetch();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return state;
}
