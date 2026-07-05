import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { Button, Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing, borderRadius, sizing } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

const CODE_LENGTH = 6;

export default function Verify() {
  const { resendConfirmation, confirmSignUpCode } = useAuth();
  const { c }    = useTheme();
  const router   = useRouter();
  const { email = '' } = useLocalSearchParams<{ email: string }>();

  const [digits,    setDigits]    = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error,     setError]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);

  const inputs = useRef<(TextInput | null)[]>([]);

  const code = digits.join('');
  const ready = code.length === CODE_LENGTH && code.replace(/\s/g, '').length === CODE_LENGTH;

  function handleDigit(value: string, index: number) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    setError(null);
    if (!ready) return;
    setLoading(true);
    try {
      await confirmSignUpCode(email, code);
      // Conta confirmada e sessão estabelecida — guarda em _layout redireciona
      // para (app). Próximos logins: e-mail + CPF.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido. Tente novamente.');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);
    setResent(false);
    try {
      await resendConfirmation(email);
      setResent(true);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      setError(
        raw.includes('you can only request this after')
          ? 'Aguarde alguns segundos antes de pedir um novo envio.'
          : 'Não foi possível reenviar. Tente novamente.',
      );
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
        Código enviado.
      </Text>
      <Text style={[styles.subtitle, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Verifique o e-mail{'\n'}
        <Text style={{ color: c.text, fontFamily: fontFamily.sansMedium }}>{email}</Text>
      </Text>

      {/* Caixas de dígitos */}
      <View style={styles.digitRow}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(r) => { inputs.current[i] = r; }}
            value={d}
            onChangeText={(v) => handleDigit(v, i)}
            onKeyPress={(e) => handleKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            style={[
              styles.digitBox,
              {
                color: c.text,
                backgroundColor: c.surface,
                borderColor: d ? c.focusRing : c.border,
                fontFamily: fontFamily.sansMedium,
              },
            ]}
          />
        ))}
      </View>

      {error ? (
        <Text style={[styles.error, { color: c.error, fontFamily: fontFamily.sans }]}>
          {error}
        </Text>
      ) : null}

      {resent ? (
        <Text style={[styles.info, { color: c.success, fontFamily: fontFamily.sans }]}>
          Novo código enviado!
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label="Confirmar" onPress={handleVerify} loading={loading} disabled={!ready} />
      </View>

      {/* Trust note */}
      <View style={[styles.trust, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.trustText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          🔒{'  '}O código expira em 60 minutos.
        </Text>
      </View>

      {/* Reenviar + voltar */}
      <View style={styles.footer}>
        <Text
          onPress={resending ? undefined : handleResend}
          style={[styles.link, { color: resending ? c.text3 : c.accent, fontFamily: fontFamily.sansMedium }]}
        >
          {resending ? 'Enviando...' : 'Reenviar código'}
        </Text>
        <Text style={[styles.sep, { color: c.text3 }]}>·</Text>
        <Text
          onPress={() => router.back()}
          style={[styles.link, { color: c.text2, fontFamily: fontFamily.sans }]}
        >
          Voltar
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
    lineHeight: 26,
    marginBottom: spacing['2xl'],
  },
  digitRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  digitBox: {
    flex: 1,
    height: sizing.field,
    borderWidth: 1.5,
    borderRadius: borderRadius.field,
    textAlign: 'center',
    fontSize: 22,
  },
  error: { fontSize: fontSize.micro, marginBottom: spacing.sm },
  info:  { fontSize: fontSize.micro, marginBottom: spacing.sm, textAlign: 'center' },
  actions: {
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
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
    alignItems: 'center',
    gap: spacing.sm,
  },
  link: { fontSize: fontSize.bodySm },
  sep:  { fontSize: fontSize.bodySm },
});
