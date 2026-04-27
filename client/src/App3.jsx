import React, { useState, useEffect, useCallback } from 'react';

// ========== CONFIGURAZIONE ==========
const API_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV ==='http://localhost:3000');

// ========== UTILITIES ==========
const fetchAPI = async (url, options = {}) => {
  const hasBody = options.body !== undefined && options.body !== null;

  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data = null;

  try {
    if (response.status !== 204) {
      data = isJson ? await response.json() : await response.text();
    }
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMessage =
      (typeof data === 'object' && data?.error) ||
      (typeof data === 'string' && data) ||
      'Errore del server';
    throw new Error(errorMessage);
  }

  return data;
};

const pagePermissions = {
  listino: ['Direttore', 'Dipendente'],
  fatture: ['Direttore', 'Dipendente'],
  piatti: ['Direttore'],
  dipendenti: ['Direttore'],
};

const canAccessPage = (page, role) => {
  return pagePermissions[page]?.includes(role);
};

const formatCurrency = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
};

const safeDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data non valida'
    : date.toLocaleString('it-IT');
};

// ========== APP PRINCIPALE ==========
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('listino');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const styleId = 'ristorante-global-styles';

    if (document.getElementById(styleId)) return;

    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600;700&display=swap');

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
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
        border-color: #667eea !important;
        background: white !important;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
      }

      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      ::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 10px;
      }

      ::-webkit-scrollbar-thumb {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 10px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%);
      }

      .listinoCardHover:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      }

      .closeButton:hover {
        background: rgba(255,255,255,0.3) !important;
        transform: rotate(90deg) !important;
      }

      .ingredienteRow {
        animation: slideUp 0.2s ease-out;
      }

      .editButton:hover,
      .deleteButton:hover {
        transform: scale(1.1) !important;
      }

      input, select, textarea {
        transition: all 0.2s ease !important;
      }

      input:hover, select:hover, textarea:hover {
        border-color: #667eea !important;
      }
    `;
    document.head.appendChild(styleSheet);

    return () => {
      const styleEl = document.getElementById(styleId);
      if (styleEl) styleEl.remove();
    };
  }, []);

  const checkAuth = async () => {
    try {
      const data = await fetchAPI('/api/me');
      setUser(data);
      setCurrentPage('listino');
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (nome, password) => {
    const data = await fetchAPI('/api/login', {
      method: 'POST',
      body: JSON.stringify({ nome, password }),
    });

    setUser(data);
    setCurrentPage('listino');
  };

  const handleLogout = async () => {
    try {
      await fetchAPI('/api/logout', { method: 'POST' });
    } catch (error) {
      alert(`Logout non riuscito: ${error.message}`);
    } finally {
      setUser(null);
      setCurrentPage('listino');
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loader}></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const safeCurrentPage = canAccessPage(currentPage, user.ruolo)
    ? currentPage
    : 'listino';

  return (
    <div style={styles.appContainer}>
      <Sidebar
        user={user}
        currentPage={safeCurrentPage}
        onNavigate={setCurrentPage}
        onLogout={handleLogout}
      />
      <MainContent currentPage={safeCurrentPage} user={user} />
    </div>
  );
}

// ========== LOGIN PAGE ==========
function LoginPage({ onLogin }) {
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onLogin(nome, password);
    } catch (err) {
      setError(err.message || 'Errore durante il login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.loginContainer}>
      <div style={styles.loginBox}>
        <h1 style={styles.loginTitle}>Gestione Ristorante</h1>
        <p style={styles.loginSubtitle}>Accedi al sistema</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.loginForm}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={styles.input}
              required
              autoFocus
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
            />
          </div>

          <button type="submit" style={styles.loginButton} disabled={loading}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ========== SIDEBAR ==========
function Sidebar({ user, currentPage, onNavigate, onLogout }) {
  const menuItems = [
    { id: 'listino', label: 'Listino', icon: '📋', allowed: ['Direttore', 'Dipendente'] },
    { id: 'fatture', label: 'Fatture', icon: '🧾', allowed: ['Direttore', 'Dipendente'] },
    { id: 'piatti', label: 'Gestione Piatti', icon: '🍝', allowed: ['Direttore'] },
    { id: 'dipendenti', label: 'Gestione Dipendenti', icon: '👥', allowed: ['Direttore'] },
  ];

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <h2 style={styles.sidebarTitle}>🍴 Ristorante</h2>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{user.nome}</span>
          <span style={styles.userRole}>{user.ruolo}</span>
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
    </div>
  );
}

// ========== MAIN CONTENT ==========
function MainContent({ currentPage, user }) {
  if (!canAccessPage(currentPage, user.ruolo)) {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.emptyState}>Non hai accesso a questa sezione.</div>
      </div>
    );
  }

  return (
    <div style={styles.mainContent}>
      {currentPage === 'listino' && <ListinoPage />}
      {currentPage === 'fatture' && <FatturePage />}
      {currentPage === 'piatti' && <GestionePiattiPage />}
      {currentPage === 'dipendenti' && <GestioneDipendentiPage />}
    </div>
  );
}

// ========== LISTINO PAGE ==========
function ListinoPage() {
  const [piatti, setPiatti] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPiatti = useCallback(async () => {
    try {
      const data = await fetchAPI('/api/piatti');
      setPiatti(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Errore caricamento piatti:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPiatti();
  }, [loadPiatti]);

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <h1 style={styles.pageTitle}>📋 Listino Piatti</h1>

      <div style={styles.cardGrid}>
        {piatti.map((piatto) => (
          <div key={piatto.id} style={styles.listinoCard} className="listinoCardHover">
            <div style={styles.listinoCardHeader}>
              <h3 style={styles.listinoCardTitle}>{piatto.nome}</h3>
              <span style={styles.listinoCardPrice}>€{formatCurrency(piatto.prezzo)}</span>
            </div>

            {Array.isArray(piatto.ingredienti) && piatto.ingredienti.length > 0 && (
              <div style={styles.ingredientiSection}>
                <p style={styles.ingredientiLabel}>Ingredienti necessari:</p>
                <ul style={styles.ingredientiList}>
                  {piatto.ingredienti.map((ing, idx) => (
                    <li key={idx} style={styles.ingredienteItem}>
                      {ing.nome_ingrediente} - {ing.quantita}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
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

  const loadPiatti = useCallback(async () => {
    try {
      const data = await fetchAPI('/api/piatti');
      setPiatti(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Errore caricamento piatti:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPiatti();
  }, [loadPiatti]);

  const handleDelete = async (id) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo piatto?')) return;

    try {
      await fetchAPI(`/api/piatti/${id}`, { method: 'DELETE' });
      await loadPiatti();
    } catch (error) {
      alert(`Errore: ${error.message}`);
    }
  };

  const handleEdit = (piatto) => {
    setEditingPiatto(piatto);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingPiatto(null);
    setShowForm(true);
  };

  const handleFormClose = async (shouldReload = true) => {
    setShowForm(false);
    setEditingPiatto(null);
    if (shouldReload) {
      await loadPiatti();
    }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>🍝 Gestione Piatti</h1>
        <button onClick={handleCreate} style={styles.primaryButton}>
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
        <div style={styles.tableHeaderPiatti}>
          <div style={styles.tableCell}>Nome</div>
          <div style={styles.tableCell}>Prezzo</div>
          <div style={styles.tableCell}>Ingredienti</div>
          <div style={styles.tableCell}>Azioni</div>
        </div>

        {piatti.map((piatto) => (
          <div key={piatto.id} style={styles.tableRowPiatti}>
            <div style={styles.tableCell}>{piatto.nome}</div>
            <div style={styles.tableCell}>€{formatCurrency(piatto.prezzo)}</div>
            <div style={styles.tableCell}>
              {Array.isArray(piatto.ingredienti) ? piatto.ingredienti.length : 0} ingredienti
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
  const [nome, setNome] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [ingredienti, setIngredienti] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setNome(piatto?.nome || '');
    setPrezzo(
      piatto?.prezzo !== undefined && piatto?.prezzo !== null
        ? String(piatto.prezzo)
        : ''
    );
    setIngredienti(Array.isArray(piatto?.ingredienti) ? piatto.ingredienti : []);
  }, [piatto]);

  const addIngrediente = () => {
    setIngredienti((prev) => [...prev, { nome_ingrediente: '', quantita: '' }]);
  };

  const removeIngrediente = (index) => {
    setIngredienti((prev) => prev.filter((_, i) => i !== index));
  };

  const updateIngrediente = (index, field, value) => {
    setIngredienti((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const prezzoNumerico = Number(prezzo);
    if (!Number.isFinite(prezzoNumerico) || prezzoNumerico < 0) {
      alert('Inserisci un prezzo valido');
      return;
    }

    setLoading(true);

    try {
      const body = {
        nome: nome.trim(),
        prezzo: prezzoNumerico,
        ingredienti: ingredienti.filter(
          (ing) => ing.nome_ingrediente?.trim() && ing.quantita?.trim()
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

      await onClose(true);
    } catch (error) {
      alert(`Errore: ${error.message}`);
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
          <button
            onClick={() => onClose(false)}
            style={styles.closeButton}
            className="closeButton"
          >
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
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Prezzo (€) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={prezzo}
              onChange={(e) => setPrezzo(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <div style={styles.labelRow}>
              <label style={styles.label}>Ingredienti</label>
              <button
                type="button"
                onClick={addIngrediente}
                style={styles.smallButton}
              >
                + Aggiungi
              </button>
            </div>

            {ingredienti.map((ing, index) => (
              <div
                key={index}
                style={styles.ingredienteRow}
                className="ingredienteRow"
              >
                <input
                  type="text"
                  placeholder="Nome ingrediente"
                  value={ing.nome_ingrediente}
                  onChange={(e) =>
                    updateIngrediente(index, 'nome_ingrediente', e.target.value)
                  }
                  style={{ ...styles.input, flex: 2 }}
                />
                <input
                  type="text"
                  placeholder="Quantità"
                  value={ing.quantita}
                  onChange={(e) =>
                    updateIngrediente(index, 'quantita', e.target.value)
                  }
                  style={{ ...styles.input, flex: 1 }}
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
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={() => onClose(false)}
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

  const loadDipendenti = useCallback(async () => {
    try {
      const data = await fetchAPI('/api/dipendenti');
      setDipendenti(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Errore caricamento dipendenti:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDipendenti();
  }, [loadDipendenti]);

  const handleDelete = async (id) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo dipendente?')) return;

    try {
      await fetchAPI(`/api/dipendenti/${id}`, { method: 'DELETE' });
      await loadDipendenti();
    } catch (error) {
      alert(`Errore: ${error.message}`);
    }
  };

  const handleEdit = (dipendente) => {
    setEditingDipendente(dipendente);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingDipendente(null);
    setShowForm(true);
  };

  const handleFormClose = async (shouldReload = true) => {
    setShowForm(false);
    setEditingDipendente(null);
    if (shouldReload) {
      await loadDipendenti();
    }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>👥 Gestione Dipendenti</h1>
        <button onClick={handleCreate} style={styles.primaryButton}>
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
        <div style={styles.tableHeaderDipendenti}>
          <div style={styles.tableCell}>Nome</div>
          <div style={styles.tableCell}>Ruolo</div>
          <div style={styles.tableCell}>Azioni</div>
        </div>

        {dipendenti.map((dipendente) => (
          <div key={dipendente.id} style={styles.tableRowDipendenti}>
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
  const [nome, setNome] = useState('');
  const [ruolo, setRuolo] = useState('Dipendente');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setNome(dipendente?.nome || '');
    setRuolo(dipendente?.ruolo || 'Dipendente');
    setPassword('');
  }, [dipendente]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!dipendente && !password.trim()) {
      alert('La password è obbligatoria per un nuovo dipendente');
      return;
    }

    setLoading(true);

    try {
      const body = {
        nome: nome.trim(),
        ruolo,
        ...(password.trim() ? { password } : {}),
      };

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

      await onClose(true);
    } catch (error) {
      alert(`Errore: ${error.message}`);
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
          <button
            onClick={() => onClose(false)}
            style={styles.closeButton}
            className="closeButton"
          >
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
              onClick={() => onClose(false)}
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

  const loadData = useCallback(async () => {
    try {
      const [fattureData, piattiData] = await Promise.all([
        fetchAPI('/api/fatture'),
        fetchAPI('/api/piatti'),
      ]);

      setFatture(Array.isArray(fattureData) ? fattureData : []);
      setPiatti(Array.isArray(piattiData) ? piattiData : []);
    } catch (error) {
      console.error('Errore caricamento dati:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFormClose = async (shouldReload = true) => {
    setShowForm(false);
    if (shouldReload) {
      await loadData();
    }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <h1 style={styles.pageTitle}>🧾 Fatture</h1>
        <button onClick={() => setShowForm(true)} style={styles.primaryButton}>
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
                  {safeDateTime(fattura.data)}
                </div>
                <div style={styles.fatturaDipendente}>
                  Creata da: {fattura.dipendente_nome}
                </div>
              </div>
              <div style={styles.fatturaTotal}>
                €{formatCurrency(fattura.totale)}
              </div>
            </div>

            <div style={styles.fatturaDettagli}>
              {(Array.isArray(fattura.dettagli) ? fattura.dettagli : []).map((det, idx) => (
                <div key={idx} style={styles.fatturaDettaglioRow}>
                  <span>{det.nome_piatto}</span>
                  <span>x{det.quantita}</span>
                  <span>€{formatCurrency(det.prezzo_unitario)}</span>
                  <span style={styles.fatturaDettaglioTotal}>
                    €{formatCurrency(Number(det.quantita) * Number(det.prezzo_unitario))}
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
    setItems((prev) => [
      ...prev,
      { piatto_id: '', nome_piatto: '', prezzo_unitario: 0, quantita: 1 },
    ]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        if (field === 'piatto_id') {
          const piatto = piatti.find((p) => String(p.id) === String(value));
          if (!piatto) {
            return {
              ...item,
              piatto_id: '',
              nome_piatto: '',
              prezzo_unitario: 0,
            };
          }

          return {
            ...item,
            piatto_id: piatto.id,
            nome_piatto: piatto.nome,
            prezzo_unitario: Number(piatto.prezzo) || 0,
          };
        }

        if (field === 'quantita') {
          return {
            ...item,
            quantita: Math.max(1, Number(value) || 1),
          };
        }

        return {
          ...item,
          [field]: value,
        };
      })
    );
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => {
      const quantita = Number(item.quantita) || 0;
      const prezzo = Number(item.prezzo_unitario) || 0;
      return sum + quantita * prezzo;
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (items.length === 0) {
      alert('Aggiungi almeno un piatto alla fattura');
      return;
    }

    const invalidItem = items.find(
      (item) => !item.piatto_id || !Number.isFinite(Number(item.quantita)) || Number(item.quantita) < 1
    );

    if (invalidItem) {
      alert('Controlla i piatti selezionati e le quantità');
      return;
    }

    setLoading(true);

    try {
      const body = {
        dettagli: items.map((item) => ({
          piatto_id: Number(item.piatto_id),
          nome_piatto: item.nome_piatto,
          quantita: Number(item.quantita),
          prezzo_unitario: Number(item.prezzo_unitario),
        })),
        note: note.trim(),
      };

      await fetchAPI('/api/fatture', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      await onClose(true);
    } catch (error) {
      alert(`Errore: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.modal}>
      <div style={{ ...styles.modalContent, maxWidth: '700px' }}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuova Fattura</h2>
          <button
            onClick={() => onClose(false)}
            style={styles.closeButton}
            className="closeButton"
          >
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
                      {piatto.nome} - €{formatCurrency(piatto.prezzo)}
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
                  €{formatCurrency(Number(item.quantita) * Number(item.prezzo_unitario))}
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
            <span style={styles.totalAmount}>€{formatCurrency(calculateTotal())}</span>
          </div>

          <div style={styles.formActions}>
            <button
              type="button"
              onClick={() => onClose(false)}
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

