import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { borderRadius, spacing } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? c.error : focused ? c.primary : c.border;

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          { borderColor, color: c.text, backgroundColor: c.surface },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={[styles.error, { color: c.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  input: {
    height: spacing['3xl'] - spacing.md, // 48px
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
  },
  error: {
    fontSize: fontSize.xs,
  },
});
