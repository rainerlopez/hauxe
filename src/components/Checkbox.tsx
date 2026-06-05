import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { borderRadius, sizing, spacing } from '../theme/spacing';
import { fontSize, fontFamily } from '../theme/typography';

interface CheckboxProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  error?: string;
}

export function Checkbox({ checked, onChange, label, error }: CheckboxProps) {
  const { c } = useTheme();

  const boxBorder = error ? c.error : checked ? c.forest : c.border;
  const boxBg = checked ? c.forest : c.surface;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.82 : 1 }]}
      >
        <View style={[styles.box, { borderColor: boxBorder, backgroundColor: boxBg }]}>
          {checked && (
            <Text style={[styles.check, { color: c.onForest }]}>✓</Text>
          )}
        </View>
        <Text style={[styles.label, { color: c.text2, fontFamily: fontFamily.sans }]}>
          {label}
        </Text>
      </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: sizing.minTouch,
    paddingVertical: spacing.xs,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  check: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
  },
  label: {
    flex: 1,
    fontSize: fontSize.bodySm,
    lineHeight: 21,
  },
  error: {
    fontSize: fontSize.micro,
  },
});
