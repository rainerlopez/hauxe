import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useStaffAccess } from '../../src/features/admin';
import { useTheme } from '../../src/theme/useTheme';

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

  if (access.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.forest} />
      </View>
    );
  }

  if (access.status === 'denied') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
