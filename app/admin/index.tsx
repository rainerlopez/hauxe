import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useAdminOrg, type StaffRole } from '../../src/features/admin';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/theme/useTheme';
import { borderRadius, sizing, spacing } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  org_admin: 'Administradora',
  conductor: 'Condutora',
};

export default function AdminHomeScreen() {
  const { org, orgs, select } = useAdminOrg();
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

  const primary = org;
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
        </Text>
      </View>

      {/* Seletor de espaço (só aparece com 2+ orgs) */}
      {orgs.length > 1 && (
        <View style={styles.orgRow}>
          {orgs.map((o) => (
            <Pressable
              key={o.org_id}
              onPress={() => select(o.org_id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: o.org_id === org.org_id }}
              style={[
                styles.orgChip,
                { borderColor: o.org_id === org.org_id ? c.forest : c.border },
                o.org_id === org.org_id && { backgroundColor: c.forest },
              ]}
            >
              <Text
                style={[
                  styles.orgChipText,
                  {
                    color: o.org_id === org.org_id ? c.onForest : c.text2,
                    fontFamily: o.org_id === org.org_id ? fontFamily.sansMedium : fontFamily.sans,
                  },
                ]}
              >
                {o.org_name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Navegação do console */}
      <Pressable
        onPress={() => router.push('/admin/inscritos' as never)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.navCard,
          { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={styles.navCardText}>
          <Text style={[styles.navCardTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
            Inscritos
          </Text>
          <Text style={[styles.navCardSub, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Quem vem na próxima cerimônia, fichas e check-in
          </Text>
        </View>
        <Text style={[styles.navCardArrow, { color: c.text2, fontFamily: fontFamily.sans }]}>→</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/admin/cerimonias' as never)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.navCard,
          { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={styles.navCardText}>
          <Text style={[styles.navCardTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
            Cerimônias
          </Text>
          <Text style={[styles.navCardSub, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Crie e edite cerimônias, valores e condutores
          </Text>
        </View>
        <Text style={[styles.navCardArrow, { color: c.text2, fontFamily: fontFamily.sans }]}>→</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/admin/condutores' as never)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.navCard,
          { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={styles.navCardText}>
          <Text style={[styles.navCardTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
            Condutores
          </Text>
          <Text style={[styles.navCardSub, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Gerencie os condutores do seu espaço
          </Text>
        </View>
        <Text style={[styles.navCardArrow, { color: c.text2, fontFamily: fontFamily.sans }]}>→</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/admin/equipe' as never)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.navCard,
          { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={styles.navCardText}>
          <Text style={[styles.navCardTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
            Equipe
          </Text>
          <Text style={[styles.navCardSub, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Quem administra e conduz o espaço
          </Text>
        </View>
        <Text style={[styles.navCardArrow, { color: c.text2, fontFamily: fontFamily.sans }]}>→</Text>
      </Pressable>

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
  orgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing['2xl'] },
  orgChip: {
    minHeight: sizing.minTouch,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgChipText: { fontSize: fontSize.aux },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: sizing.minTouch,
  },
  navCardText:  { flex: 1, gap: 2 },
  navCardTitle: { fontSize: fontSize.bodySm },
  navCardSub:   { fontSize: fontSize.aux },
  navCardArrow: { fontSize: fontSize.body },
  card: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing['2xl'],
    marginBottom: spacing['2xl'],
    marginTop: spacing.md,
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
