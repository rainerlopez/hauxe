import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../../src/components';
import { useAnamneseFor } from '../../../src/features/admin/useAnamneseFor';
import { confirmAction } from '../../../src/lib/confirm';
import { friendlyDbError } from '../../../src/lib/friendlyDbError';
import { supabase } from '../../../src/lib/supabase';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

interface RegDetail {
  id: string;
  profile_id: string;
  status: string;
  brings_food: boolean | null;
  notes: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

const CHECKINABLE = ['reservada', 'pendente', 'aguardando_pagamento', 'confirmada'];

// Mesmos rótulos PT-BR da lista de inscritos — evita mostrar o enum cru
// (ex.: "aguardando_pagamento") no detalhe.
const STATUS_LABEL: Record<string, string> = {
  reservada: 'Reservada',
  pendente: 'Pendente',
  aguardando_pagamento: 'Aguardando PIX',
  confirmada: 'Confirmada',
  check_in: 'Check-in ✓',
  cancelada: 'Cancelada',
  lista_espera: 'Lista de espera',
};

function yesNo(v: boolean | null | undefined) {
  return v === true ? 'Sim' : v === false ? 'Não' : '—';
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const { c } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.text3, fontFamily: fontFamily.sansSemi }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.fieldValue, { color: c.text, fontFamily: fontFamily.sans }]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Detalhe do inscrito: contato, inscrição e ficha de saúde.
 * A leitura da ficha registra trilha LGPD (log_anamnese_view) antes de
 * qualquer dado sensível aparecer — ver useAnamneseFor.
 */
