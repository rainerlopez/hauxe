import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../src/components';
import {
  useOrgRegistrations,
  type OrgRegistration,
} from '../../../src/features/admin/useOrgRegistrations';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

const STATUS_LABEL: Record<string, string> = {
  reservada: 'Reservada',
  pendente: 'Pendente',
  aguardando_pagamento: 'Aguardando PIX',
  confirmada: 'Confirmada',
  check_in: 'Check-in ✓',
  cancelada: 'Cancelada',
  lista_espera: 'Lista de espera',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: ok ? c.successSoft : c.tint,
          borderColor: ok ? c.success : c.border2,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: ok ? c.success : c.text3, fontFamily: fontFamily.sansMedium },
        ]}
      >
        {ok ? '✓ ' : '○ '}
        {label}
      </Text>
    </View>
  );
}

function RegistrationRow({ reg, onPress }: { reg: OrgRegistration; onPress: () => void }) {
  const { c } = useTheme();
  const cancelled = reg.status === 'cancelada';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: c.surface,
          borderColor: c.border2,
          opacity: pressed ? 0.75 : cancelled ? 0.45 : 1,
        },
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
          {reg.full_name ?? reg.email ?? 'Sem nome'}
        </Text>
        <Text style={[styles.rowStatus, { color: c.text2, fontFamily: fontFamily.sans }]}>
          {STATUS_LABEL[reg.status] ?? reg.status}
        </Text>
      </View>
      {!cancelled && (
        <View style={styles.chips}>
          <Chip ok={reg.ficha_ok} label="Ficha" />
          <Chip ok={reg.pagamento_ok} label="PIX" />
        </View>
      )}
    </Pressable>
  );
}

/** Console · inscritos da próxima cerimônia, com progresso e acesso à ficha. */
export default function InscritosScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const state = useOrgRegistrations();

  if (state.phase === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      </Screen>
    );
  }

  if (state.phase === 'empty' || state.phase === 'error') {
    return (
      <Screen>
        <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
          CONSOLE · INSCRITOS
        </Text>
        <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
          {state.phase === 'empty' ? 'Nenhuma cerimônia futura' : 'Não foi possível carregar'}
        </Text>
        <Text style={[styles.sub, { color: c.text2, fontFamily: fontFamily.sans }]}>
          {state.phase === 'empty'
            ? 'Quando houver uma cerimônia publicada, os inscritos aparecem aqui.'
            : state.message}
        </Text>
      </Screen>
    );
  }

  const { ceremony, registrations } = state;
  const active = registrations.filter((r) => r.status !== 'cancelada');
  const cancelled = registrations.filter((r) => r.status === 'cancelada');
  const ready = active.filter((r) => r.ficha_ok && r.pagamento_ok).length;

  return (
    <Screen>
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        CONSOLE · INSCRITOS
      </Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        {ceremony.title}
      </Text>
      <Text style={[styles.sub, { color: c.text2, fontFamily: fontFamily.sans }]}>
        {formatDate(ceremony.starts_at)}
      </Text>

      <View style={[styles.summary, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.summaryText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          {active.length} inscrito{active.length === 1 ? '' : 's'}
          {ceremony.capacity ? ` · ${ceremony.capacity} vagas` : ''} · {ready} com tudo pronto
        </Text>
      </View>

      <View style={styles.list}>
        {active.map((reg) => (
          <RegistrationRow
            key={reg.id}
            reg={reg}
            onPress={() => router.push(`/admin/inscritos/${reg.id}` as never)}
          />
        ))}
        {active.length === 0 && (
          <Text style={[styles.sub, { color: c.text3, fontFamily: fontFamily.sans }]}>
            Ninguém se inscreveu ainda.
          </Text>
        )}
      </View>

      {cancelled.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: c.text3, fontFamily: fontFamily.sansSemi }]}>
            CANCELADAS ({cancelled.length})
          </Text>
          <View style={styles.list}>
            {cancelled.map((reg) => (
              <RegistrationRow
                key={reg.id}
                reg={reg}
                onPress={() => router.push(`/admin/inscritos/${reg.id}` as never)}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  kicker: {
    fontSize: fontSize.kicker,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing.xs },
  sub: { fontSize: fontSize.bodySm, marginBottom: spacing.lg },

  summary: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: spacing.lg,
  },
  summaryText: { fontSize: fontSize.aux, lineHeight: 18 },

  list: { gap: spacing.sm, marginBottom: spacing.lg },

  sectionLabel: {
    fontSize: fontSize.micro,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },

  row: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowText: {},
  rowName: { fontSize: fontSize.body, lineHeight: 20 },
  rowStatus: { fontSize: fontSize.aux, marginTop: 2 },

  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  chipText: { fontSize: fontSize.micro },
});
