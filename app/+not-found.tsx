import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../src/theme/useTheme';
import { spacing } from '../src/theme/spacing';
import { fontFamily, fontSize } from '../src/theme/typography';

export default function NotFoundScreen() {
  const { c } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
          Esta página não existe.
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: c.accent, fontFamily: fontFamily.sansMedium }]}>
            Voltar ao início
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  title: {
    fontSize: fontSize.title,
  },
  link: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
  },
  linkText: {
    fontSize: fontSize.body,
  },
});
