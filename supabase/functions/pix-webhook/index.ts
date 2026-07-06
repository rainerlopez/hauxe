// =====================================================================
// Edge Function: pix-webhook
// Recebe a confirmação de pagamento do provedor PIX e marca o `payment`
// como 'pago'. Isso dispara `trg_payment_status_sync`, que reavalia a
// inscrição e a promove para 'confirmada' (se a ficha também estiver ok).
//
// Esta função é PÚBLICA (sem JWT de usuário) — configurar verify_jwt=false.
// A autenticidade é garantida pela verificação de assinatura do provedor.
//
// Deploy:
//   supabase functions deploy pix-webhook --no-verify-jwt
//   supabase secrets set PIX_WEBHOOK_SECRET=...
//   → registrar a URL pública no painel do provedor (Asaas/MercadoPago).
// =====================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// TODO: verificar assinatura HMAC/token do provedor (header específico).
// Rejeita com 401 se inválido. Sem isso, qualquer um poderia confirmar pagamentos.
// FAIL-CLOSED (v13/D8): sem PIX_WEBHOOK_SECRET configurada a função rejeita
// tudo — um webhook público que aceita qualquer payload seria o mesmo furo
// da simulate_payment que removemos. No modo mock, confirme pagamentos via
// SQL privilegiado (ver supabase/functions/README.md).
function isValidSignature(req: Request): boolean {
  const secret = Deno.env.get('PIX_WEBHOOK_SECRET');
  if (!secret) return false;
  const provided = req.headers.get('x-webhook-signature') ?? '';
  // TODO: comparar com HMAC do corpo. Placeholder de igualdade simples.
  return provided === secret;
}

// Mapeia o status do provedor para o nosso enum payment_status.
function mapStatus(providerStatus: string): 'pago' | 'pendente' | 'estornado' | 'expirado' | null {
  const s = providerStatus.toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'PAID', 'APPROVED'].includes(s)) return 'pago';
  if (['REFUNDED', 'CHARGEBACK'].includes(s)) return 'estornado';
  if (['EXPIRED', 'OVERDUE'].includes(s)) return 'expirado';
  if (['PENDING', 'AWAITING_PAYMENT'].includes(s)) return 'pendente';
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

    // TODO: extrair conforme o formato do provedor escolhido.
    // Asaas: payload.payment.{ externalReference | id, status }
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
