# 🚀 Guida Rapida al Deployment

## Setup in 5 Minuti

### 1️⃣ Database Neon (2 minuti)
1. Vai su [neon.tech](https://neon.tech)
2. Crea un progetto
3. Copia la Connection String
4. Vai su SQL Editor
5. Esegui il contenuto di `schema.sql`

> 💡 Se aggiorni un DB già esistente (passaggio dalla v1 saloon → v2 configurabile), riesegui semplicemente `schema.sql`: tutte le DDL hanno `IF NOT EXISTS` e sono sicure. In alternativa il server crea automaticamente la tabella `app_config` all'avvio.

### 2️⃣ Deploy su Render (3 minuti)
1. Push il codice su GitHub
2. Vai su [render.com](https://render.com)
3. New → Web Service → Connetti repository
4. Configurazione:
   - **Build**: `npm install && cd client && npm install && npm run build`
   - **Start**: `node server.js`
   - **Variabili d'ambiente**:
     ```
     DATABASE_URL=<tua-neon-connection-string>
     SESSION_SECRET=<stringa-casuale-lunga>
     NODE_ENV=production
     ```
5. Deploy!

### 3️⃣ Primo Accesso
- **URL**: Il tuo URL Render (es: `https://restaurant-app-xyz.onrender.com`)
- **Username**: Admin
- **Password**: admin123

## ⚡ Comandi Utili

```bash
# Sviluppo locale - Backend
npm start

# Sviluppo locale - Frontend
cd client && npm start

# Build produzione locale
cd client && npm run build

# Test completo
npm install && cd client && npm install && npm run build && cd .. && node server.js
```

## 🔑 Variabili d'Ambiente Render

```
DATABASE_URL=postgresql://user:password@host/database
SESSION_SECRET=cambia-questo-con-stringa-casuale-molto-lunga
NODE_ENV=production
```

## ✅ Checklist Deployment

- [ ] Database Neon creato
- [ ] Schema SQL eseguito
- [ ] Codice su GitHub
- [ ] Web Service Render creato
- [ ] Variabili d'ambiente configurate
- [ ] Build completato con successo
- [ ] App accessibile e login funzionante

## 🆘 Problemi Comuni

**Errore: "Non autenticato"**
→ Verifica che tutte le variabili d'ambiente siano configurate

**Build fallito**
→ Controlla i log su Render, verifica il build command

**Database non connesso**
→ Verifica la connection string Neon, controlla che il database sia attivo

## 📞 Note

- Il primo deploy può richiedere 5-10 minuti
- Render potrebbe mettere l'app in sleep dopo 15 minuti di inattività (piano free)
- Il risveglio dall'sleep richiede ~30 secondi al primo accesso
