const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // 👇👇👇 SÓ MEXA AQUI! 👇👇👇
    const sbUrl = "https://oabcppkojfmmmqhevjpq.supabase.co";  // <--- Coloque sua URL real aqui
    const sbKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";  // <--- Coloque sua Chave real aqui
    // 👆👆👆👆👆👆👆👆👆👆👆👆👆👆

    // --- DAQUI PARA BAIXO NÃO MEXA EM NADA! ---
    // Esse if abaixo serve para avisar se você esqueceu de mexer lá em cima.
    if (!sbUrl || sbUrl.includes("COLE_SUA")) {
        return res.status(500).json({ erro: 'Faltam as chaves no status.js' });
    }

    const supabase = createClient(sbUrl, sbKey);
    // ... resto do código ...