// ========== STYLES ==========
const styles = {
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  loader: {
    width: '50px',
    height: '50px',
    border: '5px solid rgba(255,255,255,0.3)',
    borderTop: '5px solid white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  loginContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  loginBox: {
    background: 'white',
    borderRadius: '20px',
    padding: '50px 40px',
    maxWidth: '400px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  loginTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '32px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '8px',
    textAlign: 'center',
  },
  loginSubtitle: {
    color: '#666',
    textAlign: 'center',
    marginBottom: '30px',
    fontSize: '16px',
  },
  loginForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  loginButton: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },

  appContainer: {
    display: 'flex',
    height: '100vh',
    background: '#f5f7fa',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  sidebar: {
    width: '280px',
    background: 'linear-gradient(180deg, #2c3e50 0%, #34495e 100%)',
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
    fontSize: '24px',
    color: 'white',
    marginBottom: '16px',
    fontWeight: '700',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  userName: {
    color: 'white',
    fontSize: '15px',
    fontWeight: '600',
  },
  userRole: {
    color: '#ecf0f1',
    fontSize: '13px',
    opacity: '0.8',
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
    borderLeft: '4px solid #3498db',
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

  mainContent: {
    flex: 1,
    overflow: 'auto',
    background: '#f5f7fa',
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
    gap: '16px',
    flexWrap: 'wrap',
  },
  pageTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '36px',
    color: '#1a1a1a',
    fontWeight: '700',
  },

  primaryButton: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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

  formGroup: {
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
    gap: '12px',
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
  },

  table: {
    background: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  tableHeaderPiatti: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1.5fr 1fr',
    padding: '16px 24px',
    background: '#f8f9fa',
    fontWeight: '600',
    fontSize: '14px',
    color: '#495057',
    borderBottom: '2px solid #e9ecef',
  },
  tableRowPiatti: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1.5fr 1fr',
    padding: '16px 24px',
    borderBottom: '1px solid #e9ecef',
    alignItems: 'center',
  },
  tableHeaderDipendenti: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    padding: '16px 24px',
    background: '#f8f9fa',
    fontWeight: '600',
    fontSize: '14px',
    color: '#495057',
    borderBottom: '2px solid #e9ecef',
  },
  tableRowDipendenti: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    padding: '16px 24px',
    borderBottom: '1px solid #e9ecef',
    alignItems: 'center',
  },
  tableCell: {
    fontSize: '15px',
    color: '#1a1a1a',
  },

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
    padding: '20px',
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
  listinoCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    gap: '12px',
  },
  listinoCardTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  listinoCardPrice: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#667eea',
    whiteSpace: 'nowrap',
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

  ingredienteRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
    alignItems: 'center',
  },

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
    gap: '16px',
    flexWrap: 'wrap',
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
    color: '#667eea',
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
    color: '#667eea',
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
    gap: '12px',
  },
  totalLabel: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalAmount: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#667eea',
  },

  roleBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    background: '#e0e7ff',
    color: '#667eea',
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
};
