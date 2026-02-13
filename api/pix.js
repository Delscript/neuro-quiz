const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- SUAS CHAVES REAIS ---
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    // -------------------------

    // 1. Verificação de Segurança
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido. Use POST.' });
    }

    if (!sbUrl || sbUrl.includes("COLE_SUA_URL")) {
        return res.status(500).json({ erro: 'Configure as chaves do Supabase no api/pix.js!' });
    }

    // 2. Conecta ao Banco
    const supabase = createClient(sbUrl, sbKey);

    // 3. Credenciais da Efí
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    try {
        // === RECEBENDO DADOS ===
        const body = req.body;
        
        const zap = body.whatsapp || body.telefone; 
        const qi = body.qi_score || body.qi;
        const qe = body.qe_score || body.qe;
        const fase = body.fase_profissional || 'Não Informado';

        const valor = 1.00; 

        // A. Autentica na Efí
        const token = await getToken(CREDENTIALS);

        // B. Cria a Cobrança
        const cobranca = await createCharge(token, valor, CREDENTIALS);
        const txid = cobranca.txid;

       // C. SALVA NO SUPABASE
        const { error: erroSupabase } = await supabase
            .from('leads')
            .insert({
                nome: body.nome || 'Sem Nome',
                whatsapp: zap || null,
                email: body.email || 'usuario_anonimo',
                qi_score: qi || 0,
                qe_score: qe || 0,
                fase_profissional: fase,
                txid: txid,
                pix_copia_cola: cobranca.pixCopiaECola,
                status: 'pendente',
                created_at: new Date()
            });
        
        if (erroSupabase) console.error("Erro Supabase:", erroSupabase);

        // D. Gera QR Code
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

        // E. RETORNO (CORRIGIDO AQUI)
        return res.status(200).json({
            // Agora o nome bate com o index.html (qr_code_base64)
            qr_code_base64: qr.imagemQrcode, 
            pix_copia_cola: cobranca.pixCopiaECola,
            txid: txid
        });

    } catch (error) {
        console.error("🔥 Erro Geral:", error.message);
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
