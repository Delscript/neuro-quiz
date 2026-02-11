import { createClient } from '@supabase/supabase-js';

// --- SUAS CHAVES AQUI (NÃO DEIXE VAZIO!) ---
const SUPABASE_URL = 'https://oabcppkojfmmmqhevjpq.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw'; 
// --------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    console.log("🔔 WEBHOOK ACIONADO!");

    if (req.method === 'GET') {
        return res.status(200).json({ status: "Webhook Online e pronto para receber POST!" });
    }

    try {
        const corpo = req.body;
        console.log("📦 PACOTE RECEBIDO:", JSON.stringify(corpo));

        // Tenta encontrar o TXID em vários lugares possíveis do pacote
        let txid = null;
        
        if (corpo.pix && corpo.pix[0] && corpo.pix[0].txid) {
            txid = corpo.pix[0].txid; // Formato Padrão Efí
        } else if (corpo.txid) {
            txid = corpo.txid; // Formato alternativo
        }

        if (!txid) {
            console.log("⚠️ Nenhum TXID encontrado no pacote.");
            return res.status(200).json({ msg: "Ignorado: Sem TXID" });
        }

        console.log(`🎯 TXID Identificado: ${txid}`);

        // ATUALIZAÇÃO NO BANCO (Força minúsculo 'pago')
        const { data, error } = await supabase
            .from('leads')
            .update({ status_pagamento: 'pago' }) 
            .eq('txid', txid)
            .select();

        if (error) {
            console.error("❌ Erro ao gravar no Supabase:", error);
            return res.status(500).json({ erro: error.message });
        }

        if (data.length === 0) {
            console.log("⚠️ O Banco recebeu, mas não achou esse TXID na tabela leads.");
        } else {
            console.log("✅ SUCESSO! Status atualizado para 'pago'.");
        }

        return res.status(200).json({ status: "Recebido" });

    } catch (err) {
        console.error("🔥 Erro Crítico:", err);
        return res.status(500).json({ erro: err.message });
    }
}
