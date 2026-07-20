import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Screen, TextField } from '../../../src/components';
import { useAdminOrg } from '../../../src/features/admin';
import {
  useOrgRegistrations,
  type OrgRegistration,
} from '../../../src/features/admin/useOrgRegistrations';
import {
  useOrgCeremonies,
  type OrgCeremony as OrgCeremonyListItem,
} from '../../../src/features/admin/useOrgCeremonies';
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

type StatusFilter = 'todos' | 'confirmada' | 'reservada' | 'check_in' | 'cancelada';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'reservada', label: 'Reservada' },
  { value: 'check_in', label: 'Check-in' },
  { value: 'cancelada', label: 'Cancelada' },
];

/** Remove acentos e normaliza caixa p/ busca client-side. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function yesNo(v: boolean | null | undefined) {
  return v === true ? 'Sim' : v === false ? 'Não' : '—';
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function slugify(s: string): string {
  const clean = normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  return clean || 'cerimonia';
}

/** CSV (nome, e-mail, telefone, status, ficha, pagamento, leva alimento). Sem dados de saúde (LGPD). */
function buildCsv(rows: OrgRegistration[]): string {
  const header = ['Nome', 'E-mail', 'Telefone', 'Status', 'Ficha', 'Pagamento', 'Leva alimento'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.full_name ?? '',
        r.email ?? '',
        r.phone ?? '',
        STATUS_LABEL[r.status] ?? r.status,
        r.ficha_ok ? 'Sim' : 'Não',
        r.pagamento_ok ? 'Sim' : 'Não',
        yesNo(r.brings_food),
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    );
  }
  // BOM UTF-8 p/ o Excel reconhecer acentuação corretamente.
  return `﻿${lines.join('\r\n')}`;
}

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

function formatChipDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}

function shortTitle(title: string): string {
  return title.length > 22 ? `${title.slice(0, 21)}…` : title;
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

function CeremonyChip({
  ceremony,
  selected,
  onPress,
}: {
  ceremony: OrgCeremonyListItem;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.ceremonyChip,
        {
          backgroundColor: selected ? c.forest : c.surface,
          borderColor: selected ? c.forest : c.border2,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.ceremonyChipTitle,
          { color: selected ? c.onForest : c.text, fontFamily: fontFamily.sansMedium },
        ]}
      >
        {shortTitle(ceremony.title)}
      </Text>
      <Text
        style={[
          styles.ceremonyChipDate,
          { color: selected ? c.onForest : c.text3, fontFamily: fontFamily.sans },
          selected && styles.ceremonyChipDateSelected,
        ]}
      >
        {formatChipDate(ceremony.starts_at)}
      </Text>
    </Pressable>
  );
}

function StatusFilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: selected ? c.accentSoft : c.surface,
          borderColor: selected ? c.accentDeep : c.border2,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: selected ? c.accentDeep : c.text2, fontFamily: fontFamily.sansMedium },
        ]}
      >
        {label}
      </Text>
    </Pressable>
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

/**
 * Console · inscritos de uma cerimônia da org, com seletor (qualquer
 * cerimônia, inclusive passadas — a "próxima" vem pré-selecionada), busca
 * por nome/e-mail, filtro por status e exportação CSV (sem dados de saúde —
 * LGPD).
 */
