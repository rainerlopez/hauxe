import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing } from '../../src/theme/spacing';
import { fontFamily, fontSize, fontWeight } from '../../src/theme/typography';

export default function SignIn() {
  const { signIn } = useAuth();
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // O redirect é tratado pela guarda em app/_layout.tsx.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen centered>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Hauxe</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          Entre para acessar suas cerimônias
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          placeholder="voce@exemplo.com"
        />
        <TextField
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          placeholder="••••••••"
        />

        {error ? <Text style={[styles.error, { color: c.error }]}>{error}</Text> : null}

        <Button label="Entrar" onPress={handleSignIn} loading={loading} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: c.textMuted }]}>Ainda não tem conta?</Text>
        <Link href="/sign-up" style={[styles.link, { color: c.primary }]}>
          Criar conta
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl, alignItems: 'center', gap: spacing.xs },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: { fontSize: fontSize.md },
  form: { gap: spacing.md },
  error: { fontSize: fontSize.sm },
  footer: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerText: { fontSize: fontSize.sm },
  link: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
