import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CHAVES DO COFRE ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuração do Agente HTTPS (Certificado)
const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

// 1. Pega Token Efí
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
                try { resolve(JSON.parse(data).access_token || null); } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. Busca Pagamento na Efí
async function verificarPagamentoSeguro(token, txid) {
    const fim = new Date().toISOString(); 
    const inicio = new Date(new Date().getTime() - (48 * 60 * 60 * 1000)).toISOString(); // 48h

    return new Promise((resolve) => {
        const options = {
            hostname: 'pix.api.efipay.com.br',
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
                    if (json.pix && json.pix.length > 0) resolve(true);
                    else resolve(false);
                } catch { resolve(false); }
            });
        });
        req.on('error', () => resolve(false));
        req.end();
    });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const { txid } = req.query;
    if (!txid) return res.status(400).json({ erro: 'TXID faltando' });

    try {
        // Busca no banco local INCLUINDO as notas (qi_score, qe_score)
        const { data: lead } = await supabase
            .from('leads')
            .select('status_pagamento, qi_score, qe_score') // <--- IMPORTANTE
            .eq('txid', txid)
            .single();

        // Se já estiver pago no nosso banco, retorna com as notas
        if (lead && lead.status_pagamento === 'pago') {
            return res.status(200).json({ 
                status: 'pago', 
                qi: lead.qi_score, 
                qe: lead.qe_score 
            });
        }

        // Se não, vai na Efí conferir
        const token = await getEfiToken();
        if (token) {
            const estaPago = await verificarPagamentoSeguro(token, txid);
            if (estaPago) {
                await supabase.from('leads').update({ status_pagamento: 'pago' }).eq('txid', txid);
                // Retorna atualizado
                return res.status(200).json({ 
                    status: 'pago',
                    qi: lead?.qi_score || 0,
                    qe: lead?.qe_score || 0
                });
            }
        }

        return res.status(200).json({ status: 'aguardando' });

    } catch (error) {
        return res.status(500).json({ erro: 'Erro interno' });
    }
                                  }
