# Edge Functions — Hauxe

Funções Deno do fluxo de pagamento PIX.

## Funções

| Função | Acesso | Responsabilidade |
|--------|--------|------------------|
| `create-pix-charge` | autenticado (JWT do usuário) | Cria a cobrança PIX e registra em `payments` (status `pendente`) via `service_role`. |
| `pix-webhook` | público (`verify_jwt=false`) | Recebe a confirmação do provedor e marca o `payment` como `pago` → trigger confirma a inscrição. |

## Estado atual

- **DEPLOYADAS em produção (06/07/2026)** — `create-pix-charge` (verify_jwt on)
  e `pix-webhook` (verify_jwt off), ambas em modo mock.
- **Provedor mockado.** Sem `PIX_PROVIDER` definido, `create-pix-charge` gera um QR Code de teste
  (via `api.qrserver.com`) e um `provider_txid` fake. Suficiente para validar app + triggers.
- **`pix-webhook` é fail-closed**: sem `PIX_WEBHOOK_SECRET` configurada, rejeita
  TUDO com 401 (verificado em produção). Um webhook aberto seria o mesmo furo da
  `simulate_payment`, removida na v13. No modo mock, confirme pagamentos via SQL
  (seção abaixo).
- A integração real (Asaas/MercadoPago) está marcada com `TODO` em ambas as funções
  (chamada HTTP ao provedor e verificação de assinatura do webhook).

## Deploy

```bash
supabase functions deploy create-pix-charge
supabase functions deploy pix-webhook --no-verify-jwt
```

## Secrets

```bash
# Reais quando houver provedor:
supabase secrets set PIX_PROVIDER=asaas
supabase secrets set PIX_PROVIDER_API_KEY=...
supabase secrets set PIX_WEBHOOK_SECRET=...
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas
automaticamente no runtime das Edge Functions.

Depois do deploy, registrar a URL pública de `pix-webhook` no painel do provedor.

## Testar a confirmação sem provedor

Simule o webhook chamando a função com um payload de teste, ou marque direto no banco:

```sql
update payments set status = 'pago', paid_at = now()
where registration_id = '<rid>' and status = 'pendente';
```

O trigger `trg_payment_status_sync` promove a inscrição para `confirmada` se a ficha também estiver ok.
