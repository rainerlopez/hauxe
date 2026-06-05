import { Tabs } from 'expo-router';

export default function AppLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
      {/* Telas de tarefa acessadas a partir do hub — não viram aba */}
      <Tabs.Screen name="anamnese" options={{ href: null }} />
      <Tabs.Screen name="contribuicao" options={{ href: null }} />
    </Tabs>
  );
}
