import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../src/components';
import { canManageOrg, useStaffAccess } from '../../../src/features/admin';
import {
  CEREMONY_STATUS_LABEL,
  useOrgCeremonies,
  type OrgCeremony,
  type CeremonyStatus,
} from '../../../src/features/admin/useOrgCeremonies';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, sizing, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: CeremonyStatus }) {
  const { c } = useTheme();
  const tone =
    status === 'publicada'
      ? { bg: c.successSoft, border: c.success, text: c.success }
      : status === 'cancelada'
      ? { bg: c.tint, border: c.error, text: c.error }
      : status === 'encerrada'
      ? { bg: c.bg2, border: c.border, text: c.text3 }
      : { bg: c.accentSoft, border: c.accentDeep, text: c.accentDeep }; // rascunho

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.badgeText, { color: tone.text, fontFamily: fontFamily.sansMedium }]}>
        {CEREMONY_STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

function CeremonyRow({ ceremony, onPress }: { ceremony: OrgCeremony; onPress: () => void }) {
  const { c } = useTheme();

  const countLabel =
    ceremony.active_registrations_count === null
      ? null
      : `${ceremony.active_registrations_count} inscrito${ceremony.active_registrations_count === 1 ? '' : 's'}`;
  const capacityLabel = ceremony.capacity ? `${ceremony.capacity} vagas` : 'sem limite';
  const summary = countLabel ? `${countLabel} · ${capacityLabel}` : capacityLabel;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, borderColor: c.border2, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.rowHead}>
        <Text
          style={[styles.rowTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}
          numberOfLines={1}
        >
          {ceremony.title}
        </Text>
        <StatusBadge status={ceremony.status} />
      </View>
      <Text style={[styles.rowDate, { color: c.text2, fontFamily: fontFamily.sans }]}>
        {formatDate(ceremony.starts_at)}
      </Text>
      <Text style={[styles.rowSummary, { color: c.text3, fontFamily: fontFamily.sans }]}>
        {summary}
      </Text>
    </Pressable>
  );
}

export default function CerimoniasListScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const access = useStaffAccess();
  const orgId = access.status === 'staff' ? access.orgs[0].org_id : null;
  const canWrite = canManageOrg(access);
  const state = useOrgCeremonies(orgId);

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
        Cerimônias
      </Text>

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

      {state.status === 'ready' && state.ceremonies.length === 0 && (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text, fontFamily: fontFamily.serif }]}>
            Nenhuma cerimônia ainda
          </Text>
          <Text style={[styles.emptyBody, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Crie a primeira cerimônia do seu espaço.
          </Text>
          {canWrite && (
            <Pressable
              onPress={() => router.push('/admin/cerimonias/nova' as never)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.ctaButton,
                { backgroundColor: c.forest, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text style={[styles.ctaLabel, { color: c.onForest, fontFamily: fontFamily.sansMedium }]}>
                Nova cerimônia
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {state.status === 'ready' && state.ceremonies.length > 0 && (
        <View style={styles.list}>
          {state.ceremonies.map((ceremony) => (
            <CeremonyRow
              key={ceremony.id}
              ceremony={ceremony}
              onPress={() => router.push(`/admin/cerimonias/${ceremony.id}` as never)}
            />
          ))}
        </View>
      )}

      {state.status === 'ready' && state.ceremonies.length > 0 && canWrite && (
        <Pressable
          onPress={() => router.push('/admin/cerimonias/nova' as never)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: c.forest, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <Text style={[styles.addLabel, { color: c.onForest, fontFamily: fontFamily.sansMedium }]}>
            Nova cerimônia
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backLink:    { paddingVertical: spacing.sm, marginBottom: spacing.xs },
  backText:    { fontSize: fontSize.bodySm },
  title:       { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing['2xl'] },
  center:      { paddingVertical: spacing['3xl'], alignItems: 'center' },
  errorText:   { fontSize: fontSize.bodySm, textAlign: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyTitle:  { fontSize: fontSize.body, textAlign: 'center' },
  emptyBody:   { fontSize: fontSize.bodySm, textAlign: 'center', maxWidth: 280 },
  ctaButton: {
    marginTop: spacing.md,
    height: sizing.button,
    borderRadius: borderRadius.button,
    paddingHorizontal: spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel:    { fontSize: fontSize.body },
  list:        { gap: spacing.sm, marginBottom: spacing['2xl'] },
  row: {
    padding: spacing.md,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    gap: spacing.xs,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { fontSize: fontSize.bodySm, flexShrink: 1 },
  rowDate:    { fontSize: fontSize.aux },
  rowSummary: { fontSize: fontSize.micro },
  badge: {
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  badgeText:   { fontSize: fontSize.micro },
  addButton: {
    height: sizing.button,
    borderRadius: borderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel:    { fontSize: fontSize.body },
});
