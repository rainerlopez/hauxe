// =====================================================================
// Edge Function: pix-webhook
// Recebe a confirmação de pagamento do provedor PIX e marca o `payment`
// como 'pago'. Isso dispara `trg_payment_status_sync`, que reavalia a
// inscrição e a promove para 'confirmada' (se a ficha também estiver ok).
//
// Esta função é PÚBLICA (sem JWT de usuário) — configurar verify_jwt=false.
// Autenticidade (Asaas): o painel de webhooks do Asaas envia o header
// `asaas-access-token` com o "Token de autenticação" configurado lá.
// Configure o MESMO valor em PIX_WEBHOOK_SECRET. Comparação constant-time.
// (Compat: o header `x-webhook-signature` também é aceito, p/ testes manuais.)
//
// FAIL-CLOSED (v13/D8): sem PIX_WEBHOOK_SECRET configurada a função rejeita
// tudo — um webhook público que aceita qualquer payload seria o mesmo furo
// da simulate_payment que removemos. No modo mock, confirme pagamentos via
// SQL privilegiado (ver supabase/functions/README.md).
//
// Deploy:
//   supabase functions deploy pix-webhook --no-verify-jwt
//   supabase secrets set PIX_WEBHOOK_SECRET=...
//   → Asaas: Menu → Integrações → Webhooks → URL desta função +
//     "Token de autenticação" = PIX_WEBHOOK_SECRET + eventos de cobrança.
// =====================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comparação constant-time (evita timing attack na igualdade do token).
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function isValidSignature(req: Request): boolean {
  const secret = Deno.env.get('PIX_WEBHOOK_SECRET');
  if (!secret) return false; // fail-closed
  const provided =
    req.headers.get('asaas-access-token') ??
    req.headers.get('x-webhook-signature') ??
    '';
  return timingSafeEqual(provided, secret);
}

// Mapeia o status do provedor para o nosso enum payment_status.
// Asaas: PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, ...
function mapStatus(providerStatus: string): 'pago' | 'pendente' | 'estornado' | 'expirado' | null {
  const s = providerStatus.toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'PAID', 'APPROVED'].includes(s)) return 'pago';
  if (['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK', 'CHARGEBACK_REQUESTED'].includes(s)) return 'estornado';
  if (['EXPIRED', 'OVERDUE'].includes(s)) return 'expirado';
  if (['PENDING', 'AWAITING_PAYMENT', 'AWAITING_RISK_ANALYSIS'].includes(s)) return 'pendente';
  return null;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Método não permitido.', { status: 405 });
  }
  if (!isValidSignature(req)) {
    return new Response('Assinatura inválida.', { status: 401 });
  }

  try {
    const payload = await req.json();

    // Asaas: { event: 'PAYMENT_RECEIVED', payment: { id, status, ... } }.
    // Fallbacks genéricos mantidos para testes manuais.
    const txid: string | undefined =
      payload?.payment?.id ?? payload?.txid ?? payload?.provider_txid;
    const providerStatus: string | undefined =
      payload?.payment?.status ?? payload?.status;

    if (!txid || !providerStatus) {
      // 200 para o provedor não reenviar indefinidamente um payload inesperado.
      return new Response('ignored', { status: 200 });
    }

    const mapped = mapStatus(providerStatus);
    if (!mapped) return new Response('ignored', { status: 200 });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const update: Record<string, unknown> = { status: mapped, raw_payload: payload };
    if (mapped === 'pago') update.paid_at = new Date().toISOString();

    // Idempotente: o UPDATE por provider_txid pode chegar mais de uma vez.
    const { error } = await admin
      .from('payments')
      .update(update)
      .eq('provider_txid', txid);

    if (error) return new Response(error.message, { status: 500 });

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'erro', { status: 500 });
  }
});
