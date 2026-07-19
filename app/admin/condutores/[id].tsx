import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Screen, TextField } from '../../../src/components';
import { canManageOrg, useStaffAccess } from '../../../src/features/admin';
import { confirmAction } from '../../../src/lib/confirm';
import { friendlyDbError } from '../../../src/lib/friendlyDbError';
import { supabase } from '../../../src/lib/supabase';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, sizing, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

const BUCKET = 'ceremony-images';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const AVATAR_SIZE = 96;

type PageState = 'loading' | 'ready' | 'saving';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

export default function ConductorFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const access = useStaffAccess();
  const isNew = id === 'novo';

  const [pageState, setPageState] = useState<PageState>(isNew ? 'ready' : 'loading');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  // URL atualmente salva no banco
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(null);
  // URI local pendente: undefined=não mexeu, null=removeu, string=nova foto selecionada
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null | undefined>(undefined);
  const [active, setActive] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canWrite = canManageOrg(access);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // O que exibir no preview: prefere o URI local se o usuário já mexeu na foto
  const displayedImage = localAvatarUri !== undefined ? localAvatarUri : savedAvatarUrl;

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
          // Antes: router.back() silencioso — o usuário nunca sabia o porquê.
          setLoadError(error ? friendlyDbError(error.message) : 'Condutor não encontrado.');
          setPageState('ready');
          return;
        }
        setName(data.name as string);
        setBio((data.bio as string | null) ?? '');
        setSavedAvatarUrl((data.avatar_url as string | null) ?? null);
        setActive(data.active as boolean);
        setPageState('ready');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  async function pickImage() {
    // Permissão apenas em nativo (iOS/Android); web usa <input type="file">
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setSaveError('Permissão para acessar a galeria é necessária.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: Platform.OS !== 'web', // crop nativo; web: manipulamos abaixo
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled) return;

    const asset = result.assets[0];

    if (asset.fileSize !== undefined && asset.fileSize > MAX_BYTES) {
      setSaveError('Imagem muito grande. Escolha uma foto de até 5 MB.');
      return;
    }
    setSaveError(null);

    // Crop quadrado + resize 512×512 + compressão JPEG 0.8
    const actions: ImageManipulator.Action[] = [];
    if (Platform.OS === 'web') {
      // No web o picker não faz crop — cortamos o centro manualmente
      const size = Math.min(asset.width, asset.height);
      actions.push({
        crop: {
          originX: Math.floor((asset.width - size) / 2),
          originY: Math.floor((asset.height - size) / 2),
          width: size,
          height: size,
        },
      });
    }
    actions.push({ resize: { width: 512, height: 512 } });

    const processed = await ImageManipulator.manipulateAsync(
      asset.uri,
      actions,
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );

    setLocalAvatarUri(processed.uri);
  }

  function removeImage() {
    setLocalAvatarUri(null);
  }

  async function uploadAvatar(localUri: string, orgId: string, conductorId: string): Promise<string> {
    const resp = await fetch(localUri);
    const blob = await resp.blob();

    if (blob.size > MAX_BYTES) {
      throw new Error('Imagem muito grande após processamento. Máximo: 5 MB.');
    }

    const path = `conductors/${orgId}/${conductorId}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) throw new Error(error.message);

    // Cache-bust via timestamp para garantir que o browser recarregue após troca de foto
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  }

  async function deleteAvatar(orgId: string, conductorId: string): Promise<void> {
    // Falha silenciosa: se o arquivo não existir (ex.: avatar era URL externa) não é crítico
    await supabase.storage
      .from(BUCKET)
      .remove([`conductors/${orgId}/${conductorId}.jpg`]);
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) { setNameError('Nome é obrigatório'); return; }
    setNameError(null);
    if (access.status !== 'staff') return;
    const orgId = access.orgs[0].org_id;

    setPageState('saving');
    setSaveError(null);

    try {
      if (isNew) {
        // Passo 1: INSERT para obter o ID gerado pelo banco
        const { data: newRow, error: insertErr } = await supabase
          .from('conductors')
          .insert({ name: trimmedName, bio: bio.trim() || null, org_id: orgId })
          .select('id')
          .single();
        if (insertErr || !newRow) throw new Error(insertErr?.message ?? 'Erro ao criar condutor.');

        const newId = newRow.id as string;

        // Passo 2: upload e atualização do avatar se o usuário escolheu foto
        if (localAvatarUri) {
          const url = await uploadAvatar(localAvatarUri, orgId, newId);
          await supabase.from('conductors').update({ avatar_url: url }).eq('id', newId);
        }
      } else {
        let finalAvatarUrl = savedAvatarUrl;

        if (localAvatarUri === null) {
          // Usuário removeu a foto
          await deleteAvatar(orgId, id as string);
          finalAvatarUrl = null;
        } else if (typeof localAvatarUri === 'string') {
          // Usuário trocou a foto — upsert sobrescreve no mesmo path
          finalAvatarUrl = await uploadAvatar(localAvatarUri, orgId, id as string);
        }

        const { error } = await supabase
          .from('conductors')
          .update({ name: trimmedName, bio: bio.trim() || null, avatar_url: finalAvatarUrl })
          .eq('id', id as string);
        if (error) throw new Error(error.message);
      }

      if (mounted.current) router.back();
    } catch (e) {
      if (!mounted.current) return;
      setSaveError(e instanceof Error ? friendlyDbError(e.message) : 'Erro ao salvar.');
      setPageState('ready');
    }
  }

  async function handleToggleActive() {
    const toDeactivate = active;
    const confirmed = await confirmAction({
      title: toDeactivate ? 'Desativar condutor?' : 'Reativar condutor?',
      message: toDeactivate
        ? 'O condutor some das opções de novas cerimônias, mas o histórico fica.'
        : 'O condutor voltará a aparecer nas opções de novas cerimônias.',
      confirmLabel: toDeactivate ? 'Desativar' : 'Reativar',
      destructive: toDeactivate,
    });
    if (!confirmed) return;
    if (access.status !== 'staff') return;
    setPageState('saving');
    setSaveError(null);

    const { error } = await supabase
      .from('conductors')
      .update({ active: !toDeactivate })
      .eq('id', id as string);

    if (!mounted.current) return;
    if (error) { setSaveError(friendlyDbError(error.message)); setPageState('ready'); return; }
    router.back();
  }

  if (pageState === 'loading') {
    return (
      <Screen centered>
        <ActivityIndicator color={c.forest} />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
          Não foi possível abrir
        </Text>
        <Text style={[styles.saveError, { color: c.error, fontFamily: fontFamily.sans }]}>
          {loadError}
        </Text>
        <Button label="← Voltar" variant="secondary" onPress={() => router.back()} />
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

      <View style={styles.form}>
        <TextField
          label="Nome *"
          value={name}
          onChangeText={(v) => { setName(v); if (nameError) setNameError(null); }}
          placeholder="Ex.: Maria das Flores"
          autoCapitalize="words"
          autoCorrect={false}
          error={nameError ?? undefined}
          editable={!isSaving && canWrite}
        />

        <TextField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="Uma breve apresentação (opcional)"
          multiline
          numberOfLines={4}
          style={styles.bioInput}
          editable={!isSaving && canWrite}
        />

        {/* Picker de avatar */}
        <View style={styles.avatarSection}>
          <Text style={[styles.avatarLabel, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
            Foto de perfil
          </Text>

          <View style={styles.avatarRow}>
            {/* Preview circular */}
            {displayedImage ? (
              <Image
                source={{ uri: displayedImage }}
                style={styles.avatarImg}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={[styles.avatarImg, styles.avatarFallback, { backgroundColor: c.forest }]}>
                <Text
                  style={{
                    color: c.onForest,
                    fontFamily: fontFamily.sansMedium,
                    fontSize: AVATAR_SIZE * 0.35,
                  }}
                >
                  {initials(name || '?')}
                </Text>
              </View>
            )}

            {/* Ações */}
            <View style={styles.avatarActions}>
              <Pressable
                onPress={pickImage}
                disabled={isSaving || !canWrite}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.pickButton,
                  {
                    borderColor: c.border,
                    backgroundColor: c.surface,
                    opacity: pressed || isSaving ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.pickLabel, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
                  {displayedImage ? 'Trocar foto' : 'Escolher foto'}
                </Text>
              </Pressable>

              {displayedImage ? (
                <Pressable
                  onPress={removeImage}
                  disabled={isSaving || !canWrite}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.removeButton,
                    { opacity: pressed || isSaving ? 0.5 : 1 },
                  ]}
                >
                  <Text style={[styles.removeLabel, { color: c.error, fontFamily: fontFamily.sans }]}>
                    Remover foto
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {saveError ? (
        <Text style={[styles.saveError, { color: c.error, fontFamily: fontFamily.sans }]}>
          {saveError}
        </Text>
      ) : null}

      {/* A RLS só permite escrita a org_admin (v06) — para os demais papéis o
          formulário vira leitura, em vez de estourar erro cru ao salvar. */}
      {!canWrite && (
        <Text style={[styles.saveError, { color: c.text3, fontFamily: fontFamily.sans }]}>
          Somente administradores do espaço podem editar condutores.
        </Text>
      )}

      {canWrite && (
        <Button
          label="Salvar"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          style={styles.saveButton}
        />
      )}

      {!isNew && canWrite && (
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
  backLink:   { paddingVertical: spacing.sm, marginBottom: spacing.xs },
  backText:   { fontSize: fontSize.bodySm },
  title:      { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing['2xl'] },
  form:       { gap: spacing.blockGap, marginBottom: spacing['2xl'] },
  bioInput:   { height: 100, paddingTop: 14, textAlignVertical: 'top' },

  // Avatar
  avatarSection: { gap: spacing.xs },
  avatarLabel:   { fontSize: fontSize.label },
  avatarRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarActions: { flex: 1, gap: spacing.sm },
  pickButton: {
    height: sizing.minTouch,
    borderRadius: borderRadius.field,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pickLabel:    { fontSize: fontSize.bodySm },
  removeButton: { paddingVertical: spacing.xs, alignItems: 'center' },
  removeLabel:  { fontSize: fontSize.aux },

  saveError:  { fontSize: fontSize.bodySm, marginBottom: spacing.md },
  saveButton: { marginBottom: spacing.md },
  toggleButton: {
    height: sizing.minTouch,
    borderRadius: borderRadius.button,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: { fontSize: fontSize.bodySm },
});
