import { createClient } from '@supabase/supabase-js';

// Chaves do banco blindadas no servidor
const SUPABASE_URL = "https://oabcppkojfmmmqhevjpq.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hYmNwcGtvamZtbW1xaGV2anBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTE2ODEsImV4cCI6MjA4NTg4NzY4MX0.b2OlaVmawuwC34kXhLwbJMm6hnPsO7Hng0r8_AHjwhw";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });

    const { senha_digitada } = req.body;

    try {
        // Vai no banco e pega a senha secreta
        const { data } = await supabase
            .from('config_admin')
            .select('senha_secreta')
            .limit(1)
            .single();

        // Compara a senha do banco com a que você digitou na tela
        if (data && data.senha_secreta === senha_digitada) {
            return res.status(200).json({ autorizado: true });
        } else {
            return res.status(401).json({ autorizado: false });
        }
    } catch (error) {
        return res.status(500).json({ erro: 'Erro interno' });
    }
}
