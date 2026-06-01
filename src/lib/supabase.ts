import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Durante o prerender SSR do `expo export` (Node), `window` não existe e o
// AsyncStorage web (localStorage) quebraria. O adapter então vira no-op no
// servidor; no cliente (web/nativo) usa o AsyncStorage normalmente.
const isServer = typeof window === 'undefined';
const storage = {
  getItem: (key: string) => (isServer ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) =>
    isServer ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string) =>
    isServer ? Promise.resolve() : AsyncStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Mantém a sessão sendo renovada automaticamente enquanto o app está em foreground.
// Em web não há ciclo de vida de AppState relevante, então só registramos no nativo.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
