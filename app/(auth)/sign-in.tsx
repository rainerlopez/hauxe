import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../src/components';
import { formatCpf, isValidCpf, useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

export default function SignIn() {
  const { signIn } = useAuth();
  const { c }      = useTheme();
  const router     = useRouter();

  const [email,   setEmail]   = useState('');
  const [cpf,     setCpf]     = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    if (!/.+@.+\..+/.test(email)) { setError('Informe um e-mail válido.'); return; }
    if (!isValidCpf(cpf))         { setError('Informe um CPF válido.'); return; }

    setLoading(true);
    try {
      await signIn(email.trim(), cpf);
      // Sessão estabelecida — a guarda em _layout redireciona para (app).
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      setError(
        raw.includes('Invalid login credentials')
          ? 'E-mail e CPF não conferem. Verifique os dados ou crie sua conta.'
          : raw.includes('Email not confirmed')
            ? 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos.'
            : 'Não foi possível entrar. Tente novamente.',
      );
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

      {/* Formulário — e-mail (login) + CPF (senha) */}
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
        <TextField
          label="CPF"
          value={cpf}
          onChangeText={(v) => setCpf(formatCpf(v))}
          autoCapitalize="none"
          autoComplete="off"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={14}
          placeholder="000.000.000-00"
        />

        {error ? (
          <Text style={[styles.error, { color: c.error, fontFamily: fontFamily.sans }]}>
            {error}
          </Text>
        ) : null}

        <Button label="Entrar" onPress={handleSignIn} loading={loading} />
      </View>

      {/* Trust note */}
      <View style={[styles.trust, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.trustText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          🔒{'  '}Sessão segura · entre com o e-mail e o CPF do seu cadastro.
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
