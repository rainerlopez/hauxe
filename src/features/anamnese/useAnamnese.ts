import { useCallback, useEffect, useState } from 'react';
import { friendlyDbError } from '../../lib/friendlyDbError';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth';

/**
 * Campos da ficha de saúde (anamnese). Espelha as colunas relevantes
 * da tabela `anamneses`. Dado sensível de saúde — LGPD Art. 5, II.
 */
export interface AnamneseData {
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  uses_medication: boolean | null;
  medications: string | null;
  psychiatric_history: boolean | null;
  psychiatric_details: string | null;
  cardiac_history: boolean | null;
  cardiac_details: string | null;
  other_conditions: string | null;
  pregnant: boolean | null;
  allergies: string | null;
  previous_experience: boolean | null;
  consent_health_data: boolean;
  consent_at: string | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'empty' }                       // ainda não existe ficha
  | { phase: 'ready'; data: AnamneseData }   // ficha já preenchida
  | { phase: 'error'; message: string };

const COLUMNS =
  'emergency_contact_name, emergency_contact_phone, uses_medication, medications, ' +
  'psychiatric_history, psychiatric_details, cardiac_history, cardiac_details, ' +
  'other_conditions, pregnant, allergies, previous_experience, ' +
  'consent_health_data, consent_at';

/**
 * Busca a anamnese do usuário corrente (uma por profile) e expõe `save`,
 * que faz upsert por `profile_id`. Quando o consentimento LGPD passa a
 * `true`, grava `consent_at` — o trigger `trg_anamnese_status_sync`
 * reavalia as inscrições automaticamente.
 */
export function useAnamnese() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setState({ phase: 'empty' });
      return;
    }

    let cancelled = false;

    async function fetchAnamnese() {
      setState({ phase: 'loading' });
      try {
        const { data, error } = await supabase
          .from('anamneses')
          .select(COLUMNS)
          .eq('profile_id', user!.id)
          .maybeSingle();

        if (error) throw error;

        if (!cancelled) {
          setState(
            data
              ? { phase: 'ready', data: data as unknown as AnamneseData }
              : { phase: 'empty' },
          );
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: e instanceof Error ? e.message : 'Erro ao carregar a ficha.',
          });
        }
      }
    }

    fetchAnamnese();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = useCallback(
    async (input: Partial<AnamneseData>): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Sessão expirada. Entre novamente.' };

      setSaving(true);
      try {
        // Só carimba consent_at na transição para consentido; preserva o existente.
        const alreadyConsented =
          state.phase === 'ready' && state.data.consent_health_data;
        const consent_at =
          input.consent_health_data && !alreadyConsented
            ? new Date().toISOString()
            : undefined;

        const payload: Record<string, unknown> = {
          profile_id: user.id,
          ...input,
        };
        if (consent_at) payload.consent_at = consent_at;

        const { error } = await supabase
          .from('anamneses')
          .upsert(payload, { onConflict: 'profile_id' });

        if (error) return { error: friendlyDbError(error.message) };
        return { error: null };
      } finally {
        setSaving(false);
      }
    },
    [user, state],
  );

  return { state, save, saving };
}

// ─── anexos (opcional) ──────────────────────────────────────────────────
//
// Bucket `anamnese-files` é PRIVADO (dado de saúde — LGPD). Caminho:
// `{profile_id}/{arquivo}` (convenção do db/hauxe_schema_patch_v03_storage.sql).
// Nunca expomos URL pública: toda leitura passa por createSignedUrl de curta
// duração, gerada sob demanda — nada fica em cache além do necessário.

const ATTACHMENTS_BUCKET = 'anamnese-files';
const ATTACHMENTS_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// 1h cobre uma sessão de tela sem que as miniaturas expirem no meio (o antigo
// 60s deixava <Image> quebrada se a pessoa lesse a ficha por >1min). O bucket
// segue privado: signed URL de curta duração, gerada sob demanda a cada refresh.
const SIGNED_URL_TTL_SECONDS = 3600;

export interface AnamneseAttachment {
  /** Nome do arquivo dentro da pasta do usuário (ex.: 1721488000000.jpg). */
  name: string;
  /** Caminho completo no bucket: `{profile_id}/{name}`. */
  path: string;
  /** URL assinada de curta duração — não persistir além da sessão de tela. */
  signedUrl: string;
}

type AttachmentsState =
  | { phase: 'loading' }
  | { phase: 'ready'; items: AnamneseAttachment[] }
  | { phase: 'error'; message: string };

/**
 * Lista, envia e remove anexos da ficha de saúde (ex.: receita, exame).
 * Upload é imediato (não depende de `save`); cada item é servido por uma
 * signed URL nova a cada `refresh` — o bucket não tem leitura pública.
 */
export function useAnamneseAttachments() {
  const { user } = useAuth();
  const [state, setState] = useState<AttachmentsState>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ phase: 'ready', items: [] });
      return;
    }
    setState({ phase: 'loading' });
    try {
      const { data, error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .list(user.id, { sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;

      // storage.list pode devolver um placeholder de pasta vazia (id null) — ignora.
      const files = (data ?? []).filter((f) => f.id);
      const paths = files.map((f) => `${user.id}/${f.name}`);

      const items: AnamneseAttachment[] = [];
      if (paths.length > 0) {
        // Uma única ida à rede assina todos os anexos (evita N round-trips).
        const { data: signed, error: signErr } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        if (signErr) throw signErr;
        (signed ?? []).forEach((s, i) => {
          if (s.signedUrl && !s.error) {
            items.push({ name: files[i].name, path: paths[i], signedUrl: s.signedUrl });
          }
        });
      }
      setState({ phase: 'ready', items });
    } catch (e) {
      setState({
        phase: 'error',
        message: e instanceof Error ? friendlyDbError(e.message) : 'Erro ao carregar anexos.',
      });
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    async (blob: Blob): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Sessão expirada. Entre novamente.' };
      if (blob.size > ATTACHMENTS_MAX_BYTES) {
        return { error: 'Arquivo muito grande após processamento. Máximo: 5 MB.' };
      }
      setBusy(true);
      try {
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) return { error: friendlyDbError(error.message) };
        await refresh();
        return { error: null };
      } finally {
        setBusy(false);
      }
    },
    [user, refresh],
  );

  const remove = useCallback(
    async (path: string): Promise<{ error: string | null }> => {
      setBusy(true);
      try {
        const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
        if (error) return { error: friendlyDbError(error.message) };
        await refresh();
        return { error: null };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return { state, busy, upload, remove, refresh };
}
