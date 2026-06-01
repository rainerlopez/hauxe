import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { spacing } from '../theme/spacing';

interface ScreenProps {
  children: ReactNode;
  /** Centraliza o conteúdo verticalmente (útil em telas de formulário/auth). */
  centered?: boolean;
  scroll?: boolean;
}

export function Screen({ children, centered = false, scroll = true }: ScreenProps) {
  const { c } = useTheme();
  const content = (
    <View style={[styles.content, centered && styles.centered]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scroll, centered && styles.centered]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg },
  content: { flex: 1, padding: spacing.lg },
  centered: { justifyContent: 'center' },
});
