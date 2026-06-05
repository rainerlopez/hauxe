import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { borderRadius, sizing, spacing } from '../theme/spacing';
import { fontSize, fontFamily } from '../theme/typography';

interface Option<T> {
  label: string;
  value: T;
}

interface RadioGroupProps<T> {
  label: string;
  value: T | null;
  onChange: (value: T) => void;
  options?: Option<T>[];
  error?: string;
}

const SIM_NAO: Option<boolean>[] = [
  { label: 'Sim', value: true },
  { label: 'Não', value: false },
];

/**
 * Seletor segmentado. Sem `options` assume Sim/Não (boolean).
 * Segue o padrão visual de TextField (label em cima, erro embaixo).
 */
export function RadioGroup<T>({
  label,
  value,
  onChange,
  options,
  error,
}: RadioGroupProps<T>) {
  const { c } = useTheme();
  const items = (options ?? (SIM_NAO as unknown as Option<T>[]));

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
        {label}
      </Text>
      <View style={styles.row}>
        {items.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={String(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(opt.value)}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: selected ? c.forest : c.surface,
                  borderColor: error ? c.error : selected ? c.forest : c.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillLabel,
                  {
                    color: selected ? c.onForest : c.text2,
                    fontFamily: selected ? fontFamily.sansMedium : fontFamily.sans,
                  },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.label,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pill: {
    flex: 1,
    height: sizing.minTouch,
    borderRadius: borderRadius.field,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: fontSize.body,
  },
  error: {
    fontSize: fontSize.micro,
  },
});
