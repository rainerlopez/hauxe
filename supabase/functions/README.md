# Edge Functions — Hauxe

Funções Deno do fluxo de pagamento PIX.

## Funções

| Função | Acesso | Responsabilidade |
|--------|--------|------------------|
| `create-pix-charge` | autenticado (JWT do usuário) | Cria a cobrança PIX (Asaas ou mock) e registra em `payments` (status `pendente`) via `service_role`. |
| `pix-webhook` | público (`verify_jwt=false`) | Recebe a confirmação do provedor e marca o `payment` como `pago` → trigger confirma a inscrição. |

## Estado atual (2026-07-19)

- **Provedor real integrado: Asaas.** `PIX_PROVIDER=asaas` ativa o fluxo real:
  busca/cria o cliente no Asaas por CPF (`profiles.cpf`, v12), cria a cobrança
  `billingType=PIX` com vencimento D+1 e busca o QR Code (`payload` copia-e-cola
  + `encodedImage` base64, gravado como data-URI em `payments.qr_code_image`).
- **A3 fechado:** o valor é derivado no servidor a partir de
  `contribution_tiers.amount`, e o tier PRECISA pertencer à cerimônia da
  inscrição (senão 400). O cliente nunca controla o valor cobrado.
- **Sem `PIX_PROVIDER`: modo mock** (QR de teste via `api.qrserver.com`,
  `provider_txid` fake) — validação fim-a-fim sem credenciais.
- **`pix-webhook` é fail-closed**: sem `PIX_WEBHOOK_SECRET` configurada, rejeita
  TUDO com 401. Com secret, valida o header `asaas-access-token` (o "Token de
  autenticação" do painel de webhooks do Asaas) em comparação **constant-time**.
  Compat: `x-webhook-signature` também é aceito para testes manuais.
- Contas sem CPF (pré-v12) recebem erro amigável pedindo atualização de perfil
  antes de pagar — o Asaas exige CPF/CNPJ do pagador.

## Deploy

```bash
supabase functions deploy create-pix-charge
supabase functions deploy pix-webhook --no-verify-jwt
```

## Secrets

```bash
# Produção (Asaas):
supabase secrets set PIX_PROVIDER=asaas
supabase secrets set ASAAS_API_KEY=<chave do painel Asaas>
supabase secrets set ASAAS_BASE_URL=https://api.asaas.com/v3   # sandbox: https://api-sandbox.asaas.com/v3
supabase secrets set PIX_WEBHOOK_SECRET=<token forte, o mesmo do painel de webhooks>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas
automaticamente no runtime das Edge Functions.

### Configuração no painel Asaas (uma vez)

1. Gerar a API key: Menu → Integrações → API.
2. Webhooks: Menu → Integrações → Webhooks → novo webhook:
   - URL: `https://<project-ref>.supabase.co/functions/v1/pix-webhook`
   - Token de autenticação: o MESMO valor de `PIX_WEBHOOK_SECRET`
   - Eventos: cobranças (PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_REFUNDED,
     PAYMENT_OVERDUE — demais eventos são ignorados com 200).
3. Recomendado: validar primeiro no sandbox (`ASAAS_BASE_URL` de sandbox + API key de sandbox).

## Testar a confirmação sem provedor

Simule o webhook chamando a função com um payload de teste, ou marque direto no banco:

```sql
update payments set status = 'pago', paid_at = now()
where registration_id = '<rid>' and status = 'pendente';
```

O trigger `trg_payment_status_sync` promove a inscrição para `confirmada` se a ficha também estiver ok.

Com `PIX_WEBHOOK_SECRET` configurada, dá para simular via HTTP:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/pix-webhook \
  -H 'Content-Type: application/json' \
  -H 'asaas-access-token: <PIX_WEBHOOK_SECRET>' \
  -d '{"event":"PAYMENT_RECEIVED","payment":{"id":"<provider_txid>","status":"RECEIVED"}}'
```
