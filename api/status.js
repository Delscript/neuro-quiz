import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- PUXANDO AS CHAVES DO COFRE DA VERCEL ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;
// --------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configura o Agente HTTPS com o seu Certificado
const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

// 1. Função para pegar o Token da Efí
async function getEfiToken() {
    const credenciais = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'pix.api.efipay.com.br', // <--- ENDEREÇO NOVO (CORRIGIDO)
            path: '/oauth/token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credenciais}`,
                'Content-Type': 'application/json'
            },
            agent: httpsAgent
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if(json.access_token) resolve(json.access_token);
                    else reject("Efí não devolveu o Token. Verifique as chaves.");
                } catch (e) { reject(e); }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. Função para consultar o Status na Efí
async function checkEfiStatus(token, txid) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'pix.api.efipay.com.br', // <--- ENDEREÇO NOVO (CORRIGIDO)
            path: `/v2/pix/${txid}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            agent: httpsAgent
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.status); 
                } catch (e) { reject(e); }
            });
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

export default async function handler(req, res) {
    // Permissões de acesso (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { txid } = req.query;
    if (!txid) return res.status(400).json({ erro: 'TXID faltando' });

    try {
        // A. Verifica no Supabase
        const { data: lead } = await supabase
            .from('leads')
            .select('status_pagamento')
            .eq('txid', txid)
            .single();

        if (lead && lead.status_pagamento === 'pago') {
            return res.status(200).json({ status: 'pago' });
        }

        // B. Verifica na Efí (Tira-Teima com endereço novo)
        console.log(`Consultando Efí para TXID: ${txid}`);
        const token = await getEfiToken();
        const statusEfi = await checkEfiStatus(token, txid);

        if (statusEfi === 'CONCLUIDA') {
            await supabase.from('leads').update({ status_pagamento: 'pago' }).eq('txid', txid);
            return res.status(200).json({ status: 'pago' });
        }

        return res.status(200).json({ status: 'aguardando' });

    } catch (error) {
        console.error("Erro Status:", error);
        return res.status(500).json({ erro: error.message });
    }
}
