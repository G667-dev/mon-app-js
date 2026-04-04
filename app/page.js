"use client";
import { useState, useEffect, useCallback, createContext, useContext } from "react";
 
// ─────────────────────────────────────────────
// UTILS — localStorage (safe)
// ─────────────────────────────────────────────
const STORAGE_KEY = "test_app_data";
 
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[TEST] localStorage read error:", e);
    return null;
  }
}
 
function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[TEST] localStorage write error:", e);
  }
}
 
// ─────────────────────────────────────────────
// UTILS — metabolism.js (calculs métaboliques)
// ─────────────────────────────────────────────
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  active: 1.55,
  very_active: 1.725,
};
 
const ACTIVITY_LABELS = {
  sedentary: "Sédentaire",
  lightly_active: "Légèrement actif",
  active: "Actif",
  very_active: "Très actif",
};
 
function calculateAge(birthdate) {
  if (!birthdate) return null;
  try {
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 10 && age <= 120 ? age : null;
  } catch {
    return null;
  }
}
 
function isProfileComplete(profile) {
  if (!profile || typeof profile !== "object") return false;
  const { name, birthdate, sex, height, weight, activity } = profile;
  if (!name || typeof name !== "string" || !name.trim()) return false;
  const age = calculateAge(birthdate);
  if (age === null) return false;
  if (!sex || (sex !== "male" && sex !== "female")) return false;
  if (!height || !Number.isFinite(height) || height < 80 || height > 260) return false;
  if (!weight || !Number.isFinite(weight) || weight < 20 || weight > 350) return false;
  if (!activity || !ACTIVITY_MULTIPLIERS[activity]) return false;
  return true;
}
 
function calculateBMR(profile) {
  if (!isProfileComplete(profile)) return null;
  const { weight, height, birthdate, sex } = profile;
  const age = calculateAge(birthdate);
  if (age === null) return null;
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}
 
function calculateTDEE(profile) {
  const bmr = calculateBMR(profile);
  if (bmr === null) return null;
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activity] || 1.2;
  return bmr * multiplier;
}
 
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
 
function getTodayMeals(meals) {
  if (!Array.isArray(meals)) return [];
  const today = getTodayKey();
  return meals.filter((m) => {
    if (!m || !m.date) return false;
    try {
      const d = new Date(m.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return key === today;
    } catch {
      return false;
    }
  });
}
 
// ─────────────────────────────────────────────
// UTILS — Historique (30 jours)
// ─────────────────────────────────────────────
const HISTORY_DAYS = 30;
 
function cleanOldMeals(meals) {
  if (!Array.isArray(meals)) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return meals.filter((m) => {
    if (!m || !m.date) return false;
    try {
      const d = new Date(m.date);
      return !isNaN(d.getTime()) && d >= cutoff;
    } catch {
      return false;
    }
  });
}
 
function getDateKey(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return null;
  }
}
 
function formatDateLabel(dateKey) {
  const today = getTodayKey();
  if (dateKey === today) return "Aujourd'hui";
 
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (dateKey === yKey) return "Hier";
 
  try {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const monthNames = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
    return `${dayNames[date.getDay()]} ${d} ${monthNames[date.getMonth()]}`;
  } catch {
    return dateKey;
  }
}
 
function groupMealsByDate(meals) {
  if (!Array.isArray(meals)) return [];
  const groups = {};
  meals.forEach((m) => {
    const key = getDateKey(m.date);
    if (!key) return;
    if (!groups[key]) groups[key] = { dateKey: key, label: formatDateLabel(key), meals: [] };
    groups[key].meals.push(m);
  });
  return Object.values(groups).sort((a, b) => (a.dateKey > b.dateKey ? -1 : 1));
}
 
// ─────────────────────────────────────────────
// CONTEXT — Global State
// ─────────────────────────────────────────────
const AppContext = createContext(null);
 
function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
 
const DEFAULT_STATE = {
  user: { name: "" },
  userProfile: {
    name: "",
    birthdate: "",
    sex: "",
    height: "",
    weight: "",
    activity: "",
  },
  dailyCalorieTarget: null,
  dailyProteinTarget: null,
  meals: [],
  savedMeals: [],
  programs: [],
  sessions: [],
  activeSession: null,
  customExercises: [],
  settings: { theme: "dark" },
};
 
function AppProvider({ children }) {
  const [state, setState] = useState(() => {
    const saved = loadFromStorage();
    if (saved && typeof saved === "object") {
      const merged = { ...DEFAULT_STATE, ...saved };
      merged.meals = cleanOldMeals(merged.meals);
      return merged;
    }
    return { ...DEFAULT_STATE };
  });
 
  useEffect(() => {
    saveToStorage(state);
  }, [state]);
 
  const updateState = useCallback((partial) => {
    setState((prev) => {
      const next = typeof partial === "function" ? partial(prev) : { ...prev, ...partial };
      return next;
    });
  }, []);
 
  return (
    <AppContext.Provider value={{ state, updateState }}>
      {children}
    </AppContext.Provider>
  );
}
 
// ─────────────────────────────────────────────
// ERROR BOUNDARY (class component — required)
// ─────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[TEST] Error caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100vh", background: "#0a0a0b", color: "#888", padding: 32,
          fontFamily: "'DM Sans', sans-serif", textAlign: "center"
        }}>
          <div>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>Une erreur est survenue</div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: 12, padding: "10px 24px", background: "#1a1a1e",
                color: "#ccc", border: "1px solid #2a2a2e", borderRadius: 8,
                cursor: "pointer", fontSize: 14
              }}
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
 
// Import React for class component
import React from "react";
 
// ─────────────────────────────────────────────
// ICONS — minimal inline SVGs
// ─────────────────────────────────────────────
const icons = {
  home: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#e0e0e0" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  training: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#e0e0e0" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" />
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  ),
  nutrition: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#e0e0e0" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C7 2 4 6 4 10c0 6 8 12 8 12s8-6 8-12c0-4-3-8-8-8z" />
      <path d="M12 2v10" />
    </svg>
  ),
  tracking: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#e0e0e0" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-6 4 4 5-8" />
    </svg>
  ),
  profile: (active) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#e0e0e0" : "#555"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0112 0v1" />
    </svg>
  ),
};
 
// ─────────────────────────────────────────────
// TABS CONFIG
// ─────────────────────────────────────────────
const TABS = [
  { id: "home", label: "Accueil", icon: icons.home },
  { id: "training", label: "Entraînement", icon: icons.training },
  { id: "nutrition", label: "Nutrition", icon: icons.nutrition },
  { id: "tracking", label: "Suivi", icon: icons.tracking },
  { id: "profile", label: "Profil", icon: icons.profile },
];
 
// ─────────────────────────────────────────────
// PAGES
// ─────────────────────────────────────────────
function PageShell({ title, subtitle, children }) {
  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">{title || "Page"}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      <div className="page-content">{children}</div>
    </div>
  );
}
 
