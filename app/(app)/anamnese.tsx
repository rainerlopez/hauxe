import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Checkbox, RadioGroup, Screen, TextField } from '../../src/components';
import { useAnamnese, type AnamneseData } from '../../src/features/anamnese';
import { useTheme } from '../../src/theme/useTheme';
import { borderRadius, spacing } from '../../src/theme/spacing';
import { fontFamily, fontSize } from '../../src/theme/typography';

// ─── estado do formulário ──────────────────────────────────────────────────────

interface FormState {
  emergency_contact_name: string;
  emergency_contact_phone: string;
  uses_medication: boolean | null;
  medications: string;
  psychiatric_history: boolean | null;
  psychiatric_details: string;
  cardiac_history: boolean | null;
  cardiac_details: string;
  pregnant: boolean | null;
  allergies: string;
  other_conditions: string;
  previous_experience: boolean | null;
  consent_health_data: boolean;
}

const EMPTY_FORM: FormState = {
  emergency_contact_name: '',
  emergency_contact_phone: '',
  uses_medication: null,
  medications: '',
  psychiatric_history: null,
  psychiatric_details: '',
  cardiac_history: null,
  cardiac_details: '',
  pregnant: null,
  allergies: '',
  other_conditions: '',
  previous_experience: null,
  consent_health_data: false,
};

function fromData(d: AnamneseData): FormState {
  return {
    emergency_contact_name: d.emergency_contact_name ?? '',
    emergency_contact_phone: d.emergency_contact_phone ?? '',
    uses_medication: d.uses_medication,
    medications: d.medications ?? '',
    psychiatric_history: d.psychiatric_history,
    psychiatric_details: d.psychiatric_details ?? '',
    cardiac_history: d.cardiac_history,
    cardiac_details: d.cardiac_details ?? '',
    pregnant: d.pregnant,
    allergies: d.allergies ?? '',
    other_conditions: d.other_conditions ?? '',
    previous_experience: d.previous_experience,
    consent_health_data: d.consent_health_data,
  };
}

// ─── tela ───────────────────────────────────────────────────────────────────────

