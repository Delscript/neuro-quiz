const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // 1. Validação de Método (Só aceita POST)
  if (req.method !== 'POST') {
    return res.status(405).send('Método não permitido');
  }

  // 2. O PORTEIRO (Aqui estava faltando!) 🛑
  // Se o banco mandar um teste vazio (sem pix), a gente responde OK e encerra.
  const { pix } = req.body;

  if (!pix || pix.length === 0) {
    console.log("👋 Handshake (Teste) recebido com sucesso!");
    return res.status(200).send({ status: "OK", mensagem: "Webhook Ativo" });
  }

  // 3. Processamento Real (Só acontece se tiver Pix de verdade)
  try {
    console.log("💰 Recebendo Pix:", JSON.stringify(pix));

    // Varre todos os pagamentos recebidos (pode vir mais de um)
    for (const pagamento of pix) {
      const txid = pagamento.txid; // O código do QR Code
      
      if (txid) {
        // Atualiza o Status no Banco de Dados
        const { data, error } = await supabase
          .from('leads')
          .update({ status_pagamento: 'pago' })
          .eq('txid', txid); // Procura pelo txid exato

        if (error) {
            console.error('❌ Erro ao salvar no Supabase:', error);
        } else {
            console.log(`✅ Pagamento confirmado para TXID: ${txid}`);
        }
      }
    }

    // 4. Responde para o Banco que deu tudo certo
    return res.status(200).send({ status: "Recebido" });

  } catch (erro) {
    console.error("🔥 Erro Crítico:", erro);
    return res.status(500).send({ erro: "Erro interno" });
  }
}
