const https = require('https');

export default async function handler(req, res) {
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    // Seu site na Vercel
    const WEBHOOK_URL = `https://${req.headers.host}/api/webhook`;

    try {
        const chavePix = req.query.chave; 
        if(!chavePix) return res.status(400).json({ erro: "Faltou ?chave=SEU_PIX no final do link" });

        console.log(`Configurando Webhook (Sem mTLS) para: ${chavePix}`);

        const token = await getToken(CREDENTIALS);
        const resultado = await configWebhook(token, chavePix, WEBHOOK_URL, CREDENTIALS);

        return res.status(200).json({ 
            mensagem: "Webhook Configurado com Sucesso! 🚀", 
            webhook_url: WEBHOOK_URL,
            detalhes: resultado 
        });

    } catch (error) {
        return res.status(500).json({ erro: error.message });
    }
}

// --- FUNÇÕES ---
function getAgent(creds) {
    let certLimpo = creds.cert_base64.replace(/^data:.*;base64,/, "").replace(/\s/g, "");
    return new https.Agent({ pfx: Buffer.from(certLimpo, 'base64'), passphrase: '' });
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
            res.on('end', () => resolve(JSON.parse(data).access_token));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

function configWebhook(token, chave, urlWebhook, creds) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: creds.sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br',
            path: `/v2/webhook/${chave}`,
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        
        // --- O SEGREDO ESTÁ AQUI EMBAIXO ---
        req.write(JSON.stringify({ 
            webhookUrl: urlWebhook,
            skipMtls: true  // <--- ISSO OBRIGA A EFÍ A ACEITAR A VERCEL
        }));
        // -----------------------------------
        
        req.end();
    });
}
