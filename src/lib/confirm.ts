import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Estiliza o botão de confirmação como destrutivo no iOS. */
  destructive?: boolean;
}

/**
 * Confirmação que funciona em web E nativo.
 *
 * No react-native-web o `Alert.alert` com botões/callbacks é um no-op — o
 * `onPress` nunca dispara. Por isso, na web usamos o `window.confirm` do
 * browser; no nativo, o `Alert.alert` normal. Resolve a Promise com `true`
 * quando o usuário confirma, `false` caso contrário.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    return Promise.resolve(Boolean(ok));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
