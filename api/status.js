const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // --- ☢️ SUAS CHAVES REAIS AQUI ☢️ ---
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    // ------------------------------------

    // Configura o banco
    const supabase = createClient(sbUrl, sbKey);

    // Pega o TXID que o site mandou
    const { txid } = req.query;

    if (!txid) {
        return res.status(400).json({ erro: 'Faltou o txid' });
    }

    try {
        // Busca no banco o status desse Pix
        const { data, error } = await supabase
            .from('leads')
            .select('status_pagamento')
            .eq('txid', txid)
            .single();

        if (error) {
            // Se não achar, ainda está pendente ou não existe
            return res.status(200).json({ status: 'pendente' });
        }

        // Devolve o status real ('pago' ou 'pendente')
        return res.status(200).json({ status: data.status_pagamento });

    } catch (err) {
        return res.status(500).json({ erro: err.message });
    }
};
