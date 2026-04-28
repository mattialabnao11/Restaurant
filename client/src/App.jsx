import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';

// ========== CONFIGURAZIONE ==========
const API_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');

// ========== UTILITIES ==========
const fetchAPI = async (url, options = {}) => {
  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMsg = 'Errore del server';
    try { const e = await response.json(); errorMsg = e.error || errorMsg; } catch (_) {}
    throw new Error(errorMsg);
  }

  return response.json();
};

// ========== CONFIG CONTEXT ==========
const DEFAULT_CONFIG = {
  nome_locale: 'Il Mio Locale',
  sottotitolo: 'Sistema di gestione',
  logo_url: null,
  icona_emoji: '🍴',
  color_primary: '#2563eb',
  color_secondary: '#1e40af',
  color_accent: '#f59e0b',
  color_bg: '#f5f7fa',
  color_sidebar_from: '#1e293b',
  color_sidebar_to: '#0f172a',
  color_text: '#1a1a1a',
  labels: {
    piatti: 'Piatti', piatto: 'Piatto', listino: 'Listino',
    fatture: 'Fatture', fattura: 'Fattura',
    dipendenti: 'Dipendenti', dipendente: 'Dipendente', direttore: 'Direttore',
    acquisti: 'Acquisti', materiali: 'Materiali', ingredienti: 'Ingredienti',
    porzioni: 'Porzioni', venditore: 'Venditore'
  },
  indirizzo: null, telefono: null, email: null, partita_iva: null
};

const ConfigContext = createContext({ config: DEFAULT_CONFIG, reload: () => {} });
const useConfig = () => useContext(ConfigContext);

// Applica le CSS variables a :root quando la config cambia
function applyThemeToRoot(cfg) {
  const r = document.documentElement;
  r.style.setProperty('--color-primary', cfg.color_primary || DEFAULT_CONFIG.color_primary);
  r.style.setProperty('--color-secondary', cfg.color_secondary || DEFAULT_CONFIG.color_secondary);
  r.style.setProperty('--color-accent', cfg.color_accent || DEFAULT_CONFIG.color_accent);
  r.style.setProperty('--color-bg', cfg.color_bg || DEFAULT_CONFIG.color_bg);
  r.style.setProperty('--color-sidebar-from', cfg.color_sidebar_from || DEFAULT_CONFIG.color_sidebar_from);
  r.style.setProperty('--color-sidebar-to', cfg.color_sidebar_to || DEFAULT_CONFIG.color_sidebar_to);
  r.style.setProperty('--color-text', cfg.color_text || DEFAULT_CONFIG.color_text);
  if (cfg.nome_locale) document.title = cfg.nome_locale;
}

// ========== KEEP-ALIVE (anti-sleep Render) ==========
// Render free dorme dopo ~15 min di inattività. Pinghiamo ogni 12 min
// quando la tab è visibile, così tieni viva l'app finché qualcuno la sta usando.
const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000; // 12 minuti
const KEEP_ALIVE_RETRY_MS = 60 * 1000;          // se errore, riprova fra 1 min

