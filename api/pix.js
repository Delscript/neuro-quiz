const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- SUAS CHAVES DO SUPABASE ---
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    
    // --- SUA CHAVE PIX (Do Banco Efí) ---
    const CHAVE_PIX = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; 
    // ------------------------------------

    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido.' });
    }

    // Conexão Supabase
    const supabase = createClient(sbUrl, sbKey);

    // Credenciais Efí (Vindas da Vercel)
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    try {
        const body = req.body;
        
        // Dados recebidos do Front
        const nome = body.nome || 'Sem Nome';
        const email = body.email || 'nao_informado';
        const zap = body.whatsapp || body.telefone; 
        const qi = body.qi_score || 0;
        const qe = body.qe_score || 0;
        const fase = body.fase_profissional || 'Não Informado';

        const valor = 1.00; 

        // 1. Autentica na Efí
        const token = await getToken(CREDENTIALS);

        // 2. Cria a Cobrança (TxID)
        const cobranca = await createCharge(token, valor, CHAVE_PIX, CREDENTIALS);
        
        // Verifica se a cobrança foi criada mesmo
        if (!cobranca.txid || !cobranca.loc || !cobranca.loc.id) {
            throw new Error('Falha ao criar cobrança na Efí. Resposta incompleta.');
        }

        const txid = cobranca.txid;
        const locId = cobranca.loc.id;

        // 3. Busca a Imagem do QR Code
        const qr = await getQRCode(token, locId, CREDENTIALS);

        // --- AQUI ESTAVA O ERRO ANTES ---
        // Verifica se a imagem realmente veio
        if (!qr.imagemQrcode) {
            console.error("Erro Efí QR Code:", JSON.stringify(qr)); // Loga o erro real no console da Vercel
            throw new Error('A Efí gerou o Pix, mas falhou ao entregar a imagem do QR Code.');
        }

        // 4. Salva no Supabase
        const { error: erroSupabase } = await supabase
            .from('leads')
            .insert({
                nome: nome,
                email: email, // Salvando e-mail
                whatsapp: zap,
                qi_score: qi,
                qe_score: qe,
                fase_profissional: fase, // Salvando fase
                txid: txid,
                pix_copia_cola: cobranca.pixCopiaECola,
                status: 'pendente',
                created_at: new Date()
            });
        
        if (erroSupabase) console.error("Erro Supabase:", erroSupabase);

        // 5. Responde para o site (Com os nomes exatos que o index.html espera)
        return res.status(200).json({
            qr_code_base64: qr.imagemQrcode, 
            pix_copia_cola: cobranca.pixCopiaECola,
            txid: txid
        });

    } catch (error) {
        console.error("🔥 Erro Crítico:", error.message);
        // Retorna erro 500 para o site mostrar o alerta, em vez de tentar carregar imagem quebrada
        return res.status(500).json({ erro: error.message });
    }
};

// --- FUNÇÕES AUXILIARES ---

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
                    else reject(new Error('Erro Auth: ' + JSON.stringify(json)));
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

function createCharge(token, valor, chavePix, creds) {
    return new Promise((resolve, reject) => {
        const dataCob = JSON.stringify({
            calendario: { expiracao: 3600 },
            valor: { original: valor.toFixed(2) },
            chave: chavePix,
            solicitacaoPagador: "NeuroQuiz Oficial"
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
                    // Se tiver txid, deu certo
                    if (json.txid) resolve(json);
                    else reject(new Error('Erro Cobrança: ' + JSON.stringify(json)));
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
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json); // Retorna o JSON (seja sucesso ou erro)
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}
