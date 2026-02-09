import { createClient } from '@supabase/supabase-js';
import https from 'https';

export default async function handler(req, res) {
    // --- 1. CONFIGURAÇÃO DE SEGURANÇA (Dentro da função para garantir) ---
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64, 
        sandbox: false
    };

    // Validação Inicial
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        return res.status(500).json({ erro: 'Faltam chaves do Supabase na Vercel' });
    }

    // --- 2. CONEXÃO BLINDADA (Agora aqui dentro!) ---
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    try {
        const { email, valor } = req.body;
        if (!valor) throw new Error('Valor é obrigatório');

        // A. Autenticação na Efí
        const token = await getToken(CREDENTIALS);
        
        // B. Cria a Cobrança
        const cobranca = await createCharge(token, valor, CREDENTIALS);
        const txid = cobranca.txid;

        // C. SALVA NO SUPABASE (Agora vai funcionar!)
        const { error: erroSupabase } = await supabase
            .from('leads')
            .insert({
                email: email || 'anônimo', // Garante que não quebra se vier sem email
                txid: txid,               
                status_pagamento: 'pendente',
                created_at: new Date()
            });

        if (erroSupabase) {
            console.error("❌ Erro ao salvar no Supabase:", erroSupabase);
        } else {
            console.log("✅ Pagamento registrado no Supabase com TXID:", txid);
        }

        // D. Gera o Desenho do QR Code
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

        return res.status(200).json({
            img: qr.imagemQrcode,
            code: qr.qrcode,
            txid: txid 
        });

    } catch (error) {
        console.error("Erro Pix:", error.message);
        return res.status(500).json({ erro: error.message });
    }
}

// --- FUNÇÕES AUXILIARES (MANTIVE IGUAL) ---
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

function createCharge(token, valor, creds) {
    return new Promise((resolve, reject) => {
        const dataCob = JSON.stringify({
            calendario: { expiracao: 3600 },
            valor: { original: valor.toFixed(2) },
            chave: "65e5f3c3-b7d1-4757-a955-d6fc20519dce", 
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
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}
