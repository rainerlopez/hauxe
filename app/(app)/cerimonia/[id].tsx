import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../../src/components';
import { useEnroll } from '../../../src/features/registration';
import { supabase } from '../../../src/lib/supabase';
import { useTheme } from '../../../src/theme/useTheme';
import { borderRadius, spacing } from '../../../src/theme/spacing';
import { fontFamily, fontSize } from '../../../src/theme/typography';

interface CeremonyDetail {
  id: string;
  title: string;
  description: string | null;
  orientations: string | null;
  arrival_at: string | null;
  starts_at: string;
  food_donation_kg: number | null;
}

function formatFull(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Detalhe da cerimônia + "Garantir minha vaga".
 * É a porta de entrada do fluxo (link do WhatsApp → deep link para cá).
 * A vaga é garantida na hora; ficha e contribuição ficam como tarefas
 * independentes no hub (modelo assíncrono do produto).
 */
export default function CeremonyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const { enroll, enrolling } = useEnroll();

  const [ceremony, setCeremony] = useState<CeremonyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'full' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    supabase
      .from('ceremonies')
      .select('id, title, description, orientations, arrival_at, starts_at, food_donation_kg')
      .eq('id', id)
      .eq('status', 'publicada')
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setCeremony((data as CeremonyDetail) ?? null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleEnroll() {
    if (!ceremony) return;
    setNotice(null);
    const result = await enroll(ceremony.id);
    if (result.error === null) {
      router.replace('/'); // hub assume: "Sua vaga está garantida."
      return;
    }
    setNotice({ kind: result.full ? 'full' : 'error', text: result.error });
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

  if (!ceremony) {
    return (
      <Screen>
        <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
          OCA GUATA HETÉ
        </Text>
        <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
          Cerimônia não encontrada
        </Text>
        <Text style={[styles.body, { color: c.text2, fontFamily: fontFamily.sans }]}>
          Este convite pode ter expirado. Fale com quem te enviou o link.
        </Text>
        <Button label="Voltar ao início" variant="secondary" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.kicker, { color: c.accent, fontFamily: fontFamily.sansSemi }]}>
        OCA GUATA HETÉ · CONVITE
      </Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fontFamily.serif }]}>
        {ceremony.title}
      </Text>

      {/* Data e horários — em destaque calmo */}
      <View style={[styles.infoCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.infoDate, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
          {formatFull(ceremony.starts_at)}
        </Text>
        <Text style={[styles.infoLine, { color: c.text2, fontFamily: fontFamily.sans }]}>
          {ceremony.arrival_at
            ? `Chegada ${formatTime(ceremony.arrival_at)} · Início ${formatTime(ceremony.starts_at)}`
            : `Início ${formatTime(ceremony.starts_at)}`}
        </Text>
      </View>

      {ceremony.description ? (
        <Text style={[styles.body, { color: c.text2, fontFamily: fontFamily.sans }]}>
          {ceremony.description}
        </Text>
      ) : null}

      {ceremony.orientations ? (
        <View style={[styles.orientCard, { backgroundColor: c.tint, borderColor: c.border2 }]}>
          <Text style={[styles.orientTitle, { color: c.text, fontFamily: fontFamily.sansMedium }]}>
            Orientações
          </Text>
          <Text style={[styles.orientBody, { color: c.text2, fontFamily: fontFamily.sans }]}>
            {ceremony.orientations}
          </Text>
        </View>
      ) : null}

      {ceremony.food_donation_kg ? (
        <Text style={[styles.foodNote, { color: c.text2, fontFamily: fontFamily.sans }]}>
          🌿{'  '}Se puder, leve {ceremony.food_donation_kg}kg de alimento para a partilha.
        </Text>
      ) : null}

      {/* Aviso (lotada / erro) — sem urgência artificial */}
      {notice ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: notice.kind === 'full' ? c.accentSoft : c.tint,
              borderColor: c.border2,
            },
          ]}
        >
          <Text style={[styles.noticeText, { color: c.text2, fontFamily: fontFamily.sans }]}>
            {notice.kind === 'full'
              ? `${notice.text} Fale com a equipe do espaço — às vezes uma vaga se abre.`
              : notice.text}
          </Text>
        </View>
      ) : null}

      {notice?.kind !== 'full' && (
        <Button label="Garantir minha vaga" loading={enrolling} onPress={handleEnroll} />
      )}

      <Text style={[styles.trust, { color: c.text3, fontFamily: fontFamily.sans }]}>
        A vaga é garantida agora. Ficha de saúde e contribuição você faz depois, com calma.
      </Text>
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
    marginBottom: spacing.lg,
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },

  infoCard: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  infoDate: { fontSize: fontSize.body, textTransform: 'capitalize' },
  infoLine: { fontSize: fontSize.bodySm, marginTop: 2 },

  orientCard: {
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  orientTitle: { fontSize: fontSize.bodySm, marginBottom: spacing.xs },
  orientBody: { fontSize: fontSize.bodySm, lineHeight: 20 },

  foodNote: {
    fontSize: fontSize.aux,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  notice: {
    borderRadius: borderRadius.field,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: spacing.lg,
  },
  noticeText: { fontSize: fontSize.bodySm, lineHeight: 20 },

  trust: {
    fontSize: fontSize.aux,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
});
