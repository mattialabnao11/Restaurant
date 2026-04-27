# 🍴 Gestione Locale (configurabile)

Applicazione completa per la gestione di un locale (ristorante, pizzeria, bar, ecc.) con autenticazione, gestione catalogo, dipendenti, fatture e **pannello di configurazione completo** modificabile dal Direttore.

## 🌟 Funzionalità

### 🛡️ Direttore — area amministrazione
- ✅ Dashboard con KPI (incassi giornalieri/settimanali/mensili, top piatti, ultime fatture)
- ✅ Configurazione app: nome locale, logo, sottotitolo, palette colori, etichette personalizzabili, contatti/dati fiscali
- ✅ Gestione completa catalogo piatti (CRUD) con ingredienti collegati ai materiali
- ✅ Gestione dipendenti (CRUD)
- ✅ Listini materiali e prezzi venditori
- ✅ Calcolo costi piatto e margine
- ✅ Visualizzazione listino e storico fatture

### 👤 Dipendente — area operativa
- ✅ Visualizzazione listino e prezzi
- ✅ Creazione fatture
- ✅ Storico fatture
- ✅ Lista acquisti

### ⚙️ Configurazione runtime
Il Direttore può modificare in qualsiasi momento da `Configurazione`:
- **Brand**: nome locale, sottotitolo, emoji o logo (URL)
- **Tema colori**: primario, secondario, accento, sidebar, sfondo (con preset rapidi e color picker)
- **Etichette**: rinomina termini come "Piatti", "Fatture", "Dipendenti" per adattarli al tuo locale
- **Contatti / dati fiscali**: indirizzo, telefono, email, P.IVA

Le modifiche sono **immediate per tutti gli utenti** al successivo caricamento.

### 🛰️ Sentinella anti-sleep (Render free)
Render free mette in pausa l'app dopo ~15 minuti di inattività. L'app integra una **sentinella keep-alive** che:
- pinga `/api/ping` ogni **12 minuti** quando una pagina è aperta
- si **mette in pausa automaticamente** quando la tab è in background (risparmia banda/risorse)
- riprova ogni minuto se il server è offline (lo "sveglia" appena qualcuno torna)
- mostra in basso nella sidebar un **indicatore di stato** (pallino verde/rosso) con tooltip dell'ultimo ping

In pratica: finché qualcuno tiene aperta l'app in una tab visibile, il server non andrà mai in sleep. Per garanzia 24/7 anche con tab chiuse, configura un servizio esterno (es. [UptimeRobot](https://uptimerobot.com), [cron-job.org](https://cron-job.org)) sull'URL `https://tuo-app.onrender.com/api/ping` ogni 10 minuti.

## 🛠 Stack Tecnologico

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Neon)
- **Frontend**: React
- **Deployment**: Render
- **Autenticazione**: Session-based

## 📋 Prerequisiti

