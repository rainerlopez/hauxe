import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../../src/components';
import { useStaffAccess } from '../../../src/features/admin';
import { supabase } from '../../../src/lib/supabase';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, sizing, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

type PageState = 'loading' | 'ready' | 'saving';

export default function ConductorFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const access = useStaffAccess();
  const isNew = id === 'novo';

  const [pageState, setPageState] = useState<PageState>(isNew ? 'ready' : 'loading');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [active, setActive] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Carrega dados do condutor para edição
  useEffect(() => {
    if (isNew) return;

    supabase
      .from('conductors')
      .select('*')
      .eq('id', id as string)
      .single()
      .then(({ data, error }) => {
        if (!mounted.current) return;
        if (error || !data) {
          router.back();
          return;
        }
        setName(data.name as string);
        setBio((data.bio as string | null) ?? '');
        setAvatarUrl((data.avatar_url as string | null) ?? '');
        setActive(data.active as boolean);
        setPageState('ready');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Nome é obrigatório');
      return;
    }
    setNameError(null);

    if (access.status !== 'staff') return;
    const orgId = access.orgs[0].org_id;

    setPageState('saving');
    setSaveError(null);

    const payload = {
      name: trimmedName,
      bio: bio.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    };

    const { error } = isNew
      ? await supabase.from('conductors').insert({ ...payload, org_id: orgId })
      : await supabase.from('conductors').update(payload).eq('id', id as string);

    if (!mounted.current) return;

    if (error) {
      setSaveError(error.message);
      setPageState('ready');
      return;
    }

    router.back();
  }

  function handleToggleActive() {
    const toDeactivate = active;
    Alert.alert(
      toDeactivate ? 'Desativar condutor?' : 'Reativar condutor?',
      toDeactivate
        ? 'O condutor some das opções de novas cerimônias, mas o histórico fica.'
        : 'O condutor voltará a aparecer nas opções de novas cerimônias.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: toDeactivate ? 'Desativar' : 'Reativar',
          style: toDeactivate ? 'destructive' : 'default',
          onPress: async () => {
            if (access.status !== 'staff') return;
            setPageState('saving');
            const { error } = await supabase
              .from('conductors')
              .update({ active: !toDeactivate })
              .eq('id', id as string);
            if (!mounted.current) return;
            if (error) {
              setSaveError(error.message);
              setPageState('ready');
              return;
            }
            router.back();
          },
        },
      ],
    );
  }

  if (pageState === 'loading') {
    return (
      <Screen centered>
        <ActivityIndicator color={c.forest} />
      </Screen>
    );
  }

  const isSaving = pageState === 'saving';

  return (
    <Screen>
      {/* Cabeçalho */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.backText, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
          ← Condutores
        </Text>
      </Pressable>

      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        {isNew ? 'Novo condutor' : 'Editar condutor'}
      </Text>

      {/* Formulário */}
      <View style={styles.form}>
        <TextField
          label="Nome *"
          value={name}
          onChangeText={(v) => { setName(v); if (nameError) setNameError(null); }}
          placeholder="Ex.: Maria das Flores"
          autoCapitalize="words"
          autoCorrect={false}
          error={nameError ?? undefined}
          editable={!isSaving}
        />

        <TextField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="Uma breve apresentação (opcional)"
          multiline
          numberOfLines={4}
          style={styles.bioInput}
          editable={!isSaving}
        />

        <View style={styles.fieldWrapper}>
          <TextField
            label="URL do avatar"
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!isSaving}
          />
          <Text style={[styles.hint, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Cole a URL de uma imagem pública. Upload direto de arquivo será adicionado em breve.
          </Text>
        </View>
      </View>

      {saveError ? (
        <Text style={[styles.saveError, { color: c.error, fontFamily: fontFamily.sans }]}>
          {saveError}
        </Text>
      ) : null}

      {/* Ação principal */}
      <Button
        label="Salvar"
        onPress={handleSave}
        loading={isSaving}
        disabled={isSaving}
        style={styles.saveButton}
      />

      {/* Desativar / Reativar — só para condutores existentes */}
      {!isNew && (
        <Pressable
          onPress={handleToggleActive}
          accessibilityRole="button"
          disabled={isSaving}
          style={({ pressed }) => [
            styles.toggleButton,
            { borderColor: active ? c.error : c.forest, opacity: pressed || isSaving ? 0.6 : 1 },
          ]}
        >
          <Text
            style={[
              styles.toggleLabel,
              { color: active ? c.error : c.forest, fontFamily: fontFamily.sansMedium },
            ]}
          >
            {active ? 'Desativar condutor' : 'Reativar condutor'}
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backLink:    { paddingVertical: spacing.sm, marginBottom: spacing.xs },
  backText:    { fontSize: fontSize.bodySm },
  title:       { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing['2xl'] },
  form:        { gap: spacing.blockGap, marginBottom: spacing['2xl'] },
  bioInput:    { height: 100, paddingTop: 14, textAlignVertical: 'top' },
  fieldWrapper: { gap: spacing.xs },
  hint:        { fontSize: fontSize.micro },
  saveError:   { fontSize: fontSize.bodySm, marginBottom: spacing.md },
  saveButton:  { marginBottom: spacing.md },
  toggleButton: {
    height: sizing.minTouch,
    borderRadius: borderRadius.button,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: { fontSize: fontSize.bodySm },
});
