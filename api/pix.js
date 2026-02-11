const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
const CHAVE_PIX_EFI = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; 

import { createClient } from '@supabase/supabase-js';
import https from 'https';

// =====================================================
// ⚠️⚠️ PREENCHA AQUI COM SEUS DADOS REAIS ⚠️⚠️
// =====================================================

// 1. URL do Supabase (A mesma que você pôs no index.html)
const SUPABASE_URL = "https://oabcppkojfmmmqhevjpq.supabase.co"; 

// 2. Chave do Supabase (A mesma anon/public que você pôs no index.html)
const SUPABASE_KEY = "SUA_CHAVE_GIGANTE_AQUI";

// 3. Sua Chave Pix na Efí (CPF ou Aleatória)
const CHAVE_PIX_EFI = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw"; 

// =====================================================
// DADOS DA EFÍ (Esses continuam pegando do .env da Vercel)
// Se você não configurou isso na Vercel, o Pix não funciona.
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;
// =====================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

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
                try { resolve(JSON.parse(data).access_token); } catch { resolve(null); }
            });
        });
        req.on('error', (e) => { console.error("Erro Token:", e); resolve(null); });
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

export default async function handler(req, res) {
    // Permite que qualquer um chame (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const { email, valor, qi, qe } = req.body; 

        // 1. Pega Token da Efí
        const token = await getEfiToken();
        if (!token) throw new Error("Falha ao autenticar na Efí (Verifique Client ID/Secret)");

        // 2. Cria Cobrança
        const dadosCob = {
            calendario: { expiracao: 3600 },
            devedor: { nome: "Cliente NeuroQuiz", cpf: "00000000000" }, 
            valor: { original: "1.00" },
            chave: CHAVE_PIX_EFI
        };
        
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
            req.write(JSON.stringify(dadosCob));
            req.end();
        });

        if (!cobranca.txid) {
            console.error("Erro Efí Cobrança:", cobranca);
            throw new Error("Erro ao criar cobrança na Efí");
        }

        // 3. Gera QR Code
        const qrcode = await new Promise((resolve, reject) => {
            https.get({
                hostname: 'pix.api.efipay.com.br',
                path: `/v2/loc/${cobranca.loc.id}/qrcode`,
                headers: { 'Authorization': `Bearer ${token}` },
                agent: httpsAgent
            }, (r) => {
                let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d)));
            });
        });

        // 4. SALVA NO SUPABASE (Com as chaves hardcoded, não tem como errar)
        // Primeiro tenta atualizar se já existe (pelo email do quiz)
        let { data, error } = await supabase.from('leads')
            .update({ 
                txid: cobranca.txid, 
                pix_copia_cola: qrcode.qrcode,
                status_pagamento: 'aguardando',
                qi_score: qi || 0,
                qe_score: qe || 0
            })
            .eq('email', email)
            .select();

        // Se não atualizou nada (email não encontrado), insere novo
        if (!data || data.length === 0) {
            await supabase.from('leads').insert([{
                email: email,
                txid: cobranca.txid,
                pix_copia_cola: qrcode.qrcode,
                status_pagamento: 'aguardando',
                qi_score: qi || 0,
                qe_score: qe || 0
            }]);
        }

        res.status(200).json({
            txid: cobranca.txid,
            copia_cola: qrcode.qrcode,
            qrcode_base64: qrcode.imagemQrcode,
            img: qrcode.imagemQrcode 
        });

    } catch (error) {
        console.error("ERRO CRÍTICO API:", error);
        res.status(500).json({ erro: error.message });
    }
}
