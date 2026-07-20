import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, TextField } from '../../../src/components';
import { canManageOrg, useStaffAccess } from '../../../src/features/admin';
import {
  CEREMONY_STATUS_LABEL,
  type CeremonyStatus,
} from '../../../src/features/admin/useOrgCeremonies';
import { confirmAction } from '../../../src/lib/confirm';
import { friendlyDbError } from '../../../src/lib/friendlyDbError';
import { supabase } from '../../../src/lib/supabase';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, sizing, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

type PageState = 'loading' | 'ready' | 'saving';

/** Linha de tier no editor: id presente = já existe no banco. */
interface TierDraft {
  id: string | null;
  label: string;
  amountText: string; // em reais, texto ("120" ou "120,00")
}

interface ConductorOption {
  id: string;
  name: string;
  active: boolean;
}

// ── Data/hora sem lib de datepicker: DD/MM/AAAA + HH:MM locais ─────────

function two(n: number) {
  return String(n).padStart(2, '0');
}

function isoToLocalParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${two(d.getHours())}:${two(d.getMinutes())}`,
  };
}

/** "DD/MM/AAAA" + "HH:MM" → ISO (fuso local). null = inválido. */
function partsToIso(date: string, time: string): string | null {
  const dm = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const tm = time.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const [, dd, mo, yyyy] = dm.map(Number) as unknown as number[];
  const [, hh, mi] = tm.map(Number) as unknown as number[];
  const d = new Date(yyyy, mo - 1, dd, hh, mi);
  // Rejeita datas "normalizadas" pelo JS (ex.: 32/13 vira outro mês)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mo - 1 || d.getDate() !== dd) return null;
  if (d.getHours() !== hh || d.getMinutes() !== mi) return null;
  return d.toISOString();
}

/** "120", "120,50", "120.50" → número em reais. null = inválido. */
function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export default function CeremonyFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const access = useStaffAccess();
  const isNew = id === 'nova';
  const canWrite = canManageOrg(access);
  const orgId = access.status === 'staff' ? access.orgs[0].org_id : null;

  const [pageState, setPageState] = useState<PageState>(isNew ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [arrivalText, setArrivalText] = useState('');   // HH:MM opcional (mesmo dia)
  const [endText, setEndText] = useState('');           // HH:MM opcional (mesmo dia)
  const [capacityText, setCapacityText] = useState('');
  const [foodKgText, setFoodKgText] = useState('');
  const [orientations, setOrientations] = useState('');
  const [status, setStatus] = useState<CeremonyStatus>('rascunho');

  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [removedTierIds, setRemovedTierIds] = useState<string[]>([]);
  const [conductorOptions, setConductorOptions] = useState<ConductorOption[]>([]);
  const [selectedConductors, setSelectedConductors] = useState<Set<string>>(new Set());
  const savedConductors = useRef<Set<string>>(new Set());

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Carrega cerimônia (edição) + tiers + vínculos + condutores da org
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function load() {
      try {
        const conductorsQ = await supabase
          .from('conductors')
          .select('id, name, active')
          .eq('org_id', orgId!)
          .order('name');
        if (conductorsQ.error) throw new Error(conductorsQ.error.message);
        const options = (conductorsQ.data ?? []) as ConductorOption[];

        if (isNew) {
          if (cancelled) return;
          setConductorOptions(options.filter((o) => o.active));
          setPageState('ready');
          return;
        }

        const [cerQ, tiersQ, linksQ] = await Promise.all([
          supabase.from('ceremonies').select('*').eq('id', id as string).single(),
          supabase
            .from('contribution_tiers')
            .select('id, label, amount, sort_order')
            .eq('ceremony_id', id as string)
            .order('sort_order'),
          supabase
            .from('ceremony_conductors')
            .select('conductor_id')
            .eq('ceremony_id', id as string),
        ]);
        if (cerQ.error || !cerQ.data) throw new Error(cerQ.error?.message ?? 'Cerimônia não encontrada.');
        if (tiersQ.error) throw new Error(tiersQ.error.message);
        if (linksQ.error) throw new Error(linksQ.error.message);
        if (cancelled) return;

        const cer = cerQ.data;
        setTitle(cer.title as string);
        setDescription((cer.description as string | null) ?? '');
        const startParts = isoToLocalParts(cer.starts_at as string);
        setDateText(startParts.date);
        setTimeText(startParts.time);
        if (cer.arrival_at) setArrivalText(isoToLocalParts(cer.arrival_at as string).time);
        if (cer.ends_at) setEndText(isoToLocalParts(cer.ends_at as string).time);
        setCapacityText(cer.capacity ? String(cer.capacity) : '');
        setFoodKgText(cer.food_donation_kg != null ? String(cer.food_donation_kg).replace('.', ',') : '');
        setOrientations((cer.orientations as string | null) ?? '');
        setStatus(cer.status as CeremonyStatus);

        setTiers(
          (tiersQ.data ?? []).map((t) => ({
            id: t.id as string,
            label: (t.label as string | null) ?? '',
            amountText: String(t.amount).replace('.', ','),
          })),
        );

        const linked = new Set((linksQ.data ?? []).map((l) => l.conductor_id as string));
        savedConductors.current = new Set(linked);
        setSelectedConductors(new Set(linked));
        // Ativos + inativos que já estão vinculados (para permitir desvincular)
        setConductorOptions(options.filter((o) => o.active || linked.has(o.id)));

        setPageState('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? friendlyDbError(e.message) : 'Erro ao carregar.');
        setPageState('ready');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, orgId]);

  function toggleConductor(cid: string) {
    setSelectedConductors((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  function updateTier(index: number, patch: Partial<TierDraft>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeTier(index: number) {
    const tier = tiers[index];
    if (tier.id) setRemovedTierIds((prev) => [...prev, tier.id!]);
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!orgId) return;

    // ── Validação ──
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setFieldError('Título é obrigatório.'); return; }
    const startsIso = partsToIso(dateText, timeText);
    if (!startsIso) { setFieldError('Data/hora de início inválida (use DD/MM/AAAA e HH:MM).'); return; }
    const arrivalIso = arrivalText.trim() ? partsToIso(dateText, arrivalText) : null;
    if (arrivalText.trim() && !arrivalIso) { setFieldError('Hora de chegada inválida (HH:MM).'); return; }
    const endsIso = endText.trim() ? partsToIso(dateText, endText) : null;
    if (endText.trim() && !endsIso) { setFieldError('Hora de término inválida (HH:MM).'); return; }
    let capacity: number | null = null;
    if (capacityText.trim()) {
      capacity = Number(capacityText.trim());
      if (!Number.isInteger(capacity) || capacity <= 0) {
        setFieldError('Capacidade deve ser um número inteiro maior que zero (ou vazio = sem limite).');
        return;
      }
    }
    let foodKg: number | null = null;
    if (foodKgText.trim()) {
      foodKg = parseAmount(foodKgText);
      if (foodKg === null) { setFieldError('Alimento (kg) inválido.'); return; }
    }
    for (const t of tiers) {
      if (!t.label.trim()) { setFieldError('Todo valor de contribuição precisa de um rótulo.'); return; }
      if (parseAmount(t.amountText) === null) {
        setFieldError(`Valor inválido no tier "${t.label.trim()}". Use números em reais, ex.: 120 ou 120,50.`);
        return;
      }
    }
    setFieldError(null);

    if (status === 'cancelada') {
      const confirmed = await confirmAction({
        title: 'Cancelar cerimônia?',
        message: 'Os participantes deixarão de ver a cerimônia como ativa. Esta é uma ação séria.',
        confirmLabel: 'Cancelar cerimônia',
        destructive: true,
      });
      if (!confirmed) return;
    }

    setPageState('saving');
    setSaveError(null);

    try {
      const payload = {
        title: trimmedTitle,
        description: description.trim() || null,
        starts_at: startsIso,
        arrival_at: arrivalIso,
        ends_at: endsIso,
        capacity,
        food_donation_kg: foodKg,
        orientations: orientations.trim() || null,
        status,
      };

      let ceremonyId = id as string;
      if (isNew) {
        const { data, error } = await supabase
          .from('ceremonies')
          .insert({ ...payload, org_id: orgId })
          .select('id')
          .single();
        if (error || !data) throw new Error(error?.message ?? 'Erro ao criar cerimônia.');
        ceremonyId = data.id as string;
      } else {
        const { error } = await supabase.from('ceremonies').update(payload).eq('id', ceremonyId);
        if (error) throw new Error(error.message);
      }

      // ── Tiers: diff (delete → update → insert) ──
      if (removedTierIds.length > 0) {
        const { error } = await supabase
          .from('contribution_tiers')
          .delete()
          .in('id', removedTierIds);
        if (error) {
          throw new Error(
            error.message.includes('foreign key') || error.message.includes('violates')
              ? 'Um dos valores removidos já foi escolhido em uma inscrição — edite o rótulo/valor em vez de remover.'
              : error.message,
          );
        }
      }
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        const row = {
          label: t.label.trim(),
          amount: parseAmount(t.amountText)!,
          sort_order: i,
        };
        if (t.id) {
          const { error } = await supabase.from('contribution_tiers').update(row).eq('id', t.id);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase
            .from('contribution_tiers')
            .insert({ ...row, ceremony_id: ceremonyId });
          if (error) throw new Error(error.message);
        }
      }

      // ── Condutores: diff dos vínculos ──
      const toAdd = [...selectedConductors].filter((cid) => !savedConductors.current.has(cid));
      const toRemove = [...savedConductors.current].filter((cid) => !selectedConductors.has(cid));
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('ceremony_conductors')
          .insert(toAdd.map((cid) => ({ ceremony_id: ceremonyId, conductor_id: cid })));
        if (error) throw new Error(error.message);
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('ceremony_conductors')
          .delete()
          .eq('ceremony_id', ceremonyId)
          .in('conductor_id', toRemove);
        if (error) throw new Error(error.message);
      }

      if (mounted.current) router.back();
    } catch (e) {
      if (!mounted.current) return;
      setSaveError(e instanceof Error ? friendlyDbError(e.message) : 'Erro ao salvar.');
      setPageState('ready');
    }
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
        <Text style={[styles.errorText, { color: c.error, fontFamily: fontFamily.sans }]}>
          {loadError}
        </Text>
        <Button label="← Voltar" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const isSaving = pageState === 'saving';
  const editable = !isSaving && canWrite;
  // encerrada/cancelada só fazem sentido para cerimônia que já existe
  const statusOptions: CeremonyStatus[] = isNew
    ? ['rascunho', 'publicada']
    : ['rascunho', 'publicada', 'encerrada', 'cancelada'];

  return (
    <Screen>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.backLink, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.backText, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
          ← Cerimônias
        </Text>
      </Pressable>

      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        {isNew ? 'Nova cerimônia' : 'Editar cerimônia'}
      </Text>

      <View style={styles.form}>
        <TextField
          label="Título *"
          value={title}
          onChangeText={setTitle}
          placeholder="Ex.: Cerimônia Yawanawá · Lua Cheia"
          editable={editable}
        />

        <TextField
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          placeholder="Convite/descrição que o participante vê (opcional)"
          multiline
          numberOfLines={4}
          style={styles.multiline}
          editable={editable}
        />

        <View style={styles.rowFields}>
          <View style={styles.rowField}>
            <TextField
              label="Data *"
              value={dateText}
              onChangeText={setDateText}
              placeholder="DD/MM/AAAA"
              keyboardType="numbers-and-punctuation"
              editable={editable}
            />
          </View>
          <View style={styles.rowField}>
            <TextField
              label="Início *"
              value={timeText}
              onChangeText={setTimeText}
              placeholder="HH:MM"
              keyboardType="numbers-and-punctuation"
              editable={editable}
            />
          </View>
        </View>

        <View style={styles.rowFields}>
          <View style={styles.rowField}>
            <TextField
              label="Chegada (opcional)"
              value={arrivalText}
              onChangeText={setArrivalText}
              placeholder="HH:MM"
              keyboardType="numbers-and-punctuation"
              editable={editable}
            />
          </View>
          <View style={styles.rowField}>
            <TextField
              label="Término (opcional)"
              value={endText}
              onChangeText={setEndText}
              placeholder="HH:MM"
              keyboardType="numbers-and-punctuation"
              editable={editable}
            />
          </View>
        </View>

        <View style={styles.rowFields}>
          <View style={styles.rowField}>
            <TextField
              label="Capacidade"
              value={capacityText}
              onChangeText={setCapacityText}
              placeholder="Vazio = sem limite"
              keyboardType="number-pad"
              editable={editable}
            />
          </View>
          <View style={styles.rowField}>
            <TextField
              label="Alimento (kg)"
              value={foodKgText}
              onChangeText={setFoodKgText}
              placeholder="Ex.: 1"
              keyboardType="numbers-and-punctuation"
              editable={editable}
            />
          </View>
        </View>

        <TextField
          label="Orientações pré-cerimônia"
          value={orientations}
          onChangeText={setOrientations}
          placeholder="Dieta, o que levar, horários... (opcional)"
          multiline
          numberOfLines={4}
          style={styles.multiline}
          editable={editable}
        />

        {/* Status */}
        <View>
          <Text style={[styles.sectionLabel, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
            Status
          </Text>
          <View style={styles.chipRow}>
            {statusOptions.map((s) => (
              <Pressable
                key={s}
                onPress={() => editable && setStatus(s)}
                accessibilityRole="tab"
                accessibilityState={{ selected: status === s }}
                style={[
                  styles.chip,
                  { borderColor: status === s ? c.forest : c.border },
                  status === s && { backgroundColor: c.forest },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    {
                      fontFamily: status === s ? fontFamily.sansMedium : fontFamily.sans,
                      color: status === s ? c.onForest : c.text2,
                    },
                  ]}
                >
                  {CEREMONY_STATUS_LABEL[s]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Tiers de contribuição */}
        <View>
          <Text style={[styles.sectionLabel, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
            Valores de contribuição (R$)
          </Text>
          {tiers.length === 0 && (
            <Text style={[styles.helperText, { color: c.text3, fontFamily: fontFamily.sans }]}>
              Sem valores ainda — o participante não conseguirá gerar o PIX.
            </Text>
          )}
          {tiers.map((tier, i) => (
            <View key={tier.id ?? `new-${i}`} style={styles.tierRow}>
              <View style={styles.tierLabel}>
                <TextField
                  label={i === 0 ? 'Rótulo' : ''}
                  value={tier.label}
                  onChangeText={(v) => updateTier(i, { label: v })}
                  placeholder="Ex.: Contribuição plena"
                  editable={editable}
                />
              </View>
              <View style={styles.tierAmount}>
                <TextField
                  label={i === 0 ? 'Valor' : ''}
                  value={tier.amountText}
                  onChangeText={(v) => updateTier(i, { amountText: v })}
                  placeholder="120,00"
                  keyboardType="numbers-and-punctuation"
                  editable={editable}
                />
              </View>
              {editable && (
                <Pressable
                  onPress={() => removeTier(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remover valor ${tier.label || i + 1}`}
                  style={({ pressed }) => [styles.tierRemove, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <Text style={{ color: c.error, fontFamily: fontFamily.sansMedium, fontSize: fontSize.body }}>
                    ✕
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
          {editable && (
            <Pressable
              onPress={() => setTiers((prev) => [...prev, { id: null, label: '', amountText: '' }])}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addTier, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.addTierLabel, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
                + Adicionar valor
              </Text>
            </Pressable>
          )}
        </View>

        {/* Condutores */}
        <View>
          <Text style={[styles.sectionLabel, { color: c.text2, fontFamily: fontFamily.sansMedium }]}>
            Condutores
          </Text>
          {conductorOptions.length === 0 ? (
            <Text style={[styles.helperText, { color: c.text3, fontFamily: fontFamily.sans }]}>
              Nenhum condutor ativo — cadastre em Console → Condutores.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {conductorOptions.map((opt) => {
                const selected = selectedConductors.has(opt.id);
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => editable && toggleConductor(opt.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    style={[
                      styles.chip,
                      { borderColor: selected ? c.forest : c.border },
                      selected && { backgroundColor: c.forest },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        {
                          fontFamily: selected ? fontFamily.sansMedium : fontFamily.sans,
                          color: selected ? c.onForest : c.text2,
                        },
                      ]}
                    >
                      {opt.name}
                      {!opt.active ? ' (inativo)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {fieldError && (
        <Text style={[styles.errorText, { color: c.error, fontFamily: fontFamily.sans }]}>
          {fieldError}
        </Text>
      )}
      {saveError && (
        <Text style={[styles.errorText, { color: c.error, fontFamily: fontFamily.sans }]}>
          {saveError}
        </Text>
      )}

      {!canWrite && (
        <Text style={[styles.helperText, { color: c.text3, fontFamily: fontFamily.sans }]}>
          Somente administradores do espaço podem editar cerimônias.
        </Text>
      )}

      {canWrite && (
        <Button
          label={isNew ? 'Criar cerimônia' : 'Salvar'}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          style={styles.saveButton}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backLink:   { paddingVertical: spacing.sm, marginBottom: spacing.xs },
  backText:   { fontSize: fontSize.bodySm },
  title:      { fontSize: fontSize.title, lineHeight: 32, marginBottom: spacing['2xl'] },
  form:       { gap: spacing.blockGap, marginBottom: spacing['2xl'] },
  multiline:  { height: 100, paddingTop: 14, textAlignVertical: 'top' },

  rowFields:  { flexDirection: 'row', gap: spacing.md },
  rowField:   { flex: 1 },

  sectionLabel: { fontSize: fontSize.label, marginBottom: spacing.sm },
  helperText:   { fontSize: fontSize.bodySm, marginBottom: spacing.sm },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: sizing.minTouch,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontSize: fontSize.aux },

  tierRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginBottom: spacing.sm },
  tierLabel:  { flex: 2 },
  tierAmount: { flex: 1 },
  tierRemove: {
    width: sizing.minTouch,
    height: sizing.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTier: {
    height: sizing.minTouch,
    borderRadius: borderRadius.field,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTierLabel: { fontSize: fontSize.bodySm },

  errorText:  { fontSize: fontSize.bodySm, marginBottom: spacing.md },
  saveButton: { marginBottom: spacing.md },
});
