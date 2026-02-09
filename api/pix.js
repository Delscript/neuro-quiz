const { createClient } = require('@supabase/supabase-js');
const https = require('https');

module.exports = async (req, res) => {
    // --- O TESTE NUCLEAR (Hardcoding) ---
    // Cole suas chaves reais aqui dentro das aspas!
    const sbUrl = 'https://oabcppkojfmmmqhevjpq.supabase.co'; 
    const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw';   
    // ------------------------------------

    if (!sbUrl || sbUrl.includes("xxxx")) {
        console.error("🚨 Você esqueceu de colar as chaves reais no código!");
        return res.status(500).json({ erro: 'Troque os xxxxx pelas chaves reais no código!' });
    }

    // O resto continua igual...
    const supabase = createClient(sbUrl, sbKey);
    // ...
