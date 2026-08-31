import { createClient } from '@supabase/supabase-js';

// Usando as chaves que já funcionam no seu pix.js e status.js
const SUPABASE_URL = 'https://oabcppkojfmmmqhevjpq.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    // 1. Pega o token da URL e o token que você definiu na Vercel
    const { token } = req.query;
    const tokenVerdadeiro = process.env.WEBHOOK_TOKEN_SECRETO || "Blindado2026"; // Aceita o da Vercel ou o padrão

    // 2. RESPOSTA PARA A EFÍ (O que resolve o erro 500)
    // Quando a Efí testa o link, ela pode mandar um GET. Precisamos responder 200 sempre.
    if (req.method === 'GET') {
        return res.status(200).json({ status: "Webhook Online" });
    }

    // 3. TRAVA DE SEGURANÇA
    if (token !== tokenVerdadeiro) {
        console.log("🚫 Token Inválido");
        return res.status(401).json({ erro: "Token incorreto" });
    }

    try {
        const corpo = req.body;
        let txid = null;
        
        // Tenta achar o TXID no pacote da Efí
        if (corpo.pix && corpo.pix[0]) {
            txid = corpo.pix[0].txid;
        } else if (corpo.txid) {
            txid = corpo.txid;
        }

        if (!txid) return res.status(200).json({ msg: "Sem TXID" });

        // 4. ATUALIZA O BANCO (status_pagamento)
        const { error } = await supabase
            .from('leads')
            .update({ status_pagamento: 'pago' })
            .eq('txid', txid);

        if (error) throw error;

        return res.status(200).json({ status: "pago" });

    } catch (err) {
        console.error("Erro interno:", err.message);
        return res.status(500).json({ erro: "Erro ao processar banco" });
    }
}
