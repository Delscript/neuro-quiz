import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CHAVES ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;
// --------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

// 1. Token
async function getEfiToken() {
    const credenciais = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    return new Promise((resolve, reject) => {
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
                try {
                    const json = JSON.parse(data);
                    if(json.access_token) resolve(json.access_token);
                    else resolve(null); // Retorna null se falhar auth
                } catch (e) { resolve(null); }
            });
        });
        req.on('error', e => resolve(null));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. Status com Detalhe
async function checkEfiStatus(token, txid) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'pix.api.efipay.com.br',
            path: `/v2/pix/${txid}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            agent: httpsAgent
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json); // Retorna o JSON completo do banco!
                } catch (e) { resolve({ erro: "Falha ao ler JSON do banco" }); }
            });
        });
        req.on('error', e => resolve({ erro: e.message }));
        req.end();
    });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const { txid } = req.query;

    if (!txid) return res.status(400).json({ erro: 'TXID faltando' });

    try {
        // 1. Pega Token
        const token = await getEfiToken();
        if (!token) {
            return res.status(200).json({ 
                status: 'erro_auth', 
                mensagem: 'Não consegui autenticar na Efí. Verifique Client_ID e Secret.' 
            });
        }

        // 2. Pergunta ao Banco
        const respostaBanco = await checkEfiStatus(token, txid);
        const statusReal = respostaBanco.status; // Pode ser ATIVA, CONCLUIDA, etc.

        // 3. Atualiza se for CONCLUIDA
        if (statusReal === 'CONCLUIDA') {
            await supabase.from('leads').update({ status_pagamento: 'pago' }).eq('txid', txid);
            return res.status(200).json({ status: 'pago', debug_banco: statusReal });
        }

        // 4. Se não for pago, MOSTRA O PORQUÊ (O Segredo!)
        return res.status(200).json({ 
            status: 'aguardando', 
            motivo_real: statusReal, 
            detalhe_banco: respostaBanco 
        });

    } catch (error) {
        return res.status(500).json({ erro: error.message });
    }
}
