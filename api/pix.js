import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- SUAS CHAVES ---
const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
const CHAVE_PIX_EFI = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; // <--- CONFIRA SE ISSO ESTÁ PREENCHIDO
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
        req.on('error', () => resolve(null));
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Só POST');

    try {
        // AGORA RECEBEMOS AS NOTAS TAMBÉM (qi, qe)
        const { email, valor, qi, qe } = req.body; 

        const token = await getEfiToken();
        if (!token) throw new Error("Falha na autenticação Efí");

        const dadosCob = {
            calendario: { expiracao: 3600 },
            devedor: { nome: "Cliente NeuroQuiz", cpf: "00000000000" }, 
            valor: { original: "1.00" },
            chave: CHAVE_PIX_EFI
        };
        
        const cobranca = await new Promise((resolve) => {
            const req = https.request({
                hostname: 'pix.api.efipay.com.br',
                path: '/v2/cob',
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                agent: httpsAgent
            }, (r) => {
                let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d)));
            });
            req.write(JSON.stringify(dadosCob));
            req.end();
        });

        const qrcode = await new Promise((resolve) => {
            https.get({
                hostname: 'pix.api.efipay.com.br',
                path: `/v2/loc/${cobranca.loc.id}/qrcode`,
                headers: { 'Authorization': `Bearer ${token}` },
                agent: httpsAgent
            }, (r) => {
                let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d)));
            });
        });

        // ATUALIZA TUDO DE UMA VEZ: PIX + NOTAS
        // Se a linha já existir (pelo email), ele atualiza.
        // Se não existir, o update não faria nada, mas como seu index cria no inicio, deve existir.
        const { error } = await supabase.from('leads')
            .update({ 
                txid: cobranca.txid, 
                pix_copia_cola: qrcode.qrcode,
                status_pagamento: 'aguardando',
                qi_score: qi, // <--- SALVANDO AQUI
                qe_score: qe  // <--- SALVANDO AQUI
            })
            .eq('email', email);

        if(error) console.error("Erro ao salvar no banco:", error);

        res.status(200).json({
            txid: cobranca.txid,
            copia_cola: qrcode.qrcode,
            qrcode_base64: qrcode.imagemQrcode || qrcode.imagem_base64,
            img: qrcode.imagemQrcode 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: error.message });
    }
}
