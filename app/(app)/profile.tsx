import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/components';
import { useAuth } from '../../src/features/auth';
import { useTheme } from '../../src/theme/useTheme';
import { spacing } from '../../src/theme/spacing';
import { fontSize, fontFamily } from '../../src/theme/typography';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { c }             = useTheme();
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
      </View>
      <Button label="Sair" variant="secondary" onPress={handleSignOut} loading={loading} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body:  { flex: 1, justifyContent: 'center', gap: spacing.xs },
  label: { fontSize: fontSize.aux },
  email: { fontSize: fontSize.body },
});
