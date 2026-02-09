            
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