export default function InscritoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const router = useRouter();

  const [reg, setReg] = useState<RegDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anamnese = useAnamneseFor(reg?.profile_id ?? null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    supabase
      .from('registrations')
      .select('id, profile_id, status, brings_food, notes, profiles ( full_name, email, phone )')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const profile = data.profiles as unknown as {
            full_name: string | null;
            email: string | null;
            phone: string | null;
          } | null;
          setReg({
            id: data.id as string,
            profile_id: data.profile_id as string,
            status: data.status as string,
            brings_food: data.brings_food as boolean | null,
            notes: data.notes as string | null,
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? null,
            phone: profile?.phone ?? null,
          });
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCheckIn() {
    if (!reg) return;
    const confirmed = await confirmAction({
      title: 'Confirmar check-in?',
      message: `${reg.full_name ?? 'Participante'} será marcado como presente na cerimônia.`,
      confirmLabel: 'Fazer check-in',
    });
    if (!confirmed) return;
    setChecking(true);
    setError(null);
    const { error: err } = await supabase
      .from('registrations')
      .update({ status: 'check_in' })
      .eq('id', reg.id);
    setChecking(false);
    if (err) {
      setError(friendlyDbError(err.message));
      return;
    }
    setReg({ ...reg, status: 'check_in' });
  }

  // Desfaz um check-in feito por engano. O status de volta é derivado do
  // progresso real (view registration_progress): ficha+PIX ok → 'confirmada',
  // senão → 'reservada' — mesmo critério do refresh_registration_status.
  async function handleUndoCheckIn() {
    if (!reg) return;
    const confirmed = await confirmAction({
      title: 'Desfazer check-in?',
      message: `${reg.full_name ?? 'Participante'} voltará ao status anterior ao check-in.`,
      confirmLabel: 'Desfazer',
      destructive: true,
    });
    if (!confirmed) return;
    setChecking(true);
    setError(null);
    try {
      const { data: prog, error: progErr } = await supabase
        .from('registration_progress')
        .select('ficha_ok, pagamento_ok')
        .eq('registration_id', reg.id)
        .maybeSingle();
      if (progErr) throw new Error(progErr.message);

      const target = prog?.ficha_ok && prog?.pagamento_ok ? 'confirmada' : 'reservada';
      const { error: err } = await supabase
        .from('registrations')
        .update({ status: target })
        .eq('id', reg.id);
      if (err) throw new Error(err.message);

      setReg({ ...reg, status: target });
    } catch (e) {
      setError(e instanceof Error ? friendlyDbError(e.message) : 'Erro ao desfazer check-in.');
    } finally {
      setChecking(false);
    }
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      </Screen>
    );
  }

  if (!reg) {
    return (
      <Screen>
        <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
          Inscrição não encontrada
        </Text>
        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        CONSOLE · INSCRITO
      </Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        {reg.full_name ?? 'Sem nome'}
      </Text>

      {reg.status === 'check_in' && (
        <View style={[styles.checkedBadge, { backgroundColor: c.forest, borderColor: c.forestDeep }]}>
          <Text style={[styles.checkedText, { color: c.onForest, fontFamily: fontFamily.sansMedium }]}>
            Check-in feito ✓ Haux!
          </Text>
        </View>
      )}

      {/* Contato */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Field label="E-mail" value={reg.email} />
        <Field label="Telefone" value={reg.phone} />
        <Field label="Status da inscrição" value={STATUS_LABEL[reg.status] ?? reg.status} />
        <Field label="Leva alimento" value={yesNo(reg.brings_food)} />
        <Field label="Observações" value={reg.notes} />
      </View>

      {/* Ficha de saúde */}
      <Text style={[styles.sectionLabel, { color: c.text3, fontFamily: fontFamily.sansSemi }]}>
        FICHA DE SAÚDE
      </Text>

      {anamnese.phase === 'loading' && <ActivityIndicator color={c.forest} />}

      {anamnese.phase === 'empty' && (
        <View style={[styles.card, { backgroundColor: c.tint, borderColor: c.border2 }]}>
          <Text style={[styles.fieldValue, { color: c.text2, fontFamily: fontFamily.sans }]}>
            Ainda não preencheu a ficha.
          </Text>
        </View>
      )}

      {anamnese.phase === 'error' && (
        <View style={[styles.card, { backgroundColor: c.tint, borderColor: c.border2 }]}>
          <Text style={[styles.fieldValue, { color: c.error, fontFamily: fontFamily.sans }]}>
            {anamnese.message}
          </Text>
        </View>
      )}

      {anamnese.phase === 'ready' && (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Field
            label="Contato de emergência"
            value={
              anamnese.data.emergency_contact_name
                ? `${anamnese.data.emergency_contact_name}${anamnese.data.emergency_contact_phone ? ` · ${anamnese.data.emergency_contact_phone}` : ''}`
                : null
            }
          />
          <Field label="Usa medicação" value={yesNo(anamnese.data.uses_medication)} />
          <Field label="Quais medicações" value={anamnese.data.medications} />
          <Field label="Histórico psiquiátrico" value={yesNo(anamnese.data.psychiatric_history)} />
          <Field label="Detalhes psiquiátricos" value={anamnese.data.psychiatric_details} />
          <Field label="Histórico cardíaco" value={yesNo(anamnese.data.cardiac_history)} />
          <Field label="Detalhes cardíacos" value={anamnese.data.cardiac_details} />
          <Field label="Outras condições" value={anamnese.data.other_conditions} />
          <Field label="Gestante" value={yesNo(anamnese.data.pregnant)} />
          <Field label="Alergias" value={anamnese.data.allergies} />
          <Field label="Experiência prévia" value={yesNo(anamnese.data.previous_experience)} />
          <Field
            label="Consentimento LGPD"
            value={anamnese.data.consent_health_data ? 'Autorizado' : 'NÃO autorizado'}
          />
        </View>
      )}

      <Text style={[styles.lgpdNote, { color: c.text3, fontFamily: fontFamily.sans }]}>
        🔒 Este acesso à ficha fica registrado (LGPD).
      </Text>

      {error && (
        <Text style={[styles.errorText, { color: c.error, fontFamily: fontFamily.sans }]}>
          {error}
        </Text>
      )}

      {CHECKINABLE.includes(reg.status) && (
        <Button label="Fazer check-in" loading={checking} onPress={handleCheckIn} />
      )}

      {reg.status === 'check_in' && (
        <Button
          label="Desfazer check-in"
          variant="secondary"
          loading={checking}
          onPress={handleUndoCheckIn}
        />
      )}

      <Button label="← Voltar aos inscritos" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  kicker: {
    fontSize: fontSize.kicker,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing.lg },

  checkedBadge: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  checkedText: { fontSize: fontSize.body },

  card: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },

  sectionLabel: {
    fontSize: fontSize.micro,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },

  field: {},
  fieldLabel: { fontSize: fontSize.micro, letterSpacing: 0.8, marginBottom: 2 },
  fieldValue: { fontSize: fontSize.bodySm, lineHeight: 20 },

  lgpdNote: {
    fontSize: fontSize.micro,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.bodySm,
    marginBottom: spacing.md,
  },
});
