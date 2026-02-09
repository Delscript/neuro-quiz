const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
  // 1. Responde rápido ao Banco Efí para o Webhook ser aceito
  if (req.method === 'POST') {
    const { pix } = req.body;

    // Handshake: Se não tem dados de pix, é apenas o teste da Efí
    if (!pix || pix.length === 0) {
      console.log("Teste de conexão recebido");
      return res.status(200).json({ status: "OK" });
    }

    // 2. Processa o pagamento real
    try {
      for (const pagamento of pix) {
        const txid = pagamento.txid;
        
        await supabase
          .from('leads')
          .update({ status_pagamento: 'pago' })
          .eq('txid', txid);
          
        console.log(`Sucesso para o TXID: ${txid}`);
      }
      return res.status(200).json({ status: "Processado" });
    } catch (err) {
      console.error("Erro no processamento:", err);
      return res.status(200).json({ status: "Erro capturado mas 200 enviado" });
    }
  }

  return res.status(405).send('Método não permitido');
};
