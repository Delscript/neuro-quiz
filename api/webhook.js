import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CONFIGURAÇÕES ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;

// ⚠️⚠️ COLOQUE SUA CHAVE PIX AQUI (CPF, EMAIL, ETC) ⚠️⚠️
const CHAVE_PIX = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; 

// Inicializa o Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configura o Agente HTTPS (Ignora erros de SSL para garantir conexão)
const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

// 1. Pega o Token do Banco (Efí)
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
        req.on('error', (e) => { console.error("Erro Token:", e); resolve(null); });
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. Cria a Cobrança Pix
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
        req.on('error', (e) => { console.error("Erro Cobrança:", e); resolve(null); });
        req.write(JSON.stringify(dados));
        req.end();
    });
}

// 3. Gera a Imagem do QR Code
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
    // Cabeçalhos para evitar bloqueio
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    try {
        const { nome, email, cpf, qi_score, qe_score } = req.body;

        // --- FORÇA CONVERSÃO PARA NÚMERO (EVITA NULL) ---
        const qiFinal = parseInt(qi_score) || 3; // Se der erro, salva 3
        const qeFinal = parseInt(qe_score) || 3; // Se der erro, salva 3

        console.log(`Recebido: Nome=${nome}, CPF=${cpf}, QI=${qiFinal}, QE=${qeFinal}`);

        // 1. Autenticação Bancária
        const token = await getEfiToken();
        if (!token) return res.status(500).json({ erro: 'Erro no Banco (Token)' });

        // 2. Criação do Pix
        const cobranca = await criarCobranca(token, cpf, nome);
        if (!cobranca || !cobranca.txid) return res.status(500).json({ erro: 'Erro ao criar Pix' });

        // 3. Imagem do QR Code
        const qrcode = await gerarQRCode(token, cobranca.loc.id);

        // 4. SALVA NO SUPABASE (A PARTE QUE ESTAVA FALHANDO)
        // Usamos 'await' aqui para garantir que salvou antes de responder
        const { data, error } = await supabase.from('leads').insert([
            {
                nome: nome,
                email: email,
                whatsapp: cpf, // Salvando CPF no campo whatsapp
                txid: cobranca.txid,
                pix_copia_cola: qrcode.qrcode,
                status_pagamento: 'aguardando',
                qi_score: qiFinal,
                qe_score: qeFinal
            }
        ]);

        if (error) {
            console.error("ERRO SUPABASE:", error); // Isso vai aparecer nos logs se falhar
        } else {
            console.log("Salvo no Supabase com sucesso!");
        }

        // Responde para o site
        return res.status(200).json({
            txid: cobranca.txid,
            copia_cola: qrcode.qrcode,
            qrcode_base64: qrcode.imagemQrcode
        });

    } catch (error) {
        console.error("Erro Geral:", error);
        return res.status(500).json({ erro: error.message });
    }
                }
