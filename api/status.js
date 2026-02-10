import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CHAVES DO COFRE ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;
// -----------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

// 1. Pega Token
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
                    else resolve(null);
                } catch (e) { resolve(null); }
            });
        });
        req.on('error', e => resolve(null));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. Busca na Lista de Recebidos (O MÉTODO QUE FUNCIONOU!)
async function buscarPixNaLista(token, txid) {
    // Procura nos últimos 4 dias para garantir
    const fim = new Date().toISOString(); 
    const inicio = new Date(new Date().getTime() - (4 * 24 * 60 * 60 * 1000)).toISOString();

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'pix.api.efipay.com.br',
            // Filtra direto pelo TXID na lista de recebidos
            path: `/v2/pix?inicio=${inicio}&fim=${fim}&txid=${txid}`,
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
                    // Se tiver algum item na lista "pix", é porque PAGOU!
                    if (json.pix && json.pix.length > 0) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch (e) { resolve(false); }
            });
        });
        req.on('error', e => resolve(false));
        req.end();
    });
}

export default async function handler(req, res) {
    // Mata o Cache para sempre consultar o real
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const { txid } = req.query;
    if (!txid) return res.status(400).json({ erro: 'TXID faltando' });

    try {
        // A. Verifica Banco de Dados (Supabase)
        const { data: lead } = await supabase
            .from('leads').select('status_pagamento').eq('txid', txid).single();

        if (lead && lead.status_pagamento === 'pago') {
            return res.status(200).json({ status: 'pago' });
        }

        // B. Verifica na Efí (Usando o método de Lista)
        const token = await getEfiToken();
        if (token) {
            const pagou = await buscarPixNaLista(token, txid);
            
            if (pagou) {
                // SUCESSO! Atualiza o banco e libera
                await supabase.from('leads').update({ status_pagamento: 'pago' }).eq('txid', txid);
                return res.status(200).json({ status: 'pago' });
            }
        }

        return res.status(200).json({ status: 'aguardando' });

    } catch (error) {
        return res.status(500).json({ erro: error.message });
    }
                        }
