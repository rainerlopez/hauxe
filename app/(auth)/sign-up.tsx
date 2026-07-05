import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../src/components';
import { formatCpf, isValidCpf, useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

export default function SignUp() {
  const { signUp } = useAuth();
  const { c }      = useTheme();
  const router     = useRouter();

  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [cpf,      setCpf]      = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSignUp() {
    setError(null);
    if (fullName.trim().length < 2) { setError('Informe seu nome completo.'); return; }
    if (!/.+@.+\..+/.test(email))   { setError('Informe um e-mail válido.'); return; }
    if (!isValidCpf(cpf))           { setError('Informe um CPF válido.'); return; }

    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp(email.trim(), cpf, fullName.trim());
      if (needsEmailConfirmation) {
        // Falta confirmar o e-mail: a tela check-email orienta (link + código).
        router.push({ pathname: '/check-email', params: { email: email.trim() } });
      }
      // Com confirmação desativada a sessão já existe — a guarda em _layout
      // redireciona para (app).
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      setError(
        raw.includes('already registered')
          ? 'Este e-mail já tem conta. Use "Entrar" com seu e-mail e CPF.'
          : 'Não foi possível criar sua conta. Tente novamente.',
      );
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

      {/* Formulário — e-mail (login) + CPF (senha) */}
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
          <Text style={[styles.msg, { color: c.error, fontFamily: fontFamily.sans }]}>
            {error}
          </Text>
        ) : null}

        <Button label="Garantir minha vaga" onPress={handleSignUp} loading={loading} />
      </View>

      {/* Trust note */}
      <View style={[styles.trust, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.trustText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          🔒{'  '}Seu e-mail é seu login e seu CPF é sua senha. Sem app para baixar.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          Já tem conta?
        </Text>
        <Text
          onPress={() => router.push('/sign-in')}
          style={[styles.link, { color: c.accent, fontFamily: fontFamily.sansMedium }]}
        >
          Entrar
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
  ceremonyText: { flex: 1 },
  ceremonyTitle: { fontSize: 15, lineHeight: 18 },
  ceremonySub:   { fontSize: fontSize.aux, marginTop: 2 },
  form: {
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  msg: { fontSize: fontSize.micro },
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
