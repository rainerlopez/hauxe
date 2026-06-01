import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { AuthProvider, useAuth } from '../src/features/auth';

SplashScreen.preventAutoHideAsync();

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(app)',
};

/**
 * Redireciona entre os grupos (auth) e (app) conforme a sessão.
 * Padrão canônico do Expo Router: observa o segmento ativo + estado de auth.
 */
function useProtectedRoute() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);
}

function RootNavigator() {
  const { loading } = useAuth();
  useProtectedRoute();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
