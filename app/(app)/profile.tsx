import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useStaffAccess } from '../../src/features/admin';
import { useTheme } from '../../src/theme/useTheme';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { fontSize, fontFamily } from '../../src/theme/typography';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { c }             = useTheme();
  const router            = useRouter();
  const access            = useStaffAccess();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await signOut();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <Text style={[styles.label, { color: c.text2, fontFamily: fontFamily.sans }]}>
          Conectado como
        </Text>
        <Text style={[styles.email, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
          {user?.email ?? '—'}
        </Text>

        {/* Acesso ao console — só aparece para staff (RLS bloqueia o resto) */}
        {access.status === 'staff' && (
          <Pressable
            onPress={() => router.push('/admin' as never)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.staffLink,
              { backgroundColor: c.accentSoft, borderColor: c.border2, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.staffText, { color: c.accentDeep, fontFamily: fontFamily.sansSemi }]}>
              Console da equipe →
            </Text>
            <Text style={[styles.staffSub, { color: c.text2, fontFamily: fontFamily.sans }]}>
              {access.orgs[0].org_name}
            </Text>
          </Pressable>
        )}
      </View>
      <Button label="Sair" variant="secondary" onPress={handleSignOut} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body:  { flex: 1, justifyContent: 'center', gap: spacing.xs },
  label: { fontSize: fontSize.aux },
  email: { fontSize: fontSize.body },
  staffLink: {
    marginTop: spacing['2xl'],
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  staffText: { fontSize: fontSize.bodySm },
  staffSub:  { fontSize: fontSize.aux, marginTop: 2 },
});