function useKeepAlive() {
  // Stato di salute esposto al UI (per l'indicatore nella sidebar)
  const [status, setStatus] = useState({
    ok: true,
    lastPing: null,
    lastError: null
  });

  useEffect(() => {
    let timer = null;
    let stopped = false;

    const ping = async () => {
      if (stopped) return;
      try {
        const r = await fetch(`${API_URL}/api/ping`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        setStatus({ ok: true, lastPing: new Date(), lastError: null, uptime: data.uptime });
        scheduleNext(KEEP_ALIVE_INTERVAL_MS);
      } catch (e) {
        // Server probabilmente in sleep o offline: riproviamo presto (così lo svegliamo)
        setStatus(s => ({ ok: false, lastPing: s.lastPing, lastError: e.message }));
        scheduleNext(KEEP_ALIVE_RETRY_MS);
      }
    };

    const scheduleNext = (ms) => {
      clearTimeout(timer);
      // Solo se la tab è visibile programma il prossimo ping. Risparmia banda/risorse.
      if (document.visibilityState === 'visible') {
        timer = setTimeout(ping, ms);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Appena la tab torna visibile, pinga subito (potrebbe essere passato molto tempo)
        ping();
      } else {
        clearTimeout(timer);
      }
    };

    // Primo ping immediato (così sveglia il dyno e popola lo stato)
    ping();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return status;
}

// ========== APP PRINCIPALE ==========
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [currentPage, setCurrentPage] = useState('listino');
  // Sentinella keep-alive: attiva sempre (login + post-login), si pausa se la tab è nascosta
  const keepAlive = useKeepAlive();

  const reloadConfig = useCallback(async () => {
    try {
      const data = await fetchAPI('/api/config');
      const merged = { ...DEFAULT_CONFIG, ...data, labels: { ...DEFAULT_CONFIG.labels, ...(data.labels || {}) } };
      setConfig(merged);
      applyThemeToRoot(merged);
    } catch (e) {
      // fallback ai default — non bloccare l'app
      applyThemeToRoot(DEFAULT_CONFIG);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await reloadConfig();
      try {
        const data = await fetchAPI('/api/me');
        setUser(data);
        // Default landing diversa per ruolo
        setCurrentPage(data.ruolo === 'Direttore' ? 'dashboard' : 'listino');
      } catch (e) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [reloadConfig]);

  const handleLogin = async (nome, password) => {
    const data = await fetchAPI('/api/login', {
      method: 'POST',
      body: JSON.stringify({ nome, password }),
    });
    setUser(data);
    setCurrentPage(data.ruolo === 'Direttore' ? 'dashboard' : 'listino');
  };

  const handleLogout = async () => {
    await fetchAPI('/api/logout', { method: 'POST' });
    setUser(null);
    setCurrentPage('listino');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loader}></div>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={{ config, reload: reloadConfig }}>
      {!user ? (
        <LoginPage onLogin={handleLogin} />
      ) : (
        <div style={{ ...styles.appContainer, ...(user.ruolo === 'Dipendente' ? styles.appContainerDipendente : {}) }}>
          <Sidebar
            user={user}
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onLogout={handleLogout}
            keepAlive={keepAlive}
          />
          <MainContent currentPage={currentPage} user={user} onNavigate={setCurrentPage} />
        </div>
      )}
    </ConfigContext.Provider>
  );
}

// ========== LOGIN PAGE ==========
function LoginPage({ onLogin }) {
  const { config } = useConfig();
  const [ruoloSel, setRuoloSel] = useState('Dipendente'); // visivo: Dipendente o Direttore
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(nome.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isDirettore = ruoloSel === 'Direttore';
  const labels = config.labels || DEFAULT_CONFIG.labels;

  return (
    <div style={styles.loginContainer}>
      <div style={styles.loginBox}>
        <div style={styles.loginBrand}>
          {config.logo_url ? (
            <img src={config.logo_url} alt={config.nome_locale} style={styles.loginLogo} />
          ) : (
            <div style={styles.loginEmoji}>{config.icona_emoji || '🍴'}</div>
          )}
          <h1 style={styles.loginTitle}>{config.nome_locale}</h1>
          <p style={styles.loginSubtitle}>{config.sottotitolo || 'Accedi al sistema'}</p>
        </div>

        {/* Selettore ruolo: cambia visivamente l'esperienza ma il login resta unico */}
        <div style={styles.roleSwitcher}>
          <button
            type="button"
            onClick={() => setRuoloSel('Dipendente')}
            style={{
              ...styles.roleSwitchBtn,
              ...(ruoloSel === 'Dipendente' ? styles.roleSwitchBtnActive : {})
            }}
          >
            👤 {labels.dipendente}
          </button>
          <button
            type="button"
            onClick={() => setRuoloSel('Direttore')}
            style={{
              ...styles.roleSwitchBtn,
              ...(ruoloSel === 'Direttore' ? styles.roleSwitchBtnActiveAdmin : {})
            }}
          >
            🛡️ {labels.direttore}
          </button>
        </div>

        <p style={styles.loginRoleHint}>
          {isDirettore
            ? 'Accesso area amministrazione: gestione, configurazione e dashboard.'
            : 'Accesso area operativa: listino, ordini e fatture.'}
        </p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.loginForm}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Nome utente</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={styles.input}
              required
              autoFocus
              placeholder={isDirettore ? 'Nome direttore' : 'Il tuo nome'}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            style={{
              ...styles.loginButton,
              ...(isDirettore ? styles.loginButtonAdmin : {})
            }}
            disabled={loading}
          >
            {loading ? 'Accesso in corso…' : (isDirettore ? '🛡️ Entra come ' + labels.direttore : 'Accedi')}
          </button>
        </form>

        <div style={styles.loginFooter}>
          {config.nome_locale} · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

// ========== SIDEBAR ==========
function Sidebar({ user, currentPage, onNavigate, onLogout, keepAlive }) {
  const { config } = useConfig();
  const L = config.labels || DEFAULT_CONFIG.labels;

  // Voci ordinate per ruolo: il direttore vede prima la dashboard
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', allowed: ['Direttore'] },
    { id: 'listino', label: L.listino, icon: '📋', allowed: ['Direttore', 'Dipendente'] },
    { id: 'fatture', label: L.fatture, icon: '🧾', allowed: ['Direttore', 'Dipendente'] },
    { id: 'acquisti', label: L.acquisti, icon: '🛒', allowed: ['Direttore', 'Dipendente'] },
    { id: 'piatti', label: 'Gestione ' + L.piatti, icon: '🍝', allowed: ['Direttore'] },
    { id: 'dipendenti', label: 'Gestione ' + L.dipendenti, icon: '👥', allowed: ['Direttore'] },
    { id: 'listini-ranch', label: 'Listini ' + L.materiali, icon: '🏪', allowed: ['Direttore'] },
    { id: 'configurazione', label: 'Configurazione', icon: '⚙️', allowed: ['Direttore'] },
  ];

  const isDirettore = user.ruolo === 'Direttore';

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <div style={styles.sidebarBrand}>
          {config.logo_url ? (
            <img src={config.logo_url} alt={config.nome_locale} style={styles.sidebarLogo} />
          ) : (
            <span style={styles.sidebarEmoji}>{config.icona_emoji || '🍴'}</span>
          )}
          <h2 style={styles.sidebarTitle}>{config.nome_locale}</h2>
        </div>

        <div style={styles.userInfo}>
          <div style={styles.userAvatar}>
            {(user.nome || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={styles.userName}>{user.nome}</div>
            <div style={{
              ...styles.userRole,
              ...(isDirettore ? styles.userRoleAdmin : {})
            }}>
              {isDirettore ? '🛡️ ' : '👤 '}{isDirettore ? L.direttore : L.dipendente}
            </div>
          </div>
        </div>
      </div>

      <nav style={styles.nav}>
        {menuItems
          .filter((item) => item.allowed.includes(user.ruolo))
          .map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                ...styles.navItem,
                ...(currentPage === item.id ? styles.navItemActive : {}),
              }}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
      </nav>

      <button onClick={onLogout} style={styles.logoutButton}>
        🚪 Esci
      </button>

      {keepAlive && <KeepAliveBadge keepAlive={keepAlive} />}
    </div>
  );
}

// Indicatore di stato della sentinella keep-alive
function KeepAliveBadge({ keepAlive }) {
  const ok = keepAlive.ok;
  const last = keepAlive.lastPing;
  const lastTxt = last
    ? last.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const tooltip = ok
    ? `Server attivo · ultimo ping: ${lastTxt}\nLa sentinella mantiene viva l'app ogni 12 minuti.`
    : `Server non risponde · riprovo automaticamente.\nUltimo errore: ${keepAlive.lastError || 'sconosciuto'}`;

  return (
    <div style={styles.keepAliveBadge} title={tooltip}>
      <span style={{ ...styles.keepAliveDot, background: ok ? '#10b981' : '#ef4444' }} />
      <span style={styles.keepAliveText}>
        {ok ? 'Sentinella attiva' : 'Riconnessione…'}
      </span>
    </div>
  );
}

// ========== MAIN CONTENT ==========
function MainContent({ currentPage, user, onNavigate }) {
  return (
    <div style={styles.mainContent}>
      {currentPage === 'dashboard' && user.ruolo === 'Direttore' && <DashboardPage onNavigate={onNavigate} />}
      {currentPage === 'listino' && <ListinoPage />}
      {currentPage === 'fatture' && <FatturePage />}
      {currentPage === 'piatti' && <GestionePiattiPage />}
      {currentPage === 'dipendenti' && <GestioneDipendentiPage />}
      {currentPage === 'listini-ranch' && <ListiniRanchPage />}
      {currentPage === 'acquisti' && <AcquistiPage />}
      {currentPage === 'configurazione' && user.ruolo === 'Direttore' && <ConfigurazioneAppPage />}
    </div>
  );
}

// ========== DASHBOARD PAGE (solo Direttore) ==========
function DashboardPage({ onNavigate }) {
  const { config } = useConfig();
  const L = config.labels || DEFAULT_CONFIG.labels;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await fetchAPI('/api/dashboard');
        setData(d);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={styles.loading}>Caricamento dashboard…</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.dashboardHeader}>
        <div>
          <h1 style={styles.pageTitle}>Dashboard</h1>
          <p style={styles.dashboardSubtitle}>
            Panoramica di {config.nome_locale} · {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {data && (
        <>
          {/* KPI cards */}
          <div style={styles.kpiGrid}>
            <KpiCard
              label="Incasso oggi"
              value={`€${data.oggi.totale.toFixed(2)}`}
              hint={`${data.oggi.n} ${data.oggi.n === 1 ? L.fattura.toLowerCase() : L.fatture.toLowerCase()}`}
              icon="💶"
              accent="primary"
            />
            <KpiCard
              label="Ultimi 7 giorni"
              value={`€${data.settimana.totale.toFixed(2)}`}
              hint={`${data.settimana.n} ${L.fatture.toLowerCase()}`}
              icon="📈"
              accent="success"
            />
            <KpiCard
              label="Ultimi 30 giorni"
              value={`€${data.mese.totale.toFixed(2)}`}
              hint={`${data.mese.n} ${L.fatture.toLowerCase()}`}
              icon="📅"
              accent="accent"
            />
            <KpiCard
              label={L.piatti + ' in listino'}
              value={data.tot_piatti}
              hint={`${data.tot_dipendenti} ${L.dipendenti.toLowerCase()}`}
              icon="🍽️"
              accent="muted"
            />
          </div>

          {/* Top piatti + ultime fatture */}
          <div style={styles.dashboardTwoCol}>
            <div style={styles.dashCard}>
              <div style={styles.dashCardHeader}>
                <h3 style={styles.dashCardTitle}>🏆 Top {L.piatti.toLowerCase()} (30 giorni)</h3>
              </div>
              {data.top_piatti.length === 0 ? (
                <div style={styles.emptyState}>Nessun dato disponibile</div>
              ) : (
                <div>
                  {data.top_piatti.map((p, i) => (
                    <div key={i} style={styles.dashRow}>
                      <span style={styles.dashRowRank}>#{i + 1}</span>
                      <span style={styles.dashRowName}>{p.nome_piatto}</span>
                      <span style={styles.dashRowMeta}>{p.quantita_totale} pz</span>
                      <span style={styles.dashRowAmount}>€{parseFloat(p.ricavo).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.dashCard}>
              <div style={styles.dashCardHeader}>
                <h3 style={styles.dashCardTitle}>🧾 Ultime {L.fatture.toLowerCase()}</h3>
                <button onClick={() => onNavigate('fatture')} style={styles.linkButton}>
                  Vedi tutte →
                </button>
              </div>
              {data.ultime_fatture.length === 0 ? (
                <div style={styles.emptyState}>Nessuna fattura recente</div>
              ) : (
                <div>
                  {data.ultime_fatture.map((f) => (
                    <div key={f.id} style={styles.dashRow}>
                      <span style={styles.dashRowRank}>#{f.id}</span>
                      <span style={styles.dashRowName}>
                        {f.dipendente_nome || '—'}
                      </span>
                      <span style={styles.dashRowMeta}>
                        {new Date(f.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={styles.dashRowAmount}>€{parseFloat(f.totale).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div style={styles.quickActions}>
            <h3 style={styles.quickActionsTitle}>Azioni rapide</h3>
            <div style={styles.quickActionsGrid}>
              <button onClick={() => onNavigate('piatti')} style={styles.quickActionBtn}>
                <span style={styles.quickActionIcon}>🍝</span>
                <span style={styles.quickActionLabel}>Aggiungi {L.piatto.toLowerCase()}</span>
              </button>
              <button onClick={() => onNavigate('dipendenti')} style={styles.quickActionBtn}>
                <span style={styles.quickActionIcon}>👥</span>
                <span style={styles.quickActionLabel}>Aggiungi {L.dipendente.toLowerCase()}</span>
              </button>
              <button onClick={() => onNavigate('listini-ranch')} style={styles.quickActionBtn}>
                <span style={styles.quickActionIcon}>🏪</span>
                <span style={styles.quickActionLabel}>{L.materiali} & prezzi</span>
              </button>
              <button onClick={() => onNavigate('configurazione')} style={styles.quickActionBtn}>
                <span style={styles.quickActionIcon}>⚙️</span>
                <span style={styles.quickActionLabel}>Configurazione app</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, hint, icon, accent }) {
  const accentColor = {
    primary: 'var(--color-primary)',
    success: 'var(--color-success)',
    accent: 'var(--color-accent)',
    muted: 'var(--color-muted)'
  }[accent] || 'var(--color-primary)';

  return (
    <div style={{ ...styles.kpiCard, borderTopColor: accentColor }}>
      <div style={styles.kpiIcon}>{icon}</div>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
      {hint && <div style={styles.kpiHint}>{hint}</div>}
    </div>
  );
}

// ========== CONFIGURAZIONE APP PAGE (solo Direttore) ==========
function ConfigurazioneAppPage() {
  const { config, reload } = useConfig();
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('brand');

  useEffect(() => { setForm(config); }, [config]);

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const setLabel = (key, value) => setForm(prev => ({
    ...prev,
    labels: { ...prev.labels, [key]: value }
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      await fetchAPI('/api/config', {
        method: 'PUT',
        body: JSON.stringify(form)
      });
      await reload();
      setMsg('✅ Configurazione salvata. Le modifiche sono attive per tutti gli utenti.');
      setTimeout(() => setMsg(''), 4000);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Ripristinare i valori di default? La modifica non è ancora salvata finché non clicchi "Salva".')) {
      setForm({ ...DEFAULT_CONFIG, labels: { ...DEFAULT_CONFIG.labels } });
    }
  };

  // Live preview applica subito al :root (così il direttore vede l'effetto prima di salvare)
  const applyPreview = () => applyThemeToRoot(form);

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>⚙️ Configurazione app</h1>
          <p style={styles.dashboardSubtitle}>
            Le modifiche salvate vengono applicate per tutti gli utenti, immediatamente al prossimo caricamento.
          </p>
        </div>
      </div>

      <div style={styles.tabs}>
        {[
          { id: 'brand', label: '🏷️ Brand' },
          { id: 'colori', label: '🎨 Colori & tema' },
          { id: 'etichette', label: '🔤 Etichette' },
          { id: 'contatti', label: '📍 Contatti / Fiscale' }
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{ ...styles.tabBtn, ...(tab === t.id ? styles.tabBtnActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div style={styles.successBox}>{msg}</div>}
      {err && <div style={styles.errorBox}>{err}</div>}

      <form onSubmit={handleSubmit} style={styles.configForm}>
        {tab === 'brand' && (
          <div style={styles.configCard}>
            <h3 style={styles.configCardTitle}>Identità del locale</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Nome del locale</label>
              <input style={styles.input} value={form.nome_locale || ''}
                onChange={e => setField('nome_locale', e.target.value)} required maxLength={150} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Sottotitolo / slogan</label>
              <input style={styles.input} value={form.sottotitolo || ''}
                onChange={e => setField('sottotitolo', e.target.value)} maxLength={255} />
            </div>
            <div style={styles.formRow}>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>Emoji icona (fallback senza logo)</label>
                <input style={styles.input} value={form.icona_emoji || ''}
                  onChange={e => setField('icona_emoji', e.target.value)} maxLength={10} placeholder="🍴" />
              </div>
              <div style={{ ...styles.formGroup, flex: 2 }}>
                <label style={styles.label}>URL logo (opzionale)</label>
                <input style={styles.input} value={form.logo_url || ''}
                  onChange={e => setField('logo_url', e.target.value)} placeholder="https://…/logo.png" />
              </div>
            </div>

            <div style={styles.brandPreview}>
              <span style={styles.brandPreviewLabel}>Anteprima:</span>
              {form.logo_url
                ? <img src={form.logo_url} alt="logo" style={styles.brandPreviewLogo} />
                : <span style={styles.brandPreviewEmoji}>{form.icona_emoji || '🍴'}</span>
              }
              <div>
                <div style={styles.brandPreviewName}>{form.nome_locale || 'Il Mio Locale'}</div>
                <div style={styles.brandPreviewSub}>{form.sottotitolo}</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'colori' && (
          <div style={styles.configCard}>
            <h3 style={styles.configCardTitle}>Palette colori</h3>
            <p style={styles.configCardHint}>
              Clicca "Anteprima live" per vedere subito l'effetto. Salva quando sei soddisfatto.
            </p>
            <div style={styles.colorGrid}>
              <ColorField label="Primario (azioni principali)" value={form.color_primary}
                onChange={v => setField('color_primary', v)} />
              <ColorField label="Secondario (gradiente)" value={form.color_secondary}
                onChange={v => setField('color_secondary', v)} />
              <ColorField label="Accento (highlight, link)" value={form.color_accent}
                onChange={v => setField('color_accent', v)} />
              <ColorField label="Sfondo app" value={form.color_bg}
                onChange={v => setField('color_bg', v)} />
              <ColorField label="Sidebar (alto)" value={form.color_sidebar_from}
                onChange={v => setField('color_sidebar_from', v)} />
              <ColorField label="Sidebar (basso)" value={form.color_sidebar_to}
                onChange={v => setField('color_sidebar_to', v)} />
              <ColorField label="Testo principale" value={form.color_text}
                onChange={v => setField('color_text', v)} />
            </div>

            <div style={styles.formRow}>
              <button type="button" onClick={applyPreview} style={styles.secondaryButton}>
                👁️ Anteprima live
              </button>
              <button type="button" onClick={handleReset} style={styles.secondaryButton}>
                ↺ Ripristina default
              </button>
            </div>

            <div style={styles.themePresets}>
              <span style={styles.themePresetsLabel}>Preset rapidi:</span>
              <PresetButton label="Blu pro" colors={{
                color_primary: '#2563eb', color_secondary: '#1e40af', color_accent: '#f59e0b',
                color_sidebar_from: '#1e293b', color_sidebar_to: '#0f172a', color_bg: '#f5f7fa', color_text: '#1a1a1a'
              }} setForm={setForm} />
              <PresetButton label="Elegante scuro" colors={{
                color_primary: '#d4af37', color_secondary: '#b8941f', color_accent: '#d4af37',
                color_sidebar_from: '#1a1a1a', color_sidebar_to: '#0a0a0a', color_bg: '#1f2937', color_text: '#f9fafb'
              }} setForm={setForm} />
              <PresetButton label="Caldo terra" colors={{
                color_primary: '#92400e', color_secondary: '#78350f', color_accent: '#d97706',
                color_sidebar_from: '#451a03', color_sidebar_to: '#1c0a01', color_bg: '#fef7ed', color_text: '#1c1917'
              }} setForm={setForm} />
              <PresetButton label="Verde fresco" colors={{
                color_primary: '#059669', color_secondary: '#047857', color_accent: '#f59e0b',
                color_sidebar_from: '#064e3b', color_sidebar_to: '#022c22', color_bg: '#f0fdf4', color_text: '#1a1a1a'
              }} setForm={setForm} />
              <PresetButton label="Rosso vinaccia" colors={{
                color_primary: '#991b1b', color_secondary: '#7f1d1d', color_accent: '#f59e0b',
                color_sidebar_from: '#450a0a', color_sidebar_to: '#1c0202', color_bg: '#fef2f2', color_text: '#1a1a1a'
              }} setForm={setForm} />
            </div>
          </div>
        )}

        {tab === 'etichette' && (
          <div style={styles.configCard}>
            <h3 style={styles.configCardTitle}>Etichette personalizzate</h3>
            <p style={styles.configCardHint}>
              Cambia la terminologia per adattarla al tuo locale (es: "Piatti" → "Pizze", "Dipendenti" → "Staff").
            </p>
            <div style={styles.labelsGrid}>
              {Object.keys(DEFAULT_CONFIG.labels).map(k => (
                <div key={k} style={styles.formGroup}>
                  <label style={styles.label}>
                    <span style={styles.labelKey}>{k}</span>
                    <span style={styles.labelDefault}>default: "{DEFAULT_CONFIG.labels[k]}"</span>
                  </label>
                  <input
                    style={styles.input}
                    value={(form.labels && form.labels[k]) || ''}
                    onChange={e => setLabel(k, e.target.value)}
                    placeholder={DEFAULT_CONFIG.labels[k]}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'contatti' && (
          <div style={styles.configCard}>
            <h3 style={styles.configCardTitle}>Contatti & dati fiscali</h3>
            <p style={styles.configCardHint}>
              Verranno usati su scontrini, ricevute e documenti stampabili.
            </p>
            <div style={styles.formGroup}>
              <label style={styles.label}>Indirizzo</label>
              <input style={styles.input} value={form.indirizzo || ''}
                onChange={e => setField('indirizzo', e.target.value)} />
            </div>
            <div style={styles.formRow}>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>Telefono</label>
                <input style={styles.input} value={form.telefono || ''}
                  onChange={e => setField('telefono', e.target.value)} />
              </div>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>Email</label>
                <input style={styles.input} type="email" value={form.email || ''}
                  onChange={e => setField('email', e.target.value)} />
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Partita IVA / Codice fiscale</label>
              <input style={styles.input} value={form.partita_iva || ''}
                onChange={e => setField('partita_iva', e.target.value)} />
            </div>
          </div>
        )}

        <div style={styles.configActions}>
          <button type="submit" style={styles.primaryButton} disabled={saving}>
            {saving ? 'Salvataggio…' : '💾 Salva configurazione'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div style={styles.colorField}>
      <label style={styles.label}>{label}</label>
      <div style={styles.colorInputRow}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={styles.colorPicker}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...styles.input, fontFamily: 'monospace' }}
          placeholder="#rrggbb"
        />
      </div>
    </div>
  );
}

function PresetButton({ label, colors, setForm }) {
  return (
    <button
      type="button"
      onClick={() => setForm(prev => ({ ...prev, ...colors }))}
      style={{
        ...styles.presetBtn,
        background: `linear-gradient(135deg, ${colors.color_primary}, ${colors.color_secondary})`
      }}
    >
      {label}
    </button>
  );
}

// ========== LISTINO PAGE ==========
function ListinoPage() {
  const [piatti, setPiatti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState({});

  useEffect(() => {
    loadPiatti();
  }, []);

  const loadPiatti = async () => {
    try {
      const data = await fetchAPI('/api/piatti');
      setPiatti(data);
    } catch (error) {
      console.error('Errore caricamento piatti:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (id) => {
    setExpandedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <h1 style={styles.pageTitle}>📋 Listino Piatti</h1>

      <div style={styles.cardGrid}>
        {piatti.map((piatto) => {
          const costoConosciuto = piatto.costo_per_porzione !== null && piatto.costo_per_porzione > 0;
          const marginePercentuale = piatto.percentuale_margine;
          const porzioni = piatto.porzioni || 1;
          const isExpanded = expandedCards[piatto.id];
          
          return (
            <div
              key={piatto.id}
              style={{
                ...styles.listinoCardCompact,
                ...(isExpanded ? styles.listinoCardExpanded : {})
              }}
              onClick={() => toggleCard(piatto.id)}
            >
              {/* Vista Compatta */}
              <div style={styles.listinoCardCompactHeader}>
                <div style={styles.listinoCardCompactInfo}>
                  <h3 style={styles.listinoCardCompactTitle}>{piatto.nome}</h3>
                  <div style={styles.listinoCardCompactDetails}>
                    <span style={styles.listinoCardCompactPrice}>
                      €{parseFloat(piatto.prezzo).toFixed(2)}
                    </span>
                    {costoConosciuto && (
                      <span style={{
                        ...styles.listinoCardCompactMargine,
                        color: marginePercentuale > 50 ? '#28a745' : marginePercentuale > 30 ? '#ffc107' : '#dc3545'
                      }}>
                        Margine: {marginePercentuale.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCard(piatto.id); }}
                  style={styles.listinoExpandButton}
                  title={isExpanded ? "Comprimi" : "Espandi"}
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>

              {/* Vista Espansa */}
              {isExpanded && (
                <div style={styles.listinoCardExpandedContent} onClick={(e) => e.stopPropagation()}>
                  {/* Costo Produzione */}
                  {costoConosciuto && (
                    <div style={styles.costoProduzione}>
                      {porzioni > 1 && piatto.costo_totale_ricetta && (
                        <div style={styles.porzioniInfo}>
                          <div style={styles.porzioniLabel}>
                            Ricetta completa fa <strong>{porzioni} porzioni</strong>
                          </div>
                          <div style={styles.costoRow}>
                            <span style={styles.costoLabel}>Costo totale ricetta:</span>
                            <span style={styles.costoValue}>
                              €{piatto.costo_totale_ricetta.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                      <div style={styles.costoRow}>
                        <span style={styles.costoLabel}>Costo per porzione:</span>
                        <span style={styles.costoValue}>
                          €{piatto.costo_per_porzione.toFixed(2)}
                        </span>
                      </div>
                      <div style={styles.costoRow}>
                        <span style={styles.costoLabel}>Margine:</span>
                        <span style={{
                          ...styles.costoValue,
                          color: piatto.margine > 0 ? '#28a745' : '#dc3545'
                        }}>
                          €{piatto.margine.toFixed(2)} ({marginePercentuale.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={styles.margineBar}>
                        <div style={{
                          ...styles.margineBarFill,
                          width: `${Math.min(marginePercentuale, 100)}%`,
                          background: marginePercentuale > 50 
                            ? 'linear-gradient(90deg, #28a745 0%, #20c997 100%)'
                            : marginePercentuale > 30
                            ? 'linear-gradient(90deg, #ffc107 0%, #fd7e14 100%)'
                            : 'linear-gradient(90deg, #dc3545 0%, #e74c3c 100%)'
                        }}></div>
                      </div>
                    </div>
                  )}
                  
                  {/* Ingredienti */}
                  {piatto.ingredienti && piatto.ingredienti.length > 0 && (
                    <div style={styles.ingredientiSection}>
                      <p style={styles.ingredientiLabel}>
                        Ingredienti {porzioni > 1 ? `(per ${porzioni} porzioni)` : ''}:
                      </p>
                      <ul style={styles.ingredientiList}>
                        {piatto.ingredienti.map((ing, idx) => (
                          <li key={idx} style={styles.ingredienteItem}>
                            {ing.nome_ingrediente} - {ing.quantita}
                            {!ing.materiale_id && (
                              <span style={styles.ingredienteWarning}>⚠️ Non collegato</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {!costoConosciuto && piatto.ingredienti && piatto.ingredienti.length > 0 && (
                    <div style={styles.costoWarning}>
                      ⚠️ Collega gli ingredienti ai materiali in Listini Materiali per vedere il costo
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {piatti.length === 0 && (
        <div style={styles.emptyState}>Nessun piatto disponibile</div>
      )}
    </div>
  );
}

// ========== GESTIONE PIATTI PAGE ==========
function GestionePiattiPage() {
  const [piatti, setPiatti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPiatto, setEditingPiatto] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadPiatti();
  }, []);

  const loadPiatti = async () => {
    try {
      const data = await fetchAPI('/api/piatti');
      setPiatti(data);
    } catch (error) {
      console.error('Errore caricamento piatti:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo piatto?')) return;

    try {
      await fetchAPI(`/api/piatti/${id}`, { method: 'DELETE' });
      loadPiatti();
    } catch (error) {
      alert('Errore: ' + error.message);
    }
  };

  const handleEdit = (piatto) => {
    setEditingPiatto(piatto);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingPiatto(null);
    loadPiatti();
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>🍝 Gestione Piatti</h1>
        <button
          onClick={() => setShowForm(true)}
          style={styles.primaryButton}
        >
          + Nuovo Piatto
        </button>
      </div>

      {showForm && (
        <PiattoForm
          piatto={editingPiatto}
          onClose={handleFormClose}
        />
      )}

      <div style={styles.table}>
        <div style={styles.tableHeader}>
          <div style={styles.tableCell}>Nome</div>
          <div style={styles.tableCell}>Prezzo</div>
          <div style={styles.tableCell}>Ingredienti</div>
          <div style={styles.tableCell}>Azioni</div>
        </div>
        {piatti.map((piatto) => (
          <div key={piatto.id} style={styles.tableRow}>
            <div style={styles.tableCell}>{piatto.nome}</div>
            <div style={styles.tableCell}>€{parseFloat(piatto.prezzo).toFixed(2)}</div>
            <div style={styles.tableCell}>
              {piatto.ingredienti?.length || 0} ingredienti
            </div>
            <div style={styles.tableCell}>
              <button
                onClick={() => handleEdit(piatto)}
                style={styles.editButton}
                className="editButton"
              >
                ✏️
              </button>
              <button
                onClick={() => handleDelete(piatto.id)}
                style={styles.deleteButton}
                className="deleteButton"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {piatti.length === 0 && (
        <div style={styles.emptyState}>Nessun piatto disponibile</div>
      )}
    </div>
  );
}

// ========== PIATTO FORM ==========
function PiattoForm({ piatto, onClose }) {
  const [nome, setNome] = useState(piatto?.nome || '');
  const [prezzo, setPrezzo] = useState(piatto?.prezzo || '');
  const [porzioni, setPorzioni] = useState(piatto?.porzioni || 1);
  const [ingredienti, setIngredienti] = useState(piatto?.ingredienti || []);
  const [materiali, setMateriali] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMateriali();
  }, []);

  const loadMateriali = async () => {
    try {
      const data = await fetchAPI('/api/materiali');
      setMateriali(data);
    } catch (error) {
      console.error('Errore caricamento materiali:', error);
    }
  };

  const addIngrediente = () => {
    setIngredienti([...ingredienti, { materiale_id: '', nome_ingrediente: '', quantita: '' }]);
  };

  const removeIngrediente = (index) => {
    setIngredienti(ingredienti.filter((_, i) => i !== index));
  };

  const updateIngrediente = (index, field, value) => {
    const newIngredienti = [...ingredienti];
    
    if (field === 'materiale_id') {
      const materiale = materiali.find(m => m.id === parseInt(value));
      if (materiale) {
        newIngredienti[index].materiale_id = materiale.id;
        newIngredienti[index].nome_ingrediente = materiale.nome;
        newIngredienti[index].unita_misura = materiale.unita_misura;
      }
    } else {
      newIngredienti[index][field] = value;
    }
    
    setIngredienti(newIngredienti);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body = {
        nome,
        prezzo: parseFloat(prezzo),
        porzioni: parseInt(porzioni),
        ingredienti: ingredienti.filter(
          (ing) => ing.materiale_id && ing.quantita
        ),
      };

      if (piatto) {
        await fetchAPI(`/api/piatti/${piatto.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await fetchAPI('/api/piatti', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      onClose();
    } catch (error) {
      alert('Errore: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {piatto ? 'Modifica Piatto' : 'Nuovo Piatto'}
          </h2>
          <button onClick={onClose} style={styles.closeButton} className="closeButton">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Nome Piatto *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={styles.input}
              placeholder="es. Spaghetti Carbonara"
              required
            />
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Prezzo Vendita (€) *</label>
              <input
                type="number"
                step="0.01"
                value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
                style={styles.input}
                placeholder="12.50"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Porzioni Prodotte *</label>
              <input
                type="number"
                min="1"
                value={porzioni}
                onChange={(e) => setPorzioni(e.target.value)}
                style={styles.input}
                placeholder="1"
                required
              />
              <small style={styles.helpText}>
                Quante porzioni produce questa ricetta?
              </small>
            </div>
          </div>

          <div style={styles.formGroup}>
            <div style={styles.labelRow}>
              <label style={styles.label}>Ingredienti (da Listini Materiali)</label>
              <button
                type="button"
                onClick={addIngrediente}
                style={styles.smallButton}
              >
                + Aggiungi
              </button>
            </div>
            {ingredienti.map((ing, index) => (
              <div key={index} style={styles.ingredienteRow} className="ingredienteRow">
                <select
                  value={ing.materiale_id || ''}
                  onChange={(e) => updateIngrediente(index, 'materiale_id', e.target.value)}
                  style={{ ...styles.input, flex: 2 }}
                  required
                >
                  <option value="">Seleziona materiale...</option>
                  {materiali.map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {mat.nome} ({mat.unita_misura})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder={ing.unita_misura ? `Quantità (${ing.unita_misura})` : 'Quantità'}
                  value={ing.quantita}
                  onChange={(e) => updateIngrediente(index, 'quantita', e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => removeIngrediente(index)}
                  style={styles.removeButton}
                >
                  🗑️
                </button>
              </div>
            ))}
            {ingredienti.length === 0 && (
              <div style={styles.ranchNoPrezzi}>
                Aggiungi ingredienti dal menu Listini Materiali
              </div>
            )}
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.secondaryButton}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={loading}
            >
              {loading ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========== GESTIONE DIPENDENTI PAGE ==========
function GestioneDipendentiPage() {
  const [dipendenti, setDipendenti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingDipendente, setEditingDipendente] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadDipendenti();
  }, []);

  const loadDipendenti = async () => {
    try {
      const data = await fetchAPI('/api/dipendenti');
      setDipendenti(data);
    } catch (error) {
      console.error('Errore caricamento dipendenti:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo dipendente?')) return;

    try {
      await fetchAPI(`/api/dipendenti/${id}`, { method: 'DELETE' });
      loadDipendenti();
    } catch (error) {
      alert('Errore: ' + error.message);
    }
  };

  const handleEdit = (dipendente) => {
    setEditingDipendente(dipendente);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingDipendente(null);
    loadDipendenti();
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>👥 Gestione Dipendenti</h1>
        <button
          onClick={() => setShowForm(true)}
          style={styles.primaryButton}
        >
          + Nuovo Dipendente
        </button>
      </div>

      {showForm && (
        <DipendenteForm
          dipendente={editingDipendente}
          onClose={handleFormClose}
        />
      )}

      <div style={styles.table}>
        <div style={styles.tableHeader}>
          <div style={styles.tableCell}>Nome</div>
          <div style={styles.tableCell}>Ruolo</div>
          <div style={styles.tableCell}>Azioni</div>
        </div>
        {dipendenti.map((dipendente) => (
          <div key={dipendente.id} style={styles.tableRow}>
            <div style={styles.tableCell}>{dipendente.nome}</div>
            <div style={styles.tableCell}>
              <span style={styles.roleBadge}>{dipendente.ruolo}</span>
            </div>
            <div style={styles.tableCell}>
              <button
                onClick={() => handleEdit(dipendente)}
                style={styles.editButton}
                className="editButton"
              >
                ✏️
              </button>
              <button
                onClick={() => handleDelete(dipendente.id)}
                style={styles.deleteButton}
                className="deleteButton"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {dipendenti.length === 0 && (
        <div style={styles.emptyState}>Nessun dipendente disponibile</div>
      )}
    </div>
  );
}

// ========== DIPENDENTE FORM ==========
function DipendenteForm({ dipendente, onClose }) {
  const [nome, setNome] = useState(dipendente?.nome || '');
  const [ruolo, setRuolo] = useState(dipendente?.ruolo || 'Dipendente');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body = { nome, ruolo, password };

      if (dipendente) {
        await fetchAPI(`/api/dipendenti/${dipendente.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await fetchAPI('/api/dipendenti', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      onClose();
    } catch (error) {
      alert('Errore: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {dipendente ? 'Modifica Dipendente' : 'Nuovo Dipendente'}
          </h2>
          <button onClick={onClose} style={styles.closeButton} className="closeButton">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Nome *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Ruolo *</label>
            <select
              value={ruolo}
              onChange={(e) => setRuolo(e.target.value)}
              style={styles.input}
              required
            >
              <option value="Dipendente">Dipendente</option>
              <option value="Direttore">Direttore</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Password {dipendente ? '(lascia vuoto per non modificare)' : '*'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required={!dipendente}
            />
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.secondaryButton}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={loading}
            >
              {loading ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========== FATTURE PAGE ==========
function FatturePage() {
  const [fatture, setFatture] = useState([]);
  const [piatti, setPiatti] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [fattureData, piattiData] = await Promise.all([
        fetchAPI('/api/fatture'),
        fetchAPI('/api/piatti'),
      ]);
      setFatture(fattureData);
      setPiatti(piattiData);
    } catch (error) {
      console.error('Errore caricamento dati:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    loadData();
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>🧾 Fatture</h1>
        <button
          onClick={() => setShowForm(true)}
          style={styles.primaryButton}
        >
          + Nuova Fattura
        </button>
      </div>

      {showForm && (
        <FatturaForm piatti={piatti} onClose={handleFormClose} />
      )}

      <div style={styles.fattureList}>
        {fatture.map((fattura) => (
          <div key={fattura.id} style={styles.fatturaCard}>
            <div style={styles.fatturaHeader}>
              <div>
                <div style={styles.fatturaId}>Fattura #{fattura.id}</div>
                <div style={styles.fatturaDate}>
                  {new Date(fattura.data).toLocaleString('it-IT')}
                </div>
                <div style={styles.fatturaDipendente}>
                  Creata da: {fattura.dipendente_nome}
                </div>
              </div>
              <div style={styles.fatturaTotal}>
                €{parseFloat(fattura.totale).toFixed(2)}
              </div>
            </div>

            <div style={styles.fatturaDettagli}>
              {fattura.dettagli.map((det, idx) => (
                <div key={idx} style={styles.fatturaDettaglioRow}>
                  <span>{det.nome_piatto}</span>
                  <span>x{det.quantita}</span>
                  <span>€{parseFloat(det.prezzo_unitario).toFixed(2)}</span>
                  <span style={styles.fatturaDettaglioTotal}>
                    €{(det.quantita * parseFloat(det.prezzo_unitario)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {fattura.note && (
              <div style={styles.fatturaNote}>Note: {fattura.note}</div>
            )}
          </div>
        ))}
      </div>

      {fatture.length === 0 && (
        <div style={styles.emptyState}>Nessuna fattura disponibile</div>
      )}
    </div>
  );
}

// ========== FATTURA FORM ==========
function FatturaForm({ piatti, onClose }) {
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const addItem = () => {
    setItems([
      ...items,
      { piatto_id: '', nome_piatto: '', prezzo_unitario: 0, quantita: 1 },
    ]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    
    if (field === 'piatto_id') {
      const piatto = piatti.find((p) => p.id === parseInt(value));
      if (piatto) {
        newItems[index] = {
          ...newItems[index],
          piatto_id: piatto.id,
          nome_piatto: piatto.nome,
          prezzo_unitario: parseFloat(piatto.prezzo),
        };
      }
    } else {
      newItems[index][field] = value;
    }
    
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce(
      (sum, item) => sum + item.quantita * item.prezzo_unitario,
      0
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (items.length === 0) {
      alert('Aggiungi almeno un piatto alla fattura');
      return;
    }

    setLoading(true);

    try {
      const body = {
        dettagli: items.map((item) => ({
          piatto_id: item.piatto_id,
          nome_piatto: item.nome_piatto,
          quantita: parseInt(item.quantita),
          prezzo_unitario: parseFloat(item.prezzo_unitario),
        })),
        note,
      };

      await fetchAPI('/api/fatture', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      onClose();
    } catch (error) {
      alert('Errore: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modal}>
      <div style={{ ...styles.modalContent, maxWidth: '700px' }}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuova Fattura</h2>
          <button onClick={onClose} style={styles.closeButton} className="closeButton">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <div style={styles.labelRow}>
              <label style={styles.label}>Piatti</label>
              <button
                type="button"
                onClick={addItem}
                style={styles.smallButton}
              >
                + Aggiungi Piatto
              </button>
            </div>
            
            {items.map((item, index) => (
              <div key={index} style={styles.fatturaItemRow}>
                <select
                  value={item.piatto_id}
                  onChange={(e) => updateItem(index, 'piatto_id', e.target.value)}
                  style={{ ...styles.input, flex: 2 }}
                  required
                >
                  <option value="">Seleziona piatto...</option>
                  {piatti.map((piatto) => (
                    <option key={piatto.id} value={piatto.id}>
                      {piatto.nome} - €{parseFloat(piatto.prezzo).toFixed(2)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={item.quantita}
                  onChange={(e) => updateItem(index, 'quantita', e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                  placeholder="Qtà"
                  required
                />
                <div style={styles.itemTotal}>
                  €{(item.quantita * item.prezzo_unitario).toFixed(2)}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  style={styles.removeButton}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Note (opzionale)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              placeholder="Aggiungi note..."
            />
          </div>

          <div style={styles.totalSection}>
            <span style={styles.totalLabel}>Totale:</span>
            <span style={styles.totalAmount}>€{calculateTotal().toFixed(2)}</span>
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.secondaryButton}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={loading}
            >
              {loading ? 'Creazione...' : 'Crea Fattura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========== LISTINI Materiali PAGE ==========
function ListiniRanchPage() {
  const [materiali, setMateriali] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMateriale, setEditingMateriale] = useState(null);
  const [editingPrezzo, setEditingPrezzo] = useState(null);
  const [showMaterialeForm, setShowMaterialeForm] = useState(false);
  const [showPrezzoForm, setShowPrezzoForm] = useState(false);
  const [selectedMateriale, setSelectedMateriale] = useState(null);
  const [expandedCards, setExpandedCards] = useState({});

  useEffect(() => {
    loadMateriali();
  }, []);

  const loadMateriali = async () => {
    try {
      const data = await fetchAPI('/api/materiali');
      setMateriali(data);
    } catch (error) {
      console.error('Errore caricamento materiali:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (id) => {
    setExpandedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDeleteMateriale = async (id, e) => {
    e.stopPropagation(); // Previeni il toggle della card
    if (!window.confirm('Sei sicuro di voler eliminare questo materiale e tutti i suoi prezzi?')) return;

    try {
      await fetchAPI(`/api/materiali/${id}`, { method: 'DELETE' });
      loadMateriali();
    } catch (error) {
      alert('Errore: ' + error.message);
    }
  };

  const handleDeletePrezzo = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Sei sicuro di voler eliminare questo prezzo?')) return;

    try {
      await fetchAPI(`/api/prezzi-venditori/${id}`, { method: 'DELETE' });
      loadMateriali();
    } catch (error) {
      alert('Errore: ' + error.message);
    }
  };

  const handleEditMateriale = (materiale, e) => {
    e.stopPropagation();
    setEditingMateriale(materiale);
    setShowMaterialeForm(true);
  };

  const handleAddPrezzo = (materiale, e) => {
    e.stopPropagation();
    setSelectedMateriale(materiale);
    setEditingPrezzo(null);
    setShowPrezzoForm(true);
  };

  const handleEditPrezzo = (materiale, prezzo, e) => {
    e.stopPropagation();
    setSelectedMateriale(materiale);
    setEditingPrezzo(prezzo);
    setShowPrezzoForm(true);
  };

  const handleFormClose = () => {
    setShowMaterialeForm(false);
    setShowPrezzoForm(false);
    setEditingMateriale(null);
    setEditingPrezzo(null);
    setSelectedMateriale(null);
    loadMateriali();
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>🏪 Listini Materiali - Confronto Prezzi Fornitori</h1>
        <button
          onClick={() => setShowMaterialeForm(true)}
          style={styles.primaryButton}
        >
          + Nuovo Materiale
        </button>
      </div>

      {showMaterialeForm && (
        <MaterialeForm
          materiale={editingMateriale}
          onClose={handleFormClose}
        />
      )}

      {showPrezzoForm && (
        <PrezzoVenditoreForm
          materiale={selectedMateriale}
          prezzo={editingPrezzo}
          onClose={handleFormClose}
        />
      )}

      <div style={styles.ranchContainer}>
        {materiali.map((materiale) => {
          const isExpanded = expandedCards[materiale.id];
          const hasPrezzi = materiale.prezzi_venditori && materiale.prezzi_venditori.length > 0;
          
          return (
            <div
              key={materiale.id}
              style={{
                ...styles.ranchCardCompact,
                ...(isExpanded ? styles.ranchCardExpanded : {})
              }}
              onClick={() => toggleCard(materiale.id)}
            >
              {/* Vista Compatta */}
              <div style={styles.ranchCardCompactHeader}>
                <div style={styles.ranchCardCompactInfo}>
                  <h3 style={styles.ranchCardCompactTitle}>
                    {materiale.nome}
                    <span style={styles.ranchCardCompactUnit}>({materiale.unita_misura})</span>
                  </h3>
                  {hasPrezzi && materiale.prezzo_migliore && (
                    <div style={styles.ranchCardCompactPrice}>
                      Miglior prezzo: <strong>€{materiale.prezzo_migliore.toFixed(2)}/{materiale.unita_misura}</strong>
                      <span style={styles.ranchCardPrezziCount}>
                        {materiale.prezzi_venditori.length} fornitore{materiale.prezzi_venditori.length !== 1 ? 'i' : ''}
                      </span>
                    </div>
                  )}
                  {!hasPrezzi && (
                    <div style={styles.ranchCardNoPriceCompact}>
                      Nessun prezzo disponibile
                    </div>
                  )}
                </div>
                
                <div style={styles.ranchCardCompactActions}>
                  <button
                    onClick={(e) => handleEditMateriale(materiale, e)}
                    style={styles.editButton}
                    className="editButton"
                    title="Modifica materiale"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => handleDeleteMateriale(materiale.id, e)}
                    style={styles.deleteButton}
                    className="deleteButton"
                    title="Elimina materiale"
                  >
                    🗑️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCard(materiale.id); }}
                    style={styles.expandButton}
                    title={isExpanded ? "Comprimi" : "Espandi"}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* Vista Espansa */}
              {isExpanded && (
                <div style={styles.ranchCardExpandedContent}>
                  {materiale.note && (
                    <p style={styles.ranchCardNote}>{materiale.note}</p>
                  )}
                  
                  <div style={styles.ranchPrezziSection}>
                    <div style={styles.ranchPrezziHeader}>
                      <h4 style={styles.ranchPrezziTitle}>Prezzi Fornitori</h4>
                      <button
                        onClick={(e) => handleAddPrezzo(materiale, e)}
                        style={styles.smallButton}
                      >
                        + Aggiungi Prezzo
                      </button>
                    </div>

                    {hasPrezzi ? (
                      <div style={styles.ranchPrezziList}>
                        {materiale.prezzi_venditori.map((prezzo) => {
                          const isMigliore = parseFloat(prezzo.prezzo) === materiale.prezzo_migliore;
                          
                          return (
                            <div
                              key={prezzo.id}
                              style={{
                                ...styles.ranchPrezzoItem,
                                ...(isMigliore ? styles.ranchPrezzoMigliore : {})
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div style={styles.ranchPrezzoInfo}>
                                <div style={styles.ranchPrezzoVenditore}>
                                  {prezzo.nome_venditore}
                                  {isMigliore && (
                                    <span style={styles.ranchBadgeMigliore}>🏆 Migliore</span>
                                  )}
                                </div>
                                <div style={styles.ranchPrezzoAmount}>
                                  €{parseFloat(prezzo.prezzo).toFixed(2)}/{materiale.unita_misura}
                                </div>
                                {prezzo.note && (
                                  <div style={styles.ranchPrezzoNote}>{prezzo.note}</div>
                                )}
                                <div style={styles.ranchPrezzoData}>
                                  Aggiornato: {new Date(prezzo.data_aggiornamento).toLocaleDateString('it-IT')}
                                </div>
                              </div>
                              <div style={styles.ranchPrezzoActions}>
                                <button
                                  onClick={(e) => handleEditPrezzo(materiale, prezzo, e)}
                                  style={styles.editButton}
                                  className="editButton"
                                  title="Modifica prezzo"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={(e) => handleDeletePrezzo(prezzo.id, e)}
                                  style={styles.deleteButton}
                                  className="deleteButton"
                                  title="Elimina prezzo"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={styles.ranchNoPrezzi}>
                        Nessun prezzo disponibile. Aggiungi i prezzi dei fornitori per confrontarli.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {materiali.length === 0 && (
        <div style={styles.emptyState}>
          Nessun materiale disponibile. Inizia aggiungendo i materiali che acquisti.
        </div>
      )}
    </div>
  );
}

// ========== MATERIALE FORM ==========
function MaterialeForm({ materiale, onClose }) {
  const [nome, setNome] = useState(materiale?.nome || '');
  const [unitaMisura, setUnitaMisura] = useState(materiale?.unita_misura || '');
  const [note, setNote] = useState(materiale?.note || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body = { nome, unita_misura: unitaMisura, note };

      if (materiale) {
        await fetchAPI(`/api/materiali/${materiale.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await fetchAPI('/api/materiali', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      onClose();
    } catch (error) {
      alert('Errore: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {materiale ? 'Modifica Materiale' : 'Nuovo Materiale'}
          </h2>
          <button onClick={onClose} style={styles.closeButton} className="closeButton">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Nome Materiale *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={styles.input}
              placeholder="es. Farina 00, Olio EVO, ecc."
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Unità di Misura *</label>
            <input
              type="text"
              value={unitaMisura}
              onChange={(e) => setUnitaMisura(e.target.value)}
              style={styles.input}
              placeholder="es. kg, litri, pezzi, ecc."
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Note (opzionale)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              placeholder="Informazioni aggiuntive sul materiale..."
            />
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.secondaryButton}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={loading}
            >
              {loading ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========== PREZZO VENDITORE FORM ==========
function PrezzoVenditoreForm({ materiale, prezzo, onClose }) {
  const [nomeVenditore, setNomeVenditore] = useState(prezzo?.nome_venditore || '');
  const [prezzoValue, setPrezzoValue] = useState(prezzo?.prezzo || '');
  const [note, setNote] = useState(prezzo?.note || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body = {
        materiale_id: materiale.id,
        nome_venditore: nomeVenditore,
        prezzo: parseFloat(prezzoValue),
        note
      };

      if (prezzo) {
        await fetchAPI(`/api/prezzi-venditori/${prezzo.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await fetchAPI('/api/prezzi-venditori', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      onClose();
    } catch (error) {
      alert('Errore: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {prezzo ? 'Modifica Prezzo' : 'Nuovo Prezzo'}
          </h2>
          <button onClick={onClose} style={styles.closeButton} className="closeButton">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Materiale</label>
            <div style={styles.ranchMaterialeInfo}>
              <strong>{materiale.nome}</strong>
              <span style={styles.ranchMaterialeUnit}>({materiale.unita_misura})</span>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Nome Fornitore *</label>
            <input
              type="text"
              value={nomeVenditore}
              onChange={(e) => setNomeVenditore(e.target.value)}
              style={styles.input}
              placeholder="es. Fornitore A, Grossista XYZ, ecc."
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Prezzo (€/{materiale.unita_misura}) *</label>
            <input
              type="number"
              step="0.01"
              value={prezzoValue}
              onChange={(e) => setPrezzoValue(e.target.value)}
              style={styles.input}
              placeholder="0.00"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Note (opzionale)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
              placeholder="es. Min. ordine, condizioni di pagamento, ecc."
            />
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.secondaryButton}
            >
              Annulla
            </button>
            <button
              type="submit"
              style={styles.primaryButton}
              disabled={loading}
            >
              {loading ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ========== ACQUISTI PAGE ==========
function AcquistiPage() {
  const [materiali, setMateriali] = useState([]);
  const [righeAcquisto, setRigheAcquisto] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadMateriali();
  }, []);

  const loadMateriali = async () => {
    try {
      const data = await fetchAPI('/api/materiali');
      setMateriali(data);
    } catch (error) {
      console.error('Errore caricamento materiali:', error);
    } finally {
      setLoading(false);
    }
  };

  const aggiungiRiga = (materiale, fornitore, quantita, prezzoCustom) => {
    const nuovaRiga = {
      id: Date.now(),
      materiale,
      fornitore,
      quantita: parseFloat(quantita),
      prezzoUnitario: fornitore === 'Altro' ? parseFloat(prezzoCustom) : parseFloat(fornitore.prezzo),
    };

    setRigheAcquisto([...righeAcquisto, nuovaRiga]);
    setShowAddForm(false);
  };

  const rimuoviRiga = (id) => {
    setRigheAcquisto(righeAcquisto.filter(r => r.id !== id));
  };

  const calcolaTotale = () => {
    return righeAcquisto.reduce((acc, riga) => {
      return acc + (riga.quantita * riga.prezzoUnitario);
    }, 0);
  };

  const resetAcquisto = () => {
    if (window.confirm('Vuoi svuotare l\'acquisto corrente?')) {
      setRigheAcquisto([]);
    }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>🛒 Calcolatore Acquisti</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          {righeAcquisto.length > 0 && (
            <button onClick={resetAcquisto} style={styles.secondaryButton}>
              🗑️ Svuota
            </button>
          )}
          <button onClick={() => setShowAddForm(true)} style={styles.primaryButton}>
            + Aggiungi Materiale
          </button>
        </div>
      </div>

      {showAddForm && (
        <AggiungiMaterialeForm
          materiali={materiali}
          onAdd={aggiungiRiga}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {righeAcquisto.length > 0 ? (
        <div style={styles.acquistoContainer}>
          <div style={styles.acquistoTable}>
            <div style={styles.acquistoTableHeader}>
              <div style={styles.acquistoTableCell}>Materiale</div>
              <div style={styles.acquistoTableCell}>Fornitore</div>
              <div style={styles.acquistoTableCell}>Quantità</div>
              <div style={styles.acquistoTableCell}>Prezzo/unità</div>
              <div style={styles.acquistoTableCell}>Totale</div>
              <div style={styles.acquistoTableCell}>Azioni</div>
            </div>

            {righeAcquisto.map((riga) => (
              <div key={riga.id} style={styles.acquistoTableRow}>
                <div style={styles.acquistoTableCell}>
                  <strong>{riga.materiale.nome}</strong>
                  <span style={styles.acquistoUnitaBadge}>({riga.materiale.unita_misura})</span>
                </div>
                <div style={styles.acquistoTableCell}>
                  {riga.fornitore === 'Altro' ? (
                    <span style={styles.acquistoFornitoreAltro}>Altro</span>
                  ) : (
                    <span>{riga.fornitore.nome_venditore}</span>
                  )}
                </div>
                <div style={styles.acquistoTableCell}>
                  <strong>{riga.quantita}</strong> {riga.materiale.unita_misura}
                </div>
                <div style={styles.acquistoTableCell}>
                  €{riga.prezzoUnitario.toFixed(2)}/{riga.materiale.unita_misura}
                </div>
                <div style={styles.acquistoTableCell}>
                  <strong style={styles.acquistoPrezzoTotale}>
                    €{(riga.quantita * riga.prezzoUnitario).toFixed(2)}
                  </strong>
                </div>
                <div style={styles.acquistoTableCell}>
                  <button
                    onClick={() => rimuoviRiga(riga.id)}
                    style={styles.deleteButton}
                    className="deleteButton"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.acquistoTotale}>
            <div style={styles.acquistoTotaleLabel}>Totale da Pagare:</div>
            <div style={styles.acquistoTotaleValue}>€{calcolaTotale().toFixed(2)}</div>
          </div>
        </div>
      ) : (
        <div style={styles.acquistoEmpty}>
          <div style={styles.acquistoEmptyIcon}>🛒</div>
          <h3 style={styles.acquistoEmptyTitle}>Nessun materiale nell'acquisto</h3>
          <p style={styles.acquistoEmptyText}>
            Clicca su "Aggiungi Materiale" per iniziare a calcolare il costo dell'ordine
          </p>
        </div>
      )}
    </div>
  );
}

// ========== AGGIUNGI MATERIALE FORM ==========
function AggiungiMaterialeForm({ materiali, onAdd, onClose }) {
  const [materialeSelezionato, setMaterialeSelezionato] = useState(null);
  const [fornitoreSelezionato, setFornitoreSelezionato] = useState(null);
  const [quantita, setQuantita] = useState('');
  const [prezzoCustom, setPrezzoCustom] = useState('');

  const handleMaterialeChange = (materialeId) => {
    const materiale = materiali.find(m => m.id === parseInt(materialeId));
    setMaterialeSelezionato(materiale);
    setFornitoreSelezionato(null); // Reset fornitore quando cambi materiale
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!materialeSelezionato || !quantita) {
      alert('Seleziona materiale e quantità');
      return;
    }

    if (!fornitoreSelezionato) {
      alert('Seleziona un fornitore');
      return;
    }

    if (fornitoreSelezionato === 'Altro' && !prezzoCustom) {
      alert('Inserisci il prezzo per il fornitore "Altro"');
      return;
    }

    onAdd(materialeSelezionato, fornitoreSelezionato, quantita, prezzoCustom);

    // Reset form
    setMaterialeSelezionato(null);
    setFornitoreSelezionato(null);
    setQuantita('');
    setPrezzoCustom('');
  };

  return (
    <div style={styles.acquistoFormContainer}>
      <div style={styles.acquistoFormHeader}>
        <h3 style={styles.acquistoFormTitle}>Aggiungi Materiale all'Acquisto</h3>
        <button onClick={onClose} style={styles.closeButton} className="closeButton">
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} style={styles.acquistoForm}>
        <div style={styles.formRow}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Materiale *</label>
            <select
              value={materialeSelezionato?.id || ''}
              onChange={(e) => handleMaterialeChange(e.target.value)}
              style={styles.input}
              required
            >
              <option value="">Seleziona materiale...</option>
              {materiali.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.nome} ({mat.unita_misura})
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Quantità ({materialeSelezionato?.unita_misura || '...'}) *
            </label>
            <input
              type="number"
              step="0.01"
              value={quantita}
              onChange={(e) => setQuantita(e.target.value)}
              style={styles.input}
              placeholder="0"
              required
            />
          </div>
        </div>

        {materialeSelezionato && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Fornitore *</label>
            <select
              value={fornitoreSelezionato === 'Altro' ? 'Altro' : fornitoreSelezionato?.id || ''}
              onChange={(e) => {
                if (e.target.value === 'Altro') {
                  setFornitoreSelezionato('Altro');
                } else {
                  const fornitore = materialeSelezionato.prezzi_venditori.find(
                    p => p.id === parseInt(e.target.value)
                  );
                  setFornitoreSelezionato(fornitore);
                }
              }}
              style={styles.input}
              required
            >
              <option value="">Seleziona fornitore...</option>
              {materialeSelezionato.prezzi_venditori && materialeSelezionato.prezzi_venditori.map((prezzo) => (
                <option key={prezzo.id} value={prezzo.id}>
                  {prezzo.nome_venditore} - €{parseFloat(prezzo.prezzo).toFixed(2)}/{materialeSelezionato.unita_misura}
                </option>
              ))}
              <option value="Altro">Altro (inserisci prezzo manualmente)</option>
            </select>
          </div>
        )}

        {fornitoreSelezionato === 'Altro' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Prezzo Unitario (€/{materialeSelezionato?.unita_misura}) *
            </label>
            <input
              type="number"
              step="0.01"
              value={prezzoCustom}
              onChange={(e) => setPrezzoCustom(e.target.value)}
              style={styles.input}
              placeholder="0.00"
              required
            />
          </div>
        )}

        {materialeSelezionato && fornitoreSelezionato && quantita && (
          <div style={styles.acquistoPreview}>
            <div style={styles.acquistoPreviewLabel}>Anteprima:</div>
            <div style={styles.acquistoPreviewRow}>
              <span>{materialeSelezionato.nome}</span>
              <span>{quantita} {materialeSelezionato.unita_misura}</span>
              <span>×</span>
              <span>
                €{(fornitoreSelezionato === 'Altro' ? parseFloat(prezzoCustom || 0) : parseFloat(fornitoreSelezionato.prezzo)).toFixed(2)}
              </span>
              <span>=</span>
              <strong style={styles.acquistoPreviewTotal}>
                €{(parseFloat(quantita) * (fornitoreSelezionato === 'Altro' ? parseFloat(prezzoCustom || 0) : parseFloat(fornitoreSelezionato.prezzo))).toFixed(2)}
              </strong>
            </div>
          </div>
        )}

        <div style={styles.formActions}>
          <button type="button" onClick={onClose} style={styles.secondaryButton}>
            Annulla
          </button>
          <button type="submit" style={styles.primaryButton}>
            Aggiungi
          </button>
        </div>
      </form>
    </div>
  );
}

// ========== STYLES ==========
const styles = {
  // Global
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
  },

  // ===== Successo/errore generici =====
  successBox: {
    background: '#ecfdf5',
    color: '#065f46',
    border: '1px solid #a7f3d0',
    padding: '12px 16px',
    borderRadius: 'var(--radius-md)',
    marginBottom: '20px',
    fontSize: '14px',
    fontWeight: '500',
  },

  // ===== Login: brand + role switcher =====
  loginBrand: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  loginEmoji: {
    fontSize: '52px',
    marginBottom: '12px',
    display: 'block',
  },
  loginLogo: {
    height: '64px',
    width: 'auto',
    margin: '0 auto 12px',
    display: 'block',
    objectFit: 'contain',
  },
  roleSwitcher: {
    display: 'flex',
    background: '#f3f4f6',
    borderRadius: 'var(--radius-md)',
    padding: '4px',
    marginBottom: '12px',
    gap: '4px',
  },
  roleSwitchBtn: {
    flex: 1,
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'calc(var(--radius-md) - 4px)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    color: 'var(--color-muted)',
    transition: 'all 0.15s',
  },
  roleSwitchBtnActive: {
    background: 'white',
    color: 'var(--color-primary)',
    boxShadow: 'var(--shadow-sm)',
  },
  roleSwitchBtnActiveAdmin: {
    background: 'var(--color-text)',
    color: 'white',
    boxShadow: 'var(--shadow-sm)',
  },
  loginRoleHint: {
    fontSize: '13px',
    color: 'var(--color-muted)',
    textAlign: 'center',
    marginBottom: '20px',
    minHeight: '36px',
  },
  loginButtonAdmin: {
    background: 'linear-gradient(135deg, var(--color-text) 0%, #000 100%)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
  },
  loginFooter: {
    marginTop: '24px',
    textAlign: 'center',
    color: 'var(--color-muted)',
    fontSize: '12px',
  },

  // ===== Sidebar update (brand area + avatar) =====
  sidebarBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
  },
  sidebarLogo: {
    height: '36px',
    width: 'auto',
    objectFit: 'contain',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
    padding: '4px',
  },
  sidebarEmoji: {
    fontSize: '28px',
  },
  userAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--color-accent)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: '700',
    flexShrink: 0,
  },
  userRoleAdmin: {
    color: 'var(--color-accent)',
    fontWeight: '600',
  },

  // ===== App Container alternativo per dipendente =====
  appContainerDipendente: {
    // Stessa struttura, solo segnale visivo (non strettamente necessario)
  },

  // ===== Keep-alive badge (sidebar) =====
  keepAliveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px 14px',
    fontSize: '11px',
    color: '#94a3b8',
    cursor: 'help',
    userSelect: 'none',
  },
  keepAliveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    boxShadow: '0 0 6px currentColor',
    animation: 'pulse 2s ease-in-out infinite',
    flexShrink: 0,
  },
  keepAliveText: {
    fontSize: '11px',
    letterSpacing: '0.3px',
  },

  // ===== Dashboard =====
  dashboardHeader: {
    marginBottom: '28px',
  },
  dashboardSubtitle: {
    color: 'var(--color-muted)',
    fontSize: '14px',
    marginTop: '6px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginBottom: '28px',
  },
  kpiCard: {
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px',
    boxShadow: 'var(--shadow-md)',
    borderTop: '4px solid var(--color-primary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  kpiIcon: {
    fontSize: '24px',
    marginBottom: '6px',
  },
  kpiLabel: {
    fontSize: '13px',
    color: 'var(--color-muted)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-text)',
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.1,
  },
  kpiHint: {
    fontSize: '12px',
    color: 'var(--color-muted)',
    marginTop: '4px',
  },
  dashboardTwoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '20px',
    marginBottom: '28px',
  },
  dashCard: {
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    boxShadow: 'var(--shadow-md)',
    border: '1px solid var(--color-border)',
  },
  dashCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--color-border)',
  },
  dashCardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-text)',
    margin: 0,
  },
  dashRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderBottom: '1px solid #f3f4f6',
    fontSize: '14px',
  },
  dashRowRank: {
    fontWeight: '700',
    color: 'var(--color-muted)',
    minWidth: '32px',
  },
  dashRowName: {
    flex: 1,
    color: 'var(--color-text)',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dashRowMeta: {
    color: 'var(--color-muted)',
    fontSize: '12px',
  },
  dashRowAmount: {
    fontWeight: '700',
    color: 'var(--color-primary)',
    minWidth: '80px',
    textAlign: 'right',
  },
  emptyState: {
    padding: '24px',
    textAlign: 'center',
    color: 'var(--color-muted)',
    fontSize: '14px',
  },
  linkButton: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-primary)',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    padding: 0,
  },
  quickActions: {
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    boxShadow: 'var(--shadow-md)',
    border: '1px solid var(--color-border)',
  },
  quickActionsTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--color-text)',
    marginBottom: '14px',
  },
  quickActionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
  },
  quickActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    background: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--color-text)',
    transition: 'all 0.15s',
  },
  quickActionIcon: {
    fontSize: '20px',
  },
  quickActionLabel: {
    flex: 1,
    textAlign: 'left',
  },

  // ===== Configurazione page =====
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    background: 'var(--color-card)',
    padding: '6px',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-sm)',
    width: 'fit-content',
    flexWrap: 'wrap',
  },
  tabBtn: {
    padding: '10px 18px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--color-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabBtnActive: {
    background: 'var(--color-primary)',
    color: 'white',
    fontWeight: '600',
  },
  configForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  configCard: {
    background: 'var(--color-card)',
    borderRadius: 'var(--radius-lg)',
    padding: '28px',
    boxShadow: 'var(--shadow-md)',
    border: '1px solid var(--color-border)',
  },
  configCardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--color-text)',
    marginBottom: '6px',
  },
  configCardHint: {
    fontSize: '13px',
    color: 'var(--color-muted)',
    marginBottom: '20px',
  },
  configActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '8px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  brandPreview: {
    marginTop: '20px',
    padding: '20px',
    background: 'var(--color-bg)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    border: '1px dashed var(--color-border)',
  },
  brandPreviewLabel: {
    fontSize: '12px',
    color: 'var(--color-muted)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginRight: '8px',
  },
  brandPreviewLogo: {
    height: '40px',
    width: 'auto',
    objectFit: 'contain',
  },
  brandPreviewEmoji: {
    fontSize: '32px',
  },
  brandPreviewName: {
    fontWeight: '700',
    fontSize: '16px',
    color: 'var(--color-text)',
  },
  brandPreviewSub: {
    fontSize: '13px',
    color: 'var(--color-muted)',
  },
  colorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '14px',
    marginBottom: '20px',
  },
  colorField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  colorInputRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  colorPicker: {
    width: '50px',
    height: '40px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    padding: '2px',
  },
  themePresets: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '20px',
    alignItems: 'center',
  },
  themePresetsLabel: {
    fontSize: '13px',
    color: 'var(--color-muted)',
    fontWeight: '500',
    marginRight: '6px',
  },
  presetBtn: {
    padding: '8px 14px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'white',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
  },
  labelsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '14px',
  },
  labelKey: {
    display: 'inline-block',
    fontFamily: 'monospace',
    fontSize: '12px',
    background: 'var(--color-bg)',
    padding: '2px 6px',
    borderRadius: '4px',
    marginRight: '8px',
  },
  labelDefault: {
    fontSize: '11px',
    color: 'var(--color-muted)',
    fontWeight: '400',
    fontStyle: 'italic',
  },
  loader: {
    width: '50px',
    height: '50px',
    border: '5px solid rgba(255,255,255,0.3)',
    borderTop: '5px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  
  // Login Page
  loginContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    padding: '20px',
  },
  loginBox: {
    background: 'white',
    borderRadius: '16px',
    padding: '40px 36px',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
  },
  loginTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-text)',
    marginBottom: '6px',
    textAlign: 'center',
  },
  loginSubtitle: {
    color: 'var(--color-muted)',
    textAlign: 'center',
    marginBottom: '4px',
    fontSize: '14px',
  },
  loginForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  loginButton: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: 'var(--radius-md)',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
  },
  loginHint: {
    marginTop: '20px',
    textAlign: 'center',
    color: 'var(--color-muted)',
  },

  // App Layout
  appContainer: {
    display: 'flex',
    height: '100vh',
    background: 'var(--color-bg)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  
  // Sidebar
  sidebar: {
    width: '280px',
    background: 'linear-gradient(180deg, var(--color-sidebar-from) 0%, var(--color-sidebar-to) 100%)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
  },
  sidebarHeader: {
    padding: '30px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  sidebarTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '20px',
    color: 'white',
    fontWeight: '700',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 'var(--radius-md)',
  },
  userName: {
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: 1.2,
  },
  userRole: {
    color: '#cbd5e1',
    fontSize: '12px',
    opacity: '0.85',
    marginTop: '2px',
  },
  nav: {
    flex: 1,
    padding: '20px 0',
  },
  navItem: {
    width: '100%',
    padding: '14px 24px',
    background: 'transparent',
    border: 'none',
    color: '#ecf0f1',
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    transition: 'all 0.2s',
    textAlign: 'left',
  },
  navItemActive: {
    background: 'rgba(255,255,255,0.1)',
    borderLeft: '4px solid var(--color-accent)',
    color: 'white',
    fontWeight: '600',
  },
  navIcon: {
    fontSize: '20px',
  },
  logoutButton: {
    margin: '20px 24px',
    padding: '12px 24px',
    background: 'rgba(231, 76, 60, 0.2)',
    border: '1px solid rgba(231, 76, 60, 0.4)',
    borderRadius: '8px',
    color: '#e74c3c',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Main Content
  mainContent: {
    flex: 1,
    overflow: 'auto',
    background: 'var(--color-bg)',
  },
  pageContainer: {
    padding: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
  },
  pageTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '36px',
    color: '#1a1a1a',
    fontWeight: '700',
  },

  // Buttons
  primaryButton: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    color: 'white',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
  },
  secondaryButton: {
    background: '#f0f2f5',
    color: '#495057',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editButton: {
    background: 'linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%)',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '10px 14px',
    marginRight: '8px',
    borderRadius: '10px',
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(253, 203, 110, 0.3)',
  },
  deleteButton: {
    background: 'linear-gradient(135deg, #ff7675 0%, #d63031 100%)',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '10px 14px',
    borderRadius: '10px',
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(214, 48, 49, 0.3)',
  },
  smallButton: {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(102, 126, 234, 0.3)',
    transition: 'all 0.2s',
  },
  removeButton: {
    background: 'linear-gradient(135deg, #fab1a0 0%, #ff7675 100%)',
    border: 'none',
    padding: '10px 14px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(255, 118, 117, 0.3)',
  },

  // Forms
  formGroup: {
    marginBottom: '20px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    color: '#1a1a1a',
    fontSize: '14px',
    fontWeight: '600',
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  labelHelper: {
    fontSize: '12px',
    fontWeight: '400',
    color: '#999',
    marginLeft: '8px',
  },
  helpText: {
    display: 'block',
    marginTop: '6px',
    fontSize: '12px',
    color: '#999',
    fontStyle: 'italic',
  },
  porzioniInfo: {
    background: '#e3f2fd',
    border: '2px solid #2196f3',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#1565c0',
    marginBottom: '16px',
  },
  porzioniLabel: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '8px',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '14px 18px',
    border: '2px solid #e1e8ed',
    borderRadius: '12px',
    fontSize: '15px',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    background: '#fafbfc',
  },
  form: {
    padding: '32px',
    maxHeight: 'calc(90vh - 180px)',
    overflowY: 'auto',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '32px',
    paddingTop: '24px',
    borderTop: '2px solid #f0f2f5',
  },

  // Table
  table: {
    background: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1.5fr 1fr',
    padding: '16px 24px',
    background: '#f8f9fa',
    fontWeight: '600',
    fontSize: '14px',
    color: '#495057',
    borderBottom: '2px solid #e9ecef',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1.5fr 1fr',
    padding: '16px 24px',
    borderBottom: '1px solid #e9ecef',
    alignItems: 'center',
  },
  tableCell: {
    fontSize: '15px',
    color: '#1a1a1a',
  },

  // Modal
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(8px)',
    animation: 'fadeIn 0.2s ease-out',
  },
  modalContent: {
    background: 'white',
    borderRadius: '24px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'hidden',
    boxShadow: '0 25px 80px rgba(102, 126, 234, 0.3), 0 10px 30px rgba(0,0,0,0.2)',
    animation: 'slideUp 0.3s ease-out',
    border: '1px solid rgba(255,255,255,0.8)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '28px 32px',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    color: 'white',
  },
  modalTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '26px',
    color: 'white',
    fontWeight: '700',
    margin: 0,
  },
  closeButton: {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: 'white',
    padding: '8px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    fontWeight: 'bold',
  },

  // Cards
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '24px',
  },
  listinoCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  
  // Listino Card Compatta (collassabile)
  listinoCardCompact: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    border: '2px solid transparent',
  },
  listinoCardExpanded: {
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    border: '2px solid #667eea',
  },
  listinoCardCompactHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listinoCardCompactInfo: {
    flex: 1,
  },
  listinoCardCompactTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  listinoCardCompactDetails: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  listinoCardCompactPrice: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  listinoCardCompactMargine: {
    fontSize: '14px',
    fontWeight: '600',
  },
  listinoExpandButton: {
    background: '#f0f2f5',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-primary)',
    transition: 'all 0.2s',
  },
  listinoCardExpandedContent: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '2px solid #f0f2f5',
  },
  
  listinoCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
  },
  listinoCardTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  listinoCardPrice: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  porzioniInfo: {
    background: '#e3f2fd',
    border: '2px solid #2196f3',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#1565c0',
    marginTop: '12px',
    marginBottom: '12px',
  },
  ingredientiSection: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e9ecef',
  },
  ingredientiLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
    marginBottom: '8px',
  },
  ingredientiList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  ingredienteItem: {
    fontSize: '14px',
    color: '#1a1a1a',
    padding: '4px 0',
  },

  // Ingredienti Row
  ingredienteRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    alignItems: 'center',
  },

  // Fatture
  fattureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fatturaCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  fatturaHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '2px solid #e9ecef',
  },
  fatturaId: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '4px',
  },
  fatturaDate: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '4px',
  },
  fatturaDipendente: {
    fontSize: '13px',
    color: '#999',
  },
  fatturaTotal: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  fatturaDettagli: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  fatturaDettaglioRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 0.5fr 1fr 1fr',
    gap: '16px',
    fontSize: '15px',
    color: '#1a1a1a',
    alignItems: 'center',
  },
  fatturaDettaglioTotal: {
    fontWeight: '600',
    textAlign: 'right',
  },
  fatturaNote: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e9ecef',
    fontSize: '14px',
    color: '#666',
    fontStyle: 'italic',
  },
  fatturaItemRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    alignItems: 'center',
  },
  itemTotal: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--color-primary)',
    minWidth: '80px',
    textAlign: 'right',
  },
  totalSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    background: '#f8f9fa',
    borderRadius: '8px',
    marginTop: '20px',
  },
  totalLabel: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalAmount: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },

  // Misc
  roleBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    background: '#e0e7ff',
    color: 'var(--color-primary)',
  },
  errorBox: {
    background: '#fee',
    color: '#c33',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#999',
    fontSize: '16px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '16px',
    color: '#999',
  },
  
  // Listini Materiali Styles
  ranchContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  
  // Card Compatta (default)
  ranchCardCompact: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    border: '2px solid transparent',
  },
  ranchCardExpanded: {
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    border: '2px solid #667eea',
  },
  ranchCardCompactHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ranchCardCompactInfo: {
    flex: 1,
  },
  ranchCardCompactTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  ranchCardCompactUnit: {
    fontSize: '14px',
    color: '#666',
    marginLeft: '8px',
    fontWeight: '500',
  },
  ranchCardCompactPrice: {
    fontSize: '15px',
    color: '#28a745',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  ranchCardPrezziCount: {
    fontSize: '13px',
    color: '#999',
    fontWeight: '400',
  },
  ranchCardNoPriceCompact: {
    fontSize: '14px',
    color: '#999',
    fontStyle: 'italic',
  },
  ranchCardCompactActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  expandButton: {
    background: '#f0f2f5',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--color-primary)',
    transition: 'all 0.2s',
  },
  
  // Contenuto Espanso
  ranchCardExpandedContent: {
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: '2px solid #f0f2f5',
  },
  
  // Vecchi stili mantenuti per retrocompatibilità
  ranchCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    transition: 'all 0.2s',
  },
  ranchCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    paddingBottom: '20px',
    borderBottom: '2px solid #f0f2f5',
  },
  ranchCardTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  ranchCardUnit: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500',
  },
  ranchCardNote: {
    fontSize: '13px',
    color: '#999',
    marginTop: '12px',
    fontStyle: 'italic',
  },
  ranchCardActions: {
    display: 'flex',
    gap: '8px',
  },
  ranchPrezziSection: {
    marginTop: '20px',
  },
  ranchPrezziHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  ranchPrezziTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  ranchPrezziList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  ranchPrezzoItem: {
    background: '#f8f9fa',
    borderRadius: '12px',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '2px solid #e9ecef',
    transition: 'all 0.2s',
  },
  ranchPrezzoMigliore: {
    background: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
    border: '2px solid #28a745',
    boxShadow: '0 4px 15px rgba(40, 167, 69, 0.2)',
  },
  ranchPrezzoInfo: {
    flex: 1,
  },
  ranchPrezzoVenditore: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  ranchBadgeMigliore: {
    background: '#28a745',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '700',
  },
  ranchPrezzoAmount: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-primary)',
    marginBottom: '6px',
  },
  ranchPrezzoNote: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '4px',
  },
  ranchPrezzoData: {
    fontSize: '12px',
    color: '#999',
  },
  ranchPrezzoActions: {
    display: 'flex',
    gap: '8px',
  },
  ranchNoPrezzi: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#999',
    fontSize: '15px',
    background: '#f8f9fa',
    borderRadius: '12px',
    border: '2px dashed #dee2e6',
  },
  ranchMaterialeInfo: {
    background: '#f0f2f5',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '15px',
    color: '#1a1a1a',
  },
  ranchMaterialeUnit: {
    color: '#666',
    marginLeft: '8px',
    fontSize: '14px',
  },
  
  // Costo Produzione Styles
  costoProduzione: {
    background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
    borderRadius: '12px',
    padding: '16px 20px',
    marginTop: '16px',
    marginBottom: '16px',
    border: '2px solid #dee2e6',
  },
  costoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  costoLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500',
  },
  costoValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  margineBar: {
    marginTop: '12px',
    height: '8px',
    background: '#e9ecef',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  margineBarFill: {
    height: '100%',
    transition: 'width 0.3s ease',
    borderRadius: '4px',
  },
  costoWarning: {
    background: '#fff3cd',
    border: '2px solid #ffc107',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#856404',
    marginTop: '12px',
  },
  ingredienteWarning: {
    fontSize: '12px',
    color: '#dc3545',
    marginLeft: '8px',
    fontWeight: '600',
  },
  
  // Acquisti Styles
  acquistoContainer: {
    background: 'white',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  acquistoTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  acquistoTableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 80px',
    gap: '16px',
    padding: '16px 20px',
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)',
    borderRadius: '12px',
    fontWeight: '700',
    fontSize: '14px',
    color: 'white',
  },
  acquistoTableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 80px',
    gap: '16px',
    padding: '16px 20px',
    background: '#f8f9fa',
    borderRadius: '12px',
    alignItems: 'center',
    transition: 'all 0.2s',
    border: '2px solid transparent',
  },
  acquistoTableCell: {
    fontSize: '14px',
    color: '#1a1a1a',
  },
  acquistoUnitaBadge: {
    marginLeft: '8px',
    fontSize: '12px',
    color: '#999',
  },
  acquistoFornitoreAltro: {
    background: '#ffc107',
    color: '#856404',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '700',
  },
  acquistoPrezzoTotale: {
    fontSize: '16px',
    color: '#28a745',
  },
  acquistoTotale: {
    marginTop: '32px',
    paddingTop: '24px',
    borderTop: '3px solid #e9ecef',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  acquistoTotaleLabel: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  acquistoTotaleValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'var(--color-primary)',
  },
  acquistoEmpty: {
    textAlign: 'center',
    padding: '80px 20px',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  acquistoEmptyIcon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  acquistoEmptyTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '12px',
  },
  acquistoEmptyText: {
    fontSize: '16px',
    color: '#999',
  },
  acquistoFormContainer: {
    background: 'white',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    marginBottom: '24px',
  },
  acquistoFormHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '20px',
    borderBottom: '2px solid #f0f2f5',
  },
  acquistoFormTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  acquistoForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  acquistoPreview: {
    background: 'linear-gradient(135deg, #e3f2fd 0%, #e8eaf6 100%)',
    border: '2px solid #667eea',
    borderRadius: '12px',
    padding: '16px 20px',
  },
  acquistoPreviewLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-primary)',
    marginBottom: '8px',
  },
  acquistoPreviewRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    fontSize: '16px',
    color: '#1a1a1a',
  },
  acquistoPreviewTotal: {
    fontSize: '20px',
    color: '#28a745',
  },
};

// CSS Animation for loader
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');

  /* ===== Theme variables — sovrascritte runtime dalla config Direttore ===== */
  :root {
    --color-primary: #2563eb;
    --color-secondary: #1e40af;
    --color-accent: #f59e0b;
    --color-bg: #f5f7fa;
    --color-sidebar-from: #1e293b;
    --color-sidebar-to: #0f172a;
    --color-text: #1a1a1a;
    --color-success: #10b981;
    --color-danger: #ef4444;
    --color-warning: #f59e0b;
    --color-card: #ffffff;
    --color-border: #e5e7eb;
    --color-muted: #6b7280;
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.06);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.10);
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  button {
    font-family: inherit;
  }
  
  button:hover {
    transform: translateY(-2px);
    filter: brightness(1.05);
  }
  
  button:active {
    transform: translateY(0);
  }
  
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: var(--color-primary) !important;
    background: white !important;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
  }
  
  .listinoCard:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }
  
  /* Scrollbar personalizzata */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
    border-radius: 10px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, var(--color-secondary) 0%, var(--color-primary) 100%);
  }
  
  /* Effetto hover per close button */
  .closeButton:hover {
    background: rgba(255,255,255,0.3) !important;
    transform: rotate(90deg) !important;
  }
  
  /* Animazione per ingredienti row */
  .ingredienteRow {
    animation: slideUp 0.2s ease-out;
  }
  
  /* Effetto per edit/delete buttons */
  .editButton:hover {
    transform: scale(1.1) !important;
  }
  
  .deleteButton:hover {
    transform: scale(1.1) !important;
  }
  
  /* Input con effetto */
  input, select, textarea {
    transition: all 0.2s ease !important;
  }
  
  input:hover, select:hover, textarea:hover {
    border-color: var(--color-primary) !important;
  }
`;
document.head.appendChild(styleSheet);
