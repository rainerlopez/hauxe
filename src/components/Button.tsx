import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';
import { useTheme } from '../theme/useTheme';
import { borderRadius, sizing } from '../theme/spacing';
import { fontSize, fontFamily } from '../theme/typography';

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
    variant === 'primary'
      ? c.forest
      : variant === 'secondary'
      ? 'transparent'
      : 'transparent';
  const fg =
    variant === 'primary'
      ? c.onForest
      : c.forest;
  const borderColor =
    variant === 'secondary' ? c.forest : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor,
          opacity: isDisabled ? 0.45 : state.pressed ? 0.82 : 1,
        },
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg, fontFamily: fontFamily.sansMedium }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: sizing.button,
    borderRadius: borderRadius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 0,
  },
  secondary: {
    borderWidth: 1.5,
  },
  ghost: {
    height: sizing.minTouch,
  },
  label: {
    fontSize: fontSize.body,
  },
});
