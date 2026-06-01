import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';
import { useTheme } from '../theme/useTheme';
import { borderRadius, spacing } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { c } = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary' ? c.primary : variant === 'secondary' ? c.secondary : 'transparent';
  const fg = variant === 'ghost' ? c.primary : c.background;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : state.pressed ? 0.85 : 1 },
        variant === 'ghost' && styles.ghost,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: spacing['3xl'] - spacing.md, // 48px
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  ghost: {
    height: 'auto',
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
});
