import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useStaffAccess, type StaffRole } from '../../src/features/admin';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/theme/useTheme';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  org_admin: 'Administradora',
  conductor: 'Condutora',
};

export default function AdminHomeScreen() {
  const access = useStaffAccess();
  const { user } = useAuth();
  const { c } = useTheme();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);

  // Nome da staff logada (profiles.full_name) — só para a saudação.
  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (active && data?.full_name) setName(data.full_name);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (access.status !== 'staff') return null; // guard do _layout cuida do resto

  const primary = access.orgs[0];
  const firstName = name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? '';

  return (
    <Screen>
      {/* Kicker */}
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        CONSOLE DA KAO
      </Text>

      {/* Título — nome da org */}
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        {primary.org_name}
      </Text>

      {/* Saudação + papel */}
      <Text style={[styles.greeting, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Olá{firstName ? `, ${firstName}` : ''}.
      </Text>

      <View style={[styles.roleChip, { backgroundColor: c.accentSoft, borderColor: c.border2 }]}>
        <Text style={[styles.roleText, { color: c.accentDeep, fontFamily: fontFamily.sansSemi }]}>
          {ROLE_LABEL[primary.role]}
          {access.orgs.length > 1 ? ` · ${access.orgs.length} espaços` : ''}
        </Text>
      </View>

      {/* Cartão de boas-vindas / próximas fases */}
      <View style={[styles.card, { backgroundColor: c.forest, borderColor: c.forestDeep }]}>
        <Text style={[styles.cardTitle, { color: c.onForest, fontFamily: fontFamily.serif }]}>
          Bem-vinda ao console.
        </Text>
        <Text style={[styles.cardBody, { color: c.onForest, fontFamily: fontFamily.sans }]}>
          Aqui você vai acompanhar as cerimônias, os inscritos e as fichas de
          saúde do seu espaço. As ferramentas chegam nas próximas etapas.
        </Text>
      </View>

      {/* Voltar ao app do participante */}
      <Pressable
        onPress={() => router.replace('/')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.backText, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
          ← Voltar ao meu app
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: fontSize.kicker,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.title,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  greeting: {
    fontSize: fontSize.body,
    marginBottom: spacing.md,
  },
  roleChip: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: spacing['2xl'],
  },
  roleText: {
    fontSize: fontSize.aux,
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing['2xl'],
    marginBottom: spacing['2xl'],
  },
  cardTitle: {
    fontSize: fontSize.body,
    marginBottom: spacing.sm,
  },
  cardBody: {
    fontSize: fontSize.bodySm,
    lineHeight: 22,
  },
  backLink: {
    paddingVertical: spacing.sm,
  },
  backText: {
    fontSize: fontSize.bodySm,
  },
});
