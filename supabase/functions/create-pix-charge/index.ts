// =====================================================================
// Edge Function: create-pix-charge
// Cria uma cobrança PIX para uma inscrição e registra em `payments`
// (status 'pendente'). A escrita usa service_role — o app NÃO escreve
// na tabela payments diretamente (RLS só permite leitura do dono).
//
// Fluxo:
//   app → invoke('create-pix-charge', { registration_id, tier_id })
//   → valida que a inscrição é do usuário autenticado
//   → valida que o tier pertence à cerimônia da inscrição (A3)
//   → deriva o valor do tier no servidor (nunca do cliente) (A3)
//   → cria a cobrança no provedor (Asaas real ou mock)
//   → INSERT payments (qr_code, qr_code_image, provider_txid)
//
// Provedores:
//   PIX_PROVIDER ausente  → mock determinístico (dev/homologação)
//   PIX_PROVIDER=asaas    → Asaas (cliente + cobrança PIX + QR Code)
//
// Deploy:
//   supabase functions deploy create-pix-charge
//   supabase secrets set PIX_PROVIDER=asaas ASAAS_API_KEY=$argila \
//     ASAAS_BASE_URL=https://api.asaas.com/v3   # sandbox: https://api-sandbox.asaas.com/v3
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

interface Payer {
  name: string;
  cpf: string | null;    // 11 dígitos (profiles.cpf, v12)
  profileId: string;
}

// ── Asaas ────────────────────────────────────────────────────────────
// Docs: https://docs.asaas.com — auth via header `access_token`.
// Cobrança PIX = POST /payments (billingType PIX) + GET /payments/{id}/pixQrCode.

async function asaasFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const base = Deno.env.get('ASAAS_BASE_URL') ?? 'https://api.asaas.com/v3';
  const key = Deno.env.get('ASAAS_API_KEY');
  if (!key) throw new Error('ASAAS_API_KEY não configurada.');

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: key,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      (body as { errors?: { description?: string }[] })?.errors?.[0]?.description ??
      `HTTP ${res.status}`;
    throw new Error(`Asaas: ${detail}`);
  }
  return body as Record<string, unknown>;
}

async function asaasFindOrCreateCustomer(payer: Payer): Promise<string> {
  if (!payer.cpf) {
    // Asaas exige CPF/CNPJ do pagador. Contas antigas (pré-v12) podem não ter.
    throw new Error('Seu cadastro não tem CPF registrado — atualize o perfil para pagar via PIX.');
  }

  const found = await asaasFetch(`/customers?cpfCnpj=${payer.cpf}&limit=1`);
  const existing = (found.data as { id: string }[] | undefined)?.[0];
  if (existing) return existing.id;

  const created = await asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: payer.name,
      cpfCnpj: payer.cpf,
      externalReference: payer.profileId,
    }),
  });
  return created.id as string;
}

async function asaasCreateCharge(
  amount: number,
  registrationId: string,
  payer: Payer,
): Promise<PixCharge> {
  const customer = await asaasFindOrCreateCustomer(payer);

  // Vencimento amanhã (data local BR não importa aqui; Asaas usa yyyy-MM-dd).
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const payment = await asaasFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer,
      billingType: 'PIX',
      value: amount,
      dueDate: due,
      description: 'Contribuição — cerimônia Hauxe',
      externalReference: registrationId,
    }),
  });

  const qr = await asaasFetch(`/payments/${payment.id}/pixQrCode`);

  return {
    txid: payment.id as string,
    qrCode: qr.payload as string,
    qrCodeImage: `data:image/png;base64,${qr.encodedImage as string}`,
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────

async function createProviderCharge(
  amount: number,
  registrationId: string,
  payer: Payer,
): Promise<{ provider: string; charge: PixCharge }> {
  const provider = Deno.env.get('PIX_PROVIDER');

  if (provider === 'asaas') {
    return { provider, charge: await asaasCreateCharge(amount, registrationId, payer) };
  }
  if (provider) {
    throw new Error(`Provedor PIX "${provider}" não suportado (use "asaas" ou remova a variável para mock).`);
  }

  // ── MOCK (sem PIX_PROVIDER) — valida o fluxo fim-a-fim sem credenciais ──
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

    // Confirma que a inscrição pertence ao usuário (RLS owner) e pega a cerimônia.
    const { data: reg, error: regErr } = await asUser
      .from('registrations')
      .select('id, ceremony_id, profile_id')
      .eq('id', registration_id)
      .maybeSingle();
    if (regErr || !reg) return json({ error: 'Inscrição não encontrada.' }, 403);

    // Client service_role — escreve em payments.
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Valor do tier — derivado no servidor, e o tier PRECISA ser da cerimônia
    // da inscrição (A3: cliente não controla o valor cobrado).
    const { data: tier, error: tierErr } = await admin
      .from('contribution_tiers')
      .select('amount, ceremony_id')
      .eq('id', tier_id)
      .single();
    if (tierErr || !tier) return json({ error: 'Valor de contribuição inválido.' }, 400);
    if (tier.ceremony_id !== reg.ceremony_id) {
      return json({ error: 'Este valor não pertence à cerimônia da sua inscrição.' }, 400);
    }

    // Idempotência: reusa uma cobrança pendente, se já existir.
    const { data: existing } = await admin
      .from('payments')
      .select('id, status')
      .eq('registration_id', registration_id)
      .eq('status', 'pendente')
      .limit(1)
      .maybeSingle();
    if (existing) return json({ payment_id: existing.id, reused: true });

    // Dados do pagador (nome + CPF) para o cadastro no provedor.
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, cpf')
      .eq('id', reg.profile_id)
      .single();

    const { provider, charge } = await createProviderCharge(
      Number(tier.amount),
      registration_id,
      {
        name: profile?.full_name ?? 'Participante Hauxe',
        cpf: profile?.cpf ?? null,
        profileId: reg.profile_id,
      },
    );

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