function HomePage() {
  const { state, updateState } = useAppContext();
  const name = state?.userProfile?.name || state?.user?.name;
  const profile = state?.userProfile || {};
  const calTarget = state?.dailyCalorieTarget;
  const protTarget = state?.dailyProteinTarget;
 
  const parseNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const profileForCalc = {
    name: profile.name,
    birthdate: profile.birthdate,
    sex: profile.sex,
    height: parseNum(profile.height),
    weight: parseNum(profile.weight),
    activity: profile.activity,
  };
  const complete = isProfileComplete(profileForCalc);
  const bmr = complete ? calculateBMR(profileForCalc) : null;
  const tdee = complete ? calculateTDEE(profileForCalc) : null;
 
  // Inline form state (calories)
  const [editingCal, setEditingCal] = useState(false);
  const [calInput, setCalInput] = useState(calTarget ? String(calTarget) : "");
  const [calSaved, setCalSaved] = useState(false);
 
  const suggestion = tdee ? Math.round(tdee - 300) : null;
 
  const handleSaveCalTarget = () => {
    const val = Number(calInput);
    if (!Number.isFinite(val) || val < 800 || val > 8000) return;
    updateState((prev) => ({ ...prev, dailyCalorieTarget: Math.round(val) }));
    setEditingCal(false);
    setCalSaved(true);
    setTimeout(() => setCalSaved(false), 2000);
  };
 
  const handleClearCal = () => {
    updateState((prev) => ({ ...prev, dailyCalorieTarget: null }));
    setCalInput("");
    setEditingCal(false);
  };
 
  // Inline form state (protein)
  const [editingProt, setEditingProt] = useState(false);
  const [protInput, setProtInput] = useState(protTarget ? String(protTarget) : "");
  const [protSaved, setProtSaved] = useState(false);
 
  const handleSaveProtTarget = () => {
    const val = Number(protInput);
    if (!Number.isFinite(val) || val < 10 || val > 500) return;
    updateState((prev) => ({ ...prev, dailyProteinTarget: Math.round(val) }));
    setEditingProt(false);
    setProtSaved(true);
    setTimeout(() => setProtSaved(false), 2000);
  };
 
  const handleClearProt = () => {
    updateState((prev) => ({ ...prev, dailyProteinTarget: null }));
    setProtInput("");
    setEditingProt(false);
  };
 
  // Today's consumption
  const todayMeals = getTodayMeals(state?.meals);
  const consumedCal = todayMeals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
  const consumedProt = todayMeals.reduce((sum, m) => sum + (Number(m.protein) || 0), 0);
  const remainingCal = calTarget ? calTarget - consumedCal : null;
  const remainingProt = protTarget ? protTarget - consumedProt : null;
 
  // ── Profil incomplet ──
  if (!complete) {
    return (
      <PageShell title="Accueil" subtitle={name ? `Bonjour, ${name}` : "Bienvenue"}>
        <div className="card dash-empty-card">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-1a6 6 0 0112 0v1" />
          </svg>
          <p className="card-text" style={{ marginTop: 12, textAlign: "center" }}>
            Complète ton profil pour accéder au dashboard
          </p>
        </div>
      </PageShell>
    );
  }
 
  // ── Dashboard complet ──
  return (
    <PageShell title="Accueil" subtitle={name ? `Bonjour, ${name}` : "Dashboard"}>
 
      {/* ── Dépense quotidienne ── */}
      <div className="card dash-metric-card">
        <div className="card-label">Dépense quotidienne estimée</div>
        <div className="dash-metric-row">
          <span className="dash-metric-value">{Math.round(tdee)}</span>
          <span className="dash-metric-unit">kcal / jour</span>
        </div>
        <div className="dash-metric-sub">
          BMR : {Math.round(bmr)} kcal
        </div>
      </div>
 
      {/* ══════════════════════════════════════════
          BLOC 1 : Objectifs quotidiens
          ══════════════════════════════════════════ */}
      <div className="dash-section-label">Objectifs quotidiens</div>
 
      {/* ── Affichage compact (pas en édition) ── */}
      {!editingCal && !editingProt && (
        <div className="card dash-target-card">
          <div className={`dash-obj-grid ${!protTarget ? "dash-obj-single" : ""}`}>
            {/* Calories */}
            <div className="dash-obj-col">
              <div className="dash-obj-label">Calories</div>
              {calTarget ? (
                <>
                  <span className="dash-obj-val dash-target-value">{calTarget}</span>
                  <span className="dash-obj-unit">kcal / jour</span>
                  <button className="dash-obj-edit" onClick={() => { setCalInput(String(calTarget)); setEditingCal(true); }}>
                    Modifier
                  </button>
                </>
              ) : (
                <button
                  className="dash-obj-define"
                  onClick={() => { setCalInput(suggestion ? String(suggestion) : ""); setEditingCal(true); }}
                >
                  Définir
                </button>
              )}
            </div>
 
            {/* Divider (uniquement si protéines définies) */}
            {protTarget && <div className="dash-obj-divider" />}
 
            {/* Protéines (uniquement si définies) */}
            {protTarget && (
              <div className="dash-obj-col">
                <div className="dash-obj-label">Protéines</div>
                <span className="dash-obj-val" style={{ color: "var(--accent)" }}>{protTarget}g</span>
                <span className="dash-obj-unit">/ jour</span>
                <button className="dash-obj-edit" onClick={() => { setProtInput(String(protTarget)); setEditingProt(true); }}>
                  Modifier
                </button>
              </div>
            )}
          </div>
          {(calSaved || protSaved) && (
            <div className="save-toast" style={{ marginTop: 12 }}>
              <span className="status-dot status-ok" />
              <span>Objectif enregistré</span>
            </div>
          )}
        </div>
      )}
 
      {/* ── Édition calories ── */}
      {editingCal && (
        <div className="card dash-target-card">
          <div className="card-label">Objectif calories</div>
          <div className="dash-inline-form">
            {suggestion && (
              <div className="dash-suggestion">
                Suggestion : déficit léger = {Math.round(tdee)} − 300 = {suggestion} kcal
              </div>
            )}
            <div className="input-row">
              <input
                className="input"
                type="number"
                placeholder="Ex : 2100"
                value={calInput}
                onChange={(e) => setCalInput(e.target.value)}
                min={800}
                max={8000}
                inputMode="numeric"
                autoFocus
                style={{ flex: 1 }}
              />
              <button className="btn-save" onClick={handleSaveCalTarget}>OK</button>
            </div>
            <div className="dash-form-actions">
              <button className="dash-cancel-btn" onClick={() => setEditingCal(false)}>Annuler</button>
              {calTarget && (
                <button className="dash-clear-btn" onClick={handleClearCal}>Supprimer</button>
              )}
            </div>
          </div>
        </div>
      )}
 
      {/* ── Édition protéines ── */}
      {editingProt && (
        <div className="card dash-target-card">
          <div className="card-label">Objectif protéines</div>
          <div className="dash-inline-form">
            <div className="input-row">
              <input
                className="input"
                type="number"
                placeholder="Ex : 140"
                value={protInput}
                onChange={(e) => setProtInput(e.target.value)}
                min={10}
                max={500}
                inputMode="numeric"
                autoFocus
                style={{ flex: 1 }}
              />
              <button className="btn-save" onClick={handleSaveProtTarget}>OK</button>
            </div>
            <div className="dash-form-actions">
              <button className="dash-cancel-btn" onClick={() => setEditingProt(false)}>Annuler</button>
              {protTarget && (
                <button className="dash-clear-btn" onClick={handleClearProt}>Supprimer</button>
              )}
            </div>
          </div>
        </div>
      )}
 
      {/* ══════════════════════════════════════════
          BLOC 2 : Restant aujourd'hui
          ══════════════════════════════════════════ */}
      {(remainingCal !== null || remainingProt !== null) && !editingCal && !editingProt && (
        <>
          <div className="dash-section-label">Restant aujourd'hui</div>
          <div className="card dash-remaining-card">
            <div className="dash-remaining-grid">
              {/* Calories restantes */}
              {remainingCal !== null && (
                <div className="dash-remaining-col">
                  <span className={`dash-remaining-big ${remainingCal >= 0 ? "dash-remaining-value" : "dash-over-value"}`}>
                    {remainingCal}
                  </span>
                  <span className="dash-remaining-unit">kcal</span>
                  <span className="dash-remaining-sub">{consumedCal} consommées</span>
                </div>
              )}
 
              {/* Divider */}
              {remainingCal !== null && remainingProt !== null && (
                <div className="dash-remaining-divider" />
              )}
 
              {/* Protéines restantes */}
              {remainingProt !== null && (
                <div className="dash-remaining-col">
                  <span className={`dash-remaining-big ${remainingProt >= 0 ? "dash-remaining-value" : "dash-over-value"}`}>
                    {remainingProt}g
                  </span>
                  <span className="dash-remaining-unit">protéines</span>
                  <span className="dash-remaining-sub">{consumedProt}g consommées</span>
                </div>
              )}
            </div>
 
            {todayMeals.length === 0 && (
              <div className="dash-metric-sub" style={{ textAlign: "center", marginTop: 10 }}>
                Aucun repas enregistré
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
 
 
 
// ─────────────────────────────────────────────
// EXERCISE DATABASE — structured, searchable
// ─────────────────────────────────────────────
const MUSCLE_GROUP_LABELS = {
  pectoraux: "Pectoraux",
  dos: "Dos",
  epaules: "Épaules",
  biceps: "Biceps",
  triceps: "Triceps",
  jambes: "Jambes",
  abdos: "Abdos",
  cardio: "Cardio",
  crossfit: "CrossFit",
};
const MUSCLE_GROUP_ORDER = ["pectoraux", "dos", "epaules", "biceps", "triceps", "jambes", "abdos", "cardio", "crossfit"];
const MUSCU_GROUPS = ["pectoraux", "dos", "epaules", "biceps", "triceps", "jambes", "abdos"];
 
const EXERCISE_DB = [
  // ══════════════════════════════════════════
  // PECTORAUX
  // ══════════════════════════════════════════
  {
    id: "pec-01", name: "Développé couché", muscle_group: "pectoraux", category: "musculation",
    type: "musculation", equipment: "barre",
    synonyms: ["bench press", "bench", "chest press", "barbell bench press", "dc", "dev couché", "developpe couche"],
    description: "Mouvement de base pour les pectoraux, allongé sur un banc plat avec barre.",
    animation_url: null,
  },
  {
    id: "pec-02", name: "Développé incliné", muscle_group: "pectoraux", category: "musculation",
    type: "musculation", equipment: "barre / haltères",
    synonyms: ["incline bench press", "incline press", "dev incliné", "incline", "developpe incline"],
    description: "Développé sur banc incliné, cible le haut des pectoraux.",
    animation_url: null,
  },
  {
    id: "pec-03", name: "Développé décliné", muscle_group: "pectoraux", category: "musculation",
    type: "musculation", equipment: "barre / haltères",
    synonyms: ["decline bench press", "decline press", "dev décliné", "developpe decline"],
    description: "Développé sur banc décliné, cible le bas des pectoraux.",
    animation_url: null,
  },
  {
    id: "pec-04", name: "Écarté couché", muscle_group: "pectoraux", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["dumbbell fly", "chest fly", "fly", "écartés", "ecarté couche", "flies"],
    description: "Mouvement d'ouverture avec haltères, allongé sur banc plat.",
    animation_url: null,
  },
  {
    id: "pec-05", name: "Écarté incliné", muscle_group: "pectoraux", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["incline fly", "incline chest fly", "écarté incline", "incline flies"],
    description: "Écartés sur banc incliné, cible le haut des pectoraux.",
    animation_url: null,
  },
  {
    id: "pec-06", name: "Pec deck", muscle_group: "pectoraux", category: "musculation",
    type: "machine", equipment: "machine",
    synonyms: ["butterfly", "pec fly machine", "machine pec", "peck deck", "butterfly machine"],
    description: "Machine d'écartés pour isoler les pectoraux.",
    animation_url: null,
  },
  {
    id: "pec-07", name: "Dips pectoraux", muscle_group: "pectoraux", category: "musculation",
    type: "poids_du_corps", equipment: "barres parallèles",
    synonyms: ["chest dips", "dips", "dips pecs", "parallel bar dips"],
    description: "Dips buste penché en avant pour cibler les pectoraux.",
    animation_url: null,
  },
  {
    id: "pec-08", name: "Pompes", muscle_group: "pectoraux", category: "musculation",
    type: "poids_du_corps", equipment: "aucun",
    synonyms: ["push-ups", "pushups", "push ups", "pompe"],
    description: "Mouvement au sol, bras tendus, poussée depuis le sol.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // DOS
  // ══════════════════════════════════════════
  {
    id: "dos-01", name: "Tractions", muscle_group: "dos", category: "musculation",
    type: "poids_du_corps", equipment: "barre de traction",
    synonyms: ["pull-ups", "pullups", "pull ups", "chin-ups", "chinups", "traction pronation", "traction supination"],
    description: "Mouvement vertical au poids du corps, barre fixe.",
    animation_url: null,
  },
  {
    id: "dos-02", name: "Tirage vertical", muscle_group: "dos", category: "musculation",
    type: "machine", equipment: "poulie haute",
    synonyms: ["lat pulldown", "pulldown", "tirage poitrine", "tirage vertical poitrine", "tirage poulie haute"],
    description: "Tirage à la poulie haute vers la poitrine.",
    animation_url: null,
  },
  {
    id: "dos-03", name: "Tirage horizontal", muscle_group: "dos", category: "musculation",
    type: "machine", equipment: "poulie basse",
    synonyms: ["seated row", "cable row", "tirage poulie basse", "tirage horizontal poulie", "rowing poulie"],
    description: "Tirage à la poulie basse, assis.",
    animation_url: null,
  },
  {
    id: "dos-04", name: "Rowing barre", muscle_group: "dos", category: "musculation",
    type: "musculation", equipment: "barre",
    synonyms: ["barbell row", "bent over row", "rowing", "row barre", "bent row"],
    description: "Rowing penché avec barre, dos en épaisseur.",
    animation_url: null,
  },
  {
    id: "dos-05", name: "Rowing haltère", muscle_group: "dos", category: "musculation",
    type: "musculation", equipment: "haltère",
    synonyms: ["dumbbell row", "one arm row", "rowing haltère un bras", "single arm row", "rowing un bras"],
    description: "Rowing unilatéral avec haltère, un bras à la fois.",
    animation_url: null,
  },
  {
    id: "dos-06", name: "Rowing machine", muscle_group: "dos", category: "musculation",
    type: "machine", equipment: "machine",
    synonyms: ["machine row", "seated machine row", "rowing guidé"],
    description: "Rowing guidé sur machine.",
    animation_url: null,
  },
  {
    id: "dos-07", name: "Rowing T-bar", muscle_group: "dos", category: "musculation",
    type: "musculation", equipment: "T-bar / landmine",
    synonyms: ["t-bar row", "tbar row", "t bar", "landmine row"],
    description: "Rowing avec barre en T ou dispositif landmine.",
    animation_url: null,
  },
  {
    id: "dos-08", name: "Pull-over", muscle_group: "dos", category: "musculation",
    type: "musculation", equipment: "haltère",
    synonyms: ["pullover", "pull over", "dumbbell pullover", "pull-over haltère"],
    description: "Mouvement d'extension au-dessus de la tête, allongé.",
    animation_url: null,
  },
  {
    id: "dos-09", name: "Face pull", muscle_group: "dos", category: "musculation",
    type: "machine", equipment: "poulie / corde",
    synonyms: ["facepull", "face pulls", "tirage visage", "rear delt pull"],
    description: "Tirage corde vers le visage, cible l'arrière d'épaule et les trapèzes.",
    animation_url: null,
  },
  {
    id: "dos-10", name: "Deadlift", muscle_group: "dos", category: "musculation",
    type: "musculation", equipment: "barre",
    synonyms: ["soulevé de terre", "sdt", "deadlift", "dead lift", "conventional deadlift"],
    description: "Soulevé de terre conventionnel, mouvement complet de la chaîne postérieure.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // ÉPAULES
  // ══════════════════════════════════════════
  {
    id: "epa-01", name: "Développé militaire", muscle_group: "epaules", category: "musculation",
    type: "musculation", equipment: "barre / haltères",
    synonyms: ["overhead press", "ohp", "military press", "shoulder press", "dev militaire", "presse épaules"],
    description: "Développé vertical au-dessus de la tête.",
    animation_url: null,
  },
  {
    id: "epa-02", name: "Élévations latérales", muscle_group: "epaules", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["lateral raise", "lateral raises", "side raise", "elevations laterales", "lat raise"],
    description: "Élévation des bras sur les côtés, cible le deltoïde moyen.",
    animation_url: null,
  },
  {
    id: "epa-03", name: "Élévations frontales", muscle_group: "epaules", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["front raise", "front raises", "elevations frontales", "front delt raise"],
    description: "Élévation des bras devant soi, cible le deltoïde antérieur.",
    animation_url: null,
  },
  {
    id: "epa-04", name: "Oiseau", muscle_group: "epaules", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["reverse fly", "rear delt fly", "oiseau haltères", "arrière épaule", "bent over fly"],
    description: "Écartés penché en avant, cible l'arrière de l'épaule.",
    animation_url: null,
  },
  {
    id: "epa-05", name: "Reverse pec deck", muscle_group: "epaules", category: "musculation",
    type: "machine", equipment: "machine",
    synonyms: ["reverse fly machine", "rear delt machine", "butterfly inversé", "pec deck inversé"],
    description: "Machine butterfly inversée pour l'arrière d'épaule.",
    animation_url: null,
  },
  {
    id: "epa-06", name: "Arnold press", muscle_group: "epaules", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["arnold", "arnold shoulder press", "rotation press"],
    description: "Développé avec rotation des poignets, cible les 3 faisceaux.",
    animation_url: null,
  },
  {
    id: "epa-07", name: "Upright row", muscle_group: "epaules", category: "musculation",
    type: "musculation", equipment: "barre / haltères",
    synonyms: ["tirage menton", "rowing menton", "tirage vertical", "upright rowing"],
    description: "Tirage vertical le long du corps vers le menton.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // BICEPS
  // ══════════════════════════════════════════
  {
    id: "bic-01", name: "Curl barre", muscle_group: "biceps", category: "musculation",
    type: "musculation", equipment: "barre droite",
    synonyms: ["barbell curl", "curl barre droite", "standing curl", "biceps curl"],
    description: "Flexion des bras avec barre droite, debout.",
    animation_url: null,
  },
  {
    id: "bic-02", name: "Curl barre EZ", muscle_group: "biceps", category: "musculation",
    type: "musculation", equipment: "barre EZ",
    synonyms: ["ez bar curl", "ez curl", "curl ez", "biceps ez curl", "curl barre ez"],
    description: "Flexion des bras avec barre EZ, prise plus confortable.",
    animation_url: null,
  },
  {
    id: "bic-03", name: "Curl haltères", muscle_group: "biceps", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["dumbbell curl", "curl haltere", "biceps curl haltères"],
    description: "Flexion des bras avec haltères, debout ou assis.",
    animation_url: null,
  },
  {
    id: "bic-04", name: "Curl incliné", muscle_group: "biceps", category: "musculation",
    type: "musculation", equipment: "haltères / banc incliné",
    synonyms: ["incline curl", "incline dumbbell curl", "curl incliné haltères", "curl banc incliné"],
    description: "Curl sur banc incliné pour étirer le biceps en position basse.",
    animation_url: null,
  },
  {
    id: "bic-05", name: "Curl marteau", muscle_group: "biceps", category: "musculation",
    type: "musculation", equipment: "haltères",
    synonyms: ["hammer curl", "hammer curls", "curl prise marteau", "curl neutre"],
    description: "Curl prise neutre, cible le brachial et long supinateur.",
    animation_url: null,
  },
  {
    id: "bic-06", name: "Curl concentration", muscle_group: "biceps", category: "musculation",
    type: "musculation", equipment: "haltère",
    synonyms: ["concentration curl", "curl concentré", "seated curl"],
    description: "Curl unilatéral assis, coude sur la cuisse pour isolation maximale.",
    animation_url: null,
  },
  {
    id: "bic-07", name: "Curl pupitre", muscle_group: "biceps", category: "musculation",
    type: "musculation", equipment: "barre / haltère / pupitre",
    synonyms: ["preacher curl", "curl au pupitre", "scott curl", "curl larry scott"],
    description: "Curl avec support pupitre pour isolation stricte du biceps.",
    animation_url: null,
  },
  {
    id: "bic-08", name: "Curl câble", muscle_group: "biceps", category: "musculation",
    type: "machine", equipment: "poulie",
    synonyms: ["cable curl", "curl poulie", "curl poulie basse", "biceps cable"],
    description: "Curl à la poulie pour une tension constante.",
    animation_url: null,
  },
  {
    id: "bic-09", name: "Bayesian curl", muscle_group: "biceps", category: "musculation",
    type: "machine", equipment: "poulie basse",
    synonyms: ["bayesian cable curl", "behind body curl", "curl bayesian"],
    description: "Curl câble bras derrière le corps pour un étirement maximal.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // TRICEPS
  // ══════════════════════════════════════════
  {
    id: "tri-01", name: "Dips triceps", muscle_group: "triceps", category: "musculation",
    type: "poids_du_corps", equipment: "barres parallèles",
    synonyms: ["triceps dips", "dips", "parallel dips", "dips bras"],
    description: "Dips buste droit pour cibler les triceps.",
    animation_url: null,
  },
  {
    id: "tri-02", name: "Barre au front", muscle_group: "triceps", category: "musculation",
    type: "musculation", equipment: "barre EZ / barre droite",
    synonyms: ["skull crusher", "skull crushers", "skullcrusher", "lying triceps extension", "french press"],
    description: "Extension triceps allongé, barre descendue vers le front.",
    animation_url: null,
  },
  {
    id: "tri-03", name: "Triceps pushdown unilatéral", muscle_group: "triceps", category: "musculation",
    type: "machine", equipment: "poulie haute",
    synonyms: ["single arm pushdown", "single arm triceps pushdown", "pushdown un bras", "triceps poulie un bras"],
    description: "Extension triceps à la poulie haute, un bras à la fois.",
    animation_url: null,
  },
  {
    id: "tri-04", name: "Extension overhead unilatérale", muscle_group: "triceps", category: "musculation",
    type: "machine", equipment: "poulie basse",
    synonyms: ["single arm overhead extension", "overhead cable extension", "extension au-dessus tête un bras"],
    description: "Extension triceps au-dessus de la tête, un bras, poulie basse.",
    animation_url: null,
  },
  {
    id: "tri-05", name: "Triceps pushdown", muscle_group: "triceps", category: "musculation",
    type: "machine", equipment: "poulie haute",
    synonyms: ["pushdown", "cable pushdown", "triceps poulie", "extension poulie haute", "press down"],
    description: "Extension triceps à la poulie haute, deux bras.",
    animation_url: null,
  },
  {
    id: "tri-06", name: "Extension overhead poulie", muscle_group: "triceps", category: "musculation",
    type: "machine", equipment: "poulie basse / corde",
    synonyms: ["overhead triceps extension", "cable overhead extension", "extension triceps poulie basse"],
    description: "Extension triceps au-dessus de la tête à la poulie.",
    animation_url: null,
  },
  {
    id: "tri-07", name: "Extension triceps haltère", muscle_group: "triceps", category: "musculation",
    type: "musculation", equipment: "haltère",
    synonyms: ["dumbbell triceps extension", "overhead dumbbell extension", "extension haltère au-dessus de la tête"],
    description: "Extension au-dessus de la tête avec un haltère.",
    animation_url: null,
  },
  {
    id: "tri-08", name: "Kickback", muscle_group: "triceps", category: "musculation",
    type: "musculation", equipment: "haltère",
    synonyms: ["triceps kickback", "kickback haltère", "dumbbell kickback"],
    description: "Extension arrière du bras, buste penché.",
    animation_url: null,
  },
  {
    id: "tri-09", name: "Close grip bench", muscle_group: "triceps", category: "musculation",
    type: "musculation", equipment: "barre",
    synonyms: ["close grip bench press", "dev couché prise serrée", "développé couché serré", "cgbp"],
    description: "Développé couché prise serrée, cible les triceps.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // JAMBES
  // ══════════════════════════════════════════
  {
    id: "jam-01", name: "Squat", muscle_group: "jambes", category: "musculation",
    type: "musculation", equipment: "barre",
    synonyms: ["back squat", "barbell squat", "squat barre", "squats"],
    description: "Flexion complète des jambes, barre sur les trapèzes.",
    animation_url: null,
  },
  {
    id: "jam-02", name: "Front squat", muscle_group: "jambes", category: "musculation",
    type: "musculation", equipment: "barre",
    synonyms: ["squat avant", "front squat barre", "squat frontal"],
    description: "Squat barre devant, cible davantage les quadriceps.",
    animation_url: null,
  },
  {
    id: "jam-03", name: "Leg press", muscle_group: "jambes", category: "musculation",
    type: "machine", equipment: "machine",
    synonyms: ["presse à cuisses", "presse jambes", "leg press machine", "presse"],
    description: "Presse inclinée pour les quadriceps et fessiers.",
    animation_url: null,
  },
  {
    id: "jam-04", name: "Fentes", muscle_group: "jambes", category: "musculation",
    type: "musculation", equipment: "haltères / barre",
    synonyms: ["lunges", "fentes avant", "fentes marchées", "walking lunges", "lunge"],
    description: "Fentes avant ou marchées, quadriceps et fessiers.",
    animation_url: null,
  },
  {
    id: "jam-05", name: "Fentes bulgares", muscle_group: "jambes", category: "musculation",
    type: "musculation", equipment: "haltères / banc",
    synonyms: ["bulgarian split squat", "bulgarian lunges", "split squat", "fentes pied surélevé"],
    description: "Fente pied arrière surélevé, unilatéral.",
    animation_url: null,
  },
  {
    id: "jam-06", name: "Soulevé de terre jambes tendues", muscle_group: "jambes", category: "musculation",
    type: "musculation", equipment: "barre / haltères",
    synonyms: ["romanian deadlift", "rdl", "stiff leg deadlift", "sdt jambes tendues", "soulevé roumain"],
    description: "Soulevé de terre jambes quasi tendues, cible les ischio-jambiers.",
    animation_url: null,
  },
  {
    id: "jam-07", name: "Leg curl", muscle_group: "jambes", category: "musculation",
    type: "machine", equipment: "machine",
    synonyms: ["leg curls", "hamstring curl", "ischio machine", "curl jambes"],
    description: "Flexion des jambes sur machine, cible les ischio-jambiers.",
    animation_url: null,
  },
  {
    id: "jam-08", name: "Leg extension", muscle_group: "jambes", category: "musculation",
    type: "machine", equipment: "machine",
    synonyms: ["leg extensions", "quadriceps extension", "extension jambes", "extension quadriceps"],
    description: "Extension des jambes sur machine, isole les quadriceps.",
    animation_url: null,
  },
  {
    id: "jam-09", name: "Hip thrust", muscle_group: "jambes", category: "musculation",
    type: "musculation", equipment: "barre / banc",
    synonyms: ["hip thrusts", "barbell hip thrust", "glute bridge", "pont fessier", "relevé de bassin"],
    description: "Extension de hanche, dos sur banc, cible les fessiers.",
    animation_url: null,
  },
  {
    id: "jam-10", name: "Mollets debout", muscle_group: "jambes", category: "musculation",
    type: "machine", equipment: "machine / barre",
    synonyms: ["standing calf raise", "calf raise", "mollets", "calf raises", "mollets machine"],
    description: "Extension des chevilles debout, cible les mollets.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // ABDOS
  // ══════════════════════════════════════════
  {
    id: "abd-01", name: "Crunch", muscle_group: "abdos", category: "musculation",
    type: "poids_du_corps", equipment: "aucun",
    synonyms: ["crunches", "crunchs", "abdos crunch", "sit-up partiel"],
    description: "Flexion du buste allongé, cible le grand droit.",
    animation_url: null,
  },
  {
    id: "abd-02", name: "Relevé de jambes", muscle_group: "abdos", category: "musculation",
    type: "poids_du_corps", equipment: "barre / banc",
    synonyms: ["leg raise", "leg raises", "hanging leg raise", "relevé de jambes suspendu"],
    description: "Relevé des jambes suspendu ou allongé.",
    animation_url: null,
  },
  {
    id: "abd-03", name: "Gainage", muscle_group: "abdos", category: "musculation",
    type: "poids_du_corps", equipment: "aucun",
    synonyms: ["plank", "planking", "planche", "gainage ventral"],
    description: "Position statique sur les avant-bras, renforce le core.",
    animation_url: null,
  },
  {
    id: "abd-04", name: "Gainage latéral", muscle_group: "abdos", category: "musculation",
    type: "poids_du_corps", equipment: "aucun",
    synonyms: ["side plank", "planche latérale", "gainage oblique"],
    description: "Gainage sur le côté, cible les obliques.",
    animation_url: null,
  },
  {
    id: "abd-05", name: "Russian twist", muscle_group: "abdos", category: "musculation",
    type: "poids_du_corps", equipment: "poids / médecine-ball",
    synonyms: ["russian twists", "twist russe", "rotation russe"],
    description: "Rotation du buste assis, pieds décollés du sol.",
    animation_url: null,
  },
  {
    id: "abd-06", name: "Mountain climbers", muscle_group: "abdos", category: "musculation",
    type: "poids_du_corps", equipment: "aucun",
    synonyms: ["mountain climber", "grimpeur", "montée de genoux planche"],
    description: "Montée de genoux alternée en position de planche.",
    animation_url: null,
  },
  {
    id: "abd-07", name: "Ab wheel", muscle_group: "abdos", category: "musculation",
    type: "poids_du_corps", equipment: "roue abdominale",
    synonyms: ["ab roller", "roue abdominale", "rollout", "ab wheel rollout"],
    description: "Extension du corps avec roulette abdominale.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // CARDIO
  // ══════════════════════════════════════════
  {
    id: "car-01", name: "Course à pied", muscle_group: "cardio", category: "cardio",
    type: "cardio", equipment: "aucun / tapis",
    synonyms: ["running", "run", "jogging", "footing", "tapis de course", "treadmill"],
    description: "Course à pied en extérieur ou sur tapis.",
    animation_url: null,
  },
  {
    id: "car-02", name: "Marche rapide", muscle_group: "cardio", category: "cardio",
    type: "cardio", equipment: "aucun / tapis",
    synonyms: ["brisk walking", "marche", "marche inclinée", "incline walk", "walking", "power walk"],
    description: "Marche soutenue, possible en inclinaison.",
    animation_url: null,
  },
  {
    id: "car-03", name: "Vélo", muscle_group: "cardio", category: "cardio",
    type: "cardio", equipment: "vélo / vélo stationnaire",
    synonyms: ["cycling", "bike", "vélo elliptique", "biking", "velo", "vélo stationnaire", "spinning"],
    description: "Vélo d'extérieur, stationnaire ou elliptique.",
    animation_url: null,
  },
  {
    id: "car-04", name: "Rameur", muscle_group: "cardio", category: "cardio",
    type: "cardio", equipment: "rameur",
    synonyms: ["rowing machine", "rower", "ergomètre", "ergo", "rowing", "concept 2"],
    description: "Rameur ergomètre, travail complet cardio + musculaire.",
    animation_url: null,
  },
  {
    id: "car-05", name: "Corde à sauter", muscle_group: "cardio", category: "cardio",
    type: "cardio", equipment: "corde",
    synonyms: ["jump rope", "skipping", "skipping rope", "saut à la corde"],
    description: "Sauts à la corde, cardio haute intensité.",
    animation_url: null,
  },
  {
    id: "car-06", name: "HIIT", muscle_group: "cardio", category: "cardio",
    type: "cardio", equipment: "variable",
    synonyms: ["high intensity interval training", "interval training", "hiit workout", "fractionné", "intervalles"],
    description: "Entraînement fractionné haute intensité.",
    animation_url: null,
  },
 
  // ══════════════════════════════════════════
  // CROSSFIT
  // ══════════════════════════════════════════
  {
    id: "cx-01", name: "Burpees", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "aucun",
    synonyms: ["burpee", "burpees", "chest to floor burpee"],
    description: "Mouvement complet : squat, planche, pompe, saut.",
    animation_url: null,
  },
  {
    id: "cx-02", name: "Thrusters", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "barre / haltères",
    synonyms: ["thruster", "squat press", "squat to press"],
    description: "Front squat enchaîné avec un développé au-dessus de la tête.",
    animation_url: null,
  },
  {
    id: "cx-03", name: "Kettlebell swing", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "kettlebell",
    synonyms: ["kb swing", "swing kettlebell", "russian swing", "american swing"],
    description: "Balancé de kettlebell, travail explosif des hanches.",
    animation_url: null,
  },
  {
    id: "cx-04", name: "Box jump", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "box / caisse",
    synonyms: ["box jumps", "saut sur box", "plyo box"],
    description: "Saut explosif sur une box.",
    animation_url: null,
  },
  {
    id: "cx-05", name: "Wall ball", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "médecine-ball",
    synonyms: ["wall balls", "wall ball shots", "wall ball throw"],
    description: "Squat suivi d'un lancer de médecine-ball contre un mur.",
    animation_url: null,
  },
  {
    id: "cx-06", name: "Double unders", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "corde à sauter",
    synonyms: ["double under", "DU", "double saut corde"],
    description: "Double passage de corde sous les pieds par saut.",
    animation_url: null,
  },
  {
    id: "cx-07", name: "Sit-ups", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "aucun",
    synonyms: ["situps", "sit up", "abmat sit-ups", "abmat"],
    description: "Relevé complet du buste, allongé au sol.",
    animation_url: null,
  },
  {
    id: "cx-08", name: "Air squat", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "aucun",
    synonyms: ["air squats", "bodyweight squat", "squat poids du corps"],
    description: "Squat au poids du corps, mouvement fondamental.",
    animation_url: null,
  },
  {
    id: "cx-09", name: "Clean & jerk", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "barre",
    synonyms: ["clean and jerk", "épaulé jeté", "C&J", "clean jerk"],
    description: "Épaulé-jeté : mouvement olympique complet.",
    animation_url: null,
  },
  {
    id: "cx-10", name: "Snatch", muscle_group: "crossfit", category: "crossfit",
    type: "crossfit", equipment: "barre",
    synonyms: ["arraché", "power snatch", "squat snatch"],
    description: "Arraché : du sol au-dessus de la tête en un mouvement.",
    animation_url: null,
  },
];
 
// ─────────────────────────────────────────────
// EXERCISE SEARCH & HELPERS
// ─────────────────────────────────────────────
const CATEGORY_LABELS = { musculation: "Musculation", cardio: "Cardio" };
 
function getAllExercises(customExercises) {
  const custom = Array.isArray(customExercises) ? customExercises : [];
  return [...EXERCISE_DB, ...custom];
}
 
function searchExercises(query, allExercises) {
  const list = allExercises || EXERCISE_DB;
  if (!query || typeof query !== "string") return list;
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return list;
  return list.filter((ex) => {
    const haystack = [
      ex.name,
      ...(ex.synonyms || []),
      ex.muscle_group,
      ex.type,
      ex.equipment || "",
    ].join(" ").toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
 
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
 
// ─────────────────────────────────────────────
// UTILS — Cardio & Calories
// ─────────────────────────────────────────────
const CARDIO_METS = {
  "car-01": 9.8, "car-02": 4.5, "car-03": 7.5,
  "car-04": 7.0, "car-05": 10.0, "car-06": 9.0,
};
 
function hmsToSeconds(h, m, s) {
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}
function secondsToHMS(t) {
  const total = Math.max(0, Math.round(Number(t) || 0));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}
function autoCalcCardio(cardio) {
  const c = { ...cardio };
  const dur = Number(c.durationSecs) || 0;
  const dist = Number(c.distance) || 0;
  if (dur > 0 && dist > 0) {
    c.speed = (dist / (dur / 3600)).toFixed(1);
    c.allure = ((dur / 60) / dist).toFixed(1);
  }
  return c;
}
 
function calcSessionCalories(exercises, profile) {
  const w = Number(profile?.weight) || 0;
  if (w <= 0) return { total: 0, cardio: 0, musculation: 0 };
  const age = calculateAge(profile?.birthdate) || 30;
  const isMale = profile?.sex === "male";
  const wFactor = w / 75;
  let cCal = 0, mCal = 0;
 
  (exercises || []).forEach((ex) => {
    if (ex.category === "cardio") {
      const durS = Number(ex.cardio?.durationSecs) || 0;
      if (durS <= 0) return;
      const durH = durS / 3600;
      const durM = durS / 60;
      const bpm = Number(ex.cardio?.bpm) || 0;
      const speed = Number(ex.cardio?.speed) || 0;
      if (bpm > 50) {
        const perMin = isMale
          ? (-55.0969 + 0.6309 * bpm + 0.1988 * w + 0.2017 * age) / 4.184
          : (-20.4022 + 0.4472 * bpm - 0.1263 * w + 0.074 * age) / 4.184;
        cCal += Math.max(0, perMin * durM);
      } else {
        let met = CARDIO_METS[ex.exerciseId] || 6;
        if (ex.exerciseId === "car-01" && speed > 0) {
          met = speed < 8 ? 8 : speed < 10 ? 10 : speed < 13 ? 11.5 : 13;
        }
        cCal += met * w * durH;
      }
    } else {
      const done = (ex.sets || []).filter((s) => s.done);
      done.forEach((s) => {
        const reps = Number(s.reps) || 0;
        const kg = Number(s.weight) || 0;
        mCal += Math.max(2, (3 + kg * reps * 0.0015) * wFactor);
      });
    }
  });
  return { total: Math.round(cCal + mCal), cardio: Math.round(cCal), musculation: Math.round(mCal) };
}
 
function detectProgramChanges(origTemplate, curExercises) {
  const changes = [];
  if (!origTemplate || !curExercises) return changes;
  const origIds = new Set(origTemplate.map((e) => e.exerciseId));
  const curIds = new Set(curExercises.map((e) => e.exerciseId));
  curExercises.forEach((e) => { if (!origIds.has(e.exerciseId)) changes.push(`+ ${e.name} ajouté`); });
  origTemplate.forEach((e) => { if (!curIds.has(e.exerciseId)) changes.push(`− ${e.name} retiré`); });
  curExercises.forEach((cur) => {
    const orig = origTemplate.find((o) => o.exerciseId === cur.exerciseId);
    if (!orig || cur.category === "cardio") return;
    const oSets = Number(orig.sets) || 0;
    const cSets = cur.sets?.length || 0;
    if (oSets !== cSets) changes.push(`${cur.name} : ${oSets} → ${cSets} séries`);
  });
  return changes;
}
 
function sessionToTemplate(exercises) {
  return (exercises || []).map((e) => ({
    exerciseId: e.exerciseId, name: e.name, category: e.category,
    sets: e.category === "cardio" ? 0 : (e.sets?.length || 0),
    reps: e.category === "cardio" ? 0 : (Number(e.sets?.[0]?.reps) || 10),
    restTime: 90,
  }));
}
 
// ─────────────────────────────────────────────
// CREATE EXERCISE FORM
// ─────────────────────────────────────────────
const MAIN_GROUP_LABELS = { musculation: "Musculation", cardio: "Cardio", crossfit: "CrossFit" };
const MAIN_GROUP_OPTIONS = ["musculation", "cardio", "crossfit"];
const EQUIPMENT_OPTIONS = [
  "", "Barre", "Haltères", "Barre EZ", "Machine", "Poulie", "Poulie haute", "Poulie basse",
  "Corde", "Kettlebell", "Banc", "Barre de traction", "Barres parallèles",
  "Élastique", "Médecine-ball", "TRX", "Roue abdominale", "Tapis", "Vélo", "Rameur", "Aucun",
];
 
function CreateExerciseModal({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [mainGroup, setMainGroup] = useState("musculation");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [description, setDescription] = useState("");
  const [synonymsRaw, setSynonymsRaw] = useState("");
  const [error, setError] = useState("");
 
  const isMuscu = mainGroup === "musculation";
 
  const handleSave = () => {
    const n = name.trim();
    if (!n) { setError("Le nom est obligatoire"); return; }
    if (isMuscu && !muscleGroup) { setError("Le groupe musculaire est obligatoire"); return; }
    const category = mainGroup === "cardio" ? "cardio" : mainGroup === "crossfit" ? "crossfit" : "musculation";
    const finalMuscleGroup = isMuscu ? muscleGroup : mainGroup;
    const synonyms = synonymsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const ex = {
      id: "custom-" + generateId(),
      name: n,
      muscle_group: finalMuscleGroup,
      category,
      type: category,
      equipment: equipment || null,
      synonyms,
      description: description.trim() || null,
      animation_url: null,
      is_custom: true,
    };
    onSave(ex);
  };
 
  return (
    <div className="train-popup-overlay" onClick={onClose}>
      <div className="train-popup custom-ex-modal" onClick={(e) => e.stopPropagation()}>
        <div className="train-popup-title">Créer un exercice</div>
 
        <div className="custom-ex-fields">
          <div className="nutri-field-wrap">
            <div className="nutri-field-label">Nom <span className="nutri-required">*</span></div>
            <input className={`input input-full ${error && !name.trim() ? "input-error" : ""}`}
              type="text" placeholder="Ex : Tirage Yates" value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }} maxLength={60} autoFocus />
          </div>
 
          {/* Main group: musculation / cardio / crossfit */}
          <div className="nutri-field-wrap">
            <div className="nutri-field-label">Catégorie <span className="nutri-required">*</span></div>
            <div className="custom-ex-group-row">
              {MAIN_GROUP_OPTIONS.map((g) => (
                <button key={g}
                  className={`custom-ex-group-btn ${mainGroup === g ? "custom-ex-group-on custom-ex-group-" + g : ""}`}
                  onClick={() => { setMainGroup(g); setMuscleGroup(""); setError(""); }}
                >{MAIN_GROUP_LABELS[g]}</button>
              ))}
            </div>
          </div>
 
          {/* Muscle group — only for musculation */}
          {isMuscu && (
            <div className="nutri-field-wrap">
              <div className="nutri-field-label">Groupe musculaire <span className="nutri-required">*</span></div>
              <select className={`input input-full select ${error && isMuscu && !muscleGroup ? "input-error" : ""}`}
                value={muscleGroup} onChange={(e) => { setMuscleGroup(e.target.value); setError(""); }}>
                <option value="">— Choisir —</option>
                {MUSCU_GROUPS.map((mg) => (
                  <option key={mg} value={mg}>{MUSCLE_GROUP_LABELS[mg]}</option>
                ))}
              </select>
            </div>
          )}
 
          <div className="nutri-field-wrap">
            <div className="nutri-field-label">Équipement</div>
            <select className="input input-full select" value={equipment}
              onChange={(e) => setEquipment(e.target.value)}>
              <option value="">— Optionnel —</option>
              {EQUIPMENT_OPTIONS.filter(Boolean).map((eq) => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          </div>
 
          <div className="nutri-field-wrap">
            <div className="nutri-field-label">Description</div>
            <input className="input input-full" type="text" placeholder="Courte explication…"
              value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
          </div>
 
          <div className="nutri-field-wrap">
            <div className="nutri-field-label">Synonymes <span style={{ opacity: 0.5, fontSize: 10 }}>(virgules)</span></div>
            <input className="input input-full" type="text" placeholder="Ex : yates row, rowing yates"
              value={synonymsRaw} onChange={(e) => setSynonymsRaw(e.target.value)} maxLength={200} />
          </div>
        </div>
 
        {error && <div className="nutri-error" style={{ marginTop: 4 }}>{error}</div>}
 
        <div className="train-actions" style={{ marginTop: 10 }}>
          <button className="btn-primary" onClick={handleSave}>Créer l'exercice</button>
          <button className="dash-cancel-btn" style={{ width: "100%" }} onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
 
// ─────────────────────────────────────────────
// EXERCISE CATALOG (shared picker with search)
// ─────────────────────────────────────────────
function ExerciseCatalog({ onSelect, selectedIds, disabledIds, allExercises, onCreateExercise }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("musculation");
 
  const list = allExercises || EXERCISE_DB;
  const isSearching = search.trim().length > 0;
  const selSet = new Set(selectedIds || []);
  const disSet = new Set(disabledIds || []);
 
  // Get exercises for current view
  const getFiltered = () => {
    if (isSearching) return searchExercises(search, list);
    if (tab === "musculation") return list.filter((ex) => ex.category === "musculation" && ex.muscle_group !== "crossfit" && ex.muscle_group !== "cardio");
    if (tab === "cardio") return list.filter((ex) => ex.muscle_group === "cardio" || ex.category === "cardio");
    if (tab === "crossfit") return list.filter((ex) => ex.muscle_group === "crossfit" || ex.category === "crossfit");
    return [];
  };
  const filtered = getFiltered();
 
  // Group by muscle_group (for musculation and search only)
  const grouped = {};
  filtered.forEach((ex) => {
    const key = ex.muscle_group || "autre";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ex);
  });
 
  const renderExRow = (ex) => {
    const isSel = selSet.has(ex.id);
    const isDis = disSet.has(ex.id);
    return (
      <div key={ex.id} className={`train-ex-row ${isSel ? "train-ex-row-on" : ""} ${isDis ? "train-ex-row-dis" : ""}`}>
        <div className="train-ex-row-info">
          <span className="train-ex-name">
            {ex.name}
            {ex.is_custom && <span className="train-ex-custom-badge">perso</span>}
          </span>
          {ex.equipment && ex.equipment !== "aucun" && (
            <span className="train-ex-equip">{ex.equipment}</span>
          )}
        </div>
        {isSel ? (
          <span className="train-ex-added">Ajouté ✓</span>
        ) : (
          <button className="train-ex-add-btn" onClick={() => !isDis && onSelect(ex)}
            disabled={isDis}>Ajouter</button>
        )}
      </div>
    );
  };
 
  return (
    <>
      {/* Search */}
      <div className="train-search-wrap">
        <svg className="train-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input className="train-search-input" type="text" placeholder="Rechercher un exercice…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && <button className="train-search-clear" onClick={() => setSearch("")}>✕</button>}
      </div>
 
      {/* Create exercise link */}
      {onCreateExercise && (
        <button className="train-text-link" onClick={onCreateExercise}>+ Créer un exercice</button>
      )}
 
      {/* Tabs */}
      {!isSearching && (
        <div className="train-tabs">
          {MAIN_GROUP_OPTIONS.map((g) => (
            <button key={g} className={`train-tab ${tab === g ? "train-tab-on train-tab-" + g : ""}`}
              onClick={() => setTab(g)}>
              {MAIN_GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      )}
 
      {/* Search count */}
      {isSearching && (
        <div className="train-search-count">
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          {filtered.length === 0 && " — essaie un autre mot"}
        </div>
      )}
 
      {/* MUSCULATION: grouped by muscle */}
      {!isSearching && tab === "musculation" && MUSCU_GROUPS.map((mg) => {
        if (!grouped[mg] || grouped[mg].length === 0) return null;
        return (
          <div key={mg} className="train-group-section">
            <div className="train-group-label">{MUSCLE_GROUP_LABELS[mg]}</div>
            {grouped[mg].map(renderExRow)}
          </div>
        );
      })}
 
      {/* CARDIO: flat list */}
      {!isSearching && tab === "cardio" && (
        <div className="train-group-section">
          {filtered.length > 0 ? filtered.map(renderExRow) : (
            <p className="card-text" style={{ opacity: 0.5, padding: 12 }}>Aucun exercice cardio</p>
          )}
        </div>
      )}
 
      {/* CROSSFIT: flat list */}
      {!isSearching && tab === "crossfit" && (
        <div className="train-group-section">
          {filtered.length > 0 ? filtered.map(renderExRow) : (
            <p className="card-text" style={{ opacity: 0.5, padding: 12 }}>Aucun exercice CrossFit</p>
          )}
        </div>
      )}
 
      {/* SEARCH: grouped by category */}
      {isSearching && MUSCLE_GROUP_ORDER.map((mg) => {
        if (!grouped[mg] || grouped[mg].length === 0) return null;
        const catColor = mg === "cardio" || mg === "crossfit" ? mg : "musculation";
        return (
          <div key={mg} className="train-group-section">
            <span className={`train-cat-badge train-cat-${catColor}`} style={{ marginBottom: 6 }}>{MUSCLE_GROUP_LABELS[mg] || mg}</span>
            {grouped[mg].map(renderExRow)}
          </div>
        );
      })}
    </>
  );
}
 
// ─────────────────────────────────────────────
// TRAINING PAGE — full implementation
// ─────────────────────────────────────────────
function TrainingPage() {
  const { state, updateState } = useAppContext();
  const programs = Array.isArray(state?.programs) ? state.programs : [];
  const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
  const activeSession = state?.activeSession || null;
  const customExercises = Array.isArray(state?.customExercises) ? state.customExercises : [];
  const allExercises = getAllExercises(customExercises);
 
  // Navigation: home | create | detail | session | pick | history | review
  const [view, setView] = useState(activeSession ? "session" : "home");
  const [viewData, setViewData] = useState(null);
  const [toast, setToast] = useState("");
 
  // Create program state
  const [progName, setProgName] = useState("");
  const [progExercises, setProgExercises] = useState([]);
  const [progError, setProgError] = useState("");
 
  // Session UI state
  const [elapsed, setElapsed] = useState(0);
  const [restTimer, setRestTimer] = useState(null);
  const [histOpen, setHistOpen] = useState(false);
  const [restModeOn, setRestModeOn] = useState(true);
  const [finishData, setFinishData] = useState(null); // {calories, changes, session}
  const [showCreateEx, setShowCreateEx] = useState(false);
  const [showExList, setShowExList] = useState(false);
 
  // Profile for calorie calc
  const profile = state?.userProfile || {};
  const profileForCalc = {
    weight: Number(profile.weight) || null,
    height: Number(profile.height) || null,
    birthdate: profile.birthdate,
    sex: profile.sex,
  };
 
  const nav = (v, data = null) => { setView(v); setViewData(data); };
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };
 
  const handleCreateExercise = (ex) => {
    updateState((prev) => ({
      ...prev,
      customExercises: [...(prev.customExercises || []), ex],
    }));
    setShowCreateEx(false);
    showToast(`${ex.name} créé`);
  };
 
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };
 
  // ── Elapsed time ──
  useEffect(() => {
    if (!activeSession?.startedAt) return;
    const start = new Date(activeSession.startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeSession?.startedAt]);
 
  // ── Rest timer countdown ──
  useEffect(() => {
    if (!restTimer) return;
    if (restTimer.remaining <= 0) { setRestTimer(null); return; }
    const id = setTimeout(() => {
      setRestTimer((prev) => prev ? { ...prev, remaining: prev.remaining - 1 } : null);
    }, 1000);
    return () => clearTimeout(id);
  }, [restTimer]);
 
  // ══════════════════════════════════════════
  // PROGRAM CRUD
  // ══════════════════════════════════════════
  const startCreate = () => {
    setProgName(""); setProgExercises([]); setProgError("");
    nav("create");
  };
 
  const addProgEx = (ex) => {
    if (progExercises.some((e) => e.exerciseId === ex.id)) return;
    const isCardio = ex.category === "cardio";
    setProgExercises((p) => [...p, {
      exerciseId: ex.id, name: ex.name, category: ex.category,
      sets: isCardio ? 0 : 3, reps: isCardio ? 0 : 10, restTime: 90,
    }]);
  };
 
  const removeProgEx = (exId) => setProgExercises((p) => p.filter((e) => e.exerciseId !== exId));
 
  const updateProgEx = (exId, field, val) => {
    setProgExercises((p) => p.map((e) => e.exerciseId === exId ? { ...e, [field]: val } : e));
  };
 
  const saveProgram = () => {
    const name = progName.trim();
    if (!name) { setProgError("Le nom est obligatoire"); return; }
    if (progExercises.length === 0) { setProgError("Ajoute au moins un exercice"); return; }
    const prog = { id: generateId(), name, exercises: progExercises };
    updateState((prev) => ({ ...prev, programs: [...(prev.programs || []), prog] }));
    nav("home"); showToast("Programme créé");
  };
 
  const deleteProgram = (id) => {
    updateState((prev) => ({ ...prev, programs: (prev.programs || []).filter((p) => p.id !== id) }));
    nav("home"); showToast("Programme supprimé");
  };
 
  const duplicateProgram = (prog) => {
    const dup = { ...prog, id: generateId(), name: prog.name + " (copie)", exercises: prog.exercises.map((e) => ({ ...e })) };
    updateState((prev) => ({ ...prev, programs: [...(prev.programs || []), dup] }));
    showToast("Programme dupliqué");
  };
 
  const updateProgramEx = (progId, exId, field, val) => {
    updateState((prev) => ({
      ...prev,
      programs: (prev.programs || []).map((p) => {
        if (p.id !== progId) return p;
        return { ...p, exercises: p.exercises.map((e) =>
          (e.exerciseId || e.id) === exId ? { ...e, [field]: val } : e
        )};
      }),
    }));
    // Refresh viewData
    setViewData((prev) => {
      if (!prev || prev.id !== progId) return prev;
      return { ...prev, exercises: prev.exercises.map((e) =>
        (e.exerciseId || e.id) === exId ? { ...e, [field]: val } : e
      )};
    });
  };
 
  const removeProgramEx = (progId, exId) => {
    updateState((prev) => ({
      ...prev,
      programs: (prev.programs || []).map((p) => {
        if (p.id !== progId) return p;
        return { ...p, exercises: p.exercises.filter((e) => (e.exerciseId || e.id) !== exId) };
      }),
    }));
    setViewData((prev) => {
      if (!prev || prev.id !== progId) return prev;
      return { ...prev, exercises: prev.exercises.filter((e) => (e.exerciseId || e.id) !== exId) };
    });
    showToast("Exercice retiré");
  };
 
  // ══════════════════════════════════════════
  // SESSION MANAGEMENT
  // ══════════════════════════════════════════
  const startFreeSession = () => {
    const session = { id: generateId(), type: "free", programId: null, programName: null, startedAt: new Date().toISOString(), exercises: [] };
    updateState((prev) => ({ ...prev, activeSession: session }));
    nav("session");
  };
 
  const startProgramSession = (prog) => {
    const origTemplate = (prog.exercises || []).map((e) => ({
      exerciseId: e.exerciseId || e.id, name: e.name, category: e.category,
      sets: Number(e.sets) || 0, reps: Number(e.reps) || 0, restTime: e.restTime || 90,
    }));
    const exercises = origTemplate.map((e) => {
      const isCardio = e.category === "cardio";
      const numSets = e.sets || (isCardio ? 0 : 3);
      const numReps = e.reps || (isCardio ? 0 : 10);
      return {
        id: generateId(), exerciseId: e.exerciseId, name: e.name, category: e.category,
        sets: isCardio ? [] : Array.from({ length: numSets }, () => ({ reps: numReps, weight: "", done: false })),
        cardio: isCardio ? { durationSecs: 0, distance: "", speed: "", allure: "", bpm: "" } : null,
      };
    });
    const session = {
      id: generateId(), type: "program", programId: prog.id, programName: prog.name,
      startedAt: new Date().toISOString(), exercises, originalTemplate: origTemplate,
    };
    setRestModeOn(prog.restMode !== false);
    updateState((prev) => ({ ...prev, activeSession: session }));
    nav("session");
  };
 
  const addSessionExercise = (ex) => {
    if (!activeSession) return;
    const isCardio = ex.category === "cardio";
    const newEx = {
      id: generateId(), exerciseId: ex.id, name: ex.name, category: ex.category,
      sets: isCardio ? [] : [{ reps: 10, weight: "", done: false }],
      cardio: isCardio ? { durationSecs: 0, distance: "", speed: "", allure: "", bpm: "" } : null,
    };
    updateState((prev) => ({
      ...prev,
      activeSession: { ...prev.activeSession, exercises: [...(prev.activeSession?.exercises || []), newEx] },
    }));
    nav("session"); showToast(`${ex.name} ajouté`);
  };
 
  const updateSessionEx = (exSessId, updater) => {
    updateState((prev) => {
      if (!prev.activeSession) return prev;
      return { ...prev, activeSession: { ...prev.activeSession,
        exercises: prev.activeSession.exercises.map((e) => e.id === exSessId ? (typeof updater === "function" ? updater(e) : { ...e, ...updater }) : e),
      }};
    });
  };
 
  const removeSessionEx = (exSessId) => {
    updateState((prev) => {
      if (!prev.activeSession) return prev;
      return { ...prev, activeSession: { ...prev.activeSession,
        exercises: prev.activeSession.exercises.filter((e) => e.id !== exSessId),
      }};
    });
  };
 
  const addSet = (exSessId) => {
    updateSessionEx(exSessId, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, { reps: last?.reps || 10, weight: last?.weight || "", done: false }] };
    });
  };
 
  const removeSet = (exSessId) => {
    updateSessionEx(exSessId, (e) => ({ ...e, sets: e.sets.length > 1 ? e.sets.slice(0, -1) : e.sets }));
  };
 
  const updateSet = (exSessId, si, field, val) => {
    updateSessionEx(exSessId, (e) => ({
      ...e, sets: e.sets.map((s, i) => i === si ? { ...s, [field]: val } : s),
    }));
  };
 
  const toggleSetDone = (exSessId, si) => {
    const curEx = activeSession?.exercises?.find((e) => e.id === exSessId);
    const wasDone = curEx?.sets?.[si]?.done || false;
    updateSet(exSessId, si, "done", !wasDone);
    if (!wasDone && restModeOn) setRestTimer({ remaining: 90, total: 90 });
  };
 
  const updateCardio = (exSessId, field, val) => {
    updateSessionEx(exSessId, (e) => {
      const c = { ...(e.cardio || {}), [field]: val };
      return { ...e, cardio: autoCalcCardio(c) };
    });
  };
 
  const updateCardioDuration = (exSessId, part, val) => {
    updateSessionEx(exSessId, (e) => {
      const c = { ...(e.cardio || {}) };
      const cur = secondsToHMS(c.durationSecs);
      const v = Math.max(0, Number(val) || 0);
      if (part === "h") cur.h = Math.min(v, 23);
      if (part === "m") cur.m = Math.min(v, 59);
      if (part === "s") cur.s = Math.min(v, 59);
      c.durationSecs = hmsToSeconds(cur.h, cur.m, cur.s);
      return { ...e, cardio: autoCalcCardio(c) };
    });
  };
 
  const toggleRestMode = () => {
    const next = !restModeOn;
    setRestModeOn(next);
    if (!next) setRestTimer(null);
    if (activeSession?.type === "program" && activeSession?.programId) {
      updateState((prev) => ({
        ...prev,
        programs: (prev.programs || []).map((p) =>
          p.id === activeSession.programId ? { ...p, restMode: next } : p
        ),
      }));
    }
  };
 
  const finishSession = () => {
    if (!activeSession) return;
    const endedAt = new Date().toISOString();
    const duration = Math.round((new Date(endedAt).getTime() - new Date(activeSession.startedAt).getTime()) / 60000);
    const calories = calcSessionCalories(activeSession.exercises, profileForCalc);
    const changes = activeSession.type === "program" && activeSession.originalTemplate
      ? detectProgramChanges(activeSession.originalTemplate, activeSession.exercises)
      : [];
    const completed = { ...activeSession, endedAt, duration, calories };
    delete completed.originalTemplate;
    setFinishData({ completed, calories, changes });
    setRestTimer(null);
  };
 
  const confirmFinish = (saveChanges) => {
    if (!finishData) return;
    const { completed, changes } = finishData;
    updateState((prev) => {
      const next = { ...prev, sessions: [...(prev.sessions || []), completed], activeSession: null };
      if (saveChanges && changes.length > 0 && completed.programId) {
        const newTemplate = sessionToTemplate(completed.exercises);
        next.programs = (prev.programs || []).map((p) =>
          p.id === completed.programId ? { ...p, exercises: newTemplate } : p
        );
      }
      return next;
    });
    setFinishData(null);
    nav("home"); showToast("Séance terminée !");
  };
 
  const cancelSession = () => {
    updateState((prev) => ({ ...prev, activeSession: null }));
    setRestTimer(null); setFinishData(null); nav("home");
  };
 
  // ══════════════════════════════════════════
  // HISTORY SESSION EDITING
  // ══════════════════════════════════════════
  const updateHistSession = (sessionId, updater) => {
    updateState((prev) => ({
      ...prev,
      sessions: (prev.sessions || []).map((s) => s.id === sessionId ? (typeof updater === "function" ? updater(s) : { ...s, ...updater }) : s),
    }));
    setViewData((prev) => {
      if (!prev || prev.id !== sessionId) return prev;
      return typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
    });
  };
 
  const deleteHistSession = (sessionId) => {
    updateState((prev) => ({ ...prev, sessions: (prev.sessions || []).filter((s) => s.id !== sessionId) }));
    nav("home"); showToast("Séance supprimée");
  };
 
  const removeHistEx = (sessionId, exSessId) => {
    updateHistSession(sessionId, (s) => ({ ...s, exercises: s.exercises.filter((e) => e.id !== exSessId) }));
    showToast("Exercice retiré");
  };
 
  const addHistSet = (sessionId, exSessId) => {
    updateHistSession(sessionId, (s) => ({
      ...s, exercises: s.exercises.map((e) => {
        if (e.id !== exSessId) return e;
        const last = e.sets[e.sets.length - 1];
        return { ...e, sets: [...e.sets, { reps: last?.reps || 10, weight: last?.weight || "", done: true }] };
      }),
    }));
  };
 
  const removeHistSet = (sessionId, exSessId) => {
    updateHistSession(sessionId, (s) => ({
      ...s, exercises: s.exercises.map((e) => {
        if (e.id !== exSessId || e.sets.length <= 1) return e;
        return { ...e, sets: e.sets.slice(0, -1) };
      }),
    }));
  };
 
  const updateHistSet = (sessionId, exSessId, si, field, val) => {
    updateHistSession(sessionId, (s) => ({
      ...s, exercises: s.exercises.map((e) => {
        if (e.id !== exSessId) return e;
        return { ...e, sets: e.sets.map((set, i) => i === si ? { ...set, [field]: val } : set) };
      }),
    }));
  };
 
  // Toast renderer
  const toastEl = toast ? (
    <div className="save-toast"><span className="status-dot status-ok" /><span>{toast}</span></div>
  ) : null;
 
  const createExModal = showCreateEx ? (
    <CreateExerciseModal onSave={handleCreateExercise} onClose={() => setShowCreateEx(false)} />
  ) : null;
 
  const exListModal = showExList ? (
    <div className="train-popup-overlay" onClick={() => setShowExList(false)}>
      <div className="train-popup train-exlist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="train-exlist-header">
          <div className="train-popup-title" style={{ marginBottom: 0 }}>Exercices</div>
          <button className="train-exlist-close" onClick={() => setShowExList(false)}>✕</button>
        </div>
        <button className="btn-primary" style={{ fontSize: 13, padding: "10px 16px" }}
          onClick={() => { setShowExList(false); setShowCreateEx(true); }}>
          + Créer un nouvel exercice
        </button>
        <ExerciseCatalog
          onSelect={() => {}} selectedIds={[]} disabledIds={[]}
          allExercises={allExercises} />
      </div>
    </div>
  ) : null;
 
  // ══════════════════════════════════════════
  // VIEW: HOME
  // ══════════════════════════════════════════
  if (view === "home") {
    const sortedSessions = [...sessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    return (
      <PageShell title="Entraînement" subtitle="Programmes & séances">
 
        {/* Active session banner */}
        {activeSession && (
          <button className="train-banner" onClick={() => nav("session")}>
            <span className="train-banner-dot" />
            <span className="train-banner-txt">Séance en cours — {formatTime(elapsed)}</span>
            <span className="train-banner-arrow">Reprendre →</span>
          </button>
        )}
 
        {/* Main actions */}
        {!activeSession && (
          <button className="btn-primary train-main-btn" onClick={startFreeSession}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Démarrer une séance libre
          </button>
        )}
        <button className="train-secondary-btn" onClick={startCreate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Créer un programme
        </button>
        <button className="train-text-link" onClick={() => setShowExList(true)}>
          Voir la liste des exercices
        </button>
 
        {/* Programs */}
        {programs.length > 0 && (
          <>
            <div className="train-section-label">Mes programmes</div>
            <div className="train-prog-list">
              {programs.map((p) => (
                <button key={p.id} className="card train-prog-card" onClick={() => nav("detail", p)}>
                  <div className="train-prog-card-info">
                    <span className="train-prog-card-name">{p.name}</span>
                    <span className="train-prog-card-meta">{p.exercises?.length || 0} exercice{(p.exercises?.length || 0) > 1 ? "s" : ""}</span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          </>
        )}
 
        {/* History */}
        {sortedSessions.length > 0 && (
          <div className={`card collapse-card`}>
            <button className="collapse-toggle" onClick={() => setHistOpen((p) => !p)}>
              <span className="collapse-title">Historique<span className="collapse-count">{sortedSessions.length}</span></span>
              <svg className={`collapse-chevron ${histOpen ? "collapse-chevron-open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {histOpen && (
              <div className="collapse-body">
                <div className="train-hist-list">
                  {sortedSessions.slice(0, 15).map((s) => (
                    <button key={s.id} className="train-hist-row" onClick={() => nav("review", s)}>
                      <div className="train-hist-row-info">
                        <span className="train-hist-row-name">{s.type === "free" ? "Séance libre" : s.programName || "Programme"}</span>
                        <span className="train-hist-row-meta">
                          {formatDateLabel(getDateKey(s.startedAt))} · {s.exercises?.length || 0} exos · {s.duration || 0} min
                        </span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                  {sortedSessions.length > 15 && (
                    <div className="card-text" style={{ opacity: 0.4, textAlign: "center", fontSize: 12, paddingTop: 4 }}>
                      {sortedSessions.length - 15} séance{sortedSessions.length - 15 > 1 ? "s" : ""} plus ancienne{sortedSessions.length - 15 > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
 
        {/* Empty state */}
        {programs.length === 0 && sessions.length === 0 && !activeSession && (
          <div className="card train-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
            <p className="card-text" style={{ marginTop: 12, textAlign: "center" }}>Lance ta première séance ou crée un programme</p>
          </div>
        )}
        {exListModal}
        {createExModal}
        {toastEl}
      </PageShell>
    );
  }
 
  // ══════════════════════════════════════════
  // VIEW: CREATE PROGRAM
  // ══════════════════════════════════════════
  if (view === "create") {
    const selectedIds = progExercises.map((e) => e.exerciseId);
    return (
      <PageShell title="Nouveau programme" subtitle="Configure tes exercices">
        <button className="train-back" onClick={() => nav("home")}>← Retour</button>
 
        {/* Name */}
        <div className="card">
          <div className="card-label">Nom du programme <span className="nutri-required">*</span></div>
          <input
            className={`input input-full ${progError && !progName.trim() ? "input-error" : ""}`}
            type="text" placeholder="Ex : Push day, Full body…"
            value={progName} onChange={(e) => { setProgName(e.target.value); setProgError(""); }}
            maxLength={40}
          />
          {progError && <div className="nutri-error" style={{ marginTop: 6 }}>{progError}</div>}
        </div>
 
        {/* Selected exercises config */}
        {progExercises.length > 0 && (
          <div className="card">
            <div className="card-label">Exercices sélectionnés ({progExercises.length})</div>
            <div className="train-prog-sel-list">
              {progExercises.map((ex) => {
                const isCardio = ex.category === "cardio";
                return (
                  <div key={ex.exerciseId} className="train-prog-sel-item">
                    <div className="train-prog-sel-header">
                      <span className="train-prog-sel-name">{ex.name}</span>
                      <button className="nutri-del-btn" onClick={() => removeProgEx(ex.exerciseId)}>×</button>
                    </div>
                    {!isCardio ? (
                      <div className="train-prog-sel-config">
                        <div className="train-prog-sel-field">
                          <label>Séries</label>
                          <input className="input train-prog-sel-input" type="number" inputMode="numeric" min={1} max={20}
                            value={ex.sets || ""} onChange={(e) => updateProgEx(ex.exerciseId, "sets", Math.max(0, Number(e.target.value) || 0))} />
                        </div>
                        <span className="train-prog-sel-x">×</span>
                        <div className="train-prog-sel-field">
                          <label>Reps</label>
                          <input className="input train-prog-sel-input" type="number" inputMode="numeric" min={1} max={100}
                            value={ex.reps || ""} onChange={(e) => updateProgEx(ex.exerciseId, "reps", Math.max(0, Number(e.target.value) || 0))} />
                        </div>
                      </div>
                    ) : (
                      <div className="train-prog-sel-note">Durée et distance saisies en séance</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
 
        {/* Catalog */}
        <div className="train-section-label">Ajouter des exercices au programme</div>
        <ExerciseCatalog
          onSelect={addProgEx} selectedIds={selectedIds} disabledIds={[]}
          allExercises={allExercises} onCreateExercise={() => setShowCreateEx(true)} />
        <div className="train-actions">
          <button className="btn-primary" onClick={saveProgram}>Créer le programme</button>
          <button className="dash-cancel-btn" style={{ width: "100%" }} onClick={() => nav("home")}>Annuler</button>
        </div>
        {createExModal}
        {toastEl}
      </PageShell>
    );
  }
 
  // VIEW: PROGRAM DETAIL (editable)
  // ══════════════════════════════════════════
  if (view === "detail" && viewData) {
    const prog = viewData;
    const exs = prog.exercises || [];
    return (
      <PageShell title={prog.name} subtitle={`${exs.length} exercice${exs.length > 1 ? "s" : ""}`}>
        <button className="train-back" onClick={() => nav("home")}>← Retour</button>
 
        {exs.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 24 }}>
            <p className="card-text" style={{ opacity: 0.5 }}>Aucun exercice dans ce programme</p>
          </div>
        )}
 
        {exs.map((ex, i) => {
          const exId = ex.exerciseId || ex.id;
          const isCardio = ex.category === "cardio";
          return (
            <div key={exId + "-" + i} className="card train-detail-edit-card">
              <div className="train-detail-edit-head">
                <div className="train-detail-edit-info">
                  <span className="train-detail-num">{i + 1}</span>
                  <span className="train-detail-name">{ex.name}</span>
                  <span className={`train-cat-dot-sm train-cat-${ex.category}`} />
                </div>
                <button className="nutri-del-btn" onClick={() => removeProgramEx(prog.id, exId)} title="Retirer">×</button>
              </div>
              {!isCardio && (
                <div className="train-detail-edit-controls">
                  <div className="train-detail-edit-field">
                    <span className="train-detail-edit-label">Séries</span>
                    <div className="train-detail-stepper">
                      <button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "sets", Math.max(1, (Number(ex.sets) || 3) - 1))}>−</button>
                      <input className="train-stepper-val" type="number" inputMode="numeric"
                        value={ex.sets || 3} onChange={(e) => updateProgramEx(prog.id, exId, "sets", Math.max(1, Number(e.target.value) || 1))} />
                      <button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "sets", Math.min(20, (Number(ex.sets) || 3) + 1))}>+</button>
                    </div>
                  </div>
                  <span className="train-detail-edit-x">×</span>
                  <div className="train-detail-edit-field">
                    <span className="train-detail-edit-label">Reps</span>
                    <div className="train-detail-stepper">
                      <button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "reps", Math.max(1, (Number(ex.reps) || 10) - 1))}>−</button>
                      <input className="train-stepper-val" type="number" inputMode="numeric"
                        value={ex.reps || 10} onChange={(e) => updateProgramEx(prog.id, exId, "reps", Math.max(1, Number(e.target.value) || 1))} />
                      <button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "reps", Math.min(100, (Number(ex.reps) || 10) + 1))}>+</button>
                    </div>
                  </div>
                </div>
              )}
              {isCardio && (
                <span className="train-detail-edit-cardio-note">Durée et distance saisies en séance</span>
              )}
            </div>
          );
        })}
 
        <button className="btn-primary" onClick={() => startProgramSession(prog)} style={{ marginTop: 4 }}>
          Lancer ce programme
        </button>
        <div className="train-detail-actions">
          <button className="train-secondary-btn" style={{ flex: 1 }} onClick={() => duplicateProgram(prog)}>Dupliquer</button>
          <button className="dash-clear-btn" style={{ flex: 1 }} onClick={() => deleteProgram(prog.id)}>Supprimer</button>
        </div>
        {toastEl}
      </PageShell>
    );
  }
 
  // ══════════════════════════════════════════
  // VIEW: EXERCISE PICKER (in session)
  // ══════════════════════════════════════════
  if (view === "pick") {
    const addedIds = (activeSession?.exercises || []).map((e) => e.exerciseId);
    return (
      <PageShell title="Ajouter un exercice" subtitle="Sélectionne un exercice">
        <button className="train-back" onClick={() => nav("session")}>← Retour à la séance</button>
        <ExerciseCatalog
          onSelect={addSessionExercise} selectedIds={[]} disabledIds={addedIds}
          allExercises={allExercises} onCreateExercise={() => setShowCreateEx(true)} />
        {createExModal}
      </PageShell>
    );
  }
 
  // ══════════════════════════════════════════
  // VIEW: ACTIVE SESSION
  // ══════════════════════════════════════════
  if (view === "session" && activeSession) {
    const sessionExs = activeSession.exercises || [];
    const totalSets = sessionExs.reduce((s, e) => s + (e.sets?.length || 0), 0);
    const doneSets = sessionExs.reduce((s, e) => s + (e.sets?.filter((st) => st.done).length || 0), 0);
 
    return (
      <PageShell
        title={activeSession.type === "free" ? "Séance libre" : activeSession.programName}
        subtitle={activeSession.type === "program" ? "Programme" : null}
      >
        {/* Timer header */}
        <div className="card train-session-header">
          <div className="train-session-time">{formatTime(elapsed)}</div>
          <div className="train-session-stats">
            <span>{sessionExs.length} exercice{sessionExs.length > 1 ? "s" : ""}</span>
            {totalSets > 0 && <span> · {doneSets}/{totalSets} séries</span>}
          </div>
          {/* Rest mode toggle */}
          <button className="train-rest-toggle" onClick={toggleRestMode}>
            <span className={`train-rest-toggle-dot ${restModeOn ? "train-rest-toggle-on" : ""}`} />
            <span className="train-rest-toggle-label">{restModeOn ? "Repos activé" : "Repos désactivé"}</span>
          </button>
        </div>
 
        {/* Rest timer */}
        {restTimer && (
          <button className="train-rest-bar" onClick={() => setRestTimer(null)}>
            <div className="train-rest-fill" style={{ width: `${(restTimer.remaining / restTimer.total) * 100}%` }} />
            <span className="train-rest-txt">Repos : {formatTime(restTimer.remaining)}</span>
            <span className="train-rest-dismiss">✕</span>
          </button>
        )}
 
        {/* Exercises */}
        {sessionExs.map((ex) => (
          <div key={ex.id} className="card train-sess-ex">
            <div className="train-sess-ex-head">
              <div>
                <span className="train-sess-ex-name">{ex.name}</span>
                <span className={`train-cat-dot-sm train-cat-${ex.category}`} />
              </div>
              <button className="nutri-del-btn" onClick={() => removeSessionEx(ex.id)} title="Retirer">×</button>
            </div>
 
            {ex.category !== "cardio" ? (
              <>
                <div className="train-sets-head">
                  <span className="train-sets-col-num">Série</span>
                  <span className="train-sets-col">Poids (kg)</span>
                  <span className="train-sets-col">Reps</span>
                  <span className="train-sets-col-chk" />
                </div>
                {ex.sets.map((set, si) => (
                  <div key={si} className={`train-set-row ${set.done ? "train-set-done" : ""}`}>
                    <span className="train-set-num">{si + 1}</span>
                    <input className="train-set-input" type="number" inputMode="decimal" placeholder="—"
                      value={set.weight} onChange={(e) => updateSet(ex.id, si, "weight", e.target.value)} />
                    <input className="train-set-input" type="number" inputMode="numeric" placeholder="—"
                      value={set.reps} onChange={(e) => updateSet(ex.id, si, "reps", e.target.value)} />
                    <button className={`train-set-chk ${set.done ? "train-set-chk-on" : ""}`}
                      onClick={() => toggleSetDone(ex.id, si)}>✓</button>
                  </div>
                ))}
                <div className="train-set-btns">
                  <button className="train-set-btn" onClick={() => addSet(ex.id)}>+ Série</button>
                  {ex.sets.length > 1 && <button className="train-set-btn" onClick={() => removeSet(ex.id)}>− Série</button>}
                </div>
              </>
            ) : (() => {
              const dur = secondsToHMS(ex.cardio?.durationSecs);
              return (
                <div className="train-cardio-section">
                  <div className="train-cardio-field">
                    <label className="train-cardio-label">Durée <span className="nutri-required">*</span></label>
                    <div className="train-hms-row">
                      <input className="input train-hms-input" type="number" inputMode="numeric" placeholder="h" min={0} max={23}
                        value={dur.h || ""} onChange={(e) => updateCardioDuration(ex.id, "h", e.target.value)} />
                      <span className="train-hms-sep">:</span>
                      <input className="input train-hms-input" type="number" inputMode="numeric" placeholder="m" min={0} max={59}
                        value={dur.m || ""} onChange={(e) => updateCardioDuration(ex.id, "m", e.target.value)} />
                      <span className="train-hms-sep">:</span>
                      <input className="input train-hms-input" type="number" inputMode="numeric" placeholder="s" min={0} max={59}
                        value={dur.s || ""} onChange={(e) => updateCardioDuration(ex.id, "s", e.target.value)} />
                    </div>
                  </div>
                  <div className="train-cardio-grid">
                    <div className="train-cardio-field">
                      <label className="train-cardio-label">Distance (km)</label>
                      <input className="input input-full" type="number" inputMode="decimal" placeholder="—"
                        value={ex.cardio?.distance || ""} onChange={(e) => updateCardio(ex.id, "distance", e.target.value)} />
                    </div>
                    <div className="train-cardio-field">
                      <label className="train-cardio-label">BPM</label>
                      <input className="input input-full" type="number" inputMode="numeric" placeholder="—"
                        value={ex.cardio?.bpm || ""} onChange={(e) => updateCardio(ex.id, "bpm", e.target.value)} />
                    </div>
                  </div>
                  <div className="train-cardio-grid">
                    <div className="train-cardio-field">
                      <label className="train-cardio-label">Vitesse (km/h)</label>
                      <input className="input input-full train-cardio-auto" type="number" inputMode="decimal" placeholder="auto"
                        value={ex.cardio?.speed || ""} onChange={(e) => updateCardio(ex.id, "speed", e.target.value)} />
                    </div>
                    <div className="train-cardio-field">
                      <label className="train-cardio-label">Allure (min/km)</label>
                      <input className="input input-full train-cardio-auto" type="number" inputMode="decimal" placeholder="auto"
                        value={ex.cardio?.allure || ""} onChange={(e) => updateCardio(ex.id, "allure", e.target.value)} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ))}
 
        {/* Add exercise */}
        <button className="train-secondary-btn" onClick={() => nav("pick")}>
          + Ajouter un exercice
        </button>
 
        {/* Finish */}
        <div className="train-actions" style={{ marginTop: 8 }}>
          <button className="btn-primary" onClick={finishSession}>Terminer la séance</button>
          <button className="dash-cancel-btn" style={{ width: "100%" }} onClick={cancelSession}>Annuler la séance</button>
        </div>
 
        {/* ── Finish Popup ── */}
        {finishData && (
          <div className="train-popup-overlay" onClick={() => setFinishData(null)}>
            <div className="train-popup" onClick={(e) => e.stopPropagation()}>
              <div className="train-popup-title">Séance terminée</div>
 
              {/* Calories */}
              <div className="train-popup-cal">
                <div className="train-popup-cal-big">{finishData.calories.total}</div>
                <div className="train-popup-cal-unit">kcal estimées</div>
                {(finishData.calories.cardio > 0 || finishData.calories.musculation > 0) && (
                  <div className="train-popup-cal-detail">
                    {finishData.calories.cardio > 0 && <span>Cardio : {finishData.calories.cardio} kcal</span>}
                    {finishData.calories.cardio > 0 && finishData.calories.musculation > 0 && <span> · </span>}
                    {finishData.calories.musculation > 0 && <span>Muscu : {finishData.calories.musculation} kcal</span>}
                  </div>
                )}
              </div>
 
              {/* Program changes */}
              {finishData.changes.length > 0 && (
                <div className="train-popup-changes">
                  <div className="train-popup-changes-title">Vous avez modifié ce programme</div>
                  <div className="train-popup-changes-list">
                    {finishData.changes.map((c, i) => (
                      <div key={i} className="train-popup-change-item">{c}</div>
                    ))}
                  </div>
                  <div className="train-popup-change-btns">
                    <button className="btn-primary" style={{ fontSize: 13, padding: "11px 14px" }}
                      onClick={() => confirmFinish(true)}>Enregistrer les modifications</button>
                    <button className="dash-cancel-btn" style={{ width: "100%" }}
                      onClick={() => confirmFinish(false)}>Ignorer</button>
                  </div>
                </div>
              )}
 
              {/* No changes — simple confirm */}
              {finishData.changes.length === 0 && (
                <button className="btn-primary" style={{ width: "100%", marginTop: 12 }}
                  onClick={() => confirmFinish(false)}>Confirmer</button>
              )}
            </div>
          </div>
        )}
 
        {toastEl}
      </PageShell>
    );
  }
 
  // ══════════════════════════════════════════
  // VIEW: SESSION REVIEW (editable history)
  // ══════════════════════════════════════════
  if (view === "review" && viewData) {
    const s = viewData;
    const dateLabel = formatDateLabel(getDateKey(s.startedAt));
    return (
      <PageShell title={s.type === "free" ? "Séance libre" : s.programName || "Programme"} subtitle={dateLabel}>
        <button className="train-back" onClick={() => nav("home")}>← Retour</button>
 
        <div className="card train-review-header">
          <div className="train-review-stat">
            <span className="train-review-stat-val">{s.duration || 0}</span>
            <span className="train-review-stat-label">min</span>
          </div>
          <div className="train-review-divider" />
          <div className="train-review-stat">
            <span className="train-review-stat-val">{s.exercises?.length || 0}</span>
            <span className="train-review-stat-label">exercices</span>
          </div>
          <div className="train-review-divider" />
          <div className="train-review-stat">
            <span className="train-review-stat-val">{s.exercises?.reduce((t, e) => t + (e.sets?.length || 0), 0) || 0}</span>
            <span className="train-review-stat-label">séries</span>
          </div>
          {s.calories?.total > 0 && (
            <>
              <div className="train-review-divider" />
              <div className="train-review-stat">
                <span className="train-review-stat-val" style={{ color: "var(--ok)" }}>{s.calories.total}</span>
                <span className="train-review-stat-label">kcal</span>
              </div>
            </>
          )}
        </div>
 
        {(s.exercises || []).map((ex) => (
          <div key={ex.id} className="card train-sess-ex">
            <div className="train-sess-ex-head">
              <div>
                <span className="train-sess-ex-name">{ex.name}</span>
                <span className={`train-cat-dot-sm train-cat-${ex.category}`} />
              </div>
              <button className="nutri-del-btn" onClick={() => removeHistEx(s.id, ex.id)} title="Retirer">×</button>
            </div>
 
            {ex.category !== "cardio" ? (
              <>
                <div className="train-sets-head">
                  <span className="train-sets-col-num">Série</span>
                  <span className="train-sets-col">Poids (kg)</span>
                  <span className="train-sets-col">Reps</span>
                  <span className="train-sets-col-chk" />
                </div>
                {(ex.sets || []).map((set, si) => (
                  <div key={si} className={`train-set-row ${set.done ? "train-set-done" : ""}`}>
                    <span className="train-set-num">{si + 1}</span>
                    <input className="train-set-input" type="number" inputMode="decimal" placeholder="—"
                      value={set.weight} onChange={(e) => updateHistSet(s.id, ex.id, si, "weight", e.target.value)} />
                    <input className="train-set-input" type="number" inputMode="numeric" placeholder="—"
                      value={set.reps} onChange={(e) => updateHistSet(s.id, ex.id, si, "reps", e.target.value)} />
                    <span className={`train-set-chk ${set.done ? "train-set-chk-on" : ""}`} style={{ cursor: "default" }}>
                      {set.done ? "✓" : ""}
                    </span>
                  </div>
                ))}
                <div className="train-set-btns">
                  <button className="train-set-btn" onClick={() => addHistSet(s.id, ex.id)}>+ Série</button>
                  {(ex.sets?.length || 0) > 1 && <button className="train-set-btn" onClick={() => removeHistSet(s.id, ex.id)}>− Série</button>}
                </div>
              </>
            ) : (
              <div className="train-review-cardio">
                {ex.cardio?.durationSecs > 0 && <div className="train-review-cardio-row">Durée : {formatTime(ex.cardio.durationSecs)}</div>}
                {ex.cardio?.distance && <div className="train-review-cardio-row">Distance : {ex.cardio.distance} km</div>}
                {ex.cardio?.speed && <div className="train-review-cardio-row">Vitesse : {ex.cardio.speed} km/h</div>}
                {ex.cardio?.allure && <div className="train-review-cardio-row">Allure : {ex.cardio.allure} min/km</div>}
                {ex.cardio?.bpm && <div className="train-review-cardio-row">BPM : {ex.cardio.bpm}</div>}
                {!ex.cardio?.durationSecs && !ex.cardio?.distance && (
                  <div className="card-text" style={{ opacity: 0.4 }}>Aucune donnée</div>
                )}
              </div>
            )}
          </div>
        ))}
 
        <button className="dash-clear-btn" style={{ width: "100%", marginTop: 8 }}
          onClick={() => deleteHistSession(s.id)}>
          Supprimer la séance
        </button>
        {toastEl}
      </PageShell>
    );
  }
 
  // Fallback
  return <PageShell title="Entraînement" subtitle=""><button className="train-back" onClick={() => nav("home")}>← Retour</button></PageShell>;
}
 
function NutriSection({ title, count, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen !== undefined ? defaultOpen : true);
  return (
    <div className={`card collapse-card ${open ? "collapse-open" : ""}`}>
      <button className="collapse-toggle" onClick={() => setOpen((p) => !p)}>
        <span className="collapse-title">
          {title}
          {count !== undefined && count !== null && (
            <span className="collapse-count">{count}</span>
          )}
        </span>
        <svg
          className={`collapse-chevron ${open ? "collapse-chevron-open" : ""}`}
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}
 
function NutritionPage() {
  const { state, updateState } = useAppContext();
  const meals = Array.isArray(state?.meals) ? state.meals : [];
  const savedMeals = Array.isArray(state?.savedMeals) ? state.savedMeals : [];
  const todayMeals = getTodayMeals(meals);
 
  const calTarget = state?.dailyCalorieTarget;
  const protTarget = state?.dailyProteinTarget;
  const consumedCal = todayMeals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
  const consumedProt = todayMeals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
 
  // Form
  const emptyForm = { name: "", calories: "", protein: "" };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState("");
 
  const updateField = (field, val) => {
    setForm((p) => ({ ...p, [field]: val }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };
 
  const parseNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
 
  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Le nom du repas est obligatoire";
    const cal = parseNum(form.calories);
    if (cal === null || cal <= 0) errs.calories = "Les calories sont obligatoires";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };
 
  const buildMeal = () => ({
    name: form.name.trim(),
    calories: Math.round(parseNum(form.calories)),
    protein: Math.round(parseNum(form.protein) || 0),
    date: new Date().toISOString(),
  });
 
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };
 
  // ── Single "Ajouter" : meals + auto-save to savedMeals ──
  const handleAdd = () => {
    if (!validate()) return;
    const meal = buildMeal();
    updateState((prev) => {
      const newMeals = cleanOldMeals([...(prev.meals || []), meal]);
      const currentSaved = Array.isArray(prev.savedMeals) ? prev.savedMeals : [];
      const alreadySaved = currentSaved.some(
        (s) => s.name.toLowerCase() === meal.name.toLowerCase()
      );
      return {
        ...prev,
        meals: newMeals,
        savedMeals: alreadySaved
          ? currentSaved
          : [...currentSaved, { name: meal.name, calories: meal.calories, protein: meal.protein, date: meal.date }],
      };
    });
    setForm(emptyForm);
    setErrors({});
    showToast("Repas ajouté");
  };
 
  // ── Quick add from saved ──
  const handleQuickAdd = (saved) => {
    updateState((prev) => ({
      ...prev,
      meals: cleanOldMeals([...(prev.meals || []), {
        name: saved.name,
        calories: saved.calories,
        protein: saved.protein,
        date: new Date().toISOString(),
      }]),
    }));
    showToast(`${saved.name} ajouté`);
  };
 
  const handleDeleteSaved = (index) => {
    updateState((prev) => ({
      ...prev,
      savedMeals: (prev.savedMeals || []).filter((_, i) => i !== index),
    }));
  };
 
  const handleDeleteMeal = (index) => {
    const mealToRemove = todayMeals[index];
    if (!mealToRemove) return;
    let found = false;
    updateState((prev) => ({
      ...prev,
      meals: (prev.meals || []).filter((m) => {
        if (!found && m.date === mealToRemove.date && m.name === mealToRemove.name) {
          found = true;
          return false;
        }
        return true;
      }),
    }));
    showToast("Repas supprimé");
  };
 
  // History: past meals grouped by date
  const todayKey = getTodayKey();
  const pastMeals = meals.filter((m) => {
    const k = getDateKey(m.date);
    return k && k !== todayKey;
  });
  const historyGroups = groupMealsByDate(pastMeals);
 
  return (
    <PageShell title="Nutrition" subtitle="Repas & calories">
 
      {/* ── Résumé du jour (toujours visible) ── */}
      <div className="card nutri-summary">
        <div className="nutri-summary-row">
          <div className="nutri-summary-item">
            <span className="nutri-summary-val">{consumedCal}</span>
            <span className="nutri-summary-label">kcal</span>
          </div>
          <div className="nutri-summary-divider" />
          <div className="nutri-summary-item">
            <span className="nutri-summary-val">{consumedProt}g</span>
            <span className="nutri-summary-label">protéines</span>
          </div>
          {calTarget && (
            <>
              <div className="nutri-summary-divider" />
              <div className="nutri-summary-item">
                <span className={`nutri-summary-val ${calTarget - consumedCal >= 0 ? "nutri-ok" : "nutri-over"}`}>
                  {calTarget - consumedCal}
                </span>
                <span className="nutri-summary-label">kcal rest.</span>
              </div>
            </>
          )}
          {protTarget && (
            <>
              <div className="nutri-summary-divider" />
              <div className="nutri-summary-item">
                <span className={`nutri-summary-val ${protTarget - consumedProt >= 0 ? "nutri-ok" : "nutri-over"}`}>
                  {protTarget - consumedProt}g
                </span>
                <span className="nutri-summary-label">prot rest.</span>
              </div>
            </>
          )}
        </div>
      </div>
 
      {/* ══════════════════════════════════════════
          1. FORMULAIRE
          ══════════════════════════════════════════ */}
      <NutriSection title="Ajouter un repas" defaultOpen={true}>
        <div className="nutri-form">
          <div className="nutri-field-wrap">
            <div className="nutri-field-label">Nom <span className="nutri-required">*</span></div>
            <input
              className={`input input-full ${errors.name ? "input-error" : ""}`}
              type="text"
              placeholder="Ex : Poulet riz"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              maxLength={50}
            />
            {errors.name && <div className="nutri-error">{errors.name}</div>}
          </div>
          <div className="profile-row-2">
            <div className="nutri-field-wrap">
              <div className="nutri-field-label">Calories <span className="nutri-required">*</span></div>
              <input
                className={`input input-full ${errors.calories ? "input-error" : ""}`}
                type="number"
                placeholder="450"
                value={form.calories}
                onChange={(e) => updateField("calories", e.target.value)}
                min={0}
                max={9999}
                inputMode="numeric"
              />
              {errors.calories && <div className="nutri-error">{errors.calories}</div>}
            </div>
            <div className="nutri-field-wrap">
              <div className="nutri-field-label">Protéines (g)</div>
              <input
                className="input input-full"
                type="number"
                placeholder="—"
                value={form.protein}
                onChange={(e) => updateField("protein", e.target.value)}
                min={0}
                max={999}
                inputMode="numeric"
              />
            </div>
          </div>
          <button className="btn-primary" onClick={handleAdd}>
            Ajouter
          </button>
        </div>
        {toast && (
          <div className="save-toast" style={{ marginTop: 10 }}>
            <span className="status-dot status-ok" />
            <span>{toast}</span>
          </div>
        )}
      </NutriSection>
 
      {/* ══════════════════════════════════════════
          2. REPAS DU JOUR
          ══════════════════════════════════════════ */}
      <NutriSection title="Repas du jour" count={todayMeals.length} defaultOpen={true}>
        {todayMeals.length === 0 ? (
          <p className="card-text" style={{ opacity: 0.5 }}>Aucun repas aujourd'hui</p>
        ) : (
          <div className="nutri-list">
            {todayMeals.map((m, i) => (
              <div key={i} className="nutri-item">
                <div className="nutri-item-info">
                  <span className="nutri-item-name">{m.name || "—"}</span>
                  <span className="nutri-item-meta">
                    {m.calories} kcal{m.protein ? ` · ${m.protein}g prot` : ""}
                    {m.date && (
                      <span className="nutri-item-time">
                        {" · "}{new Date(m.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </span>
                </div>
                <button className="nutri-del-btn" onClick={() => handleDeleteMeal(i)} title="Supprimer">×</button>
              </div>
            ))}
          </div>
        )}
      </NutriSection>
 
      {/* ══════════════════════════════════════════
          3. REPAS ENREGISTRÉS
          ══════════════════════════════════════════ */}
      <NutriSection title="Repas enregistrés" count={savedMeals.length} defaultOpen={false}>
        {savedMeals.length === 0 ? (
          <p className="card-text" style={{ opacity: 0.5 }}>
            Les repas ajoutés sont automatiquement enregistrés ici
          </p>
        ) : (
          <div className="nutri-list">
            {savedMeals.map((m, i) => (
              <div key={i} className="nutri-item">
                <div className="nutri-item-info">
                  <span className="nutri-item-name">{m.name || "—"}</span>
                  <span className="nutri-item-meta">{m.calories} kcal{m.protein ? ` · ${m.protein}g prot` : ""}</span>
                </div>
                <div className="nutri-item-actions">
                  <button className="nutri-quick-btn" onClick={() => handleQuickAdd(m)} title="Ajouter au jour">+</button>
                  <button className="nutri-del-btn" onClick={() => handleDeleteSaved(i)} title="Supprimer">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </NutriSection>
 
      {/* ══════════════════════════════════════════
          4. HISTORIQUE (30 JOURS)
          ══════════════════════════════════════════ */}
      <NutriSection
        title="Historique"
        count={historyGroups.length > 0 ? pastMeals.length : null}
        defaultOpen={false}
      >
        {historyGroups.length === 0 ? (
          <p className="card-text" style={{ opacity: 0.5 }}>
            Les repas des 30 derniers jours apparaîtront ici
          </p>
        ) : (
          <div className="hist-groups">
            {historyGroups.map((group) => {
              const dayCal = group.meals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
              const dayProt = group.meals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
              return (
                <div key={group.dateKey} className="hist-day">
                  <div className="hist-day-header">
                    <span className="hist-day-label">{group.label}</span>
                    <span className="hist-day-totals">
                      {dayCal} kcal{dayProt > 0 ? ` · ${dayProt}g` : ""}
                    </span>
                  </div>
                  <div className="hist-day-meals">
                    {group.meals.map((m, j) => (
                      <div key={j} className="hist-meal">
                        <span className="hist-meal-name">{m.name || "—"}</span>
                        <span className="hist-meal-meta">
                          {m.calories} kcal{m.protein ? ` · ${m.protein}g` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </NutriSection>
    </PageShell>
  );
}
 
function TrackingPage() {
  return (
    <PageShell title="Suivi" subtitle="Progression & métriques">
      <div className="card">
        <div className="card-dot" />
        <p className="card-text">Module de suivi — en attente de configuration.</p>
      </div>
      <div className="chart-placeholder">
        <svg width="100%" height="80" viewBox="0 0 300 80" preserveAspectRatio="none">
          <polyline
            points="0,60 40,50 80,55 120,30 160,40 200,20 240,35 280,15 300,25"
            fill="none"
            stroke="#2a2a2e"
            strokeWidth="2"
          />
        </svg>
        <span className="chart-label">Pas encore de données</span>
      </div>
    </PageShell>
  );
}
 
function ProfilePage() {
  const { state, updateState } = useAppContext();
  const saved = state?.userProfile || {};
 
  const [form, setForm] = useState({
    name: saved.name || "",
    birthdate: saved.birthdate || "",
    sex: saved.sex || "",
    height: saved.height || "",
    weight: saved.weight || "",
    activity: saved.activity || "",
  });
  const [saveMsg, setSaveMsg] = useState("");
 
  const update = (field, raw) => {
    setForm((prev) => ({ ...prev, [field]: raw }));
    setSaveMsg("");
  };
 
  const parseNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
 
  const age = calculateAge(form.birthdate);
 
  const profileForCalc = {
    name: form.name,
    birthdate: form.birthdate,
    sex: form.sex,
    height: parseNum(form.height),
    weight: parseNum(form.weight),
    activity: form.activity,
  };
 
  const complete = isProfileComplete(profileForCalc);
  const bmr = complete ? calculateBMR(profileForCalc) : null;
  const tdee = complete ? calculateTDEE(profileForCalc) : null;
 
  const handleSave = () => {
    const toSave = {
      name: form.name.trim(),
      birthdate: form.birthdate,
      sex: form.sex,
      height: parseNum(form.height) || "",
      weight: parseNum(form.weight) || "",
      activity: form.activity,
    };
    updateState((prev) => ({
      ...prev,
      user: { ...prev.user, name: toSave.name },
      userProfile: toSave,
    }));
    setSaveMsg("Profil enregistré");
    setTimeout(() => setSaveMsg(""), 2500);
  };
 
  return (
    <PageShell title="Profil" subtitle="Informations & métabolisme">
      {/* ── Prénom ── */}
      <div className="card">
        <div className="card-label">Prénom</div>
        <input
          className="input input-full"
          type="text"
          placeholder="Ton prénom..."
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          maxLength={30}
        />
      </div>
 
      {/* ── Date de naissance & Sexe ── */}
      <div className="card">
        <div className="profile-row-2">
          <div className="profile-field">
            <div className="card-label">Date de naissance</div>
            <input
              className="input input-full"
              type="date"
              value={form.birthdate}
              onChange={(e) => update("birthdate", e.target.value)}
              max={new Date().toISOString().split("T")[0]}
            />
            {age !== null && (
              <div className="age-badge">{age} ans</div>
            )}
          </div>
          <div className="profile-field">
            <div className="card-label">Sexe</div>
            <select
              className="input input-full select"
              value={form.sex}
              onChange={(e) => update("sex", e.target.value)}
            >
              <option value="">—</option>
              <option value="male">Homme</option>
              <option value="female">Femme</option>
            </select>
          </div>
        </div>
      </div>
 
      {/* ── Taille & Poids ── */}
      <div className="card">
        <div className="profile-row-2">
          <div className="profile-field">
            <div className="card-label">Taille (cm)</div>
            <input
              className="input input-full"
              type="number"
              placeholder="175"
              value={form.height}
              onChange={(e) => update("height", e.target.value)}
              min={80}
              max={260}
              inputMode="numeric"
            />
          </div>
          <div className="profile-field">
            <div className="card-label">Poids (kg)</div>
            <input
              className="input input-full"
              type="number"
              placeholder="75"
              value={form.weight}
              onChange={(e) => update("weight", e.target.value)}
              min={20}
              max={350}
              inputMode="numeric"
            />
          </div>
        </div>
      </div>
 
      {/* ── Activité ── */}
      <div className="card">
        <div className="card-label">Niveau d'activité quotidienne</div>
        <p className="card-text" style={{ marginBottom: 10, fontSize: 12, opacity: 0.5 }}>
          Hors entraînements
        </p>
        <select
          className="input input-full select"
          value={form.activity}
          onChange={(e) => update("activity", e.target.value)}
        >
          <option value="">— Sélectionner —</option>
          {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
 
      {/* ── Bouton Enregistrer ── */}
      <button className="btn-primary" onClick={handleSave}>
        Enregistrer
      </button>
      {saveMsg && (
        <div className="save-toast">
          <span className="status-dot status-ok" />
          <span>{saveMsg}</span>
        </div>
      )}
 
      {/* ── Résultats métaboliques ── */}
      {complete && bmr !== null && tdee !== null && (
        <div className="card metabolism-card">
          <div className="card-label">Résultats métaboliques</div>
          <div className="metab-grid">
            <div className="metab-item">
              <span className="metab-value">{Math.round(bmr)}</span>
              <span className="metab-unit">kcal</span>
              <span className="metab-label">Métabolisme de base (BMR)</span>
            </div>
            <div className="metab-divider" />
            <div className="metab-item">
              <span className="metab-value">{Math.round(tdee)}</span>
              <span className="metab-unit">kcal</span>
              <span className="metab-label">Dépense quotidienne (TDEE)</span>
            </div>
          </div>
        </div>
      )}
 
      {/* ── Infos système ── */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-label">Système</div>
        <div className="card-row" style={{ marginBottom: 8 }}>
          <span className="status-dot status-ok" />
          <span className="card-text">localStorage actif</span>
        </div>
        <p className="card-text" style={{ opacity: 0.4 }}>TEST v0.1.0</p>
      </div>
    </PageShell>
  );
}
 
// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
const PAGES = {
  home: HomePage,
  training: TrainingPage,
  nutrition: NutritionPage,
  tracking: TrackingPage,
  profile: ProfilePage,
};
 
function PageRenderer({ activeTab }) {
  const Page = PAGES[activeTab] || HomePage;
  return <Page />;
}
 
// ─────────────────────────────────────────────
// BOTTOM NAV
// ─────────────────────────────────────────────
function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`nav-btn ${isActive ? "nav-active" : ""}`}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
          >
            <div className="nav-icon">{tab.icon(isActive)}</div>
            <span className="nav-label">{tab.label}</span>
            {isActive && <div className="nav-indicator" />}
          </button>
        );
      })}
    </nav>
  );
}
 
// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [mounted, setMounted] = useState(false);
 
  useEffect(() => {
    setMounted(true);
  }, []);
 
  return (
    <ErrorBoundary>
      <AppProvider>
        <div className={`app-root ${mounted ? "app-mounted" : ""}`}>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
 
            *, *::before, *::after {
              margin: 0; padding: 0; box-sizing: border-box;
              -webkit-tap-highlight-color: transparent;
            }
 
            :root {
              --bg-root: #0a0a0b;
              --bg-card: #111113;
              --bg-card-hover: #161618;
              --bg-nav: #0d0d0f;
              --border: #1c1c20;
              --border-light: #252528;
              --text-primary: #e8e8ea;
              --text-secondary: #8a8a92;
              --text-muted: #55555c;
              --accent: #7b7bff;
              --accent-dim: rgba(123, 123, 255, 0.12);
              --ok: #3ddc84;
              --radius: 14px;
              --radius-sm: 10px;
              --font: 'DM Sans', -apple-system, sans-serif;
              --mono: 'JetBrains Mono', monospace;
              --nav-height: 72px;
              --safe-bottom: env(safe-area-inset-bottom, 0px);
            }
 
            html, body {
              background: var(--bg-root);
              color: var(--text-primary);
              font-family: var(--font);
              font-size: 15px;
              line-height: 1.5;
              -webkit-font-smoothing: antialiased;
              overflow: hidden;
              height: 100%;
            }
 
            .app-root {
              display: flex;
              flex-direction: column;
              height: 100vh;
              height: 100dvh;
              opacity: 0;
              transition: opacity 0.4s ease;
            }
            .app-mounted { opacity: 1; }
 
            /* ── Page Shell ── */
            .page-shell {
              flex: 1;
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
              padding: 20px 20px calc(var(--nav-height) + var(--safe-bottom) + 20px);
            }
            .page-header {
              padding: 12px 0 24px;
            }
            .page-title {
              font-size: 28px;
              font-weight: 600;
              letter-spacing: -0.5px;
              color: var(--text-primary);
            }
            .page-subtitle {
              font-size: 14px;
              color: var(--text-secondary);
              margin-top: 4px;
            }
            .page-content {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
 
            /* ── Cards ── */
            .card {
              background: var(--bg-card);
              border: 1px solid var(--border);
              border-radius: var(--radius);
              padding: 18px;
              transition: background 0.2s;
            }
            .card:hover { background: var(--bg-card-hover); }
            .card-dot {
              width: 6px; height: 6px;
              background: var(--accent);
              border-radius: 50%;
              margin-bottom: 12px;
              opacity: 0.7;
            }
            .card-label {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: var(--text-muted);
              margin-bottom: 10px;
            }
            .card-text {
              font-size: 14px;
              color: var(--text-secondary);
              line-height: 1.6;
            }
            .card-row {
              display: flex;
              align-items: center;
              gap: 10px;
            }
 
            /* ── Status ── */
            .status-dot {
              width: 7px; height: 7px;
              border-radius: 50%;
              flex-shrink: 0;
            }
            .status-ok {
              background: var(--ok);
              box-shadow: 0 0 8px rgba(61, 220, 132, 0.3);
            }
 
            /* ── Empty Slots ── */
            .empty-slots {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .slot {
              height: 52px;
              background: var(--bg-card);
              border: 1px dashed var(--border);
              border-radius: var(--radius-sm);
              opacity: 0.5;
            }
 
            /* ── Chart Placeholder ── */
            .chart-placeholder {
              background: var(--bg-card);
              border: 1px solid var(--border);
              border-radius: var(--radius);
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 12px;
            }
            .chart-label {
              font-size: 12px;
              color: var(--text-muted);
            }
 
            /* ── Input ── */
            .input-row {
              display: flex;
              gap: 8px;
            }
            .input {
              flex: 1;
              padding: 10px 14px;
              background: var(--bg-root);
              border: 1px solid var(--border-light);
              border-radius: var(--radius-sm);
              color: var(--text-primary);
              font-family: var(--font);
              font-size: 14px;
              outline: none;
              transition: border-color 0.2s;
            }
            .input::placeholder { color: var(--text-muted); }
            .input:focus { border-color: var(--accent); }
            .btn-save {
              padding: 10px 20px;
              background: var(--accent-dim);
              color: var(--accent);
              border: 1px solid rgba(123, 123, 255, 0.2);
              border-radius: var(--radius-sm);
              font-family: var(--font);
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
            }
            .btn-save:active {
              transform: scale(0.96);
              background: rgba(123, 123, 255, 0.2);
            }
 
            /* ── Bottom Nav ── */
            .bottom-nav {
              position: fixed;
              bottom: 0; left: 0; right: 0;
              height: calc(var(--nav-height) + var(--safe-bottom));
              padding-bottom: var(--safe-bottom);
              background: var(--bg-nav);
              border-top: 1px solid var(--border);
              display: flex;
              align-items: center;
              justify-content: space-around;
              z-index: 100;
              backdrop-filter: blur(16px);
              -webkit-backdrop-filter: blur(16px);
            }
            .nav-btn {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 3px;
              background: none;
              border: none;
              cursor: pointer;
              padding: 6px 12px;
              position: relative;
              min-width: 56px;
              transition: transform 0.15s;
            }
            .nav-btn:active { transform: scale(0.92); }
            .nav-icon {
              width: 24px; height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: transform 0.2s;
            }
            .nav-active .nav-icon { transform: translateY(-1px); }
            .nav-label {
              font-size: 10px;
              font-weight: 500;
              color: var(--text-muted);
              transition: color 0.2s;
            }
            .nav-active .nav-label { color: var(--text-primary); }
            .nav-indicator {
              position: absolute;
              top: -1px; left: 50%;
              transform: translateX(-50%);
              width: 20px; height: 2px;
              background: var(--accent);
              border-radius: 2px;
              opacity: 0.8;
            }
 
            /* ── Profile Form ── */
            .input-full { width: 100%; }
            .select {
              appearance: none;
              -webkit-appearance: none;
              background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2355555c' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'/%3E%3C/svg%3E");
              background-repeat: no-repeat;
              background-position: right 14px center;
              padding-right: 36px;
              cursor: pointer;
            }
            .select option {
              background: #111113;
              color: #e8e8ea;
            }
            .profile-row-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .profile-field {
              display: flex;
              flex-direction: column;
            }
            .age-badge {
              margin-top: 6px;
              padding: 4px 10px;
              background: var(--accent-dim);
              color: var(--accent);
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              width: fit-content;
              letter-spacing: 0.3px;
              animation: toastIn 0.3s ease;
            }
            .btn-primary {
              width: 100%;
              padding: 14px 20px;
              background: var(--accent);
              color: #fff;
              border: none;
              border-radius: var(--radius);
              font-family: var(--font);
              font-size: 15px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
              letter-spacing: 0.3px;
            }
            .btn-primary:active {
              transform: scale(0.97);
              opacity: 0.85;
            }
            .save-toast {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              padding: 12px;
              background: rgba(61, 220, 132, 0.08);
              border: 1px solid rgba(61, 220, 132, 0.15);
              border-radius: var(--radius-sm);
              font-size: 13px;
              color: var(--ok);
              animation: toastIn 0.3s ease;
            }
            @keyframes toastIn {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
 
            /* ── Metabolism Results ── */
            .metabolism-card {
              border-color: rgba(123, 123, 255, 0.15);
              background: linear-gradient(135deg, var(--bg-card) 0%, rgba(123, 123, 255, 0.04) 100%);
            }
            .metab-grid {
              display: flex;
              align-items: stretch;
              gap: 0;
              margin-top: 4px;
            }
            .metab-item {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 12px 8px;
            }
            .metab-value {
              font-size: 28px;
              font-weight: 600;
              color: var(--text-primary);
              font-family: var(--mono);
              letter-spacing: -1px;
              line-height: 1.1;
            }
            .metab-unit {
              font-size: 12px;
              color: var(--accent);
              font-weight: 500;
              margin-top: 2px;
            }
            .metab-label {
              font-size: 11px;
              color: var(--text-muted);
              text-align: center;
              margin-top: 6px;
              line-height: 1.3;
            }
            .metab-divider {
              width: 1px;
              background: var(--border);
              align-self: stretch;
              margin: 8px 0;
            }
 
            /* remove spinner on number inputs */
            input[type=number]::-webkit-inner-spin-button,
            input[type=number]::-webkit-outer-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
            input[type=number] { -moz-appearance: textfield; }
 
            /* ── Dashboard ── */
            .dash-empty-card {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 32px 20px;
            }
            .dash-metric-card,
            .dash-target-card,
            .dash-remaining-card {
              position: relative;
            }
            .dash-metric-row {
              display: flex;
              align-items: baseline;
              gap: 8px;
              margin-top: 4px;
            }
            .dash-metric-value {
              font-size: 34px;
              font-weight: 600;
              font-family: var(--mono);
              color: var(--text-primary);
              letter-spacing: -1.5px;
              line-height: 1.1;
            }
            .dash-metric-unit {
              font-size: 13px;
              color: var(--text-muted);
              font-weight: 500;
            }
            .dash-metric-sub {
              margin-top: 8px;
              font-size: 12px;
              color: var(--text-muted);
            }
            .dash-target-card {
              border-color: rgba(123, 123, 255, 0.18);
              background: linear-gradient(135deg, var(--bg-card) 0%, rgba(123, 123, 255, 0.04) 100%);
            }
            .dash-target-value {
              color: var(--accent);
            }
            .dash-edit-btn {
              position: absolute;
              top: 16px;
              right: 16px;
              padding: 5px 12px;
              background: var(--accent-dim);
              color: var(--accent);
              border: 1px solid rgba(123, 123, 255, 0.15);
              border-radius: 7px;
              font-family: var(--font);
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
            }
            .dash-edit-btn:active { transform: scale(0.95); }
            .dash-remaining-card {
              border-color: rgba(61, 220, 132, 0.15);
              background: linear-gradient(135deg, var(--bg-card) 0%, rgba(61, 220, 132, 0.03) 100%);
            }
            .dash-remaining-value {
              color: var(--ok);
            }
            .dash-over-value {
              color: #ff6b6b;
            }
            .dash-empty-target {
              text-align: center;
              padding: 24px 18px;
            }
            .dash-empty-target .card-label {
              text-align: left;
            }
 
            /* ── Dashboard section labels ── */
            .dash-section-label {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1.2px;
              color: var(--text-muted);
              padding: 8px 0 0;
            }
 
            /* ── Objectives grid ── */
            .dash-obj-grid {
              display: flex;
              align-items: stretch;
            }
            .dash-obj-single {
              justify-content: center;
            }
            .dash-obj-col {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 8px 6px 4px;
              position: relative;
            }
            .dash-obj-label {
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              color: var(--text-muted);
              margin-bottom: 6px;
            }
            .dash-obj-val {
              font-size: 28px;
              font-weight: 600;
              font-family: var(--mono);
              letter-spacing: -1px;
              line-height: 1.1;
              color: var(--text-primary);
            }
            .dash-obj-unit {
              font-size: 11px;
              color: var(--text-muted);
              margin-top: 2px;
            }
            .dash-obj-edit {
              margin-top: 8px;
              padding: 4px 12px;
              background: var(--accent-dim);
              color: var(--accent);
              border: 1px solid rgba(123, 123, 255, 0.15);
              border-radius: 6px;
              font-family: var(--font);
              font-size: 11px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
            }
            .dash-obj-edit:active { transform: scale(0.95); }
            .dash-obj-define {
              margin-top: 6px;
              padding: 10px 18px;
              background: var(--accent-dim);
              color: var(--accent);
              border: 1px solid rgba(123, 123, 255, 0.15);
              border-radius: var(--radius-sm);
              font-family: var(--font);
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
            }
            .dash-obj-define:active { transform: scale(0.96); }
            .dash-obj-divider {
              width: 1px;
              background: var(--border);
              align-self: stretch;
              margin: 6px 0;
            }
 
            /* ── Remaining grid ── */
            .dash-remaining-grid {
              display: flex;
              align-items: stretch;
            }
            .dash-remaining-col {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 8px 6px;
            }
            .dash-remaining-big {
              font-size: 30px;
              font-weight: 600;
              font-family: var(--mono);
              letter-spacing: -1px;
              line-height: 1.1;
            }
            .dash-remaining-unit {
              font-size: 11px;
              color: var(--text-muted);
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 3px;
            }
            .dash-remaining-sub {
              font-size: 11px;
              color: var(--text-muted);
              margin-top: 6px;
              opacity: 0.7;
            }
            .dash-remaining-divider {
              width: 1px;
              background: var(--border);
              align-self: stretch;
              margin: 6px 0;
            }
 
            /* ── Nutrition ── */
            .nutri-summary {
              padding: 16px;
            }
            .nutri-summary-row {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0;
            }
            .nutri-summary-item {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 4px 6px;
            }
            .nutri-summary-val {
              font-size: 22px;
              font-weight: 600;
              font-family: var(--mono);
              color: var(--text-primary);
              letter-spacing: -0.5px;
              line-height: 1.2;
            }
            .nutri-summary-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: var(--text-muted);
              margin-top: 2px;
            }
            .nutri-summary-divider {
              width: 1px;
              height: 32px;
              background: var(--border);
              flex-shrink: 0;
            }
            .nutri-ok { color: var(--ok); }
            .nutri-over { color: #ff6b6b; }
            .nutri-form {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .nutri-btn-row {
              display: flex;
              gap: 8px;
            }
            .nutri-btn-row .btn-primary {
              flex: 1;
            }
            .nutri-save-btn {
              flex: 1;
              padding: 12px 10px;
              background: var(--accent-dim);
              color: var(--accent);
              border: 1px solid rgba(123, 123, 255, 0.15);
              border-radius: var(--radius-sm);
              font-family: var(--font);
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
            }
            .nutri-save-btn:active {
              transform: scale(0.97);
            }
            .nutri-save-btn:disabled {
              cursor: default;
            }
            .nutri-list {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            .nutri-item {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 10px 12px;
              background: var(--bg-root);
              border: 1px solid var(--border);
              border-radius: var(--radius-sm);
              gap: 8px;
            }
            .nutri-item-info {
              display: flex;
              flex-direction: column;
              min-width: 0;
              flex: 1;
            }
            .nutri-item-name {
              font-size: 14px;
              font-weight: 500;
              color: var(--text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .nutri-item-meta {
              font-size: 12px;
              color: var(--text-muted);
              margin-top: 1px;
            }
            .nutri-item-actions {
              display: flex;
              gap: 6px;
              flex-shrink: 0;
            }
            .nutri-quick-btn {
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: rgba(61, 220, 132, 0.1);
              color: var(--ok);
              border: 1px solid rgba(61, 220, 132, 0.15);
              border-radius: 8px;
              font-size: 18px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.15s;
            }
            .nutri-quick-btn:active { transform: scale(0.9); }
            .nutri-del-btn {
              width: 32px;
              height: 32px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: none;
              color: var(--text-muted);
              border: 1px solid var(--border);
              border-radius: 8px;
              font-size: 16px;
              cursor: pointer;
              transition: all 0.15s;
            }
            .nutri-del-btn:active {
              background: rgba(255, 80, 80, 0.1);
              color: #ff6b6b;
              border-color: rgba(255, 80, 80, 0.2);
            }
            .nutri-field-wrap {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .nutri-field-label {
              font-size: 12px;
              font-weight: 500;
              color: var(--text-secondary);
            }
            .nutri-required {
              color: var(--accent);
              font-weight: 600;
            }
            .input-error {
              border-color: #ff6b6b !important;
            }
            .nutri-error {
              font-size: 12px;
              color: #ff6b6b;
              margin-top: 2px;
              animation: toastIn 0.2s ease;
            }
            .nutri-prot-card {
              position: relative;
              border-color: rgba(123, 123, 255, 0.12);
            }
            .nutri-item-time {
              opacity: 0.6;
            }
 
            /* ── Collapsible Sections ── */
            .collapse-card {
              padding: 0;
              overflow: hidden;
            }
            .collapse-toggle {
              display: flex;
              align-items: center;
              justify-content: space-between;
              width: 100%;
              padding: 16px 18px;
              background: none;
              border: none;
              cursor: pointer;
              color: var(--text-secondary);
              font-family: var(--font);
              text-align: left;
              transition: background 0.15s;
              gap: 10px;
            }
            .collapse-toggle:active {
              background: var(--bg-card-hover);
            }
            .collapse-title {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: var(--text-muted);
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .collapse-count {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-width: 20px;
              height: 20px;
              padding: 0 6px;
              background: var(--accent-dim);
              color: var(--accent);
              border-radius: 10px;
              font-size: 11px;
              font-weight: 600;
              font-family: var(--mono);
              letter-spacing: 0;
              text-transform: none;
            }
            .collapse-chevron {
              color: var(--text-muted);
              transition: transform 0.25s ease;
              flex-shrink: 0;
            }
            .collapse-chevron-open {
              transform: rotate(180deg);
            }
            .collapse-body {
              padding: 0 18px 16px;
              animation: toastIn 0.2s ease;
            }
 
            /* ── History (inside collapse) ── */
            .hist-groups {
              display: flex;
              flex-direction: column;
              gap: 14px;
            }
            .hist-day {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            .hist-day-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 6px;
              border-bottom: 1px solid var(--border);
            }
            .hist-day-label {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-primary);
            }
            .hist-day-totals {
              font-size: 11px;
              font-family: var(--mono);
              color: var(--text-muted);
              letter-spacing: -0.3px;
            }
            .hist-day-meals {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .hist-meal {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 7px 10px;
              background: var(--bg-root);
              border: 1px solid var(--border);
              border-radius: 8px;
              gap: 8px;
            }
            .hist-meal-name {
              font-size: 13px;
              color: var(--text-secondary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              min-width: 0;
              flex: 1;
            }
            .hist-meal-meta {
              font-size: 12px;
              font-family: var(--mono);
              color: var(--text-muted);
              letter-spacing: -0.3px;
              flex-shrink: 0;
            }
 
            /* ── Inline Form (objectif) ── */
            .dash-inline-form {
              display: flex;
              flex-direction: column;
              gap: 10px;
              margin-top: 10px;
              animation: toastIn 0.25s ease;
            }
            .dash-suggestion {
              font-size: 12px;
              color: var(--ok);
              background: rgba(61, 220, 132, 0.08);
              border: 1px solid rgba(61, 220, 132, 0.12);
              border-radius: 8px;
              padding: 10px 12px;
              line-height: 1.4;
            }
            .dash-form-actions {
              display: flex;
              gap: 8px;
            }
            .dash-cancel-btn,
            .dash-clear-btn {
              flex: 1;
              padding: 9px 10px;
              background: none;
              border: 1px solid var(--border);
              border-radius: var(--radius-sm);
              color: var(--text-muted);
              font-family: var(--font);
              font-size: 13px;
              cursor: pointer;
              transition: all 0.15s;
            }
            .dash-cancel-btn:active {
              background: var(--bg-card-hover);
            }
            .dash-clear-btn:active {
              background: rgba(255, 80, 80, 0.08);
              color: #ff6b6b;
              border-color: rgba(255, 80, 80, 0.2);
            }
 
            /* ── Training ── */
            .train-main-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            }
            .train-secondary-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 7px;
              width: 100%;
              padding: 12px 16px;
              background: var(--bg-card);
              border: 1px dashed var(--border-light);
              border-radius: var(--radius);
              color: var(--text-secondary);
              font-family: var(--font);
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
            }
            .train-secondary-btn:active {
              transform: scale(0.97);
              background: var(--bg-card-hover);
            }
            .train-back {
              display: inline-flex;
              align-items: center;
              background: none;
              border: none;
              color: var(--accent);
              font-family: var(--font);
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              padding: 4px 0;
              margin-bottom: 4px;
            }
            .train-back:active { opacity: 0.6; }
            .train-section-label {
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: var(--text-muted);
              padding: 8px 0 2px;
            }
            .train-empty {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 32px 20px;
            }
 
            /* Banner */
            .train-banner {
              display: flex;
              align-items: center;
              gap: 10px;
              width: 100%;
              padding: 14px 16px;
              background: rgba(61, 220, 132, 0.08);
              border: 1px solid rgba(61, 220, 132, 0.2);
              border-radius: var(--radius);
              cursor: pointer;
              font-family: var(--font);
              transition: all 0.15s;
            }
            .train-banner:active { transform: scale(0.98); }
            .train-banner-dot {
              width: 8px; height: 8px;
              background: var(--ok);
              border-radius: 50%;
              box-shadow: 0 0 8px rgba(61, 220, 132, 0.5);
              flex-shrink: 0;
              animation: pulse 2s infinite;
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
            .train-banner-txt {
              flex: 1;
              font-size: 14px;
              font-weight: 500;
              color: var(--ok);
            }
            .train-banner-arrow {
              font-size: 13px;
              color: var(--ok);
              opacity: 0.7;
              flex-shrink: 0;
            }
 
            /* Program list */
            .train-prog-list {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .train-prog-card {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              cursor: pointer;
              text-align: left;
              width: 100%;
              font-family: var(--font);
            }
            .train-prog-card-info {
              display: flex;
              flex-direction: column;
              min-width: 0;
              flex: 1;
            }
            .train-prog-card-name {
              font-size: 15px;
              font-weight: 600;
              color: var(--text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .train-prog-card-meta {
              font-size: 12px;
              color: var(--text-muted);
              margin-top: 2px;
            }
 
            /* Filters */
            /* Tabs */
            .train-tabs {
              display: flex;
              gap: 0;
              border: 1px solid var(--border);
              border-radius: var(--radius);
              overflow: hidden;
            }
            .train-tab {
              flex: 1;
              padding: 10px 8px;
              background: var(--bg-card);
              border: none;
              border-right: 1px solid var(--border);
              color: var(--text-muted);
              font-family: var(--font);
              font-size: 13px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.15s;
              text-align: center;
            }
            .train-tab:last-child { border-right: none; }
            .train-tab:active { background: var(--bg-card-hover); }
            .train-tab-on { color: #fff; }
            .train-tab-musculation { background: rgba(123, 123, 255, 0.2); color: var(--accent); }
            .train-tab-cardio { background: rgba(61, 220, 132, 0.2); color: var(--ok); }
            .train-tab-crossfit { background: rgba(255, 167, 38, 0.2); color: #ffa726; }
 
            /* Catalog badges */
            .train-cat-badge {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              width: fit-content;
            }
            .train-cat-musculation, .train-cat-dot.train-cat-musculation {
              background: rgba(123, 123, 255, 0.12);
              color: var(--accent);
            }
            .train-cat-cardio, .train-cat-dot.train-cat-cardio {
              background: rgba(61, 220, 132, 0.12);
              color: var(--ok);
            }
            .train-cat-crossfit, .train-cat-dot.train-cat-crossfit {
              background: rgba(255, 167, 38, 0.12);
              color: #ffa726;
            }
            .train-cat-dot-sm {
              display: inline-block;
              width: 6px; height: 6px;
              border-radius: 50%;
              margin-left: 6px;
              vertical-align: middle;
            }
            .train-cat-dot-sm.train-cat-musculation { background: var(--accent); }
            .train-cat-dot-sm.train-cat-cardio { background: var(--ok); }
            .train-cat-dot-sm.train-cat-crossfit { background: #ffa726; }
 
            /* Exercise groups + rows */
            .train-group-section {
              display: flex;
              flex-direction: column;
              gap: 4px;
              margin-bottom: 4px;
            }
            .train-group-label {
              font-size: 12px;
              font-weight: 600;
              color: var(--text-secondary);
              padding: 6px 2px 2px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .train-ex-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding: 10px 12px;
              background: var(--bg-card);
              border: 1px solid var(--border);
              border-radius: 8px;
            }
            .train-ex-row-on {
              background: rgba(61, 220, 132, 0.04);
              border-color: rgba(61, 220, 132, 0.2);
            }
            .train-ex-row-dis { opacity: 0.4; }
            .train-ex-row-info {
              display: flex;
              flex-direction: column;
              min-width: 0;
              flex: 1;
              gap: 1px;
            }
            .train-ex-name {
              font-size: 14px;
              color: var(--text-primary);
            }
            .train-ex-equip {
              font-size: 11px;
              color: var(--text-muted);
              opacity: 0.7;
            }
            .train-ex-add-btn {
              flex-shrink: 0;
              padding: 6px 14px;
              background: var(--accent-dim);
              color: var(--accent);
              border: 1px solid rgba(123, 123, 255, 0.2);
              border-radius: 6px;
              font-family: var(--font);
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.15s;
            }
            .train-ex-add-btn:active { transform: scale(0.95); }
            .train-ex-add-btn:disabled { opacity: 0.3; cursor: default; }
            .train-ex-added {
              flex-shrink: 0;
              font-size: 12px;
              color: var(--ok);
              font-weight: 500;
            }
 
            /* Search */
            .train-search-wrap {
              position: relative;
              display: flex;
              align-items: center;
            }
            .train-search-icon {
              position: absolute;
              left: 14px;
              color: var(--text-muted);
              pointer-events: none;
            }
            .train-search-input {
              width: 100%;
              padding: 11px 38px 11px 40px;
              background: var(--bg-card);
              border: 1px solid var(--border);
              border-radius: var(--radius);
              color: var(--text-primary);
              font-family: var(--font);
              font-size: 14px;
              outline: none;
              transition: border-color 0.2s;
            }
            .train-search-input::placeholder { color: var(--text-muted); }
            .train-search-input:focus { border-color: var(--accent); }
            .train-search-clear {
              position: absolute;
              right: 10px;
              background: none;
              border: none;
              color: var(--text-muted);
              font-size: 14px;
              cursor: pointer;
              padding: 4px 6px;
            }
            .train-search-count {
              font-size: 12px;
              color: var(--text-muted);
              padding: 2px 0;
            }
 
            /* Custom exercise badge */
            .train-ex-custom-badge {
              display: inline-block;
              margin-left: 6px;
              padding: 1px 6px;
              background: rgba(255, 167, 38, 0.12);
              color: #ffa726;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              vertical-align: middle;
            }
            .custom-ex-modal {
              max-height: 85vh;
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
            }
            .custom-ex-fields {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .train-text-link {
              background: none;
              border: none;
              color: var(--text-muted);
              font-family: var(--font);
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              padding: 6px 0;
              text-align: center;
              transition: color 0.15s;
            }
            .train-text-link:active { color: var(--accent); }
            .custom-ex-group-row {
              display: flex;
              gap: 6px;
            }
            .custom-ex-group-btn {
              flex: 1;
              padding: 10px 8px;
              background: var(--bg-root);
              border: 1px solid var(--border);
              border-radius: var(--radius-sm);
              color: var(--text-secondary);
              font-family: var(--font);
              font-size: 13px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
              text-align: center;
            }
            .custom-ex-group-btn:active { transform: scale(0.96); }
            .custom-ex-group-on { border-width: 2px; }
            .custom-ex-group-musculation { background: rgba(123, 123, 255, 0.08); border-color: var(--accent); color: var(--accent); }
            .custom-ex-group-cardio { background: rgba(61, 220, 132, 0.08); border-color: var(--ok); color: var(--ok); }
            .custom-ex-group-crossfit { background: rgba(255, 167, 38, 0.08); border-color: #ffa726; color: #ffa726; }
 
            /* Exercise list modal */
            .train-exlist-modal {
              max-height: 90vh;
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            .train-exlist-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
            }
            .train-exlist-close {
              background: none;
              border: none;
              color: var(--text-muted);
              font-size: 18px;
              cursor: pointer;
              padding: 4px 8px;
            }
            .train-actions {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
 
            /* Create — selected exercises config */
            .train-prog-sel-list {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .train-prog-sel-item {
              padding: 10px 12px;
              background: var(--bg-root);
              border: 1px solid var(--border);
              border-radius: var(--radius-sm);
            }
            .train-prog-sel-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
            }
            .train-prog-sel-name {
              font-size: 14px;
              font-weight: 500;
              color: var(--text-primary);
              flex: 1;
              min-width: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .train-prog-sel-config {
              display: flex;
              align-items: flex-end;
              gap: 8px;
              margin-top: 8px;
            }
            .train-prog-sel-field {
              flex: 1;
              display: flex;
              flex-direction: column;
              gap: 3px;
            }
            .train-prog-sel-field label {
              font-size: 11px;
              color: var(--text-muted);
              font-weight: 500;
            }
            .train-prog-sel-input {
              text-align: center;
              padding: 8px 6px !important;
            }
            .train-prog-sel-x {
              font-size: 16px;
              color: var(--text-muted);
              padding-bottom: 8px;
            }
            .train-prog-sel-note {
              font-size: 12px;
              color: var(--text-muted);
              margin-top: 6px;
              opacity: 0.7;
              font-style: italic;
            }
 
            /* Detail (editable) */
            .train-detail-edit-card {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .train-detail-edit-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
            }
            .train-detail-edit-info {
              display: flex;
              align-items: center;
              gap: 8px;
              flex: 1;
              min-width: 0;
            }
            .train-detail-num {
              width: 24px; height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: var(--accent-dim);
              color: var(--accent);
              border-radius: 50%;
              font-size: 12px;
              font-weight: 600;
              font-family: var(--mono);
              flex-shrink: 0;
            }
            .train-detail-name {
              font-size: 14px;
              font-weight: 500;
              color: var(--text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .train-detail-edit-controls {
              display: flex;
              align-items: flex-end;
              gap: 8px;
              padding: 0 4px;
            }
            .train-detail-edit-field {
              flex: 1;
              display: flex;
              flex-direction: column;
              gap: 3px;
              align-items: center;
            }
            .train-detail-edit-label {
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              color: var(--text-muted);
            }
            .train-detail-edit-x {
              font-size: 16px;
              color: var(--text-muted);
              padding-bottom: 8px;
            }
            .train-detail-edit-cardio-note {
              font-size: 12px;
              color: var(--text-muted);
              opacity: 0.7;
              font-style: italic;
              padding-left: 32px;
            }
            .train-detail-stepper {
              display: flex;
              align-items: center;
              border: 1px solid var(--border);
              border-radius: 8px;
              overflow: hidden;
            }
            .train-stepper-btn {
              width: 36px; height: 36px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: var(--bg-root);
              border: none;
              color: var(--text-primary);
              font-size: 18px;
              font-weight: 600;
              cursor: pointer;
              transition: background 0.15s;
            }
            .train-stepper-btn:active { background: var(--bg-card-hover); }
            .train-stepper-val {
              width: 40px;
              text-align: center;
              background: var(--bg-card);
              border: none;
              border-left: 1px solid var(--border);
              border-right: 1px solid var(--border);
              color: var(--text-primary);
              font-family: var(--mono);
              font-size: 15px;
              font-weight: 600;
              padding: 6px 0;
              outline: none;
            }
            .train-detail-actions {
              display: flex;
              gap: 8px;
            }
 
            /* Session header */
            .train-session-header {
              text-align: center;
              padding: 20px 16px 16px;
            }
            .train-session-time {
              font-size: 36px;
              font-weight: 600;
              font-family: var(--mono);
              color: var(--text-primary);
              letter-spacing: -1.5px;
              line-height: 1.1;
            }
            .train-session-stats {
              font-size: 13px;
              color: var(--text-muted);
              margin-top: 6px;
            }
 
            /* Rest timer */
            .train-rest-bar {
              position: relative;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 16px;
              background: rgba(123, 123, 255, 0.08);
              border: 1px solid rgba(123, 123, 255, 0.2);
              border-radius: var(--radius-sm);
              cursor: pointer;
              font-family: var(--font);
              width: 100%;
            }
            .train-rest-fill {
              position: absolute;
              left: 0; top: 0; bottom: 0;
              background: rgba(123, 123, 255, 0.1);
              transition: width 1s linear;
              pointer-events: none;
            }
            .train-rest-txt {
              position: relative;
              font-size: 14px;
              font-weight: 600;
              color: var(--accent);
              font-family: var(--mono);
            }
            .train-rest-dismiss {
              position: relative;
              font-size: 14px;
              color: var(--text-muted);
            }
 
            /* Session exercise card */
            .train-sess-ex {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .train-sess-ex-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
            }
            .train-sess-ex-head > div {
              display: flex;
              align-items: center;
            }
            .train-sess-ex-name {
              font-size: 15px;
              font-weight: 600;
              color: var(--text-primary);
            }
 
            /* Sets table */
            .train-sets-head {
              display: grid;
              grid-template-columns: 38px 1fr 1fr 38px;
              gap: 6px;
              padding: 0 2px;
              margin-bottom: 2px;
            }
            .train-sets-col-num, .train-sets-col, .train-sets-col-chk {
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: var(--text-muted);
            }
            .train-sets-col { text-align: center; }
            .train-sets-col-chk { text-align: center; }
            .train-set-row {
              display: grid;
              grid-template-columns: 38px 1fr 1fr 38px;
              gap: 6px;
              align-items: center;
              padding: 3px 2px;
              border-radius: 6px;
              transition: all 0.15s;
            }
            .train-set-done {
              background: rgba(61, 220, 132, 0.05);
            }
            .train-set-num {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-muted);
              text-align: center;
              font-family: var(--mono);
            }
            .train-set-done .train-set-num { color: var(--ok); }
            .train-set-input {
              width: 100%;
              padding: 8px 6px;
              background: var(--bg-root);
              border: 1px solid var(--border);
              border-radius: 6px;
              color: var(--text-primary);
              font-family: var(--mono);
              font-size: 14px;
              text-align: center;
              outline: none;
              transition: border-color 0.2s;
            }
            .train-set-input:focus { border-color: var(--accent); }
            .train-set-input::placeholder { color: var(--text-muted); }
            .train-set-done .train-set-input {
              opacity: 0.5;
            }
            .train-set-chk {
              width: 34px; height: 34px;
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 8px;
              border: 1px solid var(--border);
              background: none;
              color: var(--text-muted);
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.15s;
            }
            .train-set-chk:active { transform: scale(0.9); }
            .train-set-chk-on {
              background: rgba(61, 220, 132, 0.15);
              border-color: rgba(61, 220, 132, 0.3);
              color: var(--ok);
            }
            .train-set-btns {
              display: flex;
              gap: 8px;
              margin-top: 4px;
            }
            .train-set-btn {
              flex: 1;
              padding: 7px 8px;
              background: none;
              border: 1px dashed var(--border);
              border-radius: 6px;
              color: var(--text-muted);
              font-family: var(--font);
              font-size: 12px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
            }
            .train-set-btn:active {
              background: var(--bg-card-hover);
            }
 
            /* Cardio fields */
            .train-cardio-section {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .train-cardio-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px;
            }
            .train-cardio-field {
              display: flex;
              flex-direction: column;
              gap: 3px;
            }
            .train-cardio-label {
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.4px;
              color: var(--text-muted);
            }
            .train-cardio-auto {
              border-color: rgba(123, 123, 255, 0.2) !important;
              color: var(--accent) !important;
            }
            .train-cardio-auto::placeholder {
              color: rgba(123, 123, 255, 0.4) !important;
              font-style: italic;
            }
 
            /* hh:mm:ss inputs */
            .train-hms-row {
              display: flex;
              align-items: center;
              gap: 4px;
            }
            .train-hms-input {
              flex: 1;
              text-align: center;
              padding: 9px 4px !important;
              font-family: var(--mono);
              font-size: 15px;
              min-width: 0;
            }
            .train-hms-sep {
              font-size: 16px;
              font-weight: 600;
              color: var(--text-muted);
              flex-shrink: 0;
            }
 
            /* Rest mode toggle */
            .train-rest-toggle {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              margin-top: 10px;
              padding: 7px 14px;
              background: var(--bg-root);
              border: 1px solid var(--border);
              border-radius: 20px;
              cursor: pointer;
              font-family: var(--font);
              transition: all 0.15s;
            }
            .train-rest-toggle:active { transform: scale(0.95); }
            .train-rest-toggle-dot {
              width: 10px; height: 10px;
              border-radius: 50%;
              background: var(--text-muted);
              transition: all 0.2s;
            }
            .train-rest-toggle-on {
              background: var(--accent);
              box-shadow: 0 0 8px rgba(123, 123, 255, 0.4);
            }
            .train-rest-toggle-label {
              font-size: 12px;
              font-weight: 500;
              color: var(--text-secondary);
            }
 
            /* Finish popup */
            .train-popup-overlay {
              position: fixed;
              inset: 0;
              z-index: 200;
              background: rgba(0, 0, 0, 0.7);
              display: flex;
              align-items: flex-end;
              justify-content: center;
              padding: 20px;
              animation: toastIn 0.25s ease;
              backdrop-filter: blur(4px);
              -webkit-backdrop-filter: blur(4px);
            }
            .train-popup {
              width: 100%;
              max-width: 400px;
              background: var(--bg-card);
              border: 1px solid var(--border-light);
              border-radius: 18px;
              padding: 24px 20px;
              animation: popupSlide 0.3s ease;
            }
            @keyframes popupSlide {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .train-popup-title {
              font-size: 18px;
              font-weight: 600;
              color: var(--text-primary);
              text-align: center;
              margin-bottom: 16px;
            }
            .train-popup-cal {
              text-align: center;
              padding: 16px;
              background: rgba(61, 220, 132, 0.06);
              border: 1px solid rgba(61, 220, 132, 0.12);
              border-radius: var(--radius-sm);
              margin-bottom: 12px;
            }
            .train-popup-cal-big {
              font-size: 36px;
              font-weight: 600;
              font-family: var(--mono);
              color: var(--ok);
              line-height: 1.1;
            }
            .train-popup-cal-unit {
              font-size: 13px;
              color: var(--text-muted);
              margin-top: 2px;
            }
            .train-popup-cal-detail {
              font-size: 12px;
              color: var(--text-secondary);
              margin-top: 8px;
            }
            .train-popup-changes {
              padding: 14px;
              background: rgba(255, 167, 38, 0.06);
              border: 1px solid rgba(255, 167, 38, 0.15);
              border-radius: var(--radius-sm);
              display: flex;
              flex-direction: column;
              gap: 10px;
            }
            .train-popup-changes-title {
              font-size: 14px;
              font-weight: 600;
              color: #ffa726;
            }
            .train-popup-changes-list {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .train-popup-change-item {
              font-size: 13px;
              color: var(--text-secondary);
              padding: 4px 0;
              border-bottom: 1px solid var(--border);
            }
            .train-popup-change-item:last-child { border-bottom: none; }
            .train-popup-change-btns {
              display: flex;
              flex-direction: column;
              gap: 6px;
              margin-top: 4px;
            }
 
            /* History rows */
            .train-hist-list {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            .train-hist-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding: 10px 12px;
              background: var(--bg-root);
              border: 1px solid var(--border);
              border-radius: 8px;
              cursor: pointer;
              font-family: var(--font);
              text-align: left;
              width: 100%;
              transition: all 0.15s;
            }
            .train-hist-row:active { background: var(--bg-card-hover); }
            .train-hist-row-info {
              flex: 1;
              min-width: 0;
            }
            .train-hist-row-name {
              font-size: 14px;
              font-weight: 500;
              color: var(--text-primary);
              display: block;
            }
            .train-hist-row-meta {
              font-size: 12px;
              color: var(--text-muted);
              margin-top: 1px;
              display: block;
            }
 
            /* Review */
            .train-review-header {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0;
              padding: 16px;
            }
            .train-review-stat {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .train-review-stat-val {
              font-size: 24px;
              font-weight: 600;
              font-family: var(--mono);
              color: var(--text-primary);
              line-height: 1.2;
            }
            .train-review-stat-label {
              font-size: 11px;
              color: var(--text-muted);
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 2px;
            }
            .train-review-divider {
              width: 1px;
              height: 32px;
              background: var(--border);
              flex-shrink: 0;
            }
            .train-review-sets {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .train-review-set-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 6px 0;
              border-bottom: 1px solid var(--border);
            }
            .train-review-set-row:last-child { border-bottom: none; }
            .train-review-set-num {
              font-size: 13px;
              color: var(--text-secondary);
            }
            .train-review-set-val {
              font-size: 13px;
              font-family: var(--mono);
              color: var(--text-primary);
            }
            .train-review-set-done {
              color: var(--ok);
              font-size: 12px;
            }
            .train-review-cardio {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .train-review-cardio-row {
              font-size: 14px;
              color: var(--text-secondary);
            }
 
            /* ── Scrollbar ── */
            ::-webkit-scrollbar { width: 4px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb {
              background: var(--border-light);
              border-radius: 4px;
            }
          `}</style>
 
          <PageRenderer activeTab={activeTab} />
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </AppProvider>
    </ErrorBoundary>
  );
}
