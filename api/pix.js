const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- ☢️ ÁREA DO TESTE NUCLEAR ☢️ ---
    // Substitua ABAIXO pelas suas chaves REAIS do Supabase (mantenha as aspas!)
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    // ---------------------------------------------------------
1. Verificação de Segurança Básica
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido. Use POST.' });
    }

    // 2. Verifica se você colou as chaves mesmo
    if (!sbUrl || sbUrl.includes("COLE_SUA_URL")) {
        console.error("🚨 ERRO: Você esqueceu de colocar as chaves reais no código!");
        return res.status(500).json({ erro: 'Edite o api/pix.js e coloque as chaves do Supabase!' });
    }

    // 3. Conecta ao Banco
    const supabase = createClient(sbUrl, sbKey);

    // 4. Credenciais da Efí (Essas vêm da Vercel, não mexa)
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    try {
        // === CORREÇÃO AQUI: Agora estamos lendo TODOS os dados ===
        const { email, valor, nome, telefone, qi, qe } = req.body;
        
        if (!valor) throw new Error('O valor do Pix é obrigatório.');

        // A. Autentica na Efí
        const token = await getToken(CREDENTIALS);

        // B. Cria a Cobrança na Efí
        const cobranca = await createCharge(token, valor, CREDENTIALS);
        const txid = cobranca.txid;

        // C. Gera o desenho do QR Code (Puxamos pra cá para salvar o código no banco também)
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

       // D. SALVA NO SUPABASE (Modo Completo)
       // Aqui estava o erro: antes só salvava email e txid. Agora salva tudo.
        const { error: erroSupabase } = await supabase
            .from('leads')
            .insert([{
                nome: nome || 'Cliente Sem Nome', // Salva o Nome
                email: email || 'sem_email',
                whatsapp: telefone || null,       // Salva o Telefone na coluna whatsapp
                qi_score: qi || 0,                // Salva Nota QI
                qe_score: qe || 0,                // Salva Nota QE
                txid: txid,
                pix_copia_cola: qr.qrcode,        // Salva o código pix para segurança
                status_pagamento: 'aguardando',
                created_at: new Date()
            }]);
        
        if (erroSupabase) {
            console.error("Erro ao salvar no Supabase:", erroSupabase);
            // Não paramos o código, pois o Pix foi gerado com sucesso
        }

        // E. Devolve tudo para o site
        return res.status(200).json({
            img: qr.imagemQrcode,
            code: qr.qrcode, // 'copia e cola'
            copia_cola: qr.qrcode, // garantindo compatibilidade com o front
            txid: txid,
            qrcode_base64: qr.imagemQrcode // garantindo compatibilidade
        });

    } catch (error) {
        console.error("🔥 Erro Geral:", error.message);
        return res.status(500).json({ erro: error.message });
    }
};

// --- FUNÇÕES AUXILIARES (NÃO MEXI EM NADA AQUI) ---

function getAgent(creds) {
    let certLimpo = creds.cert_base64 || "";
    certLimpo = certLimpo.replace(/^data:.*;base64,/, "").replace(/\s/g, "");
    return new https.Agent({
        pfx: Buffer.from(certLimpo, 'base64'),
        passphrase: ''
    });
}

function getToken(creds) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
        const options = {
            hostname: creds.sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br',
            path: '/oauth/token',
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) resolve(json.access_token);
                    else reject(new Error('Erro Auth Efí: ' + JSON.stringify(json)));
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ grant_type: 'client_credentials' }));
        req.end();
    });
}

function createCharge(token, valor, creds) {
    return new Promise((resolve, reject) => {
        const dataCob = JSON.stringify({
            calendario: { expiracao: 3600 },
            valor: { original: valor.toFixed(2) },
            chave: "65e5f3c3-b7d1-4757-a955-d6fc20519dce", // SUA CHAVE ALEATÓRIA MANTIDA
            solicitacaoPagador: "Avaliacao Neuro-Cognitiva"
        });
        const options = {
            hostname: creds.sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br',
            path: '/v2/cob',
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.txid) resolve(json);
                    else reject(new Error('Erro Cobrança Efí: ' + JSON.stringify(json)));
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(dataCob);
        req.end();
    });
}

function getQRCode(token, locId, creds) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: creds.sandbox ? 'pix-h.api.efipay.com.br' : 'pix.api.efipay.com.br',
            path: `/v2/loc/${locId}/qrcode`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            agent: getAgent(creds)
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}
