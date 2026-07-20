import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../src/components';
import { useAuth } from '../../../src/features/auth';
import { useStaffAccess, useOrgTeam, type OrgTeamMember, type StaffRole } from '../../../src/features/admin';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, sizing, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

// Mesmo mapeamento de app/admin/index.tsx (ROLE_LABEL) — mantido em sincronia.
const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  org_admin: 'Administradora',
  conductor: 'Condutora',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function MemberAvatar({ name, size = 48 }: { name: string; size?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.forest,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.onForest, fontFamily: fontFamily.sansMedium, fontSize: size * 0.35 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

function MemberRow({ member, isYou }: { member: OrgTeamMember; isYou: boolean }) {
  const { c } = useTheme();
  const displayName = member.full_name?.trim() || 'Sem nome cadastrado';

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border2 }]}>
      <MemberAvatar name={displayName} />
      <View style={styles.rowText}>
        <Text
          style={[styles.rowName, { color: c.text, fontFamily: fontFamily.sansMedium }]}
          numberOfLines={1}
        >
          {displayName}
          {isYou ? ' (você)' : ''}
        </Text>
        <Text
          style={[styles.rowEmail, { color: c.text2, fontFamily: fontFamily.sans }]}
          numberOfLines={1}
        >
          {member.email ?? 'E-mail não disponível'}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: c.accentSoft, borderColor: c.border2 }]}>
        <Text style={[styles.badgeText, { color: c.accentDeep, fontFamily: fontFamily.sansSemi }]}>
          {ROLE_LABEL[member.role]}
        </Text>
      </View>
    </View>
  );
}

export default function EquipeListScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const access = useStaffAccess();
  const { user } = useAuth();
  const orgId = access.status === 'staff' ? access.orgs[0].org_id : null;
  const state = useOrgTeam(orgId);

  return (
    <Screen>
      {/* Cabeçalho */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.backText, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
          ← Console
        </Text>
      </Pressable>

      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Equipe
      </Text>

      {/* Estados */}
      {state.status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: c.error, fontFamily: fontFamily.sans }]}>
            {state.message}
          </Text>
        </View>
      )}

      {state.status === 'ready' && state.members.length === 0 && (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text, fontFamily: fontFamily.serif }]}>
            Nenhuma pessoa na equipe ainda
          </Text>
          <Text style={[styles.emptyBody, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Fale com o suporte técnico para adicionar administradoras e condutoras.
          </Text>
        </View>
      )}

      {state.status === 'ready' && state.members.length > 0 && (
        <View style={styles.list}>
          {state.members.map((member) => (
            <MemberRow
              key={member.profile_id}
              member={member}
              isYou={member.profile_id === user?.id}
            />
          ))}
        </View>
      )}

      {/* Nota de somente-leitura */}
      <Text style={[styles.readOnlyNote, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Para adicionar ou remover pessoas da equipe, fale com o suporte técnico.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backLink:  { paddingVertical: spacing.sm, marginBottom: spacing.xs },
  backText:  { fontSize: fontSize.bodySm },
  title:     { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing['2xl'] },
  center:    { paddingVertical: spacing['3xl'], alignItems: 'center' },
  errorText: { fontSize: fontSize.bodySm, textAlign: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: fontSize.body, textAlign: 'center' },
  emptyBody:  { fontSize: fontSize.bodySm, textAlign: 'center', maxWidth: 280 },
  list:       { gap: spacing.sm, marginBottom: spacing['2xl'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    minHeight: sizing.minTouch,
  },
  rowText:   { flex: 1, gap: 2 },
  rowName:   { fontSize: fontSize.bodySm },
  rowEmail:  { fontSize: fontSize.aux },
  badge: {
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  badgeText: { fontSize: fontSize.micro },
  readOnlyNote: {
    fontSize: fontSize.aux,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
