import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CONFIGURAÇÕES ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;

// ⚠️ COLOQUE SUA CHAVE PIX AQUI DENTRO DAS ASPAS (Ex: "12345678900" ou "email@teste.com")
const CHAVE_PIX = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; 

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
        const options = {
            hostname: 'pix.api.efipay.com.br',
            path: '/oauth/token',
            method: 'POST',
            headers: { 'Authorization': `Basic ${credenciais}`, 'Content-Type': 'application/json' },
            agent: httpsAgent
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data).access_token); } catch { resolve(null); }
            });
        });
        req.on('error', (e) => { console.error("Erro Auth:", e); resolve(null); });
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

async function criarCobranca(token, cpf, nome) {
    return new Promise((resolve) => {
        const dados = {
            calendario: { expiracao: 3600 },
            devedor: { cpf: cpf, nome: nome },
            valor: { original: "1.00" },
            chave: CHAVE_PIX
        };
        
        const options = {
            hostname: 'pix.api.efipay.com.br',
            path: '/v2/cob',
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            agent: httpsAgent
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        });
        req.on('error', (e) => { console.error("Erro Cob:", e); resolve(null); });
        req.write(JSON.stringify(dados));
        req.end();
    });
}

async function gerarQRCode(token, locId) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'pix.api.efipay.com.br',
            path: `/v2/loc/${locId}/qrcode`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            agent: httpsAgent
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

export default async function handler(req, res) {
    // Permite CORS para evitar bloqueios
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const { nome, email, cpf, qi_score, qe_score } = req.body;

        if (!CHAVE_PIX || CHAVE_PIX === "SUA_CHAVE_PIX_AQUI") {
            return res.status(500).json({ erro: 'Chave Pix não configurada no código.' });
        }

        // 1. Autenticação
        const token = await getEfiToken();
        if (!token) return res.status(500).json({ erro: 'Falha ao conectar no Banco (Token).' });

        // 2. Cobrança
        const cobranca = await criarCobranca(token, cpf, nome);
        if (!cobranca || !cobranca.txid) {
            console.error("Erro Efí:", cobranca); // Mostra o erro real no log
            return res.status(500).json({ erro: 'Erro ao criar cobrança.', detalhe: cobranca });
        }

        // 3. QR Code
        const qrcode = await gerarQRCode(token, cobranca.loc.id);

        // 4. Salva no Supabase (Agora com as Notas!)
        // O insert não usa 'await' bloqueante para garantir que o Pix apareça logo
        supabase.from('leads').insert([
            {
                nome: nome,
                email: email,
                whatsapp: cpf,
                txid: cobranca.txid,
                pix_copia_cola: qrcode.qrcode,
                status_pagamento: 'aguardando',
                qi_score: qi_score || 0,
                qe_score: qe_score || 0
            }
        ]).then(({ error }) => {
            if (error) console.error("Erro ao salvar no banco (mas Pix foi gerado):", error);
        });

        return res.status(200).json({
            txid: cobranca.txid,
            copia_cola: qrcode.qrcode,
            qrcode_base64: qrcode.imagemQrcode
        });

    } catch (error) {
        console.error("Erro Crítico:", error);
        return res.status(500).json({ erro: error.message });
    }
}
