const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- 1. SEGURANÇA: Só aceita POST ---
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido. Use POST.' });
    }

    // --- 2. VERIFICAÇÃO DE CHAVES (Diagnóstico) ---
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_KEY;

    if (!sbUrl || !sbKey) {
        console.error("🚨 ERRO GRAVE: Chaves do Supabase não encontradas!");
        return res.status(500).json({ 
            erro: 'Configuração do Servidor Incompleta',
            detalhe: 'As variáveis SUPABASE_URL ou SUPABASE_KEY não foram carregadas.' 
        });
    }

    // --- 3. CONEXÃO (Agora segura) ---
    const supabase = createClient(sbUrl, sbKey);

    // --- 4. CREDENCIAIS EFÍ ---
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    try {
        const { email, valor } = req.body;
        
        if (!valor) throw new Error('O valor do Pix é obrigatório.');

        // A. Autentica na Efí
        const token = await getToken(CREDENTIALS);

        // B. Cria a Cobrança
        const cobranca = await createCharge(token, valor, CREDENTIALS);
        const txid = cobranca.txid;

        // C. SALVA NO SUPABASE (O Pulo do Gato 🐈)
        // Usamos 'upsert' para garantir que salva mesmo se já existir
        const { error: erroSupabase } = await supabase
            .from('leads')
            .upsert({
                email: email || 'usuario_anonimo',
                txid: txid,
                status_pagamento: 'pendente',
                created_at: new Date()
            }, { onConflict: 'txid' });

        if (erroSupabase) {
            console.error("❌ Falha ao salvar no banco:", erroSupabase.message);
            // Não travamos o Pix, mas avisamos no log
        } else {
            console.log("✅ Pix gerado e salvo no banco! TXID:", txid);
        }

        // D. Gera a Imagem do QR Code
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

        // E. Devolve para o site
        return res.status(200).json({
            img: qr.imagemQrcode,
            code: qr.qrcode,
            txid: txid
        });

    } catch (error) {
        console.error("🔥 Erro no processo:", error.message);
        return res.status(500).json({ erro: error.message });
    }
};

// --- FUNÇÕES AUXILIARES DA EFÍ (MANTIDAS IGUAIS) ---
function getAgent(creds) {
    let certLimpo = creds.cert_base64 || "";
    certLimpo = certLimpo.replace(/^data:.*;base64,/, "").replace(/\s/g, "");
    return new https.Agent({
        pfx: Buffer.from(certLimpo, 'base64'),
        passphrase: ''
    });
}

function getToken(creds) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
        const options = {
            hostname: creds.sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br',
            path: '/oauth/token',
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) resolve(json.access_token);
                    else reject(new Error('Erro Auth Efí: ' + JSON.stringify(json)));
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

function createCharge(token, valor, creds) {
    return new Promise((resolve, reject) => {
        const dataCob = JSON.stringify({
            calendario: { expiracao: 3600 },
            valor: { original: valor.toFixed(2) },
            chave: "65e5f3c3-b7d1-4757-a955-d6fc20519dce", // SUA CHAVE
            solicitacaoPagador: "Avaliacao Neuro-Cognitiva"
        });
        const options = {
            hostname: creds.sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br',
            path: '/v2/cob',
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.txid) resolve(json);
                    else reject(new Error('Erro Cobrança Efí: ' + JSON.stringify(json)));
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(dataCob);
        req.end();
    });
}

function getQRCode(token, locId, creds) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: creds.sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br',
            path: `/v2/loc/${locId}/qrcode`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}
