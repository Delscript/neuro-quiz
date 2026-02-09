const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // --- ☢️ SUAS CHAVES AQUI ☢️ ---
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    // ------------------------------------------

    // 1. Validação de Segurança (Verifica se você colocou as chaves)
    if (!sbUrl || sbUrl.includes("COLE_SUA")) {
        console.error("🚨 Chaves não configuradas no status.js");
        return res.status(500).json({ erro: 'Faltam chaves no servidor' });
    }

    const supabase = createClient(sbUrl, sbKey);
    const { txid } = req.query;

    if (!txid) {
        return res.status(400).json({ error: 'Faltou o txid' });
    }

    try {
        // 2. Busca no banco
        const { data, error } = await supabase
            .from('leads')
            .select('status_pagamento')
            .eq('txid', txid)
            .single();

        // 3. Se não achar ou der erro, assume pendente
        if (error || !data) {
            return res.status(200).json({ status: 'pendente' });
        }

        // 4. Devolve o status real
        return res.status(200).json({ status: data.status_pagamento });

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}; 
// 👆 ESSA CHAVE E PONTO E VÍRGULA AQUI EM CIMA SÃO O SEGREDO! NÃO APAGUE!
