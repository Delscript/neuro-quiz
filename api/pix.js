const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- SUAS CHAVES REAIS (Já configuradas) ---
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    const CHAVE_PIX = "65e5f3c3-b7d1-4757-a955-d6fc20519dce"; // Sua Chave Pix
    // ---------------------------------------------------------

    // 1. Verificação Básica
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido. Use POST.' });
    }

    // 2. Conecta ao Banco
    const supabase = createClient(sbUrl, sbKey);

    // 3. Credenciais da Efí (Vêm das Variáveis de Ambiente da Vercel)
    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false // Mude para true se for teste, false para produção
    };

    try {
        // === RECEBENDO DADOS DO NOVO INDEX.HTML ===
        // Ajustei os nomes para baterem com o que o seu site envia
        const { nome, whatsapp, qi_score, qe_score, fase_profissional } = req.body;
        
        const valor = 1.00; // Valor fixo do Pix

        // A. Autentica na Efí
        const token = await getToken(CREDENTIALS);

        // B. Cria a Cobrança na Efí
        const cobranca = await createCharge(token, valor, CHAVE_PIX, CREDENTIALS);
        
        // Verifica se a cobrança retornou o que precisamos
        if (!cobranca.txid || !cobranca.loc || !cobranca.pixCopiaECola) {
             throw new Error("A Efí não retornou o Pix Copia e Cola. Verifique suas credenciais.");
        }

        const txid = cobranca.txid;
        const pixCopiaCola = cobranca.pixCopiaECola;

       // C. SALVA NO SUPABASE (AGORA COM FASE PROFISSIONAL)
        const { error: erroSupabase } = await supabase
            .from('leads')
            .insert({
                nome: nome || 'Sem Nome',
                whatsapp: whatsapp || null,
                qi_score: qi_score || 0,
                qe_score: qe_score || 0,
                fase_profissional: fase_profissional || 'Não Informado', // <--- AQUI ESTÁ A NOVIDADE
                txid: txid,
                pix_copia_cola: pixCopiaCola,
                status: 'pendente',
                created_at: new Date()
            });
        
        if (erroSupabase) {
            console.error("Erro Supabase:", erroSupabase);
            // Não paramos o processo aqui, senão o cliente não paga
        }

        // D. Gera o desenho do QR Code (Imagem)
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

        // E. Devolve tudo para o site
        return res.status(200).json({
            qr_code_base64: qr.imagemQrcode, // Imagem
            pix_copia_cola: pixCopiaCola,    // Código de texto
            txid: txid
        });

    } catch (error) {
        console.error("🔥 Erro Geral:", error.message);
        return res.status(500).json({ erro: error.message });
    }
};

// --- FUNÇÕES AUXILIARES DA EFÍ (NÃO MEXA) ---

function getAgent(creds) {
    let certLimpo = creds.cert_base64 || "";
    // Remove cabeçalhos se houver, deixa só o base64 puro
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

function createCharge(token, valor, chavePix, creds) {
    return new Promise((resolve, reject) => {
        const dataCob = JSON.stringify({
            calendario: { expiracao: 3600 },
            valor: { original: valor.toFixed(2) },
            chave: chavePix,
            solicitacaoPagador: "NeuroQuiz Oficial"
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
