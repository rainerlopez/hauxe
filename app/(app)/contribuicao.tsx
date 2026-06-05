import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/components';
import { useRegistration } from '../../src/features/registration';
import {
  useContributionTiers,
  usePayment,
  type ContributionTier,
} from '../../src/features/payment';
import { useTheme } from '../../src/theme/useTheme';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── tela ───────────────────────────────────────────────────────────────────────

export default function ContribuicaoScreen() {
  const { c }    = useTheme();
  const router   = useRouter();
  const regState = useRegistration();

  const registrationId = regState.phase === 'ready' ? regState.data.progress.registration_id : null;
  const ceremonyId     = regState.phase === 'ready' ? regState.data.ceremony.id : null;

  const tiersState = useContributionTiers(ceremonyId);
  const { state: payState, createCharge, creating } = usePayment(registrationId);

  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── carregando inscrição / pagamento ──
  if (regState.phase === 'loading' || payState.phase === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      </Screen>
    );
  }

  // ── sem inscrição ativa ──
  if (regState.phase !== 'ready' || !registrationId) {
    return (
      <Screen>
        <Header c={c} />
        <Text style={[styles.body, { color: c.text2, fontFamily: fontFamily.sans }]}>
          Você ainda não tem uma inscrição ativa.
        </Text>
      </Screen>
    );
  }

  // ── pagamento confirmado ──
  if (payState.phase === 'paid') {
    return (
      <Screen>
        <Header c={c} />
        <View style={[styles.successCard, { backgroundColor: c.forest, borderColor: c.forestDeep }]}>
          <Text style={[styles.successTitle, { color: c.onForest, fontFamily: fontFamily.serif }]}>
            Contribuição recebida 💛
          </Text>
          <Text style={[styles.successSub, { color: c.onForest, fontFamily: fontFamily.sans }]}>
            Tudo certo. Te esperamos na cerimônia.
          </Text>
        </View>
        <Button label="Voltar ao início" onPress={() => router.back()} />
      </Screen>
    );
  }

  // ── aguardando pagamento (cobrança gerada) ──
  if (payState.phase === 'pending') {
    const { qr_code, qr_code_image, amount } = payState.payment;

    async function handleCopy() {
      if (!qr_code) return;
      await Clipboard.setStringAsync(qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }

    return (
      <Screen>
        <Header c={c} />
        <Text style={[styles.amount, { color: c.text, fontFamily: fontFamily.serif }]}>
          {formatBRL(amount)}
        </Text>
        <Text style={[styles.body, { color: c.text2, fontFamily: fontFamily.sans }]}>
          Escaneie o QR Code ou copie o código PIX abaixo.
        </Text>

        {qr_code_image ? (
          <View style={[styles.qrBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Image
              source={{ uri: qr_code_image }}
              style={styles.qrImage}
              resizeMode="contain"
              accessibilityLabel="QR Code PIX"
            />
          </View>
        ) : null}

        {qr_code ? (
          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [
              styles.copyBox,
              { backgroundColor: c.tint, borderColor: c.border2, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.copyCode, { color: c.text2, fontFamily: fontFamily.sans }]}
            >
              {qr_code}
            </Text>
            <Text style={[styles.copyLabel, { color: c.accent, fontFamily: fontFamily.sansMedium }]}>
              {copied ? 'Copiado ✓' : 'Copiar código'}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.waitRow}>
          <ActivityIndicator color={c.forest} size="small" />
          <Text style={[styles.waitText, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Aguardando confirmação do pagamento…
          </Text>
        </View>
      </Screen>
    );
  }

  // ── escolher tier (sem cobrança ainda) ──
  async function handleGenerate() {
    setError(null);
    if (!selectedTier) {
      setError('Escolha um valor para seguir.');
      return;
    }
    const { error: chargeErr } = await createCharge(selectedTier);
    if (chargeErr) setError(chargeErr);
  }

  return (
    <Screen>
      <Header c={c} />
      <Text style={[styles.body, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Escolha o valor da sua contribuição consciente. Todos garantem sua vaga do mesmo jeito.
      </Text>

      {tiersState.phase === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      )}

      {tiersState.phase === 'empty' && (
        <Text style={[styles.body, { color: c.text3, fontFamily: fontFamily.sans }]}>
          Os valores ainda não foram definidos para esta cerimônia.
        </Text>
      )}

      {tiersState.phase === 'error' && (
        <Text style={[styles.msg, { color: c.error, fontFamily: fontFamily.sans }]}>
          {tiersState.message}
        </Text>
      )}

      {tiersState.phase === 'ready' && (
        <View style={styles.tierList}>
          {tiersState.tiers.map((tier: ContributionTier) => {
            const selected = selectedTier === tier.id;
            return (
              <Pressable
                key={tier.id}
                onPress={() => setSelectedTier(tier.id)}
                style={({ pressed }) => [
                  styles.tierCard,
                  {
                    backgroundColor: selected ? c.forest : c.surface,
                    borderColor: selected ? c.forest : c.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tierAmount,
                    {
                      color: selected ? c.onForest : c.text,
                      fontFamily: fontFamily.serif,
                    },
                  ]}
                >
                  {formatBRL(tier.amount)}
                </Text>
                {tier.label ? (
                  <Text
                    style={[
                      styles.tierLabel,
                      { color: selected ? c.onForest : c.text2, fontFamily: fontFamily.sans },
                    ]}
                  >
                    {tier.label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? (
        <Text style={[styles.msg, { color: c.error, fontFamily: fontFamily.sans }]}>
          {error}
        </Text>
      ) : null}

      {tiersState.phase === 'ready' && (
        <Button label="Gerar PIX" onPress={handleGenerate} loading={creating} />
      )}

      <Text style={[styles.note, { color: c.text3, fontFamily: fontFamily.sans }]}>
        Quando puder — sem pressa. Sua vaga continua sua.
      </Text>
    </Screen>
  );
}

// ─── cabeçalho compartilhado ─────────────────────────────────────────────────────

function Header({ c }: { c: ReturnType<typeof useTheme>['c'] }) {
  return (
    <>
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        CONTRIBUIÇÃO
      </Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Contribuição consciente
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing['3xl'] },

  kicker: {
    fontSize: fontSize.kicker,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.title,
    lineHeight: 32,
    marginBottom: spacing.lg,
  },
  body: {
    fontSize: fontSize.bodySm,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },

  tierList: { gap: spacing.md, marginBottom: spacing.xl },
  tierCard: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  tierAmount: { fontSize: 22, lineHeight: 28 },
  tierLabel:  { fontSize: fontSize.aux, marginTop: 2 },

  amount: {
    fontSize: 30,
    lineHeight: 36,
    marginBottom: spacing.xs,
  },
  qrBox: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  qrImage: { width: 220, height: 220 },
  copyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: spacing.xl,
  },
  copyCode:  { flex: 1, fontSize: fontSize.aux },
  copyLabel: { fontSize: fontSize.bodySm, flexShrink: 0 },

  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  waitText: { fontSize: fontSize.bodySm },

  successCard: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing['2xl'],
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  successTitle: { fontSize: fontSize.title, lineHeight: 30, textAlign: 'center' },
  successSub:   { fontSize: fontSize.bodySm, marginTop: spacing.xs, textAlign: 'center' },

  msg:  { fontSize: fontSize.micro, marginBottom: spacing.md },
  note: {
    fontSize: fontSize.aux,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 20,
  },
});
