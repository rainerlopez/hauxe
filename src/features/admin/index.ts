// Feature: console administrativo da Kao (staff/admin de org)
export { useStaffAccess, canManageOrg } from './useStaffAccess';
export type { StaffAccess, StaffOrg, StaffRole } from './useStaffAccess';

export { AdminOrgProvider, useAdminOrg, canManageActiveOrg } from './OrgContext';

export { useConductors } from './useConductors';
export type { Conductor } from './useConductors';

export { useOrgRegistrations } from './useOrgRegistrations';
export type { OrgRegistration } from './useOrgRegistrations';

export { useAnamneseFor } from './useAnamneseFor';

export { useOrgCeremonies } from './useOrgCeremonies';
export type { OrgCeremony as OrgCeremonyListItem, CeremonyStatus } from './useOrgCeremonies';

export { useOrgTeam } from './useOrgTeam';
export type { OrgTeamMember } from './useOrgTeam';
