import { createClient } from '@supabase/supabase-js';

// --- COLOQUE SUAS CHAVES AQUI ---
const SUPABASE_URL = 'https://oabcppkojfmmmqhevjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw'; // Use a service_role!
// --------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    console.log("Recebendo Webhook...");

    // 1. Validação Básica
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido' });
    }

    try {
        const corpo = req.body;
        console.log("Corpo recebido:", JSON.stringify(corpo));

        // 2. Validação do Formato da Efí
        // A Efí manda assim: { pix: [ { txid: "...", ... } ] }
        if (!corpo.pix || !corpo.pix[0] || !corpo.pix[0].txid) {
            console.log("Erro: O aviso não tem o formato de Pix da Efí.");
            // Retornamos 200 para a Efí não ficar tentando de novo, mas avisamos que foi ignorado
            return res.status(200).json({ mensagem: "Formato ignorado ou teste" });
        }

        const txidRecebido = corpo.pix[0].txid;
        console.log(`TXID Identificado: ${txidRecebido}`);

        // 3. Atualizar o Supabase
        const { data, error } = await supabase
            .from('leads')
            .update({ status_pagamento: 'pago' }) // Confirme se sua coluna chama 'status_pagamento'
            .eq('txid', txidRecebido)
            .select();

        if (error) {
            console.error("Erro no Supabase:", error);
            return res.status(500).json({ erro: error.message });
        }

        if (data && data.length === 0) {
            console.log("Alerta: Nenhum lead encontrado com esse TXID.");
            return res.status(200).json({ aviso: "TXID não encontrado no banco" });
        }

        console.log("Sucesso! Lead atualizado:", data);
        return res.status(200).json({ mensagem: "Status atualizado para PAGO" });

    } catch (err) {
        console.error("Erro Geral:", err);
        return res.status(500).json({ erro: err.message });
    }
}
