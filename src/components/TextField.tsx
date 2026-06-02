import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { borderRadius, sizing, spacing } from '../theme/spacing';
import { fontSize, fontFamily } from '../theme/typography';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? c.error : focused ? c.focusRing : c.border;
  const borderWidth = focused ? 2 : 1;

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={c.text3}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            borderColor,
            borderWidth,
            color: c.text,
            backgroundColor: c.surface,
            fontFamily: fontFamily.sans,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={[styles.error, { color: c.error, fontFamily: fontFamily.sans }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.label,
  },
  input: {
    height: sizing.field,
    borderRadius: borderRadius.field,
    paddingHorizontal: 16,
    fontSize: fontSize.body,
  },
  error: {
    fontSize: fontSize.micro,
  },
});
