import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CHAVES BLINDADAS (Vercel) ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;
// ---------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

// 1. Pega Token (Silencioso)
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
                try {
                    const json = JSON.parse(data);
                    resolve(json.access_token || null);
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. Busca na Lista (Filtro de Segurança)
async function verificarPagamentoSeguro(token, txid) {
    // Busca apenas nos últimos 2 dias para ser rápido
    const fim = new Date().toISOString(); 
    const inicio = new Date(new Date().getTime() - (48 * 60 * 60 * 1000)).toISOString();

    return new Promise((resolve) => {
        const options = {
            hostname: 'pix.api.efipay.com.br',
            // O segredo: txid=${txid} já filtra direto no banco
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
                    // Se a lista "pix" tiver algo, é porque PAGOU.
                    // Retornamos APENAS true ou false. Nada de dados.
                    if (json.pix && json.pix.length > 0) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch { resolve(false); }
            });
        });
        req.on('error', () => resolve(false));
        req.end();
    });
}

export default async function handler(req, res) {
    // Cabeçalhos de Segurança (Não Cachear)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const { txid } = req.query;
    if (!txid) return res.status(400).json({ erro: 'Dados inválidos' });

    try {
        // A. Verifica Banco de Dados Local (Mais Rápido)
        const { data: lead } = await supabase
            .from('leads').select('status_pagamento').eq('txid', txid).single();

        if (lead && lead.status_pagamento === 'pago') {
            return res.status(200).json({ status: 'pago' });
        }

        // B. Verifica no Banco Efí (Blindado)
        const token = await getEfiToken();
        if (token) {
            const estaPago = await verificarPagamentoSeguro(token, txid);
            
            if (estaPago) {
                // Atualiza o banco e libera
                await supabase.from('leads').update({ status_pagamento: 'pago' }).eq('txid', txid);
                return res.status(200).json({ status: 'pago' });
            }
        }

        // Se não achou, responde apenas "aguardando" (Sem detalhes de erro)
        return res.status(200).json({ status: 'aguardando' });

    } catch (error) {
        // Log interno na Vercel (só você vê), usuário vê mensagem genérica
        console.error("Erro interno:", error);
        return res.status(500).json({ erro: 'Erro interno no servidor' });
    }
}
