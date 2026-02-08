import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO OBRIGATÓRIA ---
const SUPABASE_URL = 'https://oabcppkojfmmmqhevjpq.supabase.co'; // <--- COLE URL DO SUPABASE
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw'; // <--- COLE CHAVE DO SUPABASE

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Só aceito POST');

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { pix } = req.body;

        if (!pix || !Array.isArray(pix)) return res.status(200).json({ ok: true });

        console.log("Recebi Pix:", pix.length);

        for (const pagamento of pix) {
            const txid = pagamento.txid;
            if (txid) {
                console.log("Aprovando:", txid);
                await supabase.from('leads').update({ status_pagamento: 'pago' }).eq('txid', txid);
            }
        }

        return res.status(200).json({ status: 'Sucesso' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ erro: error.message });
    }
}