- Account [Neon](https://neon.tech) (database PostgreSQL gratuito)
- Account [Render](https://render.com) (hosting gratuito)
- Node.js 18+ (per sviluppo locale)

## 🚀 Setup Database Neon

### 1. Crea il Database

1. Vai su [neon.tech](https://neon.tech) e crea un account
2. Clicca su "Create a project"
3. Scegli una regione vicina a te (es. Europa)
4. Copia la **Connection String** (formato: `postgresql://user:password@host/database`)

### 2. Inizializza lo Schema

1. Nella dashboard Neon, vai su "SQL Editor"
2. Copia e incolla il contenuto del file `schema.sql`
3. Esegui lo script
4. Verifica che le tabelle siano state create

> 💡 **Hai già un DB esistente?** Lo schema è **idempotente** (`IF NOT EXISTS` ovunque): puoi rieseguirlo in sicurezza per aggiungere la nuova tabella `app_config` senza toccare i dati esistenti. In alternativa il server crea automaticamente la tabella all'avvio se manca.

**Credenziali di default create:**
- **Nome**: Admin
- **Password**: admin123
- **Ruolo**: Direttore

🔒 **Cambiala subito al primo accesso!** (Gestione Dipendenti)

### 3. Primo accesso e configurazione

1. Accedi come `Admin` / `admin123` selezionando "🛡️ Direttore" nel login
2. Vai sulla voce di menu `⚙️ Configurazione`
3. Imposta nome del locale, logo/emoji, palette colori e etichette
4. Salva: tutti gli utenti vedranno le nuove impostazioni al prossimo refresh

## 📦 Deploy su Render

### Opzione 1: Deploy da GitHub (Consigliato)

#### 1. Carica il Codice su GitHub

```bash
# Inizializza git (se non l'hai già fatto)
git init

# Crea un file .gitignore
echo "node_modules/
.env
client/node_modules/
client/build/" > .gitignore

# Commit iniziale
git add .
git commit -m "Initial commit"

# Crea un repository su GitHub e collegalo
git remote add origin https://github.com/TUO-USERNAME/restaurant-app.git
git branch -M main
git push -u origin main
```

#### 2. Crea il Web Service su Render

1. Vai su [render.com](https://render.com) e accedi
2. Clicca "New +" → "Web Service"
3. Connetti il tuo repository GitHub
4. Configura il servizio:
   - **Name**: `restaurant-app` (o quello che preferisci)
   - **Region**: Europa (o vicino a te)
   - **Branch**: `main`
   - **Root Directory**: `.` (lascia vuoto)
   - **Environment**: `Node`
   - **Build Command**: `npm install && cd client && npm install && npm run build`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free

#### 3. Aggiungi le Variabili d'Ambiente

Nella sezione "Environment" del tuo web service, aggiungi:

```
DATABASE_URL=postgresql://user:password@host/database (tua connection string Neon)
SESSION_SECRET=your-super-secret-key-here-change-this
CLIENT_URL=https://restaurant-app.onrender.com (il tuo URL Render)
NODE_ENV=production
PORT=10000
```

⚠️ **IMPORTANTE**: Cambia `SESSION_SECRET` con una stringa casuale lunga!

#### 4. Deploy

1. Clicca "Create Web Service"
2. Render farà automaticamente il build e deploy
3. Attendi che il deploy sia completato (5-10 minuti)
4. Accedi all'app tramite l'URL fornito da Render

### Opzione 2: Deploy Manuale

Se preferisci non usare GitHub:

1. Su Render, scegli "Deploy from Git"
2. Carica manualmente i file tramite l'interfaccia
3. Segui gli stessi passaggi di configurazione dell'Opzione 1

## 🖥 Sviluppo Locale

### 1. Installa le Dipendenze

```bash
# Backend
npm install

# Frontend
cd client
npm install
cd ..
```

### 2. Configura le Variabili d'Ambiente

Crea un file `.env` nella root:

```
DATABASE_URL=tua_connection_string_neon
SESSION_SECRET=secret-key-for-development
CLIENT_URL=http://localhost:3001
NODE_ENV=development
PORT=3000
```

### 3. Avvia i Server

**Terminal 1 - Backend:**
```bash
npm start
# Server su http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd client
npm start
# Client su http://localhost:3001
```

### 4. Accedi all'App

Apri il browser su `http://localhost:3001` e accedi con:
- **Nome**: Admin
- **Password**: admin123

## 📱 Utilizzo dell'App

### Login
1. Inserisci nome utente e password
2. Clicca "Accedi"

### Direttore - Gestione Piatti
1. Vai su "Gestione Piatti"
2. Clicca "+ Nuovo Piatto"
3. Inserisci nome, prezzo e ingredienti
4. Salva

### Direttore - Gestione Dipendenti
1. Vai su "Gestione Dipendenti"
2. Clicca "+ Nuovo Dipendente"
3. Inserisci nome, ruolo e password
4. Salva

### Creazione Fattura
1. Vai su "Fatture"
2. Clicca "+ Nuova Fattura"
3. Aggiungi piatti e quantità
4. Il totale viene calcolato automaticamente
5. Salva la fattura

### Visualizzazione Listino
1. Vai su "Listino"
2. Visualizza tutti i piatti con prezzi e ingredienti necessari

## 🔧 Struttura File

```
restaurant-app/
├── server.js              # Backend Express
├── package.json           # Dipendenze backend
├── schema.sql             # Schema database
├── .env.example           # Template variabili d'ambiente
└── client/                # Frontend React
    ├── package.json       # Dipendenze frontend
    ├── public/
    │   └── index.html
    └── src/
        ├── index.js
        └── App.jsx        # Componente principale
```

## 🐛 Troubleshooting

### Problema: "Non autenticato" dopo il login
- Verifica che `CLIENT_URL` in `.env` corrisponda all'URL effettivo
- Assicurati che i cookie siano abilitati nel browser
- In produzione, verifica che `NODE_ENV=production`

### Problema: Errore connessione database
- Verifica che la connection string Neon sia corretta
- Controlla che il database sia attivo nella dashboard Neon
- Verifica che lo schema sia stato eseguito correttamente

### Problema: Deploy fallito su Render
- Controlla i log nella dashboard Render
- Verifica che tutte le variabili d'ambiente siano configurate
- Assicurati che il build command sia corretto

### Problema: Frontend non si carica
- Verifica che il build sia completato con successo
- Controlla che la cartella `client/build` sia stata creata
- Assicurati che il server stia servendo i file statici

## 🔒 Sicurezza

⚠️ **Importante per la produzione:**

1. **Cambia SESSION_SECRET**: Non usare mai il valore di default
2. **Password**: Implementa hashing delle password (bcrypt) invece di salvarle in plain text
3. **HTTPS**: Assicurati che Render usi HTTPS (automatico)
4. **Validazione Input**: Aggiungi validazione più robusta sui form
5. **Rate Limiting**: Implementa rate limiting per prevenire attacchi
6. **CORS**: Configura CORS solo per domini conosciuti

## 📝 Note

- L'app usa session-based authentication semplice (perfetta per iniziare)
- Le password sono salvate in plain text (NON per produzione reale!)
- Non esiste gestione magazzino (come richiesto)
- Il design è responsive e funziona su mobile

## 🆘 Supporto

Per problemi o domande:
1. Controlla i log su Render
2. Verifica le variabili d'ambiente
3. Controlla la connessione al database Neon

## 📄 Licenza

Progetto personale - Libero di usare e modificare
