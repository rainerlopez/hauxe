import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useRegistration } from '../../src/features/registration/useRegistration';
import { useAvailableCeremonies } from '../../src/features/registration/useAvailableCeremonies';
import { useTheme } from '../../src/theme/useTheme';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

// ─── utilidade ───────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      weekday: 'short',
    });
  } catch {
    return iso;
  }
}

// ─── componente de cartão de tarefa ──────────────────────────────────────────

interface TaskCardProps {
  done: boolean;
  title: string;
  pendingLabel: string;
  doneLabel: string;
  tone: 'care' | 'gentle'; // care = ficha (segurança), gentle = contribuição (sem pressão)
  onPress: () => void;
}

function TaskCard({ done, title, pendingLabel, doneLabel, tone, onPress }: TaskCardProps) {
  const { c } = useTheme();

  const cardBg = done
    ? (tone === 'care' ? 'rgba(47,125,91,0.07)' : 'rgba(47,125,91,0.07)')
    : c.surface;
  const cardBorder = done ? c.success : c.border;

  return (
    <Pressable
      onPress={done ? undefined : onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.taskCard,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          opacity: pressed && !done ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.taskCardInner}>
        {/* ícone */}
        <View
          style={[
            styles.taskIcon,
            {
              backgroundColor: done ? c.success : c.tint,
              borderColor: done ? c.success : c.border2,
            },
          ]}
        >
          <Text style={styles.taskIconText}>{done ? '✓' : tone === 'care' ? '📋' : '💛'}</Text>
        </View>

        {/* texto */}
        <View style={styles.taskText}>
          <Text style={[styles.taskTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
            {title}
          </Text>
          <Text style={[styles.taskSub, { color: done ? c.success : c.text2, fontFamily: fontFamily.sans }]}>
            {done ? doneLabel : pendingLabel}
          </Text>
        </View>

        {/* chevron se pendente */}
        {!done && (
          <Text style={[styles.taskChevron, { color: c.text3 }]}>›</Text>
        )}
      </View>

      {/* nota de tom (só pendente) */}
      {!done && (
        <Text
          style={[
            styles.taskNote,
            {
              color: tone === 'care' ? c.forest : c.text3,
              fontFamily: fontFamily.sans,
            },
          ]}
        >
          {tone === 'care'
            ? 'Precisamos dela para cuidar de você no dia.'
            : 'Quando puder — sem pressa.'}
        </Text>
      )}
    </Pressable>
  );
}

// ─── tela principal ───────────────────────────────────────────────────────────

export default function HubScreen() {
  const { user } = useAuth();
  const { c }    = useTheme();
  const router   = useRouter();
  const regState = useRegistration();
  const avail    = useAvailableCeremonies();

  // ── estado: carregando ──
  if (regState.phase === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      </Screen>
    );
  }

  // ── estado: sem inscrição → cerimônias abertas ──
  if (regState.phase === 'none' || regState.phase === 'error') {
    return (
      <Screen>
        {/* Kicker */}
        <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
          OCA GUATA HETÉ
        </Text>
        <Text style={[styles.noRegTitle, { color: c.text, fontFamily: fontFamily.serif }]}>
          Olá{user?.email ? `, ${user.email.split('@')[0]}` : ''}!
        </Text>
        <Text style={[styles.noRegSub, { color: c.text2, fontFamily: fontFamily.sans }]}>
          {avail.phase === 'ready'
            ? 'Estas são as próximas cerimônias do espaço.'
            : 'Você ainda não tem inscrição em nenhuma cerimônia.'}
        </Text>

        {avail.phase === 'loading' && <ActivityIndicator color={c.forest} />}

        {avail.phase === 'ready' && (
          <View style={styles.taskSection}>
            {avail.ceremonies.map((cer) => (
              <Pressable
                key={cer.id}
                onPress={() => router.push(`/cerimonia/${cer.id}` as never)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.cerCard,
                  { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.82 : 1 },
                ]}
              >
                <View style={styles.cerCardText}>
                  <Text style={[styles.cerCardTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
                    {cer.title}
                  </Text>
                  <Text style={[styles.cerCardDate, { color: c.text2, fontFamily: fontFamily.sans }]}>
                    {formatDate(cer.starts_at)}
                    {cer.my_status === 'cancelada' ? ' · você cancelou — dá para refazer' : ''}
                  </Text>
                </View>
                <Text style={[styles.taskChevron, { color: c.text3 }]}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        {(avail.phase === 'empty' || avail.phase === 'error') && (
          <View style={[styles.trustNote, { backgroundColor: c.tint, borderColor: c.border2 }]}>
            <Text style={[styles.trustText, { color: c.text2, fontFamily: fontFamily.sans }]}>
              🌿{'  '}Quando uma cerimônia estiver disponível, ela vai aparecer aqui.
            </Text>
          </View>
        )}
      </Screen>
    );
  }

  // ── estado: inscrição ativa ──
  const { progress: p, ceremony: c_ } = regState.data;
  const pendingCount = (p.ficha_ok ? 0 : 1) + (p.pagamento_ok ? 0 : 1);
  const allDone = pendingCount === 0;

  return (
    <Screen>
      {/* ── Cabeçalho: kicker + nome da cerimônia ── */}
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        OCA GUATA HETÉ · MINHA INSCRIÇÃO
      </Text>
      <Text style={[styles.ceremonyName, { color: c.text, fontFamily: fontFamily.serif }]}>
        {c_.title}
      </Text>
      <Text style={[styles.ceremonyDate, { color: c.text2, fontFamily: fontFamily.sans }]}>
        {formatDate(c_.starts_at)}
      </Text>

      {/* ── Âncora emocional: vaga garantida ── */}
      <View
        style={[
          styles.anchorCard,
          { backgroundColor: c.forest, borderColor: c.forestDeep },
        ]}
      >
        <Text style={[styles.anchorLabel, { color: c.onForest, fontFamily: fontFamily.sansSemi }]}>
          {allDone ? 'Tudo certo, te esperamos!' : 'Sua vaga está garantida.'}
        </Text>
        {allDone && (
          <Text style={[styles.anchorSub, { color: c.onForest, fontFamily: fontFamily.sans }]}>
            Haux! 🏹
          </Text>
        )}
      </View>

      {/* ── Cartões de tarefa ── */}
      {!allDone && (
        <View style={styles.taskSection}>
          <TaskCard
            done={p.ficha_ok}
            title="Ficha de saúde"
            pendingLabel="Preencher ficha"
            doneLabel="Ficha preenchida ✓"
            tone="care"
            onPress={() => router.push('/anamnese')}
          />
          <TaskCard
            done={p.pagamento_ok}
            title="Contribuição"
            pendingLabel="Contribuir via PIX"
            doneLabel="Contribuição recebida ✓"
            tone="gentle"
            onPress={() => router.push('/contribuicao')}
          />
        </View>
      )}

      {/* ── Linha de progresso ── */}
      <Text
        style={[
          styles.progressLine,
          {
            color: allDone ? c.success : c.text2,
            fontFamily: allDone ? fontFamily.sansMedium : fontFamily.sans,
          },
        ]}
      >
        {allDone
          ? 'Tudo pronto para a cerimônia!'
          : pendingCount === 1
          ? 'Falta 1 passo para concluir'
          : 'Faltam 2 passos para concluir'}
      </Text>

      {/* ── Rodapé tranquilizador ── */}
      {!allDone && (
        <View style={[styles.footer, { backgroundColor: c.tint, borderColor: c.border2 }]}>
          <Text style={[styles.footerText, { color: c.text2, fontFamily: fontFamily.sans }]}>
            🌿{'  '}Faça cada passo quando puder. Sua vaga continua sua.
          </Text>
        </View>
      )}
    </Screen>
  );
}

// ─── estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  kicker: {
    fontSize: fontSize.kicker,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  ceremonyName: {
    fontSize: fontSize.title,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  ceremonyDate: {
    fontSize: fontSize.bodySm,
    marginBottom: spacing['2xl'],
  },

  anchorCard: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing['2xl'],
    marginBottom: spacing['2xl'],
    alignItems: 'center',
  },
  anchorLabel: {
    fontSize: fontSize.body,
    textAlign: 'center',
  },
  anchorSub: {
    fontSize: fontSize.bodySm,
    marginTop: spacing.xs,
  },

  taskSection: { gap: spacing.md, marginBottom: spacing.lg },

  taskCard: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  taskCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.field,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  taskIconText: { fontSize: 18 },
  taskText:    { flex: 1 },
  taskTitle:   { fontSize: fontSize.body, lineHeight: 20 },
  taskSub:     { fontSize: fontSize.aux, marginTop: 2 },
  taskChevron: { fontSize: 22, fontWeight: '300' as const },
  taskNote: {
    fontSize: fontSize.micro,
    marginTop: spacing.sm,
    lineHeight: 18,
  },

  progressLine: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  footer: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: spacing['2xl'],
  },
  footerText: { fontSize: fontSize.aux, lineHeight: 20 },

  cerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cerCardText:  { flex: 1 },
  cerCardTitle: { fontSize: fontSize.body, lineHeight: 20 },
  cerCardDate:  { fontSize: fontSize.aux, marginTop: 2 },

  noRegTitle: {
    fontSize: fontSize.title,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  noRegSub: {
    fontSize: fontSize.body,
    marginBottom: spacing['2xl'],
  },
  trustNote: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  trustText: { fontSize: fontSize.aux, lineHeight: 20 },
});