export default function InscritosScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const orgId = useAdminOrg().org.org_id;
  const ceremoniesState = useOrgCeremonies(orgId);

  // null = comportamento padrão do hook ("próxima" cerimônia).
  const [selectedCeremonyId, setSelectedCeremonyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');

  const state = useOrgRegistrations(selectedCeremonyId);

  // Enquanto nenhuma cerimônia foi escolhida no seletor, destaca a que o
  // hook resolveu sozinho (a "próxima"), sem duplicar essa lógica aqui.
  const highlightedCeremonyId =
    selectedCeremonyId ?? (state.phase === 'ready' ? state.ceremony.id : null);

  const filtered = useMemo(() => {
    if (state.phase !== 'ready') return [];
    const q = normalize(search.trim());
    return state.registrations.filter((r) => {
      if (statusFilter !== 'todos' && r.status !== statusFilter) return false;
      if (!q) return true;
      return normalize(`${r.full_name ?? ''} ${r.email ?? ''}`).includes(q);
    });
  }, [state, search, statusFilter]);

  function handleExportCsv() {
    if (state.phase !== 'ready') return;
    if (filtered.length === 0) return;

    const csv = buildCsv(filtered);
    const filename = `inscritos-${slugify(state.ceremony.title)}.csv`;

    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    Alert.alert('Exportar CSV', 'A exportação de CSV está disponível na versão web do console.');
  }

  const totalActive = state.phase === 'ready' ? state.registrations.filter((r) => r.status !== 'cancelada').length : 0;
  const totalReady =
    state.phase === 'ready'
      ? state.registrations.filter((r) => r.status !== 'cancelada' && r.ficha_ok && r.pagamento_ok).length
      : 0;

  const showSplit = statusFilter === 'todos';
  const activeList = showSplit ? filtered.filter((r) => r.status !== 'cancelada') : filtered;
  const cancelledList = showSplit ? filtered.filter((r) => r.status === 'cancelada') : [];

  return (
    <Screen>
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        CONSOLE · INSCRITOS
      </Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Inscritos
      </Text>

      {ceremoniesState.status === 'ready' && ceremoniesState.ceremonies.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.ceremonyScroll}
          contentContainerStyle={styles.ceremonyRow}
        >
          {ceremoniesState.ceremonies.map((cer) => (
            <CeremonyChip
              key={cer.id}
              ceremony={cer}
              selected={cer.id === highlightedCeremonyId}
              onPress={() => setSelectedCeremonyId(cer.id)}
            />
          ))}
        </ScrollView>
      )}

      {state.phase === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      )}

      {(state.phase === 'empty' || state.phase === 'error') && (
        <>
          <Text style={[styles.sub, { color: c.text2, fontFamily: fontFamily.sans }]}>
            {state.phase === 'empty'
              ? 'Quando houver uma cerimônia publicada, os inscritos aparecem aqui.'
              : state.message}
          </Text>
        </>
      )}

      {state.phase === 'ready' && (
        <>
          <Text style={[styles.ceremonyTitle, { color: c.text, fontFamily: fontFamily.sansSemi }]}>
            {state.ceremony.title}
          </Text>
          <Text style={[styles.sub, { color: c.text2, fontFamily: fontFamily.sans }]}>
            {formatDate(state.ceremony.starts_at)}
          </Text>

          <View style={[styles.summary, { backgroundColor: c.tint, borderColor: c.border2 }]}>
            <Text style={[styles.summaryText, { color: c.text2, fontFamily: fontFamily.sans }]}>
              {totalActive} inscrito{totalActive === 1 ? '' : 's'}
              {state.ceremony.capacity ? ` · ${state.ceremony.capacity} vagas` : ''} · {totalReady} com tudo
              pronto
            </Text>
          </View>

          <TextField
            label="Buscar"
            placeholder="Nome ou e-mail"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchField}
          />

          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((f) => (
              <StatusFilterChip
                key={f.value}
                label={f.label}
                selected={statusFilter === f.value}
                onPress={() => setStatusFilter(f.value)}
              />
            ))}
          </View>

          <Button
            label="Exportar CSV"
            variant="secondary"
            disabled={filtered.length === 0}
            onPress={handleExportCsv}
            style={styles.exportButton}
          />

          <View style={styles.list}>
            {activeList.map((reg) => (
              <RegistrationRow
                key={reg.id}
                reg={reg}
                onPress={() => router.push(`/admin/inscritos/${reg.id}` as never)}
              />
            ))}
            {activeList.length === 0 && (
              <Text style={[styles.sub, { color: c.text3, fontFamily: fontFamily.sans }]}>
                {state.registrations.length === 0
                  ? 'Ninguém se inscreveu ainda.'
                  : 'Nenhum inscrito encontrado para esse filtro.'}
              </Text>
            )}
          </View>

          {cancelledList.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.text3, fontFamily: fontFamily.sansSemi }]}>
                CANCELADAS ({cancelledList.length})
              </Text>
              <View style={styles.list}>
                {cancelledList.map((reg) => (
                  <RegistrationRow
                    key={reg.id}
                    reg={reg}
                    onPress={() => router.push(`/admin/inscritos/${reg.id}` as never)}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing['3xl'], alignItems: 'center' },

  kicker: {
    fontSize: fontSize.kicker,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing.lg },
  sub: { fontSize: fontSize.bodySm, marginBottom: spacing.lg },

  ceremonyScroll: { marginBottom: spacing.lg },
  ceremonyRow: { gap: spacing.sm, paddingRight: spacing.xl },
  ceremonyChip: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minWidth: 108,
  },
  ceremonyChipTitle: { fontSize: fontSize.aux },
  ceremonyChipDate: { fontSize: fontSize.micro, marginTop: 2 },
  ceremonyChipDateSelected: { opacity: 0.75 },

  ceremonyTitle: { fontSize: fontSize.body, lineHeight: 22, marginBottom: 2 },

  summary: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: spacing.lg,
  },
  summaryText: { fontSize: fontSize.aux, lineHeight: 18 },

  searchField: { marginBottom: spacing.md },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterChip: {
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  filterChipText: { fontSize: fontSize.aux },

  exportButton: { marginBottom: spacing.lg, alignSelf: 'flex-start', paddingHorizontal: spacing['2xl'] },

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
