import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

/**
 * Tela pós-envio do magic link. Caminho principal: a pessoa clica no link do
 * e-mail e volta logada (rota /callback). Fallback: "Prefere digitar um código?"
 * leva à tela /verify (código de 6 dígitos).
 */
export default function CheckEmail() {
  const { sendOtp } = useAuth();
  const { c }       = useTheme();
  const router      = useRouter();
  const { email = '', fullName = '' } = useLocalSearchParams<{
    email: string;
    fullName?: string;
  }>();

  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleResend() {
    setError(null);
    setResent(false);
    setResending(true);
    try {
      await sendOtp(email, fullName || undefined);
      setResent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível reenviar.');
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      {/* Kicker */}
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        VERIFICAÇÃO
      </Text>

      {/* Título em Fraunces */}
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Verifique seu e-mail.
      </Text>
      <Text style={[styles.subtitle, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Enviamos um link para{'\n'}
        <Text style={{ color: c.text, fontFamily: fontFamily.sansMedium }}>{email}</Text>
        {'\n'}Toque nele para entrar.
      </Text>

      {/* Trust note */}
      <View style={[styles.trust, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.trustText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          🔒{'  '}O link expira em 60 minutos. Não feche este app.
        </Text>
      </View>

      {resent ? (
        <Text style={[styles.info, { color: c.success, fontFamily: fontFamily.sans }]}>
          Enviamos um novo link!
        </Text>
      ) : null}
      {error ? (
        <Text style={[styles.info, { color: c.error, fontFamily: fontFamily.sans }]}>
          {error}
        </Text>
      ) : null}

      {/* Reenviar */}
      <View style={styles.actions}>
        <Button
          label={resending ? 'Reenviando...' : 'Reenviar e-mail'}
          variant="secondary"
          onPress={handleResend}
          loading={resending}
        />
      </View>

      {/* Fallback: digitar código */}
      <Text
        onPress={() =>
          router.push({ pathname: '/verify', params: { email, fullName } })
        }
        style={[styles.fallback, { color: c.accent, fontFamily: fontFamily.sansMedium }]}
      >
        Prefere digitar um código?
      </Text>

      {/* Voltar */}
      <Text
        onPress={() => router.back()}
        style={[styles.back, { color: c.text2, fontFamily: fontFamily.sans }]}
      >
        Voltar
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: fontSize.kicker,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: fontSize.title,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.body,
    lineHeight: 26,
    marginBottom: spacing['2xl'],
  },
  trust: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: spacing.lg,
  },
  trustText: { fontSize: fontSize.aux, lineHeight: 20 },
  info: { fontSize: fontSize.micro, marginBottom: spacing.md, textAlign: 'center' },
  actions: { marginBottom: spacing.xl },
  fallback: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  back: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
  },
});
