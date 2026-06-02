import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

export default function SignIn() {
  const { sendOtp } = useAuth();
  const { c }       = useTheme();
  const router      = useRouter();

  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    setError(null);
    if (!/.+@.+\..+/.test(email)) { setError('Informe um e-mail válido.'); return; }

    setLoading(true);
    try {
      await sendOtp(email.trim());
      router.push({ pathname: '/verify', params: { email: email.trim() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o código.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      {/* Kicker */}
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        BEM-VINDO DE VOLTA
      </Text>

      {/* Título em Fraunces */}
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Haux!
      </Text>
      <Text style={[styles.subtitle, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Entre para acessar suas cerimônias.
      </Text>

      {/* Formulário — só e-mail, sem senha */}
      <View style={styles.form}>
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          placeholder="voce@email.com"
        />

        {error ? (
          <Text style={[styles.error, { color: c.error, fontFamily: fontFamily.sans }]}>
            {error}
          </Text>
        ) : null}

        <Button label="Entrar" onPress={handleSendOtp} loading={loading} />
      </View>

      {/* Trust note */}
      <View style={[styles.trust, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.trustText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          🔒{'  '}Sessão segura · você recebe um código no e-mail.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          Ainda não tem conta?
        </Text>
        <Text
          onPress={() => router.push('/sign-up')}
          style={[styles.link, { color: c.accent, fontFamily: fontFamily.sansMedium }]}
        >
          Criar conta
        </Text>
      </View>
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
    fontSize: 34,
    lineHeight: 38,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.body,
    lineHeight: 24,
    marginBottom: spacing['2xl'],
  },
  form: {
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  error: { fontSize: fontSize.micro },
  trust: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: spacing['2xl'],
  },
  trustText: { fontSize: fontSize.aux, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerText: { fontSize: fontSize.bodySm },
  link:       { fontSize: fontSize.bodySm },
});
