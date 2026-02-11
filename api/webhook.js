import { createClient } from '@supabase/supabase-js';
import https from 'https';

// --- CHAVES E CONFIGURAÇÕES ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CLIENT_ID = process.env.EFI_CLIENT_ID;
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET;
const CERTIFICADO_BASE64 = process.env.EFI_CERT_BASE64;
const CHAVE_PIX = process.env.CHAVE_PIX_EFI; // A chave Pix cadastrada na Efí

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuração do Certificado SSL
const agentOptions = { rejectUnauthorized: false };
if (CERTIFICADO_BASE64) {
    agentOptions.pfx = Buffer.from(CERTIFICADO_BASE64, 'base64');
    agentOptions.passphrase = ""; 
}
const httpsAgent = new https.Agent(agentOptions);

// 1. Função para pegar Token da Efí
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
        req.on('error', (e) => { console.error(e); resolve(null); });
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

// 2. Função para Criar Cobrança Imediata
async function criarCobranca(token, cpf, nome) {
    return new Promise((resolve, reject) => {
        const dados = {
            calendario: { expiracao: 3600 },
            devedor: { cpf: cpf, nome: nome },
            valor: { original: "1.00" }, // VALOR FIXO R$ 1,00
            chave: CHAVE_PIX // Sua chave Pix
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
        req.on('error', (e) => { console.error(e); resolve(null); });
        req.write(JSON.stringify(dados));
        req.end();
    });
}

// 3. Função para Gerar QR Code
async function gerarQRCode(token, locId) {
    return new Promise((resolve, reject) => {
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
    if (req.method !== 'POST') return res.status(405).send('Método não permitido');

    try {
        // Recebe os dados do index.html (INCLUINDO AS NOTAS)
        const { nome, email, cpf, qi_score, qe_score } = req.body;

        // Validação básica
        if (!cpf || !nome) return res.status(400).json({ erro: 'Dados incompletos' });

        // A. Autentica na Efí
        const token = await getEfiToken();
        if (!token) return res.status(500).json({ erro: 'Falha na autenticação bancária' });

        // B. Cria a Cobrança
        const cobranca = await criarCobranca(token, cpf, nome);
        if (!cobranca || !cobranca.txid) return res.status(500).json({ erro: 'Falha ao criar cobrança Pix', detalhe: cobranca });

        // C. Gera o QR Code
        const qrcode = await gerarQRCode(token, cobranca.loc.id);
        
        // D. SALVA NO SUPABASE (AGORA COM AS NOTAS!)
        const { error } = await supabase.from('leads').insert([
            {
                nome: nome,
                email: email,
                whatsapp: cpf, // Usando CPF como ID/Whats provisório se quiser
                txid: cobranca.txid,
                pix_copia_cola: qrcode.qrcode,
                status_pagamento: 'aguardando',
                qi_score: qi_score || 0, // Salva a nota QI
                qe_score: qe_score || 0  // Salva a nota QE
            }
        ]);

        if (error) {
            console.error("Erro Supabase:", error);
            // Mesmo se der erro no banco, retornamos o Pix para não perder a venda
        }

        // Retorna para o front-end
        return res.status(200).json({
            txid: cobranca.txid,
            copia_cola: qrcode.qrcode,
            qrcode_base64: qrcode.imagemQrcode
        });

    } catch (error) {
        console.error("Erro Geral:", error);
        return res.status(500).json({ erro: 'Erro interno no servidor' });
    }
                                  }
