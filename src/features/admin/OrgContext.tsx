import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StaffOrg } from './useStaffAccess';

/**
 * Org selecionada no console. Antes cada tela fixava `access.orgs[0]` (e a
 * tela de inscritos nem filtrava org, deixando a RLS decidir) — com 2+ orgs
 * o console podia mostrar dados de uma org diferente da anunciada. Agora a
 * seleção é única, vive no guard do /admin e todas as telas leem daqui.
 */
interface AdminOrgValue {
  org: StaffOrg;
  orgs: StaffOrg[];
  select: (orgId: string) => void;
}

const AdminOrgContext = createContext<AdminOrgValue | null>(null);

export function AdminOrgProvider({ orgs, children }: { orgs: StaffOrg[]; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState(orgs[0]?.org_id ?? null);

  const value = useMemo<AdminOrgValue>(() => {
    const org = orgs.find((o) => o.org_id === selectedId) ?? orgs[0];
    return { org, orgs, select: setSelectedId };
  }, [orgs, selectedId]);

  return <AdminOrgContext.Provider value={value}>{children}</AdminOrgContext.Provider>;
}

/** Org ativa do console. Só pode ser usado sob o guard de /admin (staff). */
export function useAdminOrg(): AdminOrgValue {
  const ctx = useContext(AdminOrgContext);
  if (!ctx) {
    throw new Error('useAdminOrg precisa do AdminOrgProvider (guard de /admin).');
  }
  return ctx;
}

/** O papel na org ATIVA permite gerir o espaço (escritas de admin)? */
export function canManageActiveOrg(org: StaffOrg): boolean {
  return org.role === 'org_admin' || org.role === 'super_admin';
}
