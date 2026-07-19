import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../src/components';
import { canManageOrg, useStaffAccess } from '../../../src/features/admin';
import { useConductors, type Conductor } from '../../../src/features/admin/useConductors';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, sizing, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';
import { useState } from 'react';

type Filter = 'todos' | 'ativos' | 'inativos';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativos', label: 'Ativos' },
  { key: 'inativos', label: 'Inativos' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function ConductorAvatar({ name, avatarUrl, size = 48 }: { name: string; avatarUrl: string | null; size?: number }) {
  const { c } = useTheme();
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        accessibilityIgnoresInvertColors
      />
    );
  }
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

function ConductorRow({ conductor, onPress }: { conductor: Conductor; onPress: () => void }) {
  const { c } = useTheme();
  const firstBioLine = conductor.bio?.split('\n')[0] ?? null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, borderColor: c.border2, opacity: pressed ? 0.75 : conductor.active ? 1 : 0.5 },
      ]}
    >
      <ConductorAvatar name={conductor.name} avatarUrl={conductor.avatar_url} />
      <View style={styles.rowText}>
        <Text
          style={[styles.rowName, { color: c.text, fontFamily: fontFamily.sansMedium }]}
          numberOfLines={1}
        >
          {conductor.name}
        </Text>
        {firstBioLine ? (
          <Text
            style={[styles.rowBio, { color: c.text2, fontFamily: fontFamily.sans }]}
            numberOfLines={1}
          >
            {firstBioLine}
          </Text>
        ) : null}
      </View>
      {!conductor.active && (
        <View style={[styles.badge, { backgroundColor: c.bg2, borderColor: c.border }]}>
          <Text style={[styles.badgeText, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Inativo
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ConductoresListScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const access = useStaffAccess();
  const orgId = access.status === 'staff' ? access.orgs[0].org_id : null;
  // A RLS exige org_admin para escrever em conductors (v06); escondemos a UI
  // de escrita para os demais papéis em vez de deixar o erro cru estourar.
  const canWrite = canManageOrg(access);
  const state = useConductors(orgId);
  const [filter, setFilter] = useState<Filter>('todos');

  const filtered =
    state.status === 'ready'
      ? state.conductors.filter((cond) => {
          if (filter === 'ativos') return cond.active;
          if (filter === 'inativos') return !cond.active;
          return true;
        })
      : [];

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
        Condutores
      </Text>

      {/* Filtro */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.key }}
            style={[
              styles.filterTab,
              { borderColor: filter === f.key ? c.forest : c.border },
              filter === f.key && { backgroundColor: c.forest },
            ]}
          >
            <Text
              style={[
                styles.filterLabel,
                {
                  fontFamily: filter === f.key ? fontFamily.sansMedium : fontFamily.sans,
                  color: filter === f.key ? c.onForest : c.text2,
                },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

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

      {state.status === 'ready' && filtered.length === 0 && (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text, fontFamily: fontFamily.serif }]}>
            Nenhum condutor ainda
          </Text>
          <Text style={[styles.emptyBody, { color: c.text2, fontFamily: fontFamily.sans }]}>
            {filter === 'todos'
              ? 'Adicione o primeiro condutor do seu espaço.'
              : filter === 'ativos'
              ? 'Sem condutores ativos no momento.'
              : 'Sem condutores inativos.'}
          </Text>
          {filter === 'todos' && canWrite && (
            <Pressable
              onPress={() => router.push('/admin/condutores/novo' as never)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.ctaButton,
                { backgroundColor: c.forest, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text style={[styles.ctaLabel, { color: c.onForest, fontFamily: fontFamily.sansMedium }]}>
                Adicionar condutor
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {state.status === 'ready' && filtered.length > 0 && (
        <View style={styles.list}>
          {filtered.map((conductor) => (
            <ConductorRow
              key={conductor.id}
              conductor={conductor}
              onPress={() => router.push(`/admin/condutores/${conductor.id}` as never)}
            />
          ))}
        </View>
      )}

      {/* Botão primário — visível quando pronto e o papel permite escrita */}
      {state.status === 'ready' && filtered.length > 0 && canWrite && (
        <Pressable
          onPress={() => router.push('/admin/condutores/novo' as never)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: c.forest, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <Text style={[styles.addLabel, { color: c.onForest, fontFamily: fontFamily.sansMedium }]}>
            Adicionar condutor
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
  filterRow:   { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing['2xl'] },
  filterTab: {
    flex: 1,
    height: sizing.minTouch,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: { fontSize: fontSize.aux },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    minHeight: sizing.minTouch,
  },
  rowText:     { flex: 1, gap: 2 },
  rowName:     { fontSize: fontSize.bodySm },
  rowBio:      { fontSize: fontSize.aux },
  badge: {
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 10,
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
