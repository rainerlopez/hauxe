import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

export default function SignUp() {
  const { signUp } = useAuth();
  const { c }      = useTheme();
  const [fullName,  setFullName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [info,      setInfo]      = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);

  async function handleSignUp() {
    setError(null);
    setInfo(null);
    if (fullName.trim().length < 2) { setError('Informe seu nome completo.'); return; }
    if (password.length < 6)        { setError('A senha deve ter ao menos 6 caracteres.'); return; }
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
      });
      if (needsConfirmation) {
        setInfo('Conta criada! Verifique seu e-mail para confirmar.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      {/* Kicker */}
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        INSCRIÇÃO
      </Text>

      {/* Título em Fraunces */}
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Que bom ter você aqui.
      </Text>
      <Text style={[styles.subtitle, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Garanta sua vaga em poucos toques.
      </Text>

      {/* Contexto da cerimônia */}
      <View style={[styles.ceremony, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <View style={[styles.ceremonyIcon, { backgroundColor: c.surface, borderColor: c.border2 }]}>
          <Text style={{ fontSize: 16 }}>🗓</Text>
        </View>
        <View style={styles.ceremonyText}>
          <Text style={[styles.ceremonyTitle, { color: c.text, fontFamily: fontFamily.serif }]}>
            Cerimônia Yawanawá
          </Text>
          <Text style={[styles.ceremonySub, { color: c.text2, fontFamily: fontFamily.sans }]}>
            com Paka Shahu · 31/05, domingo
          </Text>
        </View>
      </View>

      {/* Formulário — mantém lógica email/password */}
      <View style={styles.form}>
        <TextField
          label="Nome completo"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          autoComplete="name"
          placeholder="Como podemos te chamar?"
        />
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
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          placeholder="Mínimo 6 caracteres"
        />

        {error ? (
          <Text style={[styles.msg, { color: c.error, fontFamily: fontFamily.sans }]}>
            {error}
          </Text>
        ) : null}
        {info ? (
          <Text style={[styles.msg, { color: c.success, fontFamily: fontFamily.sans }]}>
            {info}
          </Text>
        ) : null}

        <Button label="Garantir minha vaga" onPress={handleSignUp} loading={loading} />
      </View>

      {/* Trust note */}
      <View style={[styles.trust, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.trustText, { color: c.success, fontFamily: fontFamily.sans }]}>
          🔒{'  '}
          <Text style={{ color: c.text2 }}>Confirmação por e-mail. Sem pressão, sem urgência.</Text>
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          Já tem conta?
        </Text>
        <Link href="/sign-in" style={[styles.link, { color: c.accent, fontFamily: fontFamily.sansMedium }]}>
          Entrar
        </Link>
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
    fontSize: fontSize.title,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.body,
    lineHeight: 24,
    marginBottom: spacing['2xl'],
  },
  ceremony: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    marginBottom: spacing['2xl'],
  },
  ceremonyIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ceremonyText: {
    flex: 1,
  },
  ceremonyTitle: {
    fontSize: 15,
    lineHeight: 18,
  },
  ceremonySub: {
    fontSize: fontSize.aux,
    marginTop: 2,
  },
  form: {
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  msg: {
    fontSize: fontSize.micro,
  },
  trust: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: spacing['2xl'],
  },
  trustText: {
    fontSize: fontSize.aux,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerText: { fontSize: fontSize.bodySm },
  link:       { fontSize: fontSize.bodySm },
});
