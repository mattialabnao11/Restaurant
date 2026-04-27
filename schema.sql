-- ============================================================
-- Schema database per applicazione gestione locale
-- ============================================================
-- Tutte le DDL sono idempotenti (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- per consentire migrazioni sicure su DB già popolato.
-- ============================================================

-- Tabella utenti (dipendenti e direttori)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    ruolo VARCHAR(20) NOT NULL CHECK (ruolo IN ('Direttore', 'Dipendente')),
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella piatti
CREATE TABLE IF NOT EXISTS piatti (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    prezzo DECIMAL(10, 2) NOT NULL,
    porzioni INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE piatti ADD COLUMN IF NOT EXISTS porzioni INTEGER DEFAULT 1;

-- Tabella materiali (materie prime / prodotti acquistabili)
CREATE TABLE IF NOT EXISTS materiali (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL UNIQUE,
    unita_misura VARCHAR(30) NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prezzi venditori per ogni materiale (per scegliere il fornitore migliore)
CREATE TABLE IF NOT EXISTS prezzi_venditori (
    id SERIAL PRIMARY KEY,
    materiale_id INTEGER REFERENCES materiali(id) ON DELETE CASCADE,
    nome_venditore VARCHAR(150) NOT NULL,
    prezzo DECIMAL(10, 4) NOT NULL,
    note TEXT,
    data_aggiornamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella ingredienti per piatti (collegata a materiali per il calcolo costo)
CREATE TABLE IF NOT EXISTS ingredienti (
    id SERIAL PRIMARY KEY,
    piatto_id INTEGER REFERENCES piatti(id) ON DELETE CASCADE,
    nome_ingrediente VARCHAR(100) NOT NULL,
    quantita VARCHAR(50) NOT NULL,
    materiale_id INTEGER REFERENCES materiali(id) ON DELETE SET NULL
);
ALTER TABLE ingredienti ADD COLUMN IF NOT EXISTS materiale_id INTEGER REFERENCES materiali(id) ON DELETE SET NULL;

-- Tabella fatture
CREATE TABLE IF NOT EXISTS fatture (
    id SERIAL PRIMARY KEY,
    data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    totale DECIMAL(10, 2) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    note TEXT
);

-- Tabella dettagli fatture
CREATE TABLE IF NOT EXISTS fatture_dettagli (
    id SERIAL PRIMARY KEY,
    fattura_id INTEGER REFERENCES fatture(id) ON DELETE CASCADE,
    piatto_id INTEGER REFERENCES piatti(id),
    nome_piatto VARCHAR(100) NOT NULL,
    quantita INTEGER NOT NULL,
    prezzo_unitario DECIMAL(10, 2) NOT NULL
);

-- ============================================================
-- Tabella configurazione app (riga unica, id=1)
-- ============================================================
-- Contiene branding, palette colori, etichette personalizzabili
-- e dati fiscali. Modificabile solo dal Direttore.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    -- Brand
    nome_locale VARCHAR(150) NOT NULL DEFAULT 'Il Mio Locale',
    sottotitolo VARCHAR(255) DEFAULT 'Sistema di gestione',
    logo_url TEXT,
    icona_emoji VARCHAR(10) DEFAULT '🍴',
    -- Palette colori (CSS values)
    color_primary VARCHAR(20) DEFAULT '#2563eb',
    color_secondary VARCHAR(20) DEFAULT '#1e40af',
    color_accent VARCHAR(20) DEFAULT '#f59e0b',
    color_bg VARCHAR(20) DEFAULT '#f5f7fa',
    color_sidebar_from VARCHAR(20) DEFAULT '#1e293b',
    color_sidebar_to VARCHAR(20) DEFAULT '#0f172a',
    color_text VARCHAR(20) DEFAULT '#1a1a1a',
    -- Etichette personalizzabili (JSON)
    labels JSONB DEFAULT '{
        "piatti": "Piatti",
        "piatto": "Piatto",
        "listino": "Listino",
        "fatture": "Fatture",
        "fattura": "Fattura",
        "dipendenti": "Dipendenti",
        "dipendente": "Dipendente",
        "direttore": "Direttore",
        "acquisti": "Acquisti",
        "materiali": "Materiali",
        "ingredienti": "Ingredienti",
        "porzioni": "Porzioni",
        "venditore": "Venditore"
    }'::jsonb,
    -- Dati fiscali / contatti (per scontrini/fatture future)
    indirizzo VARCHAR(255),
    telefono VARCHAR(50),
    email VARCHAR(150),
    partita_iva VARCHAR(50),
    -- Metadati
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_da INTEGER REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT app_config_singleton CHECK (id = 1)
);

-- Garantisce l'esistenza della singola riga di configurazione
INSERT INTO app_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Indici per performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_fatture_data ON fatture(data);
CREATE INDEX IF NOT EXISTS idx_fatture_user ON fatture(user_id);
CREATE INDEX IF NOT EXISTS idx_ingredienti_piatto ON ingredienti(piatto_id);
CREATE INDEX IF NOT EXISTS idx_prezzi_materiale ON prezzi_venditori(materiale_id);

-- ============================================================
-- Utente direttore di default (password: admin123)
-- ============================================================
-- IMPORTANTE: cambia subito la password dopo il primo accesso!
-- ============================================================
INSERT INTO users (nome, ruolo, password)
VALUES ('Admin', 'Direttore', 'admin123')
ON CONFLICT (nome) DO NOTHING;
