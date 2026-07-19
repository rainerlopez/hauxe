import { Redirect, Stack, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useStaffAccess } from '../../src/features/admin';
import { useTheme } from '../../src/theme/useTheme';
import { fontFamily, fontSize } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';

/**
 * Guarda da área administrativa.
 *
 * Camadas de segurança (defesa em profundidade):
 *   1. app/_layout.tsx já exige sessão (sem login → /sign-in).
 *   2. ESTE layout redireciona quem não é staff de nenhuma org para o hub.
 *   3. A camada que REALMENTE protege os dados é o RLS no Postgres: mesmo
 *      que alguém burle 1 e 2, não lê dados de inscritos sem ser org_member.
 */
export default function AdminLayout() {
  const access = useStaffAccess();
  const { c } = useTheme();
  const router = useRouter();

  if (access.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.forest} />
      </View>
    );
  }

  // Falha de consulta (rede etc.) ≠ negação: mostra o erro em vez de expulsar.
  if (access.status === 'error') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.bg,
          padding: spacing['2xl'],
          gap: spacing.lg,
        }}
      >
        <Text style={{ color: c.text, fontFamily: fontFamily.serif, fontSize: fontSize.body, textAlign: 'center' }}>
          Não foi possível verificar seu acesso ao console.
        </Text>
        <Text style={{ color: c.text2, fontFamily: fontFamily.sans, fontSize: fontSize.bodySm, textAlign: 'center' }}>
          {access.message}
        </Text>
        <Pressable onPress={() => router.replace('/')} accessibilityRole="button">
          <Text style={{ color: c.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.bodySm }}>
            ← Voltar ao app
          </Text>
        </Pressable>
      </View>
    );
  }

  if (access.status === 'denied') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
