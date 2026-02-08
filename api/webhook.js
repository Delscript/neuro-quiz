import { createClient } from '@supabase/supabase-js';

// --- PREENCHA SUAS CHAVES DO SUPABASE AQUI ---
const SUPABASE_URL = 'https://oabcppkojfmmmqhevjpq.supabase.co'; // <--- COLE A URL DO SUPABASE DENTRO DAS ASPAS
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw'; // <--- COLE A CHAVE DO SUPABASE DENTRO DAS ASPAS
// ---------------------------------------------

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Método não permitido');

    try {
        // Conecta no Banco
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        
        // Pega a lista de pagamentos que a Efí mandou
        const { pix } = req.body;

        // Se não tiver pix, só diz OK e encerra
        if (!pix || !Array.isArray(pix)) return res.status(200).json({ ok: true });

        console.log("Recebendo aviso de:", pix.length, "pagamentos.");

        // Processa cada pagamento
        for (const pagamento of pix) {
            const txid = pagamento.txid;
            if (txid) {
                console.log("Aprovando TXID:", txid);
                // Busca no banco quem tem esse TXID e marca como 'pago'
                await supabase
                    .from('leads')
                    .update({ status_pagamento: 'pago' })
                    .eq('txid', txid);
            }
        }

        return res.status(200).json({ status: 'Recebido e Atualizado' });

    } catch (error) {
        console.error("Erro Webhook:", error);
        return res.status(500).json({ erro: error.message });
    }
}
