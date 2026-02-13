const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- SUAS CHAVES REAIS ---
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    // -------------------------

    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido.' });
    }

    const supabase = createClient(sbUrl, sbKey);

    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    try {
        const body = req.body;
        
        // Dados do formulário
        const nome = body.nome || 'Sem Nome';
        const email = body.email || 'nao_informado';
        const whatsapp = body.whatsapp || body.telefone; 
        const qi = body.qi_score || 0;
        const qe = body.qe_score || 0;
        
        // --- A ÚNICA MUDANÇA É AQUI (Pegando a fase) ---
        const fase = body.fase_profissional || 'Não Informado'; 

        const valor = 1.00; 

        // 1. Autentica na Efí
        const token = await getToken(CREDENTIALS);

        // 2. Cria a Cobrança
        const cobranca = await createCharge(token, valor, CREDENTIALS);
        const txid = cobranca.txid;

        // 3. Salva no Supabase (Lógica Original + Coluna Nova)
        const { error: erroSupabase } = await supabase
            .from('leads')
            .insert({
                nome: nome,
                email: email,
                whatsapp: whatsapp,
                qi_score: qi,
                qe_score: qe,
                fase_profissional: fase, // <--- ADICIONADO AQUI
                txid: txid,
                pix_copia_cola: cobranca.pixCopiaECola,
                status: 'pendente', // Mantendo 'pendente' como no original
                created_at: new Date()
            });
        
        if (erroSupabase) console.error("Erro Supabase:", erroSupabase);

        // 4. Pega a Imagem do QR Code
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

        // 5. Retorna para o site (Mantendo compatibilidade total)
        return res.status(200).json({
            // Mando com os dois nomes para garantir que o index.html não quebre
            qr_code_base64: qr.imagemQrcode, // Nome novo
            qrcode_base64: qr.imagemQrcode,  // Nome antigo (backup)
            pix_copia_cola: cobranca.pixCopiaECola,
            txid: txid
        });

    } catch (error) {
        console.error("Erro:", error.message);
        return res.status(500).json({ erro: error.message });
    }
};

// --- FUNÇÕES AUXILIARES (ORIGINAIS INTACTAS) ---

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
                    else reject(new Error('Erro Auth Efí'));
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
                    else reject(new Error('Erro Cobrança Efí'));
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
