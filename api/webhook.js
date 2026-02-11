import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- PREENCHA ISSO AQUI PARA FUNCIONAR ---
const SUPABASE_URL = "https://oabcppkojfmmmqhevjpq.supabase.co"; // <--- COLE SUA URL AQUI
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw"; // <--- COLE SUA KEY AQUI
const CHAVE_PIX = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; // <--- COLE SUA CHAVE PIX AQUI
// -----------------------------------------

const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

async function getEfiToken() {
    const credenciais = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'pix.api.efipay.com.br',
            path: '/oauth/token',
            method: 'POST',
            headers: { 'Authorization': `Basic ${credenciais}`, 'Content-Type': 'application/json' },
            agent: httpsAgent
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data).access_token));
        });
        req.on('error', () => resolve(null));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { nome, email, cpf } = req.body;
        const token = await getEfiToken();

        // Cria Cobrança
        const cobranca = await new Promise((resolve) => {
            const req = https.request({
                hostname: 'pix.api.efipay.com.br',
                path: '/v2/cob',
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                agent: httpsAgent
            }, (res) => {
                let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
            });
            req.write(JSON.stringify({
                calendario: { expiracao: 3600 },
                devedor: { cpf: cpf, nome: nome },
                valor: { original: "1.00" },
                chave: CHAVE_PIX
            }));
            req.end();
        });

        // Pega QR Code
        const qrcode = await new Promise((resolve) => {
            https.get({
                hostname: 'pix.api.efipay.com.br',
                path: `/v2/loc/${cobranca.loc.id}/qrcode`,
                headers: { 'Authorization': `Bearer ${token}` },
                agent: httpsAgent
            }, (res) => {
                let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
            });
        });

        // Salva no Banco (Básico)
        await supabase.from('leads').insert([{
            nome: nome,
            email: email,
            whatsapp: cpf,
            txid: cobranca.txid,
            pix_copia_cola: qrcode.qrcode,
            status_pagamento: 'aguardando'
        }]);

        res.status(200).json({
            txid: cobranca.txid,
            copia_cola: qrcode.qrcode,
            qrcode_base64: qrcode.imagemQrcode
        });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
}
