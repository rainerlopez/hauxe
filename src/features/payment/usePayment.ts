import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface PaymentInfo {
  id: string;
  status: string;
  amount: number;
  qr_code: string | null;
  qr_code_image: string | null;
  provider_txid: string | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'none' }                       // nenhuma cobrança criada ainda
  | { phase: 'pending'; payment: PaymentInfo }
  | { phase: 'paid'; payment: PaymentInfo }
  | { phase: 'error'; message: string };

const POLL_MS = 5000;

const COLUMNS = 'id, status, amount, qr_code, qr_code_image, provider_txid';

/**
 * Acompanha o pagamento de uma inscrição. Como a confirmação chega de forma
 * assíncrona (webhook do provedor PIX), faz polling enquanto está `pending`.
 * Expõe `createCharge` que invoca a Edge Function `create-pix-charge`.
 */
export function usePayment(registrationId: string | null) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPayment = useCallback(async () => {
    if (!registrationId) {
      setState({ phase: 'none' });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(COLUMNS)
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setState({ phase: 'none' });
        return;
      }
      const payment = data as PaymentInfo;
      setState(
        payment.status === 'pago'
          ? { phase: 'paid', payment }
          : { phase: 'pending', payment },
      );
    } catch (e) {
      setState({
        phase: 'error',
        message: e instanceof Error ? e.message : 'Erro ao carregar o pagamento.',
      });
    }
  }, [registrationId]);

  // Carga inicial.
  useEffect(() => {
    setState({ phase: 'loading' });
    fetchPayment();
  }, [fetchPayment]);

  // Polling enquanto pendente; para ao confirmar ou desmontar.
  useEffect(() => {
    function clear() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    if (state.phase === 'pending' && !pollRef.current) {
      pollRef.current = setInterval(fetchPayment, POLL_MS);
    } else if (state.phase !== 'pending') {
      clear();
    }

    return clear;
  }, [state.phase, fetchPayment]);

  const createCharge = useCallback(
    async (tierId: string): Promise<{ error: string | null }> => {
      if (!registrationId) return { error: 'Inscrição não encontrada.' };

      setCreating(true);
      try {
        const { error } = await supabase.functions.invoke('create-pix-charge', {
          body: { registration_id: registrationId, tier_id: tierId },
        });
        if (error) return { error: error.message };
        await fetchPayment();
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Erro ao gerar o PIX.' };
      } finally {
        setCreating(false);
      }
    },
    [registrationId, fetchPayment],
  );

  return { state, createCharge, creating };
}
