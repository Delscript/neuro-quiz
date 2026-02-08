// Robô do Pix (Vercel Serverless Function) - Versão Blindada Anti-Wrong-Tag
const https = require('https');

export default async function handler(req, res) {
    // 1. Configuração (Pega das Variáveis da Vercel)
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64, 
        sandbox: false // Mude para true se estiver usando credenciais de Homologação
    };

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });

    try {
        console.log("Iniciando processamento...");

        const { email, valor } = req.body;
        if (!email || !valor) throw new Error('Email e valor são obrigatórios');

        // 2. Autenticação na Efí
        const token = await getToken(CREDENTIALS);
        console.log("Token obtido com sucesso.");
        
        // 3. Criação da Cobrança
        const cobranca = await createCharge(token, valor, email, CREDENTIALS);
        console.log("Cobrança criada. TXID:", cobranca.txid);

        // 4. Gera QR Code
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

        return res.status(200).json({
            img: qr.imagemQrcode,
            code: qr.qrcode,
            txid: cobranca.txid
        });

    } catch (error) {
        console.error("Erro Crítico no Backend:", error.message);
        // Retorna o erro exato para aparecer na tela do usuário
        return res.status(500).json({ erro: error.message });
    }
}

// --- MOTORES DO ROBÔ (COM LIMPEZA DE CERTIFICADO) ---

function getAgent(creds) {
    // PASSO MÁGICO: Limpa o certificado de qualquer sujeira (espaços, headers, newlines)
    let certLimpo = creds.cert_base64 || "";
    
    // Remove cabeçalhos comuns de conversores online (ex: "data:application/x-pkcs12;base64,")
    certLimpo = certLimpo.replace(/^data:.*;base64,/, "");
    // Remove espaços em branco e quebras de linha
    certLimpo = certLimpo.replace(/\s/g, "");

    if(certLimpo.length < 100) {
        throw new Error("O Certificado (EFI_CERT_BASE64) parece inválido ou curto demais.");
    }

    const certBuffer = Buffer.from(certLimpo, 'base64');

    return new https.Agent({
        pfx: certBuffer,
        passphrase: '' // Certificados Efí padrão não têm senha. Se o seu tiver, coloque aqui.
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
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) resolve(json.access_token);
                    else reject(new Error('Falha Auth Efí (Verifique Client_ID/Secret): ' + JSON.stringify(json)));
                } catch(e) { reject(e); }
            });
        });
        req.on('error', (e) => reject(new Error("Erro de Conexão Efí: " + e.message)));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

function createCharge(token, valor, email, creds) {
    return new Promise((resolve, reject) => {
        const dataCob = JSON.stringify({
            calendario: { expiracao: 3600 },
            devedor: { nome: "Cliente", cpf: "11122233344" }, // CPF genérico
            valor: { original: valor.toFixed(2) },
            chave: "SUA_CHAVE_PIX_AQUI", // Opcional
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
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.txid) resolve(json);
                    else reject(new Error('Erro ao criar cobrança: ' + JSON.stringify(json)));
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
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}
