const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- SUAS CHAVES ---
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";
    // ------------------

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });

    const supabase = createClient(sbUrl, sbKey);

    const CREDENTIALS = {
        client_id: process.env.EFI_CLIENT_ID,
        client_secret: process.env.EFI_CLIENT_SECRET,
        cert_base64: process.env.EFI_CERT_BASE64,
        sandbox: false
    };

    try {
        const body = req.body;
        
        // 1. Gera Pix
        const token = await getToken(CREDENTIALS);
        const cobranca = await createCharge(token, 1.00, CREDENTIALS);
        const qr = await getQRCode(token, cobranca.loc.id, CREDENTIALS);

        // 2. Salva no Supabase (Capturando TUDO que o index novo manda)
        const { error } = await supabase
            .from('leads')
            .insert({
                nome: body.nome || 'Sem Nome',
                email: body.email || 'sem_email',
                whatsapp: body.whatsapp || null,
                qi_score: body.qi_score || 0,
                qe_score: body.qe_score || 0,
                fase_profissional: body.fase_profissional || 'Não Informado',
                txid: cobranca.txid,
                pix_copia_cola: cobranca.pixCopiaECola,
                status: 'pendente'
            });

        if (error) console.error("Erro Supabase:", error);

        // 3. Retorna
        return res.status(200).json({
            qr_code_base64: qr.imagemQrcode,
            pix_copia_cola: cobranca.pixCopiaECola,
            txid: cobranca.txid
        });

    } catch (e) {
        return res.status(500).json({ erro: e.message });
    }
};

// --- FUNÇÕES EFÍ ---
function getAgent(c){let s=c.cert_base64.replace(/^data:.*;base64,/,"").replace(/\s/g,"");return new https.Agent({pfx:Buffer.from(s,'base64'),passphrase:''})}
function getToken(c){return new Promise((r,j)=>{const o={hostname:c.sandbox?'pix-h.api.efipay.com.br':'pix.api.efipay.com.br',path:'/oauth/token',method:'POST',headers:{'Authorization':`Basic ${Buffer.from(c.client_id+':'+c.client_secret).toString('base64')}`,'Content-Type':'application/json'},agent:getAgent(c)};const q=https.request(o,res=>{let d='';res.on('data',k=>d+=k);res.on('end',()=>r(JSON.parse(d).access_token))});q.on('error',j);q.write(JSON.stringify({grant_type:'client_credentials'}));q.end()})}
function createCharge(t,v,c){return new Promise((r,j)=>{const o={hostname:c.sandbox?'pix-h.api.efipay.com.br':'pix.api.efipay.com.br',path:'/v2/cob',method:'POST',headers:{'Authorization':`Bearer ${t}`,'Content-Type':'application/json'},agent:getAgent(c)};const q=https.request(o,res=>{let d='';res.on('data',k=>d+=k);res.on('end',()=>r(JSON.parse(d)))});q.on('error',j);q.write(JSON.stringify({calendario:{expiracao:3600},valor:{original:v.toFixed(2)},chave:"65e5f3c3-b7d1-4757-a955-d6fc20519dce"}));q.end()})}
function getQRCode(t,l,c){return new Promise((r,j)=>{const o={hostname:c.sandbox?'pix-h.api.efipay.com.br':'pix.api.efipay.com.br',path:`/v2/loc/${l}/qrcode`,method:'GET',headers:{'Authorization':`Bearer ${t}`},agent:getAgent(c)};const q=https.request(o,res=>{let d='';res.on('data',k=>d+=k);res.on('end',()=>r(JSON.parse(d)))});q.on('error',j);q.end()})}
