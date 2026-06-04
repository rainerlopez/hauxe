// =====================================================================
// Edge Function: create-pix-charge
// Cria uma cobrança PIX para uma inscrição e registra em `payments`
// (status 'pendente'). A escrita usa service_role — o app NÃO escreve
// na tabela payments diretamente (RLS só permite leitura do dono).
//
// Fluxo:
//   app → invoke('create-pix-charge', { registration_id, tier_id })
//   → valida que a inscrição é do usuário autenticado
//   → busca o valor do tier
//   → cria a cobrança no provedor (Asaas/MercadoPago) [TODO: real]
//   → INSERT payments (qr_code, qr_code_image, provider_txid)
//
// Deploy:
//   supabase functions deploy create-pix-charge
//   supabase secrets set PIX_PROVIDER=asaas PIX_PROVIDER_API_KEY=...
// =====================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface PixCharge {
  txid: string;
  qrCode: string;        // copia-e-cola
  qrCodeImage: string;   // url ou data:image base64
}

// TODO: integrar provedor real (Asaas/MercadoPago). Por ora, mock determinístico
// para validar o fluxo fim-a-fim (app + triggers) sem credenciais.
async function createProviderCharge(amount: number, registrationId: string): Promise<{ provider: string; charge: PixCharge }> {
  const provider = Deno.env.get('PIX_PROVIDER');
  if (provider) {
    // Espaço para a chamada HTTP real ao provedor.
    throw new Error(`Integração do provedor "${provider}" ainda não implementada.`);
  }

  // ── MOCK ──
  const txid = `mock-${registrationId.slice(0, 8)}-${Date.now()}`;
  const payload = `00020126BR.GOV.BCB.PIX-MOCK-${amount.toFixed(2)}-${txid}`;
  return {
    provider: 'mock',
    charge: {
      txid,
      qrCode: payload,
      qrCodeImage:
        'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
        encodeURIComponent(payload),
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const { registration_id, tier_id } = await req.json();
    if (!registration_id || !tier_id) {
      return json({ error: 'registration_id e tier_id são obrigatórios.' }, 400);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Client com o JWT do usuário — respeita RLS para validar ownership.
    const asUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Confirma que a inscrição pertence ao usuário (RLS owner).
    const { data: reg, error: regErr } = await asUser
      .from('registrations')
      .select('id')
      .eq('id', registration_id)
      .maybeSingle();
    if (regErr || !reg) return json({ error: 'Inscrição não encontrada.' }, 403);

    // Client service_role — escreve em payments.
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Valor do tier.
    const { data: tier, error: tierErr } = await admin
      .from('contribution_tiers')
      .select('amount')
      .eq('id', tier_id)
      .single();
    if (tierErr || !tier) return json({ error: 'Valor de contribuição inválido.' }, 400);

    // Idempotência: reusa uma cobrança pendente, se já existir.
    const { data: existing } = await admin
      .from('payments')
      .select('id, status')
      .eq('registration_id', registration_id)
      .eq('status', 'pendente')
      .limit(1)
      .maybeSingle();
    if (existing) return json({ payment_id: existing.id, reused: true });

    const { provider, charge } = await createProviderCharge(Number(tier.amount), registration_id);

    const { data: payment, error: payErr } = await admin
      .from('payments')
      .insert({
        registration_id,
        method: 'pix',
        status: 'pendente',
        amount: tier.amount,
        provider,
        provider_txid: charge.txid,
        qr_code: charge.qrCode,
        qr_code_image: charge.qrCodeImage,
      })
      .select('id')
      .single();
    if (payErr) return json({ error: payErr.message }, 500);

    // Registra a escolha do tier na inscrição (não dispara confirmação).
    await admin.from('registrations').update({ tier_id }).eq('id', registration_id);

    return json({ payment_id: payment.id, reused: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado.' }, 500);
  }
});
