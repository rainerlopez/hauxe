import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth';

/**
 * Papéis de staff dentro de uma org (subset de user_role).
 * 'participant' nunca aparece em org_members — só staff é cadastrada lá.
 */
export type StaffRole = 'super_admin' | 'org_admin' | 'conductor';

export interface StaffOrg {
  org_id: string;
  org_name: string;
  role: StaffRole;
}

export type StaffAccess =
  | { status: 'loading' }
  | { status: 'denied' }                       // logado, mas não é staff de nenhuma org
  | { status: 'staff'; orgs: StaffOrg[] };     // staff de ≥1 org

/**
 * Descobre de quais orgs o usuário logado é STAFF.
 *
 * A segurança real NÃO vem deste hook — vem do RLS no banco:
 *   • org_members só retorna linhas via policy is_org_member(org_id);
 *   • um participante comum recebe 0 linhas aqui E também não consegue ler
 *     nenhum dado de inscritos (registrations/anamneses/payments/profiles),
 *     mesmo que force a navegação para /admin.
 * Este hook serve só para a UX (mostrar/ocultar o console e redirecionar).
 */
export function useStaffAccess(): StaffAccess {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<StaffAccess>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      // Enquanto a sessão ainda está reidratando (hard reload / deep link direto
      // numa rota de /admin), NÃO decida ainda. Se retornássemos 'denied' aqui,
      // o guard do _layout redirecionaria para '/' antes de a sessão chegar —
      // era uma corrida que fazia o console "às vezes não carregar".
      if (authLoading) {
        setState({ status: 'loading' });
        return;
      }

      if (!user) {
        setState({ status: 'denied' });
        return;
      }

      let cancelled = false;

      async function load() {
        setState({ status: 'loading' });

        const { data, error } = await supabase
          .from('org_members')
          .select('org_id, role, organizations ( name )')
          .eq('profile_id', user!.id);

        if (cancelled) return;

        if (error || !data || data.length === 0) {
          setState({ status: 'denied' });
          return;
        }

        const orgs: StaffOrg[] = data.map((row) => {
          const org = row.organizations as unknown as { name: string } | null;
          return {
            org_id: row.org_id as string,
            org_name: org?.name ?? 'Organização',
            role: row.role as StaffRole,
          };
        });

        setState({ status: 'staff', orgs });
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [user, authLoading]),
  );

  return state;
}
