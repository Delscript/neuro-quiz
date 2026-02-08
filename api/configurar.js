const https = require('https');

export default async function handler(req, res) {
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    const WEBHOOK_URL = `https://${req.headers.host}/api/webhook`;

    try {
        const chavePix = req.query.chave; 
        if(!chavePix) return res.status(400).json({ erro: "Faltou ?chave=SEU_PIX no final do link" });

        console.log(`Configurando Webhook para: ${chavePix}`);

        const token = await getToken(CREDENTIALS);
        const resultado = await configWebhook(token, chavePix, WEBHOOK_URL, CREDENTIALS);

        return res.status(200).json({ 
            mensagem: "Webhook Configurado com Sucesso! 🚀", 
            webhook_url: WEBHOOK_URL,
            detalhes: resultado 
        });

    } catch (error) {
        // Se der erro, mostra o detalhe para a gente corrigir
        return res.status(500).json({ 
            mensagem: "Erro ao configurar",
            erro_detalhado: error.message 
        });
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
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'Content-Type': 'application/json',
                'x-skip-mtls-checking': 'true' // <--- O SEGREDO ESTÁ AQUI (No cabeçalho)
            },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                // Se a API retornar erro, a gente rejeita a Promise para ver o erro na tela
                const json = JSON.parse(data);
                if (json.nome && json.nome.includes("erro")) reject(new Error(JSON.stringify(json)));
                else resolve(json);
            });
        });
        req.on('error', reject);
        
        // CORPO DO PEDIDO LIMPO (Só a URL, sem invenção de moda)
        req.write(JSON.stringify({ webhookUrl: urlWebhook }));
        req.end();
    });
}
