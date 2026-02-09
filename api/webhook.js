// --- MODO CLÁSSICO (BLINDADO) ---
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
    // 1. CONFIGURAÇÃO (Preencha suas chaves AQUI DENTRO das aspas)
   const SUPABASE_URL = 'https://oabcppkojfmmmqhevjpq.supabase.co'; // <--- COLE A URL DO SUPABASE DENTRO DAS ASPAS
   const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw'; // <--- COLE A CHAVE DO SUPABASE DENTRO DAS ASPAS
    // -----------------------------------------------------------

    // 2. SEGURANÇA BÁSICA
    if (req.method === 'GET') return res.status(200).send('Webhook Online! Use POST para enviar dados.');

    try {
        console.log("⚡ Webhook acionado!");

        // 3. CONECTAR AO BANCO
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            console.error("❌ ERRO: Chaves do Supabase não preenchidas no código!");
            return res.status(500).json({ erro: "Configuração incompleta no servidor" });
        }
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        // 4. LER DADOS DO PIX (O Banco Efí manda uma lista de pix)
        const { pix } = req.body;
        
        // Se não tiver pix, avisa que recebeu mas não faz nada
        if (!pix) {
            console.log("📭 Recebido, mas sem dados de Pix (Teste do banco?)");
            return res.status(200).json({ ok: true });
        }

        console.log("💰 Dados recebidos:", JSON.stringify(pix));

        // 5. PROCESSAR CADA PAGAMENTO
        for (const pagamento of pix) {
            const txid = pagamento.txid; // O código de rastreio
            
            if (txid) {
                console.log(`🔎 Procurando TXID: ${txid}`);

                // Atualiza o status para 'pago' onde o txid for igual
                const { data, error } = await supabase
                    .from('leads')
                    .update({ status_pagamento: 'pago' })
                    .eq('txid', txid)
                    .select();

                if (error) {
                    console.error("❌ Erro ao salvar no Supabase:", error);
                } else {
                    console.log("✅ SUCESSO! Pagamento confirmado para:", data);
                }
            }
        }

        // 6. RESPOSTA FINAL (Sempre responder 200 pro Banco Efí não ficar bravo)
        return res.status(200).json({ status: 'Recebido e Processado' });

    } catch (error) {
        console.error("💥 Erro Geral:", error);
        return res.status(500).json({ erro: error.message });
    }
}
