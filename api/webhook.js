import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  // Se não for POST, ignora
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  // PEÇA CHAVE: O Banco Efí manda um teste antes. 
  // Se não houver a palavra "pix" no que o banco enviou, 
  // nós apenas respondemos "Tô vivo" com código 200.
  if (!req.body || !req.body.pix) {
    return res.status(200).json({ status: "Webhook Ativo" });
  }

  try {
    const { pix } = req.body;

    for (const pagamento of pix) {
      const { txid } = pagamento;
      
      if (txid) {
        await supabase
          .from('leads')
          .update({ status_pagamento: 'pago' })
          .eq('txid', txid);
      }
    }

    return res.status(200).json({ recebido: true });
  } catch (error) {
    // Mesmo se der erro no banco, respondemos 200 para a Efí não desativar o webhook
    console.error("Erro interno:", error);
    return res.status(200).json({ erro: "Processado com ressalva" });
  }
}
