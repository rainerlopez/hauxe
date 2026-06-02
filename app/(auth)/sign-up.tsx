import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing } from '../../src/theme/spacing';
import { fontFamily, fontSize, fontWeight } from '../../src/theme/typography';

export default function SignUp() {
  const { signUp } = useAuth();
  const { c } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setError(null);
    setInfo(null);

    if (fullName.trim().length < 2) {
      setError('Informe seu nome completo.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter ao menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const { needsConfirmation } = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
      });
      if (needsConfirmation) {
        setInfo('Conta criada! Verifique seu e-mail para confirmar o cadastro.');
      }
      // Se não exigir confirmação, a sessão já existe e a guarda redireciona.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen centered>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Criar conta</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>
          Comece a participar das cerimônias
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Nome completo"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          autoComplete="name"
          placeholder="Seu nome"
        />
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
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
        />

        {error ? <Text style={[styles.msg, { color: c.error }]}>{error}</Text> : null}
        {info ? <Text style={[styles.msg, { color: c.success }]}>{info}</Text> : null}

        <Button label="Criar conta" onPress={handleSignUp} loading={loading} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: c.textMuted }]}>Já tem conta?</Text>
        <Link href="/sign-in" style={[styles.link, { color: c.primary }]}>
          Entrar
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl, alignItems: 'center', gap: spacing.xs },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: { fontSize: fontSize.md },
  form: { gap: spacing.md },
  msg: { fontSize: fontSize.sm },
  footer: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerText: { fontSize: fontSize.sm },
  link: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
