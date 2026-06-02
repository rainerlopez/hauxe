import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

/**
 * Recebe o retorno do magic link (PKCE). Em web vem como ?code=... na origin;
 * em nativo como deep link hauxe://callback?code=... — em ambos os casos o
 * Expo Router entrega os params aqui. Troca o code pela sessão e redireciona.
 */
export default function Callback() {
  const { completeMagicLink } = useAuth();
  const { c }                 = useTheme();
  const router                = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Supabase pode retornar erro direto na URL (link expirado/usado).
    // Mantemos a mensagem em PT-BR e calma — o texto cru do Supabase vem em inglês.
    if (params.error) {
      setError('O link expirou ou já foi usado. Peça um novo, é rapidinho.');
      return;
    }

    const code = typeof params.code === 'string' ? params.code : undefined;
    if (!code) {
      setError('Link incompleto. Abra o link mais recente do seu e-mail.');
      return;
    }

    completeMagicLink(code)
      .then(() => {
        // Sessão estabelecida — a guarda em _layout leva ao (app);
        // garantimos o destino aqui também.
        router.replace('/');
      })
      .catch(() => {
        setError(
          'Não conseguimos entrar com este link. Ele pode ter expirado, ' +
            'ou foi aberto em um aparelho diferente de onde você pediu.',
        );
      });
  }, [params, completeMagicLink, router]);

  if (!error) {
    return (
      <Screen>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={c.forest} />
          <Text style={[styles.loadingText, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Entrando...
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        QUASE LÁ
      </Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Esse link não funcionou.
      </Text>
      <Text style={[styles.subtitle, { color: c.text2, fontFamily: fontFamily.sans }]}>
        {error}
      </Text>

      <View style={[styles.note, { backgroundColor: c.tint, borderColor: c.border2 }]}>
        <Text style={[styles.noteText, { color: c.text2, fontFamily: fontFamily.sans }]}>
          🔒{'  '}Sem problema. Peça um novo link ou entre digitando o código.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button label="Voltar ao início" onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: { fontSize: fontSize.body },
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
  note: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: spacing['2xl'],
  },
  noteText: { fontSize: fontSize.aux, lineHeight: 20 },
  actions: { marginTop: spacing.xs },
});
