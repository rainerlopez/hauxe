import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { friendlyDbError } from '../../lib/friendlyDbError';
import type { StaffRole } from './useStaffAccess';

export interface OrgTeamMember {
  profile_id: string;
  role: StaffRole;
  created_at: string;
  full_name: string | null;
  email: string | null;
}

type OrgTeamState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; members: OrgTeamMember[] };

const ROLE_ORDER: Record<StaffRole, number> = {
  super_admin: 0,
  org_admin: 1,
  conductor: 2,
};

/**
 * Equipe (org_members) da org, com nome/e-mail via join em profiles.
 * SOMENTE LEITURA: org_members só tem a policy "org_members - read"
 * (is_org_member) — não há policy de escrita (db/hauxe_schema.sql:298).
 * Adicionar/remover pessoas da equipe exige acesso privilegiado (suporte).
 * Ordenado por papel (super_admin > org_admin > conductor) e depois nome.
 */
export function useOrgTeam(orgId: string | null): OrgTeamState {
  const [state, setState] = useState<OrgTeamState>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (!orgId) {
        setState({ status: 'ready', members: [] });
        return;
      }

      let cancelled = false;

      async function load() {
        setState({ status: 'loading' });

        const { data, error } = await supabase
          .from('org_members')
          .select('profile_id, role, created_at, profiles ( full_name, email )')
          .eq('org_id', orgId);

        if (cancelled) return;

        if (error) {
          setState({ status: 'error', message: friendlyDbError(error.message) });
          return;
        }

        const members: OrgTeamMember[] = (data ?? [])
          .map((row) => {
            const profile = row.profiles as unknown as {
              full_name: string | null;
              email: string | null;
            } | null;
            return {
              profile_id: row.profile_id as string,
              role: row.role as StaffRole,
              created_at: row.created_at as string,
              full_name: profile?.full_name ?? null,
              email: profile?.email ?? null,
            };
          })
          .sort((a, b) => {
            const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
            if (roleDiff !== 0) return roleDiff;
            return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR');
          });

        setState({ status: 'ready', members });
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [orgId]),
  );

  return state;
}
