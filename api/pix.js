import { createClient } from '@supabase/supabase-js';
import https from 'https';

export default async function handler(req, res) {
    // --- DEBUG DE CHAVES (Para descobrir o mistério) ---
    console.log("Tentando acessar chaves...");
    
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (!url) console.error("❌ ERRO CRÍTICO: SUPABASE_URL está vazia ou indefinida!");
    if (!key) console.error("❌ ERRO CRÍTICO: SUPABASE_KEY está vazia ou indefinida!");

    if (!url || !key) {
        return res.status(500).json({ 
            erro: 'Faltam chaves na Vercel',
            detalhe: `URL: ${url ? 'OK' : 'FALTANDO'}, KEY: ${key ? 'OK' : 'FALTANDO'}`
        });
    }
    // ---------------------------------------------------

    // ... (O resto do código continua igual abaixo) ...
    const supabase = createClient(url, key);
    
    // ... continue com o código anterior ...
