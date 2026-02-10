import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CHAVES ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;
// --------------

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
            hostname: 'pix.api.efipay.com.br', // PRODUÇÃO
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
                    resolve(json.access_token);
                } catch (e) { resolve(null); }
            });
        });
        req.on('error', e => resolve(null));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. LISTAR OS PIX DE HOJE (O Grande Truque)
async function listarPixRecentes(token) {
    // Pega a data de hoje e ontem para garantir
    const hoje = new Date().toISOString(); 
    const ontem = new Date(new Date().getTime() - (24 * 60 * 60 * 1000)).toISOString();

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'pix.api.efipay.com.br',
            // Pede tudo de ontem pra hoje
            path: `/v2/pix?inicio=${ontem}&fim=${hoje}`,
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
                    resolve(json); 
                } catch (e) { resolve({ erro: "Erro JSON" }); }
            });
        });
        req.on('error', e => resolve({ erro: e.message }));
        req.end();
    });
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    
    try {
        const token = await getEfiToken();
        if (!token) return res.json({ erro: "Falha Auth" });

        // Aqui está a mágica: Traz a lista completa
        const listaPix = await listarPixRecentes(token);

        return res.status(200).json({ 
            mensagem: "LISTA DE PIX ENCONTRADOS NA CONTA",
            quantidade: listaPix.pix ? listaPix.pix.length : 0,
            lista: listaPix
        });

    } catch (error) {
        return res.status(500).json({ erro: error.message });
    }
}
