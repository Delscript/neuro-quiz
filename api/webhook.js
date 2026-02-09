const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
  // Validação de segurança da Efí (Handshake)
  if (req.method === 'POST') {
    const { pix } = req.body;

    // Se for apenas o teste da Efí, responde 200 na hora
    if (!pix || pix.length === 0) {
      return res.status(200).json({ status: "ok" });
    }

    try {
      for (const pagamento of pix) {
        const { txid } = pagamento;
        
        // Atualiza no banco
        await supabase
          .from('leads')
          .update({ status_pagamento: 'pago' })
          .eq('txid', txid);
      }
      return res.status(200).json({ recebido: true });
    } catch (err) {
      console.error("Erro no processamento:", err);
      return res.status(500).json({ erro: err.message });
    }
  }

  return res.status(405).send('Método não permitido');
};