export default function AnamneseScreen() {
  const { c }                  = useTheme();
  const router                 = useRouter();
  const { state, save, saving } = useAnamnese();

  const [form, setForm]   = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Preenche o formulário quando a ficha existente carrega.
  useEffect(() => {
    if (state.phase === 'ready') setForm(fromData(state.data));
  }, [state]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.emergency_contact_name.trim().length < 2)
      next.emergency_contact_name = 'Informe um nome.';
    if (form.emergency_contact_phone.trim().length < 8)
      next.emergency_contact_phone = 'Informe um telefone válido.';
    if (form.uses_medication && form.medications.trim().length === 0)
      next.medications = 'Conte quais medicações.';
    if (form.psychiatric_history && form.psychiatric_details.trim().length === 0)
      next.psychiatric_details = 'Conte um pouco mais.';
    if (form.cardiac_history && form.cardiac_details.trim().length === 0)
      next.cardiac_details = 'Conte um pouco mais.';
    if (!form.consent_health_data)
      next.consent_health_data = 'Precisamos do seu consentimento para seguir.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!validate()) return;

    const { error } = await save({
      emergency_contact_name: form.emergency_contact_name.trim(),
      emergency_contact_phone: form.emergency_contact_phone.trim(),
      uses_medication: form.uses_medication,
      medications: form.uses_medication ? form.medications.trim() : null,
      psychiatric_history: form.psychiatric_history,
      psychiatric_details: form.psychiatric_history ? form.psychiatric_details.trim() : null,
      cardiac_history: form.cardiac_history,
      cardiac_details: form.cardiac_history ? form.cardiac_details.trim() : null,
      pregnant: form.pregnant,
      allergies: form.allergies.trim() || null,
      other_conditions: form.other_conditions.trim() || null,
      previous_experience: form.previous_experience,
      consent_health_data: form.consent_health_data,
    });

    if (error) {
      setSubmitError(error);
      return;
    }
    router.back();
  }

  // ── carregando ──
  if (state.phase === 'loading') {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={c.forest} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Cabeçalho */}
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        FICHA DE SAÚDE
      </Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        Para cuidar de você
      </Text>
      <Text style={[styles.subtitle, { color: c.text2, fontFamily: fontFamily.sans }]}>
        Essas informações ficam protegidas e são vistas só por quem conduz a cerimônia.
      </Text>

      <View style={styles.form}>
        {/* Contato de emergência */}
        <Text style={[styles.section, { color: c.text, fontFamily: fontFamily.sansSemi }]}>
          Contato de emergência
        </Text>
        <TextField
          label="Nome"
          value={form.emergency_contact_name}
          onChangeText={(v) => set('emergency_contact_name', v)}
          autoCapitalize="words"
          placeholder="Quem podemos acionar se preciso"
          error={errors.emergency_contact_name}
        />
        <TextField
          label="Telefone"
          value={form.emergency_contact_phone}
          onChangeText={(v) => set('emergency_contact_phone', v)}
          keyboardType="phone-pad"
          placeholder="(00) 00000-0000"
          error={errors.emergency_contact_phone}
        />

        {/* Saúde */}
        <Text style={[styles.section, { color: c.text, fontFamily: fontFamily.sansSemi }]}>
          Saúde
        </Text>

        <RadioGroup
          label="Usa alguma medicação contínua?"
          value={form.uses_medication}
          onChange={(v) => set('uses_medication', v)}
        />
        {form.uses_medication && (
          <TextField
            label="Quais?"
            value={form.medications}
            onChangeText={(v) => set('medications', v)}
            placeholder="Nome e dosagem, se souber"
            multiline
            error={errors.medications}
          />
        )}

        <RadioGroup
          label="Possui histórico psiquiátrico?"
          value={form.psychiatric_history}
          onChange={(v) => set('psychiatric_history', v)}
        />
        {form.psychiatric_history && (
          <TextField
            label="Conte um pouco"
            value={form.psychiatric_details}
            onChangeText={(v) => set('psychiatric_details', v)}
            placeholder="O que for importante sabermos"
            multiline
            error={errors.psychiatric_details}
          />
        )}

        <RadioGroup
          label="Possui histórico cardíaco?"
          value={form.cardiac_history}
          onChange={(v) => set('cardiac_history', v)}
        />
        {form.cardiac_history && (
          <TextField
            label="Conte um pouco"
            value={form.cardiac_details}
            onChangeText={(v) => set('cardiac_details', v)}
            placeholder="O que for importante sabermos"
            multiline
            error={errors.cardiac_details}
          />
        )}

        <RadioGroup
          label="Está gestante?"
          value={form.pregnant}
          onChange={(v) => set('pregnant', v)}
        />

        <TextField
          label="Alergias"
          value={form.allergies}
          onChangeText={(v) => set('allergies', v)}
          placeholder="Alimentos, medicamentos… (opcional)"
          multiline
        />
        <TextField
          label="Outras condições"
          value={form.other_conditions}
          onChangeText={(v) => set('other_conditions', v)}
          placeholder="Algo mais que queira compartilhar (opcional)"
          multiline
        />

        <RadioGroup
          label="Já participou de uma cerimônia antes?"
          value={form.previous_experience}
          onChange={(v) => set('previous_experience', v)}
        />

        {/* Consentimento LGPD */}
        <View style={[styles.consent, { backgroundColor: c.tint, borderColor: c.border2 }]}>
          <Checkbox
            checked={form.consent_health_data}
            onChange={(v) => set('consent_health_data', v)}
            error={errors.consent_health_data}
            label="Autorizo o uso destes dados de saúde exclusivamente para a minha segurança durante a cerimônia, conforme a LGPD."
          />
        </View>

        {submitError ? (
          <Text style={[styles.msg, { color: c.error, fontFamily: fontFamily.sans }]}>
            {submitError}
          </Text>
        ) : null}

        <Button label="Salvar ficha" onPress={handleSubmit} loading={saving} />
      </View>
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
  title: {
    fontSize: fontSize.title,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.bodySm,
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },

  form: { gap: spacing.lg },
  section: {
    fontSize: fontSize.body,
    marginTop: spacing.sm,
  },
  consent: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  msg: { fontSize: fontSize.micro },
});
