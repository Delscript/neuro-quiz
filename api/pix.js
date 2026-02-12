import { createClient } from '@supabase/supabase-js';
import https from 'https';

// =====================================================
// ⚠️ PREENCHA AQUI COM SUAS CHAVES REAIS ⚠️
// =====================================================
const SUPABASE_URL = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
const CHAVE_PIX_EFI = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; 
// =====================================================

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const { nome, email, telefone, qi, qe } = req.body;

        const token = await getEfiToken();
        if (!token) throw new Error("Erro de autenticação Efí");

        // CRIAÇÃO DO PIX (SEM SIMULAR CPF)
        const cobranca = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'pix.api.efipay.com.br',
                path: '/v2/cob',
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                agent: httpsAgent
            }, (r) => {
                let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d)));
            });
            req.on('error', (e) => reject(e));
            
            // Payload limpo: Só enviamos o devedor se tivermos dados, 
            // mas como você disse que funciona sem CPF, mandamos assim:
            const dadosPix = {
                calendario: { expiracao: 3600 },
                valor: { original: "1.00" },
                chave: CHAVE_PIX_EFI,
                // Tentamos enviar o nome para aparecer no comprovante
                devedor: { 
                    nome: nome 
                }
            };

            req.write(JSON.stringify(dadosPix));
            req.end();
        });

        if (!cobranca.txid) {
            // Se der erro porque a Efí exige CPF no 'devedor', o erro vai aparecer aqui
            console.error("Erro Efí:", cobranca);
            throw new Error("Erro na geração do Pix (Efí recusou os dados)");
        }

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

        // SALVA NO BANCO (NOME, EMAIL, TELEFONE, NOTAS)
        await supabase.from('leads').insert([{
            nome: nome,
            email: email,
            whatsapp: telefone, // Salva o telefone aqui
            txid: cobranca.txid,
            pix_copia_cola: qrcode.qrcode,
            status_pagamento: 'aguardando',
            qi_score: qi || 0,
            qe_score: qe || 0
        }]);

        res.status(200).json({
            txid: cobranca.txid,
            copia_cola: qrcode.qrcode,
            qrcode_base64: qrcode.imagemQrcode,
            img: qrcode.imagemQrcode
        });

    } catch (error) {
        console.error("Erro API:", error);
        res.status(500).json({ erro: error.message });
    }
}
