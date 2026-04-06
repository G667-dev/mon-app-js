"use client";
import { useState, useEffect, useCallback, createContext, useContext, useRef, useMemo } from "react";
import React from "react";

// ─────────────────────────────────────────────
// UTILS - localStorage (safe)
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
// UTILS - metabolism.js
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
if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
return age >= 10 && age <= 120 ? age : null;
} catch { return null; }
}

function isProfileComplete(profile) {
if (!profile || typeof profile !== "object") return false;
const { name, birthdate, sex, height, weight, activity } = profile;
if (!name || typeof name !== "string" || !name.trim()) return false;
if (calculateAge(birthdate) === null) return false;
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
return bmr * (ACTIVITY_MULTIPLIERS[profile.activity] || 1.2);
}

// ─────────────────────────────────────────────
// UTILS - dates
// ─────────────────────────────────────────────
function getTodayKey() {
const d = new Date();
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDateKey(dateStr) {
try {
const d = new Date(dateStr);
if (isNaN(d.getTime())) return null;
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
} catch { return null; }
}

function getTodayMeals(meals) {
if (!Array.isArray(meals)) return [];
const today = getTodayKey();
return meals.filter((m) => m && m.date && getDateKey(m.date) === today);
}

function getTodaySessions(sessions) {
if (!Array.isArray(sessions)) return [];
const today = getTodayKey();
return sessions.filter((s) => s && s.startedAt && getDateKey(s.startedAt) === today);
}

function formatDateLabel(dateKey) {
const today = getTodayKey();
if (dateKey === today) return "Aujourd'hui";
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yKey = getDateKey(yesterday.toISOString());
if (dateKey === yKey) return "Hier";
try {
const [y, m, d] = dateKey.split("-").map(Number);
const date = new Date(y, m - 1, d);
const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const monthNames = ["jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
return `${dayNames[date.getDay()]} ${d} ${monthNames[date.getMonth()]}`;
} catch { return dateKey; }
}

function formatFullDate() {
const d = new Date();
const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const monthNames = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
return `${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`;
}

function getGreeting() {
const h = new Date().getHours();
if (h < 12) return "Bonjour";
if (h < 18) return "Bon après-midi";
return "Bonsoir";
}

const HISTORY_DAYS = 30;

function cleanOldMeals(meals) {
if (!Array.isArray(meals)) return [];
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
cutoff.setHours(0, 0, 0, 0);
return meals.filter((m) => {
if (!m || !m.date) return false;
try { const d = new Date(m.date); return !isNaN(d.getTime()) && d >= cutoff; } catch { return false; }
});
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
// UTILS - Streaks & PRs
// ─────────────────────────────────────────────
function calculateStreak(sessions) {
if (!Array.isArray(sessions) || sessions.length === 0) return { current: 0, best: 0 };
const sessionDays = new Set();
sessions.forEach((s) => { const k = getDateKey(s.startedAt); if (k) sessionDays.add(k); });
let current = 0;
const d = new Date();
const todayK = getTodayKey();
if (!sessionDays.has(todayK)) {
d.setDate(d.getDate() - 1);
const yK = getDateKey(d.toISOString());
if (!sessionDays.has(yK)) return { current: 0, best: calcBestStreak(sessionDays) };
}
const check = new Date();
if (!sessionDays.has(getTodayKey())) check.setDate(check.getDate() - 1);
while (true) {
const k = getDateKey(check.toISOString());
if (sessionDays.has(k)) { current++; check.setDate(check.getDate() - 1); }
else break;
}
return { current, best: Math.max(current, calcBestStreak(sessionDays)) };
}

function calcBestStreak(daySet) {
if (daySet.size === 0) return 0;
const sorted = […daySet].sort();
let best = 1, cur = 1;
for (let i = 1; i < sorted.length; i++) {
const prev = new Date(sorted[i - 1]);
const next = new Date(sorted[i]);
const diff = (next - prev) / 86400000;
if (Math.abs(diff - 1) < 0.1) { cur++; best = Math.max(best, cur); }
else cur = 1;
}
return best;
}

function getAllPRs(sessions) {
const prs = {};
if (!Array.isArray(sessions)) return prs;
sessions.forEach((session) => {
(session.exercises || []).forEach((ex) => {
if (ex.category === "cardio") return;
(ex.sets || []).filter((s) => s.done).forEach((set) => {
const w = Number(set.weight) || 0;
const r = Number(set.reps) || 0;
if (w <= 0 || r <= 0) return;
const tonnage = w * r;
const key = ex.exerciseId;
if (!prs[key] || tonnage > prs[key].tonnage) {
prs[key] = { weight: w, reps: r, tonnage, date: session.startedAt, exerciseName: ex.name };
}
});
});
});
return prs;
}

function checkNewPR(exerciseId, weight, reps, sessions) {
const w = Number(weight) || 0;
const r = Number(reps) || 0;
if (w <= 0 || r <= 0) return false;
const tonnage = w * r;
const prs = getAllPRs(sessions);
return !prs[exerciseId] || tonnage > prs[exerciseId].tonnage;
}

function getLastWeightForExercise(exerciseId, sessions) {
if (!Array.isArray(sessions)) return [];
const sorted = […sessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
for (const s of sorted) {
const ex = (s.exercises || []).find((e) => e.exerciseId === exerciseId);
if (ex && ex.sets && ex.sets.length > 0) {
return ex.sets.map((set) => ({ weight: set.weight || "", reps: set.reps || "" }));
}
}
return [];
}

// ─────────────────────────────────────────────
// UTILS - Suggestions
// ─────────────────────────────────────────────
function generateSuggestions(state) {
const suggestions = [];
const sessions = Array.isArray(state.sessions) ? state.sessions : [];
const meals = Array.isArray(state.meals) ? state.meals : [];
const dismissed = state.dismissedSuggestions || {};
const now = Date.now();
const THREE_DAYS = 3 * 24 * 3600 * 1000;

// 1. Neglected muscle group
if (sessions.length > 0) {
const lastTrained = {};
sessions.forEach((s) => {
(s.exercises || []).forEach((ex) => {
const db = EXERCISE_DB.find((e) => e.id === ex.exerciseId);
if (db && db.muscle_group && db.category === "musculation") {
const d = new Date(s.startedAt).getTime();
if (!lastTrained[db.muscle_group] || d > lastTrained[db.muscle_group]) lastTrained[db.muscle_group] = d;
}
});
});
const neglected = MUSCU_GROUPS.filter((g) => lastTrained[g]).sort((a, b) => lastTrained[a] - lastTrained[b]);
if (neglected.length > 0) {
const worst = neglected[0];
const days = Math.floor((now - lastTrained[worst]) / 86400000);
if (days >= 7) {
const id = `neglected-${worst}`;
if (!dismissed[id] || now - dismissed[id] > THREE_DAYS) {
suggestions.push({ id, text: `Tu n'as pas entraîné ${MUSCLE_GROUP_LABELS[worst]} depuis ${days} jours`, icon: "💪" });
}
}
}
}

// 2. Protein deficit
if (state.dailyProteinTarget) {
const last7 = [];
for (let i = 0; i < 7; i++) {
const d = new Date(); d.setDate(d.getDate() - i);
const k = getDateKey(d.toISOString());
const dayMeals = meals.filter((m) => getDateKey(m.date) === k);
const prot = dayMeals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
if (dayMeals.length > 0) last7.push(prot);
}
const underDays = last7.filter((p) => p < state.dailyProteinTarget).length;
if (underDays >= 4) {
const id = "protein-deficit";
if (!dismissed[id] || now - dismissed[id] > THREE_DAYS) {
suggestions.push({ id, text: `Tu es sous ton objectif protéines ${underDays} jours cette semaine`, icon: "🥩" });
}
}
}

return suggestions.slice(0, 2);
}

// ─────────────────────────────────────────────
// CONTEXT - Global State
// ─────────────────────────────────────────────
const AppContext = createContext(null);

function useAppContext() {
const ctx = useContext(AppContext);
if (!ctx) throw new Error("useAppContext must be used within AppProvider");
return ctx;
}

const DEFAULT_STATE = {
user: { name: "" },
userProfile: { name: "", birthdate: "", sex: "", height: "", weight: "", activity: "" },
dailyCalorieTarget: null,
dailyProteinTarget: null,
meals: [],
savedMeals: [],
programs: [],
sessions: [],
activeSession: null,
customExercises: [],
weightLog: [],
bestStreak: 0,
personalRecords: {},
dismissedSuggestions: {},
settings: { theme: "dark" },
};

function AppProvider({ children }) {
const [state, setState] = useState(() => {
const saved = loadFromStorage();
if (saved && typeof saved === "object") {
const merged = { …DEFAULT_STATE, …saved };
merged.meals = cleanOldMeals(merged.meals);
if (!merged.weightLog) merged.weightLog = [];
if (!merged.bestStreak) merged.bestStreak = 0;
if (!merged.personalRecords) merged.personalRecords = {};
if (!merged.dismissedSuggestions) merged.dismissedSuggestions = {};
return merged;
}
return { …DEFAULT_STATE };
});
const [activeTab, setActiveTab] = useState("home");

useEffect(() => { saveToStorage(state); }, [state]);

const updateState = useCallback((partial) => {
setState((prev) => {
const next = typeof partial === "function" ? partial(prev) : { …prev, …partial };
return next;
});
}, []);

return (
<AppContext.Provider value={{ state, updateState, activeTab, setActiveTab }}>
{children}
</AppContext.Provider>
);
}

// ─────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────
class ErrorBoundary extends React.Component {
constructor(props) { super(props); this.state = { hasError: false, error: null }; }
static getDerivedStateFromError(error) { return { hasError: true, error }; }
componentDidCatch(error, info) { console.error("[TEST] Error caught:", error, info); }
render() {
if (this.state.hasError) {
return (
<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0c0c0e", color: "#888", padding: 32, fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>
<div>
<div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
<div style={{ fontSize: 15, marginBottom: 8 }}>Une erreur est survenue</div>
<button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 12, padding: "10px 24px", background: "#1a1a1e", color: "#ccc", border: "1px solid #2a2a2e", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>Réessayer</button>
</div>
</div>
);
}
return this.props.children;
}
}

// ─────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────
const icons = {
home: (active) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#4ADE80" : "#A1A1AA"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" /></svg>),
track: (active) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#4ADE80" : "#A1A1AA"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>),
progress: (active) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#4ADE80" : "#A1A1AA"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>),
profile: (active) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#4ADE80" : "#A1A1AA"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0112 0v1" /></svg>),
};

const TABS = [
{ id: "home", label: "Home", icon: icons.home },
{ id: "track", label: "Track", icon: icons.track },
{ id: "progress", label: "Stats", icon: icons.progress },
{ id: "profile", label: "Profil", icon: icons.profile },
];

// ─────────────────────────────────────────────
// EXERCISE DATABASE
// ─────────────────────────────────────────────
const MUSCLE_GROUP_LABELS = {
pectoraux: "Pectoraux", dos: "Dos", epaules: "Épaules", biceps: "Biceps",
triceps: "Triceps", jambes: "Jambes", abdos: "Abdos", cardio: "Cardio", crossfit: "CrossFit",
};
const MUSCLE_GROUP_ORDER = ["pectoraux", "dos", "epaules", "biceps", "triceps", "jambes", "abdos", "cardio", "crossfit"];
const MUSCU_GROUPS = ["pectoraux", "dos", "epaules", "biceps", "triceps", "jambes", "abdos"];

const EXERCISE_DB = [
// PECTORAUX
{ id: "pec-01", name: "Développé couché", muscle_group: "pectoraux", category: "musculation", type: "musculation", equipment: "barre", synonyms: ["bench press","dc","dev couché"], description: "Mouvement de base pour les pectoraux." },
{ id: "pec-02", name: "Développé incliné", muscle_group: "pectoraux", category: "musculation", type: "musculation", equipment: "barre / haltères", synonyms: ["incline bench press","dev incliné"], description: "Cible le haut des pectoraux." },
{ id: "pec-03", name: "Développé décliné", muscle_group: "pectoraux", category: "musculation", type: "musculation", equipment: "barre / haltères", synonyms: ["decline bench press"], description: "Cible le bas des pectoraux." },
{ id: "pec-04", name: "Écarté couché", muscle_group: "pectoraux", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["dumbbell fly","chest fly","flies"], description: "Mouvement d'ouverture avec haltères." },
{ id: "pec-05", name: "Écarté incliné", muscle_group: "pectoraux", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["incline fly"], description: "Écartés sur banc incliné." },
{ id: "pec-06", name: "Pec deck", muscle_group: "pectoraux", category: "musculation", type: "machine", equipment: "machine", synonyms: ["butterfly","pec fly machine"], description: "Machine d'écartés." },
{ id: "pec-07", name: "Dips pectoraux", muscle_group: "pectoraux", category: "musculation", type: "poids_du_corps", equipment: "barres parallèles", synonyms: ["chest dips"], description: "Dips buste penché." },
{ id: "pec-08", name: "Pompes", muscle_group: "pectoraux", category: "musculation", type: "poids_du_corps", equipment: "aucun", synonyms: ["push-ups","pushups"], description: "Poussée depuis le sol." },
// DOS
{ id: "dos-01", name: "Tractions", muscle_group: "dos", category: "musculation", type: "poids_du_corps", equipment: "barre de traction", synonyms: ["pull-ups","chin-ups"], description: "Mouvement vertical au poids du corps." },
{ id: "dos-02", name: "Tirage vertical", muscle_group: "dos", category: "musculation", type: "machine", equipment: "poulie haute", synonyms: ["lat pulldown"], description: "Tirage poulie haute." },
{ id: "dos-03", name: "Tirage horizontal", muscle_group: "dos", category: "musculation", type: "machine", equipment: "poulie basse", synonyms: ["seated row","cable row"], description: "Tirage poulie basse assis." },
{ id: "dos-04", name: "Rowing barre", muscle_group: "dos", category: "musculation", type: "musculation", equipment: "barre", synonyms: ["barbell row","bent over row"], description: "Rowing penché avec barre." },
{ id: "dos-05", name: "Rowing haltère", muscle_group: "dos", category: "musculation", type: "musculation", equipment: "haltère", synonyms: ["dumbbell row","one arm row"], description: "Rowing unilatéral." },
{ id: "dos-06", name: "Rowing machine", muscle_group: "dos", category: "musculation", type: "machine", equipment: "machine", synonyms: ["machine row"], description: "Rowing guidé sur machine." },
{ id: "dos-07", name: "Rowing T-bar", muscle_group: "dos", category: "musculation", type: "musculation", equipment: "T-bar / landmine", synonyms: ["t-bar row"], description: "Rowing avec barre en T." },
{ id: "dos-08", name: "Pull-over", muscle_group: "dos", category: "musculation", type: "musculation", equipment: "haltère", synonyms: ["pullover"], description: "Extension au-dessus de la tête." },
{ id: "dos-09", name: "Face pull", muscle_group: "dos", category: "musculation", type: "machine", equipment: "poulie / corde", synonyms: ["facepull"], description: "Tirage corde vers le visage." },
{ id: "dos-10", name: "Deadlift", muscle_group: "dos", category: "musculation", type: "musculation", equipment: "barre", synonyms: ["soulevé de terre","sdt"], description: "Soulevé de terre conventionnel." },
// ÉPAULES
{ id: "epa-01", name: "Développé militaire", muscle_group: "epaules", category: "musculation", type: "musculation", equipment: "barre / haltères", synonyms: ["overhead press","ohp","military press"], description: "Développé vertical." },
{ id: "epa-02", name: "Élévations latérales", muscle_group: "epaules", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["lateral raise"], description: "Cible le deltoïde moyen." },
{ id: "epa-03", name: "Élévations frontales", muscle_group: "epaules", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["front raise"], description: "Cible le deltoïde antérieur." },
{ id: "epa-04", name: "Oiseau", muscle_group: "epaules", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["reverse fly","rear delt fly"], description: "Cible l'arrière de l'épaule." },
{ id: "epa-05", name: "Reverse pec deck", muscle_group: "epaules", category: "musculation", type: "machine", equipment: "machine", synonyms: ["reverse fly machine"], description: "Butterfly inversée." },
{ id: "epa-06", name: "Arnold press", muscle_group: "epaules", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["arnold"], description: "Développé avec rotation." },
{ id: "epa-07", name: "Upright row", muscle_group: "epaules", category: "musculation", type: "musculation", equipment: "barre / haltères", synonyms: ["tirage menton"], description: "Tirage vertical vers le menton." },
// BICEPS
{ id: "bic-01", name: "Curl barre", muscle_group: "biceps", category: "musculation", type: "musculation", equipment: "barre droite", synonyms: ["barbell curl"], description: "Flexion avec barre droite." },
{ id: "bic-02", name: "Curl barre EZ", muscle_group: "biceps", category: "musculation", type: "musculation", equipment: "barre EZ", synonyms: ["ez bar curl","ez curl"], description: "Flexion avec barre EZ." },
{ id: "bic-03", name: "Curl haltères", muscle_group: "biceps", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["dumbbell curl"], description: "Flexion avec haltères." },
{ id: "bic-04", name: "Curl incliné", muscle_group: "biceps", category: "musculation", type: "musculation", equipment: "haltères / banc incliné", synonyms: ["incline curl"], description: "Curl sur banc incliné." },
{ id: "bic-05", name: "Curl marteau", muscle_group: "biceps", category: "musculation", type: "musculation", equipment: "haltères", synonyms: ["hammer curl"], description: "Curl prise neutre." },
{ id: "bic-06", name: "Curl concentration", muscle_group: "biceps", category: "musculation", type: "musculation", equipment: "haltère", synonyms: ["concentration curl"], description: "Curl unilatéral assis." },
{ id: "bic-07", name: "Curl pupitre", muscle_group: "biceps", category: "musculation", type: "musculation", equipment: "barre / haltère / pupitre", synonyms: ["preacher curl","scott curl"], description: "Curl avec support pupitre." },
{ id: "bic-08", name: "Curl câble", muscle_group: "biceps", category: "musculation", type: "machine", equipment: "poulie", synonyms: ["cable curl"], description: "Curl à la poulie." },
{ id: "bic-09", name: "Bayesian curl", muscle_group: "biceps", category: "musculation", type: "machine", equipment: "poulie basse", synonyms: ["bayesian cable curl"], description: "Curl bras derrière le corps." },
// TRICEPS
{ id: "tri-01", name: "Dips triceps", muscle_group: "triceps", category: "musculation", type: "poids_du_corps", equipment: "barres parallèles", synonyms: ["triceps dips"], description: "Dips buste droit." },
{ id: "tri-02", name: "Barre au front", muscle_group: "triceps", category: "musculation", type: "musculation", equipment: "barre EZ / barre droite", synonyms: ["skull crusher","french press"], description: "Extension triceps allongé." },
{ id: "tri-03", name: "Triceps pushdown unilatéral", muscle_group: "triceps", category: "musculation", type: "machine", equipment: "poulie haute", synonyms: ["single arm pushdown"], description: "Extension un bras poulie haute." },
{ id: "tri-04", name: "Extension overhead unilatérale", muscle_group: "triceps", category: "musculation", type: "machine", equipment: "poulie basse", synonyms: ["single arm overhead extension"], description: "Extension au-dessus de la tête un bras." },
{ id: "tri-05", name: "Triceps pushdown", muscle_group: "triceps", category: "musculation", type: "machine", equipment: "poulie haute", synonyms: ["pushdown","cable pushdown"], description: "Extension poulie haute deux bras." },
{ id: "tri-06", name: "Extension overhead poulie", muscle_group: "triceps", category: "musculation", type: "machine", equipment: "poulie basse / corde", synonyms: ["overhead triceps extension"], description: "Extension au-dessus de la tête poulie." },
{ id: "tri-07", name: "Extension triceps haltère", muscle_group: "triceps", category: "musculation", type: "musculation", equipment: "haltère", synonyms: ["dumbbell triceps extension"], description: "Extension avec un haltère." },
{ id: "tri-08", name: "Kickback", muscle_group: "triceps", category: "musculation", type: "musculation", equipment: "haltère", synonyms: ["triceps kickback"], description: "Extension arrière du bras." },
{ id: "tri-09", name: "Close grip bench", muscle_group: "triceps", category: "musculation", type: "musculation", equipment: "barre", synonyms: ["close grip bench press","cgbp"], description: "Développé couché prise serrée." },
// JAMBES
{ id: "jam-01", name: "Squat", muscle_group: "jambes", category: "musculation", type: "musculation", equipment: "barre", synonyms: ["back squat","squats"], description: "Flexion complète des jambes." },
{ id: "jam-02", name: "Front squat", muscle_group: "jambes", category: "musculation", type: "musculation", equipment: "barre", synonyms: ["squat avant"], description: "Squat barre devant." },
{ id: "jam-03", name: "Leg press", muscle_group: "jambes", category: "musculation", type: "machine", equipment: "machine", synonyms: ["presse à cuisses"], description: "Presse inclinée." },
{ id: "jam-04", name: "Fentes", muscle_group: "jambes", category: "musculation", type: "musculation", equipment: "haltères / barre", synonyms: ["lunges"], description: "Fentes avant ou marchées." },
{ id: "jam-05", name: "Fentes bulgares", muscle_group: "jambes", category: "musculation", type: "musculation", equipment: "haltères / banc", synonyms: ["bulgarian split squat"], description: "Fente pied arrière surélevé." },
{ id: "jam-06", name: "Soulevé de terre jambes tendues", muscle_group: "jambes", category: "musculation", type: "musculation", equipment: "barre / haltères", synonyms: ["romanian deadlift","rdl"], description: "Cible les ischio-jambiers." },
{ id: "jam-07", name: "Leg curl", muscle_group: "jambes", category: "musculation", type: "machine", equipment: "machine", synonyms: ["hamstring curl"], description: "Flexion jambes sur machine." },
{ id: "jam-08", name: "Leg extension", muscle_group: "jambes", category: "musculation", type: "machine", equipment: "machine", synonyms: ["quadriceps extension"], description: "Extension jambes sur machine." },
{ id: "jam-09", name: "Hip thrust", muscle_group: "jambes", category: "musculation", type: "musculation", equipment: "barre / banc", synonyms: ["glute bridge"], description: "Extension de hanche." },
{ id: "jam-10", name: "Mollets debout", muscle_group: "jambes", category: "musculation", type: "machine", equipment: "machine / barre", synonyms: ["standing calf raise","calf raise"], description: "Extension des chevilles." },
// ABDOS
{ id: "abd-01", name: "Crunch", muscle_group: "abdos", category: "musculation", type: "poids_du_corps", equipment: "aucun", synonyms: ["crunches"], description: "Flexion du buste allongé." },
{ id: "abd-02", name: "Relevé de jambes", muscle_group: "abdos", category: "musculation", type: "poids_du_corps", equipment: "barre / banc", synonyms: ["leg raise","hanging leg raise"], description: "Relevé des jambes." },
{ id: "abd-03", name: "Gainage", muscle_group: "abdos", category: "musculation", type: "poids_du_corps", equipment: "aucun", synonyms: ["plank"], description: "Position statique sur les avant-bras." },
{ id: "abd-04", name: "Gainage latéral", muscle_group: "abdos", category: "musculation", type: "poids_du_corps", equipment: "aucun", synonyms: ["side plank"], description: "Gainage sur le côté." },
{ id: "abd-05", name: "Russian twist", muscle_group: "abdos", category: "musculation", type: "poids_du_corps", equipment: "poids / médecine-ball", synonyms: ["twist russe"], description: "Rotation du buste assis." },
{ id: "abd-06", name: "Mountain climbers", muscle_group: "abdos", category: "musculation", type: "poids_du_corps", equipment: "aucun", synonyms: ["grimpeur"], description: "Montée de genoux en planche." },
{ id: "abd-07", name: "Ab wheel", muscle_group: "abdos", category: "musculation", type: "poids_du_corps", equipment: "roue abdominale", synonyms: ["ab roller","rollout"], description: "Extension avec roulette." },
// CARDIO
{ id: "car-01", name: "Course à pied", muscle_group: "cardio", category: "cardio", type: "cardio", equipment: "aucun / tapis", synonyms: ["running","jogging","treadmill"], description: "Course en extérieur ou sur tapis." },
{ id: "car-02", name: "Marche rapide", muscle_group: "cardio", category: "cardio", type: "cardio", equipment: "aucun / tapis", synonyms: ["brisk walking","marche"], description: "Marche soutenue." },
{ id: "car-03", name: "Vélo", muscle_group: "cardio", category: "cardio", type: "cardio", equipment: "vélo / vélo stationnaire", synonyms: ["cycling","bike","spinning"], description: "Vélo d'extérieur ou stationnaire." },
{ id: "car-04", name: "Rameur", muscle_group: "cardio", category: "cardio", type: "cardio", equipment: "rameur", synonyms: ["rowing machine","rower"], description: "Rameur ergomètre." },
{ id: "car-05", name: "Corde à sauter", muscle_group: "cardio", category: "cardio", type: "cardio", equipment: "corde", synonyms: ["jump rope","skipping"], description: "Cardio haute intensité." },
{ id: "car-06", name: "HIIT", muscle_group: "cardio", category: "cardio", type: "cardio", equipment: "variable", synonyms: ["interval training","fractionné"], description: "Entraînement fractionné." },
// CROSSFIT
{ id: "cx-01", name: "Burpees", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "aucun", synonyms: ["burpee"], description: "Squat, planche, pompe, saut." },
{ id: "cx-02", name: "Thrusters", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "barre / haltères", synonyms: ["thruster","squat press"], description: "Front squat + développé." },
{ id: "cx-03", name: "Kettlebell swing", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "kettlebell", synonyms: ["kb swing"], description: "Balancé de kettlebell." },
{ id: "cx-04", name: "Box jump", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "box / caisse", synonyms: ["box jumps"], description: "Saut explosif sur box." },
{ id: "cx-05", name: "Wall ball", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "médecine-ball", synonyms: ["wall balls"], description: "Squat + lancer contre un mur." },
{ id: "cx-06", name: "Double unders", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "corde à sauter", synonyms: ["double under","DU"], description: "Double passage de corde." },
{ id: "cx-07", name: "Sit-ups", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "aucun", synonyms: ["situps","abmat"], description: "Relevé complet du buste." },
{ id: "cx-08", name: "Air squat", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "aucun", synonyms: ["bodyweight squat"], description: "Squat au poids du corps." },
{ id: "cx-09", name: "Clean & jerk", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "barre", synonyms: ["clean and jerk","épaulé jeté"], description: "Épaulé-jeté olympique." },
{ id: "cx-10", name: "Snatch", muscle_group: "crossfit", category: "crossfit", type: "crossfit", equipment: "barre", synonyms: ["arraché","power snatch"], description: "Arraché olympique." },
];

// ─────────────────────────────────────────────
// EXERCISE SEARCH & HELPERS
// ─────────────────────────────────────────────
const MAIN_GROUP_LABELS = { musculation: "Musculation", cardio: "Cardio", crossfit: "CrossFit" };
const MAIN_GROUP_OPTIONS = ["musculation", "cardio", "crossfit"];

function getAllExercises(customExercises) {
return […EXERCISE_DB, …(Array.isArray(customExercises) ? customExercises : [])];
}

function searchExercises(query, allExercises) {
const list = allExercises || EXERCISE_DB;
if (!query || typeof query !== "string") return list;
const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
if (terms.length === 0) return list;
return list.filter((ex) => {
const haystack = [ex.name, …(ex.synonyms || []), ex.muscle_group, ex.type, ex.equipment || ""].join(" ").toLowerCase();
return terms.every((t) => haystack.includes(t));
});
}

function generateId() {
return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─────────────────────────────────────────────
// UTILS - Cardio & Calories
// ─────────────────────────────────────────────
const CARDIO_METS = { "car-01": 9.8, "car-02": 4.5, "car-03": 7.5, "car-04": 7.0, "car-05": 10.0, "car-06": 9.0 };

function hmsToSeconds(h, m, s) { return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0); }
function secondsToHMS(t) { const total = Math.max(0, Math.round(Number(t) || 0)); return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }; }
function autoCalcCardio(cardio) {
const c = { …cardio };
const dur = Number(c.durationSecs) || 0;
const dist = Number(c.distance) || 0;
if (dur > 0 && dist > 0) { c.speed = (dist / (dur / 3600)).toFixed(1); c.allure = ((dur / 60) / dist).toFixed(1); }
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
const durH = durS / 3600, durM = durS / 60;
const bpm = Number(ex.cardio?.bpm) || 0;
const speed = Number(ex.cardio?.speed) || 0;
if (bpm > 50) {
const perMin = isMale ? (-55.0969 + 0.6309 * bpm + 0.1988 * w + 0.2017 * age) / 4.184 : (-20.4022 + 0.4472 * bpm - 0.1263 * w + 0.074 * age) / 4.184;
cCal += Math.max(0, perMin * durM);
} else {
let met = CARDIO_METS[ex.exerciseId] || 6;
if (ex.exerciseId === "car-01" && speed > 0) met = speed < 8 ? 8 : speed < 10 ? 10 : speed < 13 ? 11.5 : 13;
cCal += met * w * durH;
}
} else {
(ex.sets || []).filter((s) => s.done).forEach((s) => {
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
const oSets = Number(orig.sets) || 0, cSets = cur.sets?.length || 0;
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

const EQUIPMENT_OPTIONS = [
"", "Barre", "Haltères", "Barre EZ", "Machine", "Poulie", "Poulie haute", "Poulie basse",
"Corde", "Kettlebell", "Banc", "Barre de traction", "Barres parallèles",
"Élastique", "Médecine-ball", "TRX", "Roue abdominale", "Tapis", "Vélo", "Rameur", "Aucun",
];

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────
function PageShell({ title, subtitle, children, noHeader }) {
return (
<div className="page-shell">
{!noHeader && title && (
<div className="page-header">
<h1 className="page-title">{title}</h1>
{subtitle && <p className="page-subtitle">{subtitle}</p>}
</div>
)}
<div className="page-content">{children}</div>
</div>
);
}

function NutriSection({ title, count, defaultOpen, children }) {
const [open, setOpen] = useState(defaultOpen !== undefined ? defaultOpen : true);
return (
<div className={`card collapse-card ${open ? "collapse-open" : ""}`}>
<button className="collapse-toggle" onClick={() => setOpen((p) => !p)}>
<span className="collapse-title">{title}{count !== undefined && count !== null && <span className="collapse-count">{count}</span>}</span>
<svg className={`collapse-chevron ${open ? "collapse-chevron-open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
</button>
{open && <div className="collapse-body">{children}</div>}
</div>
);
}

function formatTime(secs) {
const h = Math.floor(secs / 3600);
const m = Math.floor((secs % 3600) / 60);
const s = secs % 60;
return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────
// CREATE EXERCISE MODAL
// ─────────────────────────────────────────────
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
const synonyms = synonymsRaw.split(",").map((s) => s.trim()).filter(Boolean);
onSave({
id: "custom-" + generateId(), name: n, muscle_group: isMuscu ? muscleGroup : mainGroup,
category, type: category, equipment: equipment || null, synonyms,
description: description.trim() || null, animation_url: null, is_custom: true,
});
};

return (
<div className="train-popup-overlay" onClick={onClose}>
<div className="train-popup custom-ex-modal" onClick={(e) => e.stopPropagation()}>
<div className="train-popup-title">Créer un exercice</div>
<div className="custom-ex-fields">
<div className="nutri-field-wrap">
<div className="nutri-field-label">Nom <span className="nutri-required">*</span></div>
<input className={`input input-full ${error && !name.trim() ? "input-error" : ""}`} type="text" placeholder="Ex : Tirage Yates" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} maxLength={60} autoFocus />
</div>
<div className="nutri-field-wrap">
<div className="nutri-field-label">Catégorie <span className="nutri-required">*</span></div>
<div className="custom-ex-group-row">
{MAIN_GROUP_OPTIONS.map((g) => (
<button key={g} className={`custom-ex-group-btn ${mainGroup === g ? "custom-ex-group-on custom-ex-group-" + g : ""}`} onClick={() => { setMainGroup(g); setMuscleGroup(""); setError(""); }}>{MAIN_GROUP_LABELS[g]}</button>
))}
</div>
</div>
{isMuscu && (
<div className="nutri-field-wrap">
<div className="nutri-field-label">Groupe musculaire <span className="nutri-required">*</span></div>
<select className={`input input-full select ${error && isMuscu && !muscleGroup ? "input-error" : ""}`} value={muscleGroup} onChange={(e) => { setMuscleGroup(e.target.value); setError(""); }}>
<option value="">- Choisir -</option>
{MUSCU_GROUPS.map((mg) => <option key={mg} value={mg}>{MUSCLE_GROUP_LABELS[mg]}</option>)}
</select>
</div>
)}
<div className="nutri-field-wrap">
<div className="nutri-field-label">Équipement</div>
<select className="input input-full select" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
<option value="">- Optionnel -</option>
{EQUIPMENT_OPTIONS.filter(Boolean).map((eq) => <option key={eq} value={eq}>{eq}</option>)}
</select>
</div>
<div className="nutri-field-wrap">
<div className="nutri-field-label">Description</div>
<input className="input input-full" type="text" placeholder="Courte explication…" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
</div>
<div className="nutri-field-wrap">
<div className="nutri-field-label">Synonymes <span style={{ opacity: 0.5, fontSize: 10 }}>(virgules)</span></div>
<input className="input input-full" type="text" placeholder="Ex : yates row, rowing yates" value={synonymsRaw} onChange={(e) => setSynonymsRaw(e.target.value)} maxLength={200} />
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
// EXERCISE CATALOG
// ─────────────────────────────────────────────
function ExerciseCatalog({ onSelect, selectedIds, disabledIds, allExercises, onCreateExercise }) {
const [search, setSearch] = useState("");
const [tab, setTab] = useState("musculation");
const list = allExercises || EXERCISE_DB;
const isSearching = search.trim().length > 0;
const selSet = new Set(selectedIds || []);
const disSet = new Set(disabledIds || []);

const getFiltered = () => {
if (isSearching) return searchExercises(search, list);
if (tab === "musculation") return list.filter((ex) => ex.category === "musculation" && ex.muscle_group !== "crossfit" && ex.muscle_group !== "cardio");
if (tab === "cardio") return list.filter((ex) => ex.muscle_group === "cardio" || ex.category === "cardio");
if (tab === "crossfit") return list.filter((ex) => ex.muscle_group === "crossfit" || ex.category === "crossfit");
return [];
};
const filtered = getFiltered();
const grouped = {};
filtered.forEach((ex) => { const key = ex.muscle_group || "autre"; if (!grouped[key]) grouped[key] = []; grouped[key].push(ex); });

const renderExRow = (ex) => {
const isSel = selSet.has(ex.id), isDis = disSet.has(ex.id);
return (
<div key={ex.id} className={`train-ex-row ${isSel ? "train-ex-row-on" : ""} ${isDis ? "train-ex-row-dis" : ""}`}>
<div className="train-ex-row-info">
<span className="train-ex-name">{ex.name}{ex.is_custom && <span className="train-ex-custom-badge">perso</span>}</span>
{ex.equipment && ex.equipment !== "aucun" && <span className="train-ex-equip">{ex.equipment}</span>}
</div>
{isSel ? <span className="train-ex-added">Ajouté ✓</span> : <button className="train-ex-add-btn" onClick={() => !isDis && onSelect(ex)} disabled={isDis}>Ajouter</button>}
</div>
);
};

return (
<>
<div className="train-search-wrap">
<svg className="train-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
<input className="train-search-input" type="text" placeholder="Rechercher un exercice…" value={search} onChange={(e) => setSearch(e.target.value)} />
{search && <button className="train-search-clear" onClick={() => setSearch("")}>✕</button>}
</div>
{onCreateExercise && <button className="train-text-link" onClick={onCreateExercise}>+ Créer un exercice</button>}
{!isSearching && (
<div className="train-tabs">
{MAIN_GROUP_OPTIONS.map((g) => <button key={g} className={`train-tab ${tab === g ? "train-tab-on train-tab-" + g : ""}`} onClick={() => setTab(g)}>{MAIN_GROUP_LABELS[g]}</button>)}
</div>
)}
{isSearching && <div className="train-search-count">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}{filtered.length === 0 && " - essaie un autre mot"}</div>}
{!isSearching && tab === "musculation" && MUSCU_GROUPS.map((mg) => {
if (!grouped[mg]?.length) return null;
return <div key={mg} className="train-group-section"><div className="train-group-label">{MUSCLE_GROUP_LABELS[mg]}</div>{grouped[mg].map(renderExRow)}</div>;
})}
{!isSearching && tab === "cardio" && <div className="train-group-section">{filtered.length > 0 ? filtered.map(renderExRow) : <p className="card-text" style={{ opacity: 0.5, padding: 12 }}>Aucun exercice cardio</p>}</div>}
{!isSearching && tab === "crossfit" && <div className="train-group-section">{filtered.length > 0 ? filtered.map(renderExRow) : <p className="card-text" style={{ opacity: 0.5, padding: 12 }}>Aucun exercice CrossFit</p>}</div>}
{isSearching && MUSCLE_GROUP_ORDER.map((mg) => {
if (!grouped[mg]?.length) return null;
const catColor = mg === "cardio" || mg === "crossfit" ? mg : "musculation";
return <div key={mg} className="train-group-section"><span className={`train-cat-badge train-cat-${catColor}`} style={{ marginBottom: 6 }}>{MUSCLE_GROUP_LABELS[mg] || mg}</span>{grouped[mg].map(renderExRow)}</div>;
})}
</>
);
}

// ─────────────────────────────────────────────
// HOME PAGE - with Onboarding + Dashboard
// ─────────────────────────────────────────────
function HomePage() {
const { state, updateState, setActiveTab } = useAppContext();
const profile = state?.userProfile || {};
const parseNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const profileForCalc = {
name: profile.name, birthdate: profile.birthdate, sex: profile.sex,
height: parseNum(profile.height), weight: parseNum(profile.weight), activity: profile.activity,
};
const complete = isProfileComplete(profileForCalc);

if (!complete) return <OnboardingFlow />;
return <DashboardView />;
}

// ── ONBOARDING FLOW ──
function OnboardingFlow() {
const { state, updateState } = useAppContext();
const [step, setStep] = useState(0);
const [anim, setAnim] = useState("ob-enter");
const [form, setForm] = useState({
name: state?.userProfile?.name || "",
birthdate: state?.userProfile?.birthdate || "",
sex: state?.userProfile?.sex || "",
height: state?.userProfile?.height || "",
weight: state?.userProfile?.weight || "",
activity: state?.userProfile?.activity || "",
goal: "",
});

const update = (field, val) => setForm((p) => ({ …p, [field]: val }));
const parseNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

const goNext = () => { setAnim("ob-exit"); setTimeout(() => { setStep((s) => s + 1); setAnim("ob-enter"); }, 200); };
const goBack = () => { setAnim("ob-exit-back"); setTimeout(() => { setStep((s) => s - 1); setAnim("ob-enter-back"); }, 200); };

const canProceed = () => {
if (step === 1) return form.name.trim() && calculateAge(form.birthdate) !== null && (form.sex === "male" || form.sex === "female");
if (step === 2) return parseNum(form.height) && parseNum(form.weight) && ACTIVITY_MULTIPLIERS[form.activity];
if (step === 3) return !!form.goal;
return true;
};

const handleFinish = () => {
const p = { name: form.name.trim(), birthdate: form.birthdate, sex: form.sex, height: parseNum(form.height), weight: parseNum(form.weight), activity: form.activity };
const tdee = calculateTDEE(p);
let calTarget = null, protTarget = null;
if (tdee) {
if (form.goal === "loss") { calTarget = Math.round(tdee - 300); protTarget = Math.round(p.weight * 1.8); }
else if (form.goal === "gain") { calTarget = Math.round(tdee + 200); protTarget = Math.round(p.weight * 2); }
else { calTarget = Math.round(tdee); protTarget = Math.round(p.weight * 1.8); }
}
updateState((prev) => ({
…prev,
user: { …prev.user, name: p.name },
userProfile: p,
dailyCalorieTarget: calTarget,
dailyProteinTarget: protTarget,
}));
};

const age = calculateAge(form.birthdate);

return (
<div className="page-shell">
<div className="ob-progress">
{[0, 1, 2, 3].map((i) => <div key={i} className={`ob-dot ${i <= step ? "ob-dot-active" : ""} ${i === step ? "ob-dot-current" : ""}`} />)}
</div>

```
  <div className={`ob-step ${anim}`}>
    {/* Step 0 - Welcome */}
    {step === 0 && (
      <div className="ob-welcome">
        <div className="ob-brand">HYTRX</div>
        <h1 className="ob-title">Track. Perform. Evolve.</h1>
        <p className="ob-subtitle">Configure ton profil pour activer le suivi de tes performances.</p>
        <button className="btn-primary ob-btn" onClick={goNext}>Commencer</button>
      </div>
    )}

    {/* Step 1 - Identity */}
    {step === 1 && (
      <div className="ob-form">
        <h2 className="ob-step-title">Qui es-tu ?</h2>
        <div className="ob-fields">
          <div className="nutri-field-wrap"><div className="nutri-field-label">Prénom</div>
            <input className="input input-full" type="text" placeholder="Ton prénom…" value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={30} autoFocus />
          </div>
          <div className="nutri-field-wrap"><div className="nutri-field-label">Date de naissance</div>
            <input className="input input-full" type="date" value={form.birthdate} onChange={(e) => update("birthdate", e.target.value)} max={new Date().toISOString().split("T")[0]} />
            {age !== null && <div className="age-badge">{age} ans</div>}
          </div>
          <div className="nutri-field-wrap"><div className="nutri-field-label">Sexe</div>
            <div className="ob-sex-row">
              <button className={`ob-sex-btn ${form.sex === "male" ? "ob-sex-active" : ""}`} onClick={() => update("sex", "male")}>Homme</button>
              <button className={`ob-sex-btn ${form.sex === "female" ? "ob-sex-active" : ""}`} onClick={() => update("sex", "female")}>Femme</button>
            </div>
          </div>
        </div>
        <div className="ob-nav">
          <button className="ob-back" onClick={goBack}>← Retour</button>
          <button className="btn-primary ob-btn" onClick={goNext} disabled={!canProceed()}>Suivant</button>
        </div>
      </div>
    )}

    {/* Step 2 - Measurements */}
    {step === 2 && (
      <div className="ob-form">
        <h2 className="ob-step-title">Ton physique</h2>
        <div className="ob-fields">
          <div className="profile-row-2">
            <div className="nutri-field-wrap"><div className="nutri-field-label">Taille (cm)</div>
              <input className="input input-full" type="number" placeholder="175" value={form.height} onChange={(e) => update("height", e.target.value)} min={80} max={260} inputMode="numeric" />
            </div>
            <div className="nutri-field-wrap"><div className="nutri-field-label">Poids (kg)</div>
              <input className="input input-full" type="number" placeholder="75" value={form.weight} onChange={(e) => update("weight", e.target.value)} min={20} max={350} inputMode="numeric" />
            </div>
          </div>
          <div className="nutri-field-wrap"><div className="nutri-field-label">Niveau d'activité quotidienne</div>
            <select className="input input-full select" value={form.activity} onChange={(e) => update("activity", e.target.value)}>
              <option value="">- Sélectionner -</option>
              {Object.entries(ACTIVITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="ob-nav">
          <button className="ob-back" onClick={goBack}>← Retour</button>
          <button className="btn-primary ob-btn" onClick={goNext} disabled={!canProceed()}>Suivant</button>
        </div>
      </div>
    )}

    {/* Step 3 - Goal */}
    {step === 3 && (
      <div className="ob-form">
        <h2 className="ob-step-title">Ton objectif</h2>
        <div className="ob-goals">
          {[
            { id: "loss", icon: "🔥", label: "Perte de gras", desc: "Déficit calorique modéré" },
            { id: "gain", icon: "💪", label: "Prise de muscle", desc: "Surplus calorique contrôlé" },
            { id: "recomp", icon: "⚡", label: "Recomposition", desc: "Maintien calorique" },
          ].map((g) => (
            <button key={g.id} className={`ob-goal-card ${form.goal === g.id ? "ob-goal-active" : ""}`} onClick={() => update("goal", g.id)}>
              <span className="ob-goal-icon">{g.icon}</span>
              <span className="ob-goal-label">{g.label}</span>
              <span className="ob-goal-desc">{g.desc}</span>
            </button>
          ))}
        </div>
        {form.goal && (() => {
          const p = { name: form.name, birthdate: form.birthdate, sex: form.sex, height: parseNum(form.height), weight: parseNum(form.weight), activity: form.activity };
          const tdee = calculateTDEE(p);
          if (!tdee) return null;
          const cal = form.goal === "loss" ? Math.round(tdee - 300) : form.goal === "gain" ? Math.round(tdee + 200) : Math.round(tdee);
          const prot = form.goal === "gain" ? Math.round(p.weight * 2) : Math.round(p.weight * 1.8);
          return (
            <div className="ob-preview">
              <div className="ob-preview-row"><span>Objectif calories</span><span className="ob-preview-val">{cal} kcal/j</span></div>
              <div className="ob-preview-row"><span>Objectif protéines</span><span className="ob-preview-val">{prot}g/j</span></div>
            </div>
          );
        })()}
        <div className="ob-nav">
          <button className="ob-back" onClick={goBack}>← Retour</button>
          <button className="btn-primary ob-btn" onClick={handleFinish} disabled={!canProceed()}>Commencer</button>
        </div>
      </div>
    )}
  </div>
</div>
```

);
}

// ── DASHBOARD VIEW ──
function DashboardView() {
const { state, updateState, setActiveTab } = useAppContext();
const name = state?.userProfile?.name || state?.user?.name;
const profile = state?.userProfile || {};
const calTarget = state?.dailyCalorieTarget;
const protTarget = state?.dailyProteinTarget;
const parseNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const profileForCalc = { name: profile.name, birthdate: profile.birthdate, sex: profile.sex, height: parseNum(profile.height), weight: parseNum(profile.weight), activity: profile.activity };
const bmr = calculateBMR(profileForCalc);
const tdee = calculateTDEE(profileForCalc);
const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
const activeSession = state?.activeSession || null;

// Today data
const todayMeals = getTodayMeals(state?.meals);
const todaySessions = getTodaySessions(sessions);
const consumedCal = todayMeals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
const consumedProt = todayMeals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
const burnedCal = todaySessions.reduce((s, sess) => s + (sess.calories?.total || 0), 0);
const remainingCal = calTarget ? calTarget - consumedCal + burnedCal : null;
const remainingProt = protTarget ? protTarget - consumedProt : null;
const calProgress = calTarget ? Math.min(100, Math.round((consumedCal / calTarget) * 100)) : 0;

// Streak
const streak = calculateStreak(sessions);

// Suggestions
const suggestions = useMemo(() => generateSuggestions(state), [state]);

// Editing state
const [editingCal, setEditingCal] = useState(false);
const [calInput, setCalInput] = useState(calTarget ? String(calTarget) : "");
const [calSaved, setCalSaved] = useState(false);
const [editingProt, setEditingProt] = useState(false);
const [protInput, setProtInput] = useState(protTarget ? String(protTarget) : "");
const [protSaved, setProtSaved] = useState(false);
const suggestion = tdee ? Math.round(tdee - 300) : null;

const handleSaveCalTarget = () => { const val = Number(calInput); if (!Number.isFinite(val) || val < 800 || val > 8000) return; updateState((prev) => ({ …prev, dailyCalorieTarget: Math.round(val) })); setEditingCal(false); setCalSaved(true); setTimeout(() => setCalSaved(false), 2000); };
const handleClearCal = () => { updateState((prev) => ({ …prev, dailyCalorieTarget: null })); setCalInput(""); setEditingCal(false); };
const handleSaveProtTarget = () => { const val = Number(protInput); if (!Number.isFinite(val) || val < 10 || val > 500) return; updateState((prev) => ({ …prev, dailyProteinTarget: Math.round(val) })); setEditingProt(false); setProtSaved(true); setTimeout(() => setProtSaved(false), 2000); };
const handleClearProt = () => { updateState((prev) => ({ …prev, dailyProteinTarget: null })); setProtInput(""); setEditingProt(false); };

const dismissSuggestion = (id) => {
updateState((prev) => ({ …prev, dismissedSuggestions: { …(prev.dismissedSuggestions || {}), [id]: Date.now() } }));
};

// Weekly activity dots (Mon-Sun)
const weekDots = useMemo(() => {
const dots = [];
const now = new Date();
const dayOfWeek = now.getDay(); // 0=Sun
const monday = new Date(now);
monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
monday.setHours(0, 0, 0, 0);
const sessionDays = new Set(sessions.map((s) => getDateKey(s.startedAt)).filter(Boolean));
const mealDays = new Set((state?.meals || []).map((m) => getDateKey(m.date)).filter(Boolean));
for (let i = 0; i < 7; i++) {
const d = new Date(monday);
d.setDate(d.getDate() + i);
const k = getDateKey(d.toISOString());
const isToday = k === getTodayKey();
const isFuture = d > now;
const hasSession = sessionDays.has(k);
const hasMeal = mealDays.has(k);
dots.push({ key: k, isToday, isFuture, hasSession, hasMeal, active: hasSession || hasMeal });
}
return dots;
}, [sessions, state?.meals]);

// Today wins
const todayWins = todayMeals.length + todaySessions.length;

return (
<PageShell noHeader>
{/* ── Greeting ── */}
<div className="dash-hero-greeting">
<div className="dash-brand-mark">HYTRX</div>
<div className="dash-greeting">{getGreeting()}, {name}</div>
<div className="dash-date">{formatFullDate()}</div>
{/* Weekly dots + streak inline */}
<div className="dash-week-row">
<div className="dash-week-dots">
{["L","M","M","J","V","S","D"].map((label, i) => (
<div key={i} className={`dash-week-dot-col`}>
<span className="dash-week-dot-label">{label}</span>
<div className={`dash-week-dot ${weekDots[i]?.active ? "dash-week-dot-active" : ""} ${weekDots[i]?.isToday ? "dash-week-dot-today" : ""} ${weekDots[i]?.isFuture ? "dash-week-dot-future" : ""}`} />
</div>
))}
</div>
{streak.current >= 1 && <div className={`dash-streak ${streak.current >= 3 ? "dash-streak-fire" : ""}`}>{streak.current}j</div>}
</div>
</div>

```
  {/* ── Suggestions ── */}
  {suggestions.length > 0 && (
    <div className="dash-suggestions">
      {suggestions.map((s) => (
        <div key={s.id} className="dash-suggestion-card">
          <span className="dash-suggestion-icon">{s.icon}</span>
          <span className="dash-suggestion-text">{s.text}</span>
          <button className="dash-suggestion-dismiss" onClick={() => dismissSuggestion(s.id)}>✕</button>
        </div>
      ))}
    </div>
  )}

  {/* ── Active session banner ── */}
  {activeSession && (
    <button className="train-banner" onClick={() => setActiveTab("track")}>
      <span className="train-banner-dot" /><span className="train-banner-txt">Séance en cours</span><span className="train-banner-arrow">Reprendre →</span>
    </button>
  )}

  {/* ══════════════════════════════════════
      HERO - Remaining Today (WOW moment)
      ══════════════════════════════════════ */}
  {(remainingCal !== null || remainingProt !== null) && !editingCal && !editingProt && (
    <div className={`dash-hero-card ${remainingCal !== null && remainingCal < 0 ? "dash-hero-card-over" : ""}`}>
      <div className="dash-hero-glow" />

      {/* Circular progress ring + number */}
      {remainingCal !== null && (
        <div className="dash-hero-ring-wrap">
          <svg className="dash-hero-ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
            <circle cx="60" cy="60" r="54" fill="none"
              stroke={calProgress > 100 ? "var(--danger)" : "var(--accent)"}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${Math.min(calProgress, 100) * 3.393} 339.3`}
              transform="rotate(-90 60 60)"
              className="dash-hero-ring-progress" />
          </svg>
          <div className="dash-hero-ring-content">
            <span className={`dash-hero-number ${remainingCal < 0 ? "dash-hero-over" : ""}`}>{remainingCal}</span>
            <span className="dash-hero-unit">kcal</span>
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="dash-hero-breakdown">
        <span>{consumedCal} IN</span>
        {burnedCal > 0 && <><span className="dash-hero-sep">·</span><span>{burnedCal} OUT</span></>}
        {calTarget && <><span className="dash-hero-sep">·</span><span>OBJ {calTarget}</span></>}
      </div>

      {/* Today wins */}
      {todayWins > 0 && (
        <div className="dash-hero-wins">
          <span className="dash-hero-wins-count">{todayWins}</span>
          <span className="dash-hero-wins-label">{todayWins === 1 ? "action today" : "actions today"}</span>
        </div>
      )}

      {/* Protein bar */}
      {remainingProt !== null && (
        <div className="dash-hero-prot">
          <div className="dash-hero-prot-header">
            <span className="dash-hero-prot-label">Protéines</span>
            <span className="dash-hero-prot-sub">{consumedProt}/{protTarget}g</span>
          </div>
          <div className="dash-hero-prot-bar">
            <div className={`dash-hero-prot-fill ${remainingProt < 0 ? "dash-hero-prot-fill-over" : ""}`} style={{ width: `${Math.min(100, protTarget ? (consumedProt / protTarget) * 100 : 0)}%` }} />
          </div>
          <span className={`dash-hero-prot-val ${remainingProt < 0 ? "dash-hero-over" : ""}`}>{remainingProt}g restantes</span>
        </div>
      )}

      {todayMeals.length === 0 && (
        <div className="dash-hero-empty">Aucun repas enregistré</div>
      )}
    </div>
  )}

  {/* ── Single Sticky CTA - context-aware ── */}
  {!activeSession && !editingCal && !editingProt && (
    <div className="sticky-cta">
      {todayMeals.length === 0 ? (
        <button className="sticky-cta-main" onClick={() => setActiveTab("track")}>Ajouter un repas</button>
      ) : (
        <button className="sticky-cta-main" onClick={() => setActiveTab("track")}>Lancer une séance</button>
      )}
    </div>
  )}

  {/* ── Objectives - compact, single column ── */}
  <div className="dash-section-label">Objectifs quotidiens</div>
  {!editingCal && !editingProt && (
    <div className="dash-obj-stack">
      <div className="dash-obj-row" onClick={() => { setCalInput(calTarget ? String(calTarget) : (suggestion ? String(suggestion) : "")); setEditingCal(true); }}>
        <span className="dash-obj-row-label">Calories</span>
        <span className="dash-obj-row-val">{calTarget ? `${calTarget} kcal/j` : "Non défini"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div className="dash-obj-row" onClick={() => { setProtInput(protTarget ? String(protTarget) : ""); setEditingProt(true); }}>
        <span className="dash-obj-row-label">Protéines</span>
        <span className="dash-obj-row-val">{protTarget ? `${protTarget}g/j` : "Non défini"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      {(calSaved || protSaved) && <div className="save-toast"><span className="status-dot status-ok" /><span>Objectif enregistré</span></div>}
    </div>
  )}
  {editingCal && (
    <div className="card">
      <div className="card-label">Objectif calories</div>
      <div className="dash-inline-form">
        {suggestion && <div className="dash-suggestion-hint">Suggestion : {suggestion} kcal (TDEE − 300)</div>}
        <div className="input-row"><input className="input" type="number" placeholder="Ex : 2100" value={calInput} onChange={(e) => setCalInput(e.target.value)} min={800} max={8000} inputMode="numeric" autoFocus style={{ flex: 1 }} /><button className="btn-save" onClick={handleSaveCalTarget}>OK</button></div>
        <div className="dash-form-actions"><button className="dash-cancel-btn" onClick={() => setEditingCal(false)}>Annuler</button>{calTarget && <button className="dash-clear-btn" onClick={handleClearCal}>Supprimer</button>}</div>
      </div>
    </div>
  )}
  {editingProt && (
    <div className="card">
      <div className="card-label">Objectif protéines</div>
      <div className="dash-inline-form">
        <div className="input-row"><input className="input" type="number" placeholder="Ex : 140" value={protInput} onChange={(e) => setProtInput(e.target.value)} min={10} max={500} inputMode="numeric" autoFocus style={{ flex: 1 }} /><button className="btn-save" onClick={handleSaveProtTarget}>OK</button></div>
        <div className="dash-form-actions"><button className="dash-cancel-btn" onClick={() => setEditingProt(false)}>Annuler</button>{protTarget && <button className="dash-clear-btn" onClick={handleClearProt}>Supprimer</button>}</div>
      </div>
    </div>
  )}

  {/* ── TDEE - subtle footer ── */}
  {tdee && bmr && (
    <div className="dash-tdee-compact">
      TDEE {Math.round(tdee)} kcal · BMR {Math.round(bmr)} kcal
    </div>
  )}
</PageShell>
```

);
}

// ─────────────────────────────────────────────
// TRAINING PAGE
// ─────────────────────────────────────────────
function TrainingPage() {
const { state, updateState } = useAppContext();
const programs = Array.isArray(state?.programs) ? state.programs : [];
const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
const activeSession = state?.activeSession || null;
const customExercises = Array.isArray(state?.customExercises) ? state.customExercises : [];
const allExercises = getAllExercises(customExercises);
const profile = state?.userProfile || {};
const profileForCalc = { weight: Number(profile.weight) || null, height: Number(profile.height) || null, birthdate: profile.birthdate, sex: profile.sex };

const [view, setView] = useState(activeSession ? "session" : "home");
const [viewData, setViewData] = useState(null);
const [viewAnim, setViewAnim] = useState("page-in");
const [toast, setToast] = useState("");
const [progName, setProgName] = useState("");
const [progExercises, setProgExercises] = useState([]);
const [progError, setProgError] = useState("");
const [elapsed, setElapsed] = useState(0);
const [restTimer, setRestTimer] = useState(null);
const [histOpen, setHistOpen] = useState(false);
const [restModeOn, setRestModeOn] = useState(true);
const [finishData, setFinishData] = useState(null);
const [showCreateEx, setShowCreateEx] = useState(false);
const [showExList, setShowExList] = useState(false);
const [prToast, setPrToast] = useState(null);

const nav = (v, data = null) => { setViewAnim("page-out"); setTimeout(() => { setView(v); setViewData(data); setViewAnim("page-in"); }, 120); };
const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

const handleCreateExercise = (ex) => { updateState((prev) => ({ …prev, customExercises: […(prev.customExercises || []), ex] })); setShowCreateEx(false); showToast(`${ex.name} créé`); };

useEffect(() => {
if (!activeSession?.startedAt) return;
const start = new Date(activeSession.startedAt).getTime();
const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
}, [activeSession?.startedAt]);

useEffect(() => {
if (!restTimer) return;
if (restTimer.remaining <= 0) {
setRestTimer(null);
try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
return;
}
const id = setTimeout(() => setRestTimer((prev) => prev ? { …prev, remaining: prev.remaining - 1 } : null), 1000);
return () => clearTimeout(id);
}, [restTimer]);

// PROGRAM CRUD
const startCreate = () => { setProgName(""); setProgExercises([]); setProgError(""); nav("create"); };
const addProgEx = (ex) => { if (progExercises.some((e) => e.exerciseId === ex.id)) return; setProgExercises((p) => […p, { exerciseId: ex.id, name: ex.name, category: ex.category, sets: ex.category === "cardio" ? 0 : 3, reps: ex.category === "cardio" ? 0 : 10, restTime: 90 }]); };
const removeProgEx = (exId) => setProgExercises((p) => p.filter((e) => e.exerciseId !== exId));
const updateProgEx = (exId, field, val) => setProgExercises((p) => p.map((e) => e.exerciseId === exId ? { …e, [field]: val } : e));

const saveProgram = () => {
const n = progName.trim();
if (!n) { setProgError("Le nom est obligatoire"); return; }
if (progExercises.length === 0) { setProgError("Ajoute au moins un exercice"); return; }
updateState((prev) => ({ …prev, programs: […(prev.programs || []), { id: generateId(), name: n, exercises: progExercises }] }));
nav("home"); showToast("Programme créé");
};

const deleteProgram = (id) => { updateState((prev) => ({ …prev, programs: (prev.programs || []).filter((p) => p.id !== id) })); nav("home"); showToast("Programme supprimé"); };
const duplicateProgram = (prog) => { updateState((prev) => ({ …prev, programs: […(prev.programs || []), { …prog, id: generateId(), name: prog.name + " (copie)", exercises: prog.exercises.map((e) => ({ …e })) }] })); showToast("Programme dupliqué"); };

const updateProgramEx = (progId, exId, field, val) => {
updateState((prev) => ({ …prev, programs: (prev.programs || []).map((p) => p.id !== progId ? p : { …p, exercises: p.exercises.map((e) => (e.exerciseId || e.id) === exId ? { …e, [field]: val } : e) }) }));
setViewData((prev) => { if (!prev || prev.id !== progId) return prev; return { …prev, exercises: prev.exercises.map((e) => (e.exerciseId || e.id) === exId ? { …e, [field]: val } : e) }; });
};

const removeProgramEx = (progId, exId) => {
updateState((prev) => ({ …prev, programs: (prev.programs || []).map((p) => p.id !== progId ? p : { …p, exercises: p.exercises.filter((e) => (e.exerciseId || e.id) !== exId) }) }));
setViewData((prev) => { if (!prev || prev.id !== progId) return prev; return { …prev, exercises: prev.exercises.filter((e) => (e.exerciseId || e.id) !== exId) }; });
showToast("Exercice retiré");
};

// SESSION
const startFreeSession = () => {
updateState((prev) => ({ …prev, activeSession: { id: generateId(), type: "free", programId: null, programName: null, startedAt: new Date().toISOString(), exercises: [] } }));
nav("session");
};

const startProgramSession = (prog) => {
const origTemplate = (prog.exercises || []).map((e) => ({ exerciseId: e.exerciseId || e.id, name: e.name, category: e.category, sets: Number(e.sets) || 0, reps: Number(e.reps) || 0, restTime: e.restTime || 90 }));
const exercises = origTemplate.map((e) => {
const isCardio = e.category === "cardio";
const numSets = e.sets || (isCardio ? 0 : 3);
const numReps = e.reps || (isCardio ? 0 : 10);
// Pre-fill from last session
const lastSets = getLastWeightForExercise(e.exerciseId, sessions);
return {
id: generateId(), exerciseId: e.exerciseId, name: e.name, category: e.category, restTime: e.restTime || 90,
sets: isCardio ? [] : Array.from({ length: numSets }, (_, i) => ({
reps: numReps, weight: lastSets[i]?.weight || (i > 0 && lastSets.length > 0 ? lastSets[lastSets.length - 1]?.weight || "" : ""), done: false,
lastWeight: lastSets[i]?.weight || null,
})),
cardio: isCardio ? { durationSecs: 0, distance: "", speed: "", allure: "", bpm: "" } : null,
};
});
setRestModeOn(prog.restMode !== false);
updateState((prev) => ({ …prev, activeSession: { id: generateId(), type: "program", programId: prog.id, programName: prog.name, startedAt: new Date().toISOString(), exercises, originalTemplate: origTemplate } }));
nav("session");
};

const addSessionExercise = (ex) => {
if (!activeSession) return;
const isCardio = ex.category === "cardio";
const lastSets = getLastWeightForExercise(ex.id, sessions);
const newEx = {
id: generateId(), exerciseId: ex.id, name: ex.name, category: ex.category, restTime: 90,
sets: isCardio ? [] : [{ reps: 10, weight: lastSets[0]?.weight || "", done: false, lastWeight: lastSets[0]?.weight || null }],
cardio: isCardio ? { durationSecs: 0, distance: "", speed: "", allure: "", bpm: "" } : null,
};
updateState((prev) => ({ …prev, activeSession: { …prev.activeSession, exercises: […(prev.activeSession?.exercises || []), newEx] } }));
nav("session"); showToast(`${ex.name} ajouté`);
};

const updateSessionEx = (exSessId, updater) => {
updateState((prev) => {
if (!prev.activeSession) return prev;
return { …prev, activeSession: { …prev.activeSession, exercises: prev.activeSession.exercises.map((e) => e.id === exSessId ? (typeof updater === "function" ? updater(e) : { …e, …updater }) : e) } };
});
};

const removeSessionEx = (exSessId) => { updateState((prev) => { if (!prev.activeSession) return prev; return { …prev, activeSession: { …prev.activeSession, exercises: prev.activeSession.exercises.filter((e) => e.id !== exSessId) } }; }); };

const addSet = (exSessId) => { updateSessionEx(exSessId, (e) => { const last = e.sets[e.sets.length - 1]; return { …e, sets: […e.sets, { reps: last?.reps || 10, weight: last?.weight || "", done: false }] }; }); };
const removeSet = (exSessId) => { updateSessionEx(exSessId, (e) => ({ …e, sets: e.sets.length > 1 ? e.sets.slice(0, -1) : e.sets })); };
const updateSet = (exSessId, si, field, val) => { updateSessionEx(exSessId, (e) => ({ …e, sets: e.sets.map((s, i) => i === si ? { …s, [field]: val } : s) })); };

const toggleSetDone = (exSessId, si) => {
const curEx = activeSession?.exercises?.find((e) => e.id === exSessId);
const wasDone = curEx?.sets?.[si]?.done || false;
updateSet(exSessId, si, "done", !wasDone);
if (!wasDone) {
// Rest timer
if (restModeOn) {
const restTime = curEx?.restTime || 90;
setRestTimer({ remaining: restTime, total: restTime });
}
// PR check
const set = curEx?.sets?.[si];
if (set && curEx) {
const w = Number(set.weight) || 0;
const r = Number(set.reps) || 0;
if (w > 0 && r > 0 && checkNewPR(curEx.exerciseId, w, r, sessions)) {
setPrToast({ weight: w, reps: r, name: curEx.name });
setTimeout(() => setPrToast(null), 3000);
}
}
}
};

const updateCardio = (exSessId, field, val) => { updateSessionEx(exSessId, (e) => { const c = { …(e.cardio || {}), [field]: val }; return { …e, cardio: autoCalcCardio(c) }; }); };
const updateCardioDuration = (exSessId, part, val) => {
updateSessionEx(exSessId, (e) => {
const c = { …(e.cardio || {}) }; const cur = secondsToHMS(c.durationSecs); const v = Math.max(0, Number(val) || 0);
if (part === "h") cur.h = Math.min(v, 23); if (part === "m") cur.m = Math.min(v, 59); if (part === "s") cur.s = Math.min(v, 59);
c.durationSecs = hmsToSeconds(cur.h, cur.m, cur.s); return { …e, cardio: autoCalcCardio(c) };
});
};

const toggleRestMode = () => { const next = !restModeOn; setRestModeOn(next); if (!next) setRestTimer(null); };

const finishSession = () => {
if (!activeSession) return;
const endedAt = new Date().toISOString();
const duration = Math.round((new Date(endedAt).getTime() - new Date(activeSession.startedAt).getTime()) / 60000);
const calories = calcSessionCalories(activeSession.exercises, profileForCalc);
const changes = activeSession.type === "program" && activeSession.originalTemplate ? detectProgramChanges(activeSession.originalTemplate, activeSession.exercises) : [];
const completed = { …activeSession, endedAt, duration, calories }; delete completed.originalTemplate;
setFinishData({ completed, calories, changes }); setRestTimer(null);
};

const confirmFinish = (saveChanges) => {
if (!finishData) return;
const { completed, changes } = finishData;
updateState((prev) => {
const next = { …prev, sessions: […(prev.sessions || []), completed], activeSession: null };
// Update PRs
const prs = { …(prev.personalRecords || {}) };
(completed.exercises || []).forEach((ex) => {
if (ex.category === "cardio") return;
(ex.sets || []).filter((s) => s.done).forEach((s) => {
const w = Number(s.weight) || 0, r = Number(s.reps) || 0;
if (w > 0 && r > 0) {
const t = w * r;
if (!prs[ex.exerciseId] || t > (prs[ex.exerciseId].tonnage || 0)) {
prs[ex.exerciseId] = { weight: w, reps: r, tonnage: t, date: completed.startedAt, exerciseName: ex.name };
}
}
});
});
next.personalRecords = prs;
// Update streak
const allSessions = […(prev.sessions || []), completed];
const s = calculateStreak(allSessions);
next.bestStreak = Math.max(prev.bestStreak || 0, s.current);
if (saveChanges && changes.length > 0 && completed.programId) {
next.programs = (prev.programs || []).map((p) => p.id === completed.programId ? { …p, exercises: sessionToTemplate(completed.exercises) } : p);
}
return next;
});
setFinishData(null); nav("home"); showToast("Séance terminée !");
};

const cancelSession = () => { updateState((prev) => ({ …prev, activeSession: null })); setRestTimer(null); setFinishData(null); nav("home"); };

// History editing helpers
const updateHistSession = (sessionId, updater) => {
updateState((prev) => ({ …prev, sessions: (prev.sessions || []).map((s) => s.id === sessionId ? (typeof updater === "function" ? updater(s) : { …s, …updater }) : s) }));
setViewData((prev) => { if (!prev || prev.id !== sessionId) return prev; return typeof updater === "function" ? updater(prev) : { …prev, …updater }; });
};
const deleteHistSession = (sessionId) => { updateState((prev) => ({ …prev, sessions: (prev.sessions || []).filter((s) => s.id !== sessionId) })); nav("home"); showToast("Séance supprimée"); };
const removeHistEx = (sessionId, exSessId) => { updateHistSession(sessionId, (s) => ({ …s, exercises: s.exercises.filter((e) => e.id !== exSessId) })); showToast("Exercice retiré"); };
const addHistSet = (sessionId, exSessId) => { updateHistSession(sessionId, (s) => ({ …s, exercises: s.exercises.map((e) => { if (e.id !== exSessId) return e; const last = e.sets[e.sets.length - 1]; return { …e, sets: […e.sets, { reps: last?.reps || 10, weight: last?.weight || "", done: true }] }; }) })); };
const removeHistSet = (sessionId, exSessId) => { updateHistSession(sessionId, (s) => ({ …s, exercises: s.exercises.map((e) => { if (e.id !== exSessId || e.sets.length <= 1) return e; return { …e, sets: e.sets.slice(0, -1) }; }) })); };
const updateHistSet = (sessionId, exSessId, si, field, val) => { updateHistSession(sessionId, (s) => ({ …s, exercises: s.exercises.map((e) => { if (e.id !== exSessId) return e; return { …e, sets: e.sets.map((set, i) => i === si ? { …set, [field]: val } : set) }; }) })); };

const toastEl = toast ? <div className="save-toast"><span className="status-dot status-ok" /><span>{toast}</span></div> : null;
const createExModal = showCreateEx ? <CreateExerciseModal onSave={handleCreateExercise} onClose={() => setShowCreateEx(false)} /> : null;
const prOverlay = prToast ? (
<div className="pr-overlay"><div className="pr-popup"><div className="pr-trophy">🏆</div><div className="pr-text">NOUVEAU RECORD</div><div className="pr-detail">{prToast.name} - {prToast.weight}kg × {prToast.reps} reps</div></div></div>
) : null;

// ── HOME ──
if (view === "home") {
const sortedSessions = […sessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
return (
<PageShell title="Training" subtitle="Programmes & sessions">
{activeSession && <button className="train-banner" onClick={() => nav("session")}><span className="train-banner-dot" /><span className="train-banner-txt">Séance en cours - {formatTime(elapsed)}</span><span className="train-banner-arrow">Reprendre →</span></button>}

```
    {programs.length > 0 && (<><div className="train-section-label">Mes programmes</div><div className="train-prog-list">{programs.map((p) => (<button key={p.id} className="card train-prog-card" onClick={() => nav("detail", p)}><div className="train-prog-card-info"><span className="train-prog-card-name">{p.name}</span><span className="train-prog-card-meta">{p.exercises?.length || 0} exercice{(p.exercises?.length || 0) > 1 ? "s" : ""}</span></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>))}</div></>)}
    {sortedSessions.length > 0 && (
      <div className="card collapse-card"><button className="collapse-toggle" onClick={() => setHistOpen((p) => !p)}><span className="collapse-title">Historique<span className="collapse-count">{sortedSessions.length}</span></span><svg className={`collapse-chevron ${histOpen ? "collapse-chevron-open" : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>
        {histOpen && <div className="collapse-body"><div className="train-hist-list">{sortedSessions.slice(0, 15).map((s) => (<button key={s.id} className="train-hist-row" onClick={() => nav("review", s)}><div className="train-hist-row-info"><span className="train-hist-row-name">{s.type === "free" ? "Séance libre" : s.programName || "Programme"}</span><span className="train-hist-row-meta">{formatDateLabel(getDateKey(s.startedAt))} · {s.exercises?.length || 0} exos · {s.duration || 0} min</span></div><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>))}</div></div>}
      </div>
    )}
    <div className="train-links-row">
      <button className="train-text-link" onClick={startCreate}>+ Créer un programme</button>
      <button className="train-text-link" onClick={() => setShowExList(true)}>Exercices</button>
    </div>
    {programs.length === 0 && sessions.length === 0 && !activeSession && <div className="card train-empty"><p className="card-text" style={{ textAlign: "center" }}>Lance ta première séance ou crée un programme</p></div>}

    {/* ── Sticky bottom CTA ── */}
    {!activeSession && (
      <div className="sticky-cta">
        <button className="sticky-cta-main" onClick={startFreeSession}>Démarrer une séance</button>
      </div>
    )}

    {showExList && <div className="train-popup-overlay" onClick={() => setShowExList(false)}><div className="train-popup train-exlist-modal" onClick={(e) => e.stopPropagation()}><div className="train-exlist-header"><div className="train-popup-title" style={{ marginBottom: 0 }}>Exercices</div><button className="train-exlist-close" onClick={() => setShowExList(false)}>✕</button></div><button className="btn-primary" style={{ fontSize: 13, padding: "10px 16px" }} onClick={() => { setShowExList(false); setShowCreateEx(true); }}>+ Créer un nouvel exercice</button><ExerciseCatalog onSelect={() => {}} selectedIds={[]} disabledIds={[]} allExercises={allExercises} /></div></div>}
    {createExModal}{toastEl}
  </PageShell>
);
```

}

// ── CREATE ──
if (view === "create") {
const selectedIds = progExercises.map((e) => e.exerciseId);
return (
<PageShell title="Nouveau programme" subtitle="Configure tes exercices">
<button className="train-back" onClick={() => nav("home")}>← Retour</button>
<div className="card"><div className="card-label">Nom du programme <span className="nutri-required">*</span></div><input className={`input input-full ${progError && !progName.trim() ? "input-error" : ""}`} type="text" placeholder="Ex : Push day, Full body…" value={progName} onChange={(e) => { setProgName(e.target.value); setProgError(""); }} maxLength={40} />{progError && <div className="nutri-error" style={{ marginTop: 6 }}>{progError}</div>}</div>
{progExercises.length > 0 && <div className="card"><div className="card-label">Exercices sélectionnés ({progExercises.length})</div><div className="train-prog-sel-list">{progExercises.map((ex) => { const isCardio = ex.category === "cardio"; return (<div key={ex.exerciseId} className="train-prog-sel-item"><div className="train-prog-sel-header"><span className="train-prog-sel-name">{ex.name}</span><button className="nutri-del-btn" onClick={() => removeProgEx(ex.exerciseId)}>×</button></div>{!isCardio ? (<div className="train-prog-sel-config"><div className="train-prog-sel-field"><label>Séries</label><input className="input train-prog-sel-input" type="number" inputMode="numeric" min={1} max={20} value={ex.sets || ""} onChange={(e) => updateProgEx(ex.exerciseId, "sets", Math.max(0, Number(e.target.value) || 0))} /></div><span className="train-prog-sel-x">×</span><div className="train-prog-sel-field"><label>Reps</label><input className="input train-prog-sel-input" type="number" inputMode="numeric" min={1} max={100} value={ex.reps || ""} onChange={(e) => updateProgEx(ex.exerciseId, "reps", Math.max(0, Number(e.target.value) || 0))} /></div></div>) : (<div className="train-prog-sel-note">Durée et distance saisies en séance</div>)}</div>); })}</div></div>}
<div className="train-section-label">Ajouter des exercices au programme</div>
<ExerciseCatalog onSelect={addProgEx} selectedIds={selectedIds} disabledIds={[]} allExercises={allExercises} onCreateExercise={() => setShowCreateEx(true)} />

```
    {/* ── Sticky bottom CTA ── */}
    <div className="sticky-cta">
      <button className="sticky-cta-main" onClick={saveProgram}>Créer le programme</button>
      <button className="sticky-cta-tertiary" onClick={() => nav("home")}>Annuler</button>
    </div>
    {createExModal}{toastEl}
  </PageShell>
);
```

}

// ── DETAIL ──
if (view === "detail" && viewData) {
const prog = viewData; const exs = prog.exercises || [];
return (
<PageShell title={prog.name} subtitle={`${exs.length} exercice${exs.length > 1 ? "s" : ""}`}>
<button className="train-back" onClick={() => nav("home")}>← Retour</button>
{exs.map((ex, i) => { const exId = ex.exerciseId || ex.id; const isCardio = ex.category === "cardio"; return (
<div key={exId + "-" + i} className="card train-detail-edit-card">
<div className="train-detail-edit-head"><div className="train-detail-edit-info"><span className="train-detail-num">{i + 1}</span><span className="train-detail-name">{ex.name}</span><span className={`train-cat-dot-sm train-cat-${ex.category}`} /></div><button className="nutri-del-btn" onClick={() => removeProgramEx(prog.id, exId)} title="Retirer">×</button></div>
{!isCardio && (<div className="train-detail-edit-controls"><div className="train-detail-edit-field"><span className="train-detail-edit-label">Séries</span><div className="train-detail-stepper"><button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "sets", Math.max(1, (Number(ex.sets) || 3) - 1))}>−</button><input className="train-stepper-val" type="number" inputMode="numeric" value={ex.sets || 3} onChange={(e) => updateProgramEx(prog.id, exId, "sets", Math.max(1, Number(e.target.value) || 1))} /><button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "sets", Math.min(20, (Number(ex.sets) || 3) + 1))}>+</button></div></div><span className="train-detail-edit-x">×</span><div className="train-detail-edit-field"><span className="train-detail-edit-label">Reps</span><div className="train-detail-stepper"><button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "reps", Math.max(1, (Number(ex.reps) || 10) - 1))}>−</button><input className="train-stepper-val" type="number" inputMode="numeric" value={ex.reps || 10} onChange={(e) => updateProgramEx(prog.id, exId, "reps", Math.max(1, Number(e.target.value) || 1))} /><button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "reps", Math.min(100, (Number(ex.reps) || 10) + 1))}>+</button></div></div><div className="train-detail-edit-field"><span className="train-detail-edit-label">Repos</span><div className="train-detail-stepper"><button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "restTime", Math.max(30, (Number(ex.restTime) || 90) - 15))}>−</button><input className="train-stepper-val" type="number" inputMode="numeric" value={ex.restTime || 90} onChange={(e) => updateProgramEx(prog.id, exId, "restTime", Math.max(30, Number(e.target.value) || 90))} /><button className="train-stepper-btn" onClick={() => updateProgramEx(prog.id, exId, "restTime", Math.min(300, (Number(ex.restTime) || 90) + 15))}>+</button></div></div></div>)}
{isCardio && <span className="train-detail-edit-cardio-note">Durée et distance saisies en séance</span>}
</div>
); })}
<div className="train-detail-actions"><button className="train-secondary-btn" style={{ flex: 1 }} onClick={() => duplicateProgram(prog)}>Dupliquer</button><button className="dash-clear-btn" style={{ flex: 1 }} onClick={() => deleteProgram(prog.id)}>Supprimer</button></div>

```
    {/* ── Sticky bottom CTA ── */}
    <div className="sticky-cta">
      <button className="sticky-cta-main" onClick={() => startProgramSession(prog)}>Lancer ce programme</button>
    </div>
    {toastEl}
  </PageShell>
);
```

}

// ── PICK ──
if (view === "pick") {
return (
<PageShell title="Ajouter un exercice" subtitle="Sélectionne un exercice">
<button className="train-back" onClick={() => nav("session")}>← Retour à la séance</button>
<ExerciseCatalog onSelect={addSessionExercise} selectedIds={[]} disabledIds={(activeSession?.exercises || []).map((e) => e.exerciseId)} allExercises={allExercises} onCreateExercise={() => setShowCreateEx(true)} />
{createExModal}
</PageShell>
);
}

// ── SESSION ──
if (view === "session" && activeSession) {
const sessionExs = activeSession.exercises || [];
const totalSets = sessionExs.reduce((s, e) => s + (e.sets?.length || 0), 0);
const doneSets = sessionExs.reduce((s, e) => s + (e.sets?.filter((st) => st.done).length || 0), 0);
return (
<PageShell title={activeSession.type === "free" ? "Séance libre" : activeSession.programName} subtitle={activeSession.type === "program" ? "Programme" : null}>
<div className="card train-session-header">
<div className="train-session-time">{formatTime(elapsed)}</div>
{totalSets > 0 && (
<div className="train-session-progress">
<svg className="train-session-ring" viewBox="0 0 40 40">
<circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
<circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
strokeDasharray={`${totalSets > 0 ? (doneSets / totalSets) * 106.8 : 0} 106.8`}
transform="rotate(-90 20 20)" />
</svg>
<span className="train-session-sets-label">{doneSets}/{totalSets}</span>
</div>
)}
<div className="train-session-stats">{sessionExs.length} exercice{sessionExs.length > 1 ? "s" : ""}</div>
<button className="train-rest-toggle" onClick={toggleRestMode}><span className={`train-rest-toggle-dot ${restModeOn ? "train-rest-toggle-on" : ""}`} /><span className="train-rest-toggle-label">{restModeOn ? "Repos activé" : "Repos désactivé"}</span></button>
</div>
{restTimer && <button className="train-rest-bar" onClick={() => setRestTimer(null)}><div className="train-rest-fill" style={{ width: `${(restTimer.remaining / restTimer.total) * 100}%` }} /><span className="train-rest-txt">Repos : {formatTime(restTimer.remaining)}</span><span className="train-rest-dismiss">✕</span></button>}
{sessionExs.map((ex) => (
<div key={ex.id} className="card train-sess-ex">
<div className="train-sess-ex-head">
<div>
<span className="train-sess-ex-name">{ex.name}</span>
<span className={`train-cat-dot-sm train-cat-${ex.category}`} />
</div>
<button className="nutri-del-btn" onClick={() => removeSessionEx(ex.id)} title="Retirer">×</button>
</div>
{/* Per-exercise completion bar */}
{ex.category !== "cardio" && ex.sets.length > 0 && (() => {
const done = ex.sets.filter(s => s.done).length;
const total = ex.sets.length;
const pct = Math.round((done / total) * 100);
return done > 0 ? (
<div className="train-ex-progress">
<div className="train-ex-progress-bar"><div className={`train-ex-progress-fill ${pct === 100 ? "train-ex-progress-complete" : ""}`} style={{ width: `${pct}%` }} /></div>
<span className={`train-ex-progress-label ${pct === 100 ? "train-ex-progress-done" : ""}`}>{pct === 100 ? "Done" : `${done}/${total}`}</span>
</div>
) : null;
})()}
{ex.category !== "cardio" ? (<>
<div className="train-sets-head"><span className="train-sets-col-num">Série</span><span className="train-sets-col">Poids (kg)</span><span className="train-sets-col">Reps</span><span className="train-sets-col-chk" /></div>
{ex.sets.map((set, si) => (<div key={si} className={`train-set-row ${set.done ? "train-set-done" : ""}`}><span className="train-set-num">{si + 1}</span><div className="train-set-input-wrap"><input className="train-set-input" type="number" inputMode="decimal" placeholder="-" value={set.weight} onChange={(e) => updateSet(ex.id, si, "weight", e.target.value)} />{set.lastWeight && !set.weight && <span className="train-set-hint">{set.lastWeight}kg</span>}</div><input className="train-set-input" type="number" inputMode="numeric" placeholder="-" value={set.reps} onChange={(e) => updateSet(ex.id, si, "reps", e.target.value)} /><button className={`train-set-chk ${set.done ? "train-set-chk-on" : ""}`} onClick={() => toggleSetDone(ex.id, si)}>✓</button></div>))}
<div className="train-set-btns"><button className="train-set-btn" onClick={() => addSet(ex.id)}>+ Série</button>{ex.sets.length > 1 && <button className="train-set-btn" onClick={() => removeSet(ex.id)}>− Série</button>}</div>
</>) : (() => { const dur = secondsToHMS(ex.cardio?.durationSecs); return (
<div className="train-cardio-section">
<div className="train-cardio-field"><label className="train-cardio-label">Durée</label><div className="train-hms-row"><input className="input train-hms-input" type="number" inputMode="numeric" placeholder="h" min={0} max={23} value={dur.h || ""} onChange={(e) => updateCardioDuration(ex.id, "h", e.target.value)} /><span className="train-hms-sep">:</span><input className="input train-hms-input" type="number" inputMode="numeric" placeholder="m" min={0} max={59} value={dur.m || ""} onChange={(e) => updateCardioDuration(ex.id, "m", e.target.value)} /><span className="train-hms-sep">:</span><input className="input train-hms-input" type="number" inputMode="numeric" placeholder="s" min={0} max={59} value={dur.s || ""} onChange={(e) => updateCardioDuration(ex.id, "s", e.target.value)} /></div></div>
<div className="train-cardio-grid"><div className="train-cardio-field"><label className="train-cardio-label">Distance (km)</label><input className="input input-full" type="number" inputMode="decimal" placeholder="-" value={ex.cardio?.distance || ""} onChange={(e) => updateCardio(ex.id, "distance", e.target.value)} /></div><div className="train-cardio-field"><label className="train-cardio-label">BPM</label><input className="input input-full" type="number" inputMode="numeric" placeholder="-" value={ex.cardio?.bpm || ""} onChange={(e) => updateCardio(ex.id, "bpm", e.target.value)} /></div></div>
<div className="train-cardio-grid"><div className="train-cardio-field"><label className="train-cardio-label">Vitesse (km/h)</label><input className="input input-full train-cardio-auto" type="number" inputMode="decimal" placeholder="auto" value={ex.cardio?.speed || ""} onChange={(e) => updateCardio(ex.id, "speed", e.target.value)} /></div><div className="train-cardio-field"><label className="train-cardio-label">Allure (min/km)</label><input className="input input-full train-cardio-auto" type="number" inputMode="decimal" placeholder="auto" value={ex.cardio?.allure || ""} onChange={(e) => updateCardio(ex.id, "allure", e.target.value)} /></div></div>
</div>); })()}
</div>
))}
<button className="train-secondary-btn" onClick={() => nav("pick")}>+ Ajouter un exercice</button>

```
    {/* ── Sticky bottom CTA ── */}
    <div className="sticky-cta">
      <button className="sticky-cta-main" onClick={finishSession}>Terminer la séance</button>
      <button className="sticky-cta-tertiary" onClick={cancelSession}>Annuler</button>
    </div>
    {finishData && (
      <div className="train-popup-overlay" onClick={() => setFinishData(null)}><div className="train-popup" onClick={(e) => e.stopPropagation()}>
        <div className="train-popup-title">Séance terminée</div>
        <div className="train-popup-cal"><div className="train-popup-cal-big">{finishData.calories.total}</div><div className="train-popup-cal-unit">kcal estimées</div>{(finishData.calories.cardio > 0 || finishData.calories.musculation > 0) && <div className="train-popup-cal-detail">{finishData.calories.cardio > 0 && <span>Cardio : {finishData.calories.cardio} kcal</span>}{finishData.calories.cardio > 0 && finishData.calories.musculation > 0 && <span> · </span>}{finishData.calories.musculation > 0 && <span>Muscu : {finishData.calories.musculation} kcal</span>}</div>}</div>
        {finishData.changes.length > 0 && <div className="train-popup-changes"><div className="train-popup-changes-title">Vous avez modifié ce programme</div><div className="train-popup-changes-list">{finishData.changes.map((c, i) => <div key={i} className="train-popup-change-item">{c}</div>)}</div><div className="train-popup-change-btns"><button className="btn-primary" style={{ fontSize: 13, padding: "11px 14px" }} onClick={() => confirmFinish(true)}>Enregistrer les modifications</button><button className="dash-cancel-btn" style={{ width: "100%" }} onClick={() => confirmFinish(false)}>Ignorer</button></div></div>}
        {finishData.changes.length === 0 && <button className="btn-primary" style={{ width: "100%", marginTop: 12 }} onClick={() => confirmFinish(false)}>Confirmer</button>}
      </div></div>
    )}
    {prOverlay}{toastEl}
  </PageShell>
);
```

}

// ── REVIEW ──
if (view === "review" && viewData) {
const s = viewData;
return (
<PageShell title={s.type === "free" ? "Séance libre" : s.programName || "Programme"} subtitle={formatDateLabel(getDateKey(s.startedAt))}>
<button className="train-back" onClick={() => nav("home")}>← Retour</button>
<div className="card train-review-header">
<div className="train-review-stat"><span className="train-review-stat-val">{s.duration || 0}</span><span className="train-review-stat-label">min</span></div><div className="train-review-divider" />
<div className="train-review-stat"><span className="train-review-stat-val">{s.exercises?.length || 0}</span><span className="train-review-stat-label">exercices</span></div><div className="train-review-divider" />
<div className="train-review-stat"><span className="train-review-stat-val">{s.exercises?.reduce((t, e) => t + (e.sets?.length || 0), 0) || 0}</span><span className="train-review-stat-label">séries</span></div>
{s.calories?.total > 0 && <><div className="train-review-divider" /><div className="train-review-stat"><span className="train-review-stat-val" style={{ color: "var(-ok)" }}>{s.calories.total}</span><span className="train-review-stat-label">kcal</span></div></>}
</div>
{(s.exercises || []).map((ex) => (
<div key={ex.id} className="card train-sess-ex">
<div className="train-sess-ex-head"><div><span className="train-sess-ex-name">{ex.name}</span><span className={`train-cat-dot-sm train-cat-${ex.category}`} /></div><button className="nutri-del-btn" onClick={() => removeHistEx(s.id, ex.id)} title="Retirer">×</button></div>
{ex.category !== "cardio" ? (<>
<div className="train-sets-head"><span className="train-sets-col-num">Série</span><span className="train-sets-col">Poids (kg)</span><span className="train-sets-col">Reps</span><span className="train-sets-col-chk" /></div>
{(ex.sets || []).map((set, si) => (<div key={si} className={`train-set-row ${set.done ? "train-set-done" : ""}`}><span className="train-set-num">{si + 1}</span><input className="train-set-input" type="number" inputMode="decimal" placeholder="-" value={set.weight} onChange={(e) => updateHistSet(s.id, ex.id, si, "weight", e.target.value)} /><input className="train-set-input" type="number" inputMode="numeric" placeholder="-" value={set.reps} onChange={(e) => updateHistSet(s.id, ex.id, si, "reps", e.target.value)} /><span className={`train-set-chk ${set.done ? "train-set-chk-on" : ""}`} style={{ cursor: "default" }}>{set.done ? "✓" : ""}</span></div>))}
<div className="train-set-btns"><button className="train-set-btn" onClick={() => addHistSet(s.id, ex.id)}>+ Série</button>{(ex.sets?.length || 0) > 1 && <button className="train-set-btn" onClick={() => removeHistSet(s.id, ex.id)}>− Série</button>}</div>
</>) : (
<div className="train-review-cardio">
{ex.cardio?.durationSecs > 0 && <div className="train-review-cardio-row">Durée : {formatTime(ex.cardio.durationSecs)}</div>}
{ex.cardio?.distance && <div className="train-review-cardio-row">Distance : {ex.cardio.distance} km</div>}
{ex.cardio?.speed && <div className="train-review-cardio-row">Vitesse : {ex.cardio.speed} km/h</div>}
{ex.cardio?.allure && <div className="train-review-cardio-row">Allure : {ex.cardio.allure} min/km</div>}
{ex.cardio?.bpm && <div className="train-review-cardio-row">BPM : {ex.cardio.bpm}</div>}
</div>
)}
</div>
))}
<button className="dash-clear-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => deleteHistSession(s.id)}>Supprimer la séance</button>
{toastEl}
</PageShell>
);
}

return <PageShell title="Entraînement"><button className="train-back" onClick={() => nav("home")}>← Retour</button></PageShell>;
}

// ─────────────────────────────────────────────
// NUTRITION PAGE - with autocomplete & quick log
// ─────────────────────────────────────────────
function NutritionPage() {
const { state, updateState } = useAppContext();
const meals = Array.isArray(state?.meals) ? state.meals : [];
const savedMeals = Array.isArray(state?.savedMeals) ? state.savedMeals : [];
const todayMeals = getTodayMeals(meals);
const calTarget = state?.dailyCalorieTarget;
const protTarget = state?.dailyProteinTarget;
const consumedCal = todayMeals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
const consumedProt = todayMeals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
const todaySessions = getTodaySessions(Array.isArray(state?.sessions) ? state.sessions : []);
const burnedCal = todaySessions.reduce((s, sess) => s + (sess.calories?.total || 0), 0);
const calProgress = calTarget ? Math.min(100, Math.round((consumedCal / calTarget) * 100)) : 0;

const emptyForm = { name: "", calories: "", protein: "" };
const [form, setForm] = useState(emptyForm);
const [errors, setErrors] = useState({});
const [toast, setToast] = useState("");
const [showSuggestions, setShowSuggestions] = useState(false);
const [editingSaved, setEditingSaved] = useState(null);
const inputRef = useRef(null);

const updateField = (field, val) => { setForm((p) => ({ …p, [field]: val })); setErrors((prev) => { const next = { …prev }; delete next[field]; return next; }); if (field === "name") setShowSuggestions(val.trim().length > 0); };
const parseNum = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const validate = () => { const errs = {}; if (!form.name.trim()) errs.name = "Le nom est obligatoire"; const cal = parseNum(form.calories); if (cal === null || cal <= 0) errs.calories = "Les calories sont obligatoires"; setErrors(errs); return Object.keys(errs).length === 0; };
const showToastMsg = (msg, cal) => { setToast(cal ? `+${cal} kcal · ${msg}` : msg); setTimeout(() => setToast(""), 2500); };

// Autocomplete
const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const suggestions = useMemo(() => {
if (!form.name.trim()) return [];
const q = normalize(form.name);
return savedMeals.filter((m) => normalize(m.name).includes(q)).slice(0, 5);
}, [form.name, savedMeals]);

const selectSuggestion = (m) => { setForm({ name: m.name, calories: String(m.calories), protein: String(m.protein || "") }); setShowSuggestions(false); };

// Frequent meals
const frequentMeals = useMemo(() => {
const counts = {};
meals.forEach((m) => { const k = m.name?.toLowerCase(); if (k) counts[k] = (counts[k] || 0) + 1; });
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
return sorted.map(([name]) => {
const match = savedMeals.find((s) => s.name.toLowerCase() === name) || meals.find((m) => m.name?.toLowerCase() === name);
return match ? { name: match.name, calories: match.calories, protein: match.protein || 0 } : null;
}).filter(Boolean);
}, [meals, savedMeals]);

const handleAdd = () => {
if (!validate()) return;
const meal = { name: form.name.trim(), calories: Math.round(parseNum(form.calories)), protein: Math.round(parseNum(form.protein) || 0), date: new Date().toISOString() };
updateState((prev) => {
const newMeals = cleanOldMeals([…(prev.meals || []), meal]);
const currentSaved = Array.isArray(prev.savedMeals) ? prev.savedMeals : [];
const alreadySaved = currentSaved.some((s) => s.name.toLowerCase() === meal.name.toLowerCase());
return { …prev, meals: newMeals, savedMeals: alreadySaved ? currentSaved : […currentSaved, { name: meal.name, calories: meal.calories, protein: meal.protein, date: meal.date }] };
});
setForm(emptyForm); setErrors({}); showToastMsg("Repas ajouté", meal.calories);
};

const handleQuickAdd = (saved) => {
updateState((prev) => ({ …prev, meals: cleanOldMeals([…(prev.meals || []), { name: saved.name, calories: saved.calories, protein: saved.protein, date: new Date().toISOString() }]) }));
showToastMsg(`${saved.name} ajouté`, saved.calories);
};

const handleDeleteSaved = (index) => { updateState((prev) => ({ …prev, savedMeals: (prev.savedMeals || []).filter((_, i) => i !== index) })); };
const handleDeleteMeal = (index) => {
const mealToRemove = todayMeals[index]; if (!mealToRemove) return; let found = false;
updateState((prev) => ({ …prev, meals: (prev.meals || []).filter((m) => { if (!found && m.date === mealToRemove.date && m.name === mealToRemove.name) { found = true; return false; } return true; }) }));
showToastMsg("Repas supprimé");
};

const handleUpdateSaved = (index, updates) => {
updateState((prev) => ({ …prev, savedMeals: (prev.savedMeals || []).map((m, i) => i === index ? { …m, …updates } : m) }));
setEditingSaved(null); showToastMsg("Repas mis à jour");
};

const todayKey = getTodayKey();
const pastMeals = meals.filter((m) => { const k = getDateKey(m.date); return k && k !== todayKey; });
const historyGroups = groupMealsByDate(pastMeals);

return (
<PageShell title="Nutrition" subtitle="Suivi alimentaire">
{/* Summary - visual progress rings */}
<div className="card nutri-summary">
<div className="nutri-rings-row">
{/* Calories ring */}
<div className="nutri-ring-item">
<div className="nutri-ring-wrap">
<svg className="nutri-ring-svg" viewBox="0 0 80 80">
<circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
<circle cx="40" cy="40" r="34" fill="none"
stroke={calProgress > 100 ? "var(-danger)" : "var(-accent)"}
strokeWidth="5" strokeLinecap="round"
strokeDasharray={`${Math.min(calProgress, 100) * 2.136} 213.6`}
transform="rotate(-90 40 40)"
className="nutri-ring-progress" />
</svg>
<div className="nutri-ring-inner">
<span className="nutri-ring-val">{consumedCal}</span>
</div>
</div>
<span className="nutri-ring-label">kcal</span>
</div>

```
      {/* Protein ring */}
      <div className="nutri-ring-item">
        <div className="nutri-ring-wrap">
          <svg className="nutri-ring-svg" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
            {protTarget && <circle cx="40" cy="40" r="34" fill="none"
              stroke={consumedProt > protTarget ? "var(--danger)" : "var(--accent)"}
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${Math.min(protTarget ? (consumedProt / protTarget) * 100 : 0, 100) * 2.136} 213.6`}
              transform="rotate(-90 40 40)"
              className="nutri-ring-progress" />}
          </svg>
          <div className="nutri-ring-inner">
            <span className="nutri-ring-val">{consumedProt}g</span>
          </div>
        </div>
        <span className="nutri-ring-label">prot</span>
      </div>

      {/* Remaining - key number */}
      {calTarget && (
        <div className="nutri-remaining-block">
          <span className={`nutri-remaining-val ${calTarget - consumedCal + burnedCal >= 0 ? "" : "nutri-over"}`}>{calTarget - consumedCal + burnedCal}</span>
          <span className="nutri-remaining-unit">kcal restantes</span>
          {burnedCal > 0 && <span className="nutri-remaining-burned">+{burnedCal} brûlées</span>}
        </div>
      )}
    </div>
  </div>

  {/* Frequent meals */}
  {frequentMeals.length > 0 && (
    <div className="nutri-frequent">
      <div className="card-label">Repas fréquents</div>
      <div className="nutri-chips">{frequentMeals.map((m, i) => <button key={i} className="nutri-chip" onClick={() => handleQuickAdd(m)}>{m.name} - {m.calories} kcal</button>)}</div>
    </div>
  )}

  {/* Form */}
  <NutriSection title="Ajouter un repas" defaultOpen={true}>
    <div className="nutri-form">
      <div className="nutri-field-wrap" style={{ position: "relative" }}>
        <div className="nutri-field-label">Nom <span className="nutri-required">*</span></div>
        <input ref={inputRef} className={`input input-full ${errors.name ? "input-error" : ""}`} type="text" placeholder="Ex : Poulet riz" value={form.name} onChange={(e) => updateField("name", e.target.value)} onFocus={() => form.name.trim() && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} maxLength={50} />
        {showSuggestions && suggestions.length > 0 && (
          <div className="nutri-autocomplete">{suggestions.map((m, i) => <button key={i} className="nutri-autocomplete-item" onMouseDown={(e) => { e.preventDefault(); selectSuggestion(m); }}><span className="nutri-autocomplete-name">{m.name}</span><span className="nutri-autocomplete-meta">{m.calories} kcal{m.protein ? ` · ${m.protein}g` : ""}</span></button>)}</div>
        )}
        {errors.name && <div className="nutri-error">{errors.name}</div>}
      </div>
      <div className="profile-row-2">
        <div className="nutri-field-wrap"><div className="nutri-field-label">Calories <span className="nutri-required">*</span></div><input className={`input input-full ${errors.calories ? "input-error" : ""}`} type="number" placeholder="450" value={form.calories} onChange={(e) => updateField("calories", e.target.value)} min={0} max={9999} inputMode="numeric" />{errors.calories && <div className="nutri-error">{errors.calories}</div>}</div>
        <div className="nutri-field-wrap"><div className="nutri-field-label">Protéines (g)</div><input className="input input-full" type="number" placeholder="-" value={form.protein} onChange={(e) => updateField("protein", e.target.value)} min={0} max={999} inputMode="numeric" /></div>
      </div>
      <button className="btn-primary" onClick={handleAdd}>Ajouter</button>
    </div>
    {toast && <div className="save-toast" style={{ marginTop: 10 }}><span className="status-dot status-ok" /><span>{toast}</span></div>}
  </NutriSection>

  {/* Today */}
  <NutriSection title="Repas du jour" count={todayMeals.length} defaultOpen={true}>
    {todayMeals.length === 0 ? <p className="card-text" style={{ opacity: 0.5 }}>Aucun repas aujourd'hui</p> : (
      <div className="nutri-list">{todayMeals.map((m, i) => (<div key={i} className="nutri-item"><div className="nutri-item-info"><span className="nutri-item-name">{m.name || "-"}</span><span className="nutri-item-meta">{m.calories} kcal{m.protein ? ` · ${m.protein}g prot` : ""}{m.date && <span className="nutri-item-time">{" · "}{new Date(m.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}</span></div><button className="nutri-del-btn" onClick={() => handleDeleteMeal(i)} title="Supprimer">×</button></div>))}</div>
    )}
  </NutriSection>

  {/* Saved */}
  <NutriSection title="Repas enregistrés" count={savedMeals.length} defaultOpen={false}>
    {savedMeals.length === 0 ? <p className="card-text" style={{ opacity: 0.5 }}>Les repas ajoutés sont automatiquement enregistrés ici</p> : (
      <div className="nutri-list">{savedMeals.map((m, i) => editingSaved === i ? (
        <div key={i} className="nutri-item" style={{ flexDirection: "column", gap: 8 }}>
          <input className="input input-full" defaultValue={m.name} onChange={(e) => m._name = e.target.value} />
          <div className="profile-row-2"><input className="input input-full" type="number" defaultValue={m.calories} onChange={(e) => m._cal = e.target.value} placeholder="kcal" inputMode="numeric" /><input className="input input-full" type="number" defaultValue={m.protein} onChange={(e) => m._prot = e.target.value} placeholder="prot" inputMode="numeric" /></div>
          <div style={{ display: "flex", gap: 8 }}><button className="btn-save" onClick={() => handleUpdateSaved(i, { name: m._name || m.name, calories: Number(m._cal) || m.calories, protein: Number(m._prot) || m.protein })}>OK</button><button className="dash-cancel-btn" onClick={() => setEditingSaved(null)}>Annuler</button></div>
        </div>
      ) : (
        <div key={i} className="nutri-item"><div className="nutri-item-info" onClick={() => setEditingSaved(i)} style={{ cursor: "pointer" }}><span className="nutri-item-name">{m.name || "-"}</span><span className="nutri-item-meta">{m.calories} kcal{m.protein ? ` · ${m.protein}g prot` : ""}</span></div><div className="nutri-item-actions"><button className="nutri-quick-btn" onClick={() => handleQuickAdd(m)} title="Ajouter au jour">+</button><button className="nutri-del-btn" onClick={() => handleDeleteSaved(i)} title="Supprimer">×</button></div></div>
      ))}</div>
    )}
  </NutriSection>

  {/* History */}
  <NutriSection title="Historique" count={historyGroups.length > 0 ? pastMeals.length : null} defaultOpen={false}>
    {historyGroups.length === 0 ? <p className="card-text" style={{ opacity: 0.5 }}>Les repas des 30 derniers jours apparaîtront ici</p> : (
      <div className="hist-groups">{historyGroups.map((group) => { const dayCal = group.meals.reduce((s, m) => s + (Number(m.calories) || 0), 0); const dayProt = group.meals.reduce((s, m) => s + (Number(m.protein) || 0), 0); return (
        <div key={group.dateKey} className="hist-day"><div className="hist-day-header"><span className="hist-day-label">{group.label}</span><span className="hist-day-totals">{dayCal} kcal{dayProt > 0 ? ` · ${dayProt}g` : ""}</span></div><div className="hist-day-meals">{group.meals.map((m, j) => <div key={j} className="hist-meal"><span className="hist-meal-name">{m.name || "-"}</span><span className="hist-meal-meta">{m.calories} kcal{m.protein ? ` · ${m.protein}g` : ""}</span></div>)}</div></div>
      ); })}</div>
    )}
  </NutriSection>

  {/* ── Sticky CTA ── */}
  <div className="sticky-cta">
    <button className="sticky-cta-main" onClick={handleAdd}>Ajouter le repas</button>
  </div>
</PageShell>
```

);
}

// ─────────────────────────────────────────────
// TRACKING PAGE - complete
// ─────────────────────────────────────────────
function TrackingPage() {
const { state, updateState } = useAppContext();
const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
const meals = Array.isArray(state?.meals) ? state.meals : [];
const calTarget = state?.dailyCalorieTarget;
const protTarget = state?.dailyProteinTarget;
const weightLog = Array.isArray(state?.weightLog) ? state.weightLog : [];
const customExercises = Array.isArray(state?.customExercises) ? state.customExercises : [];
const allExercises = getAllExercises(customExercises);
const [newWeight, setNewWeight] = useState("");
const [selectedExercise, setSelectedExercise] = useState("");
const [toast, setToast] = useState("");

// Week helpers
const getWeekDates = (offset = 0) => {
const now = new Date(); now.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
const start = new Date(now); start.setHours(0, 0, 0, 0);
const dates = [];
for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(d.getDate() + i); dates.push(getDateKey(d.toISOString())); }
return dates;
};

const thisWeek = getWeekDates(0);
const lastWeek = getWeekDates(-1);

const weekStats = (dates) => {
const sessCount = sessions.filter((s) => dates.includes(getDateKey(s.startedAt))).length;
let volume = 0;
sessions.filter((s) => dates.includes(getDateKey(s.startedAt))).forEach((s) => { (s.exercises || []).forEach((ex) => { (ex.sets || []).filter((st) => st.done).forEach((st) => { volume += (Number(st.weight) || 0) * (Number(st.reps) || 0); }); }); });
const dayMeals = dates.map((d) => meals.filter((m) => getDateKey(m.date) === d));
const daysWithMeals = dayMeals.filter((d) => d.length > 0).length;
const avgCal = daysWithMeals > 0 ? Math.round(dayMeals.reduce((s, d) => s + d.reduce((ss, m) => ss + (Number(m.calories) || 0), 0), 0) / daysWithMeals) : 0;
const avgProt = daysWithMeals > 0 ? Math.round(dayMeals.reduce((s, d) => s + d.reduce((ss, m) => ss + (Number(m.protein) || 0), 0), 0) / daysWithMeals) : 0;
return { sessCount, volume, avgCal, avgProt };
};

const thisStats = weekStats(thisWeek);
const lastStats = weekStats(lastWeek);
const pctChange = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0;

// 30-day calories chart
const chartData = useMemo(() => {
const data = [];
for (let i = 29; i >= 0; i-) {
const d = new Date(); d.setDate(d.getDate() - i);
const k = getDateKey(d.toISOString());
const dayMeals = meals.filter((m) => getDateKey(m.date) === k);
const cal = dayMeals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
data.push({ dateKey: k, label: `${d.getDate()}/${d.getMonth() + 1}`, cal, hasMeals: dayMeals.length > 0 });
}
return data;
}, [meals]);
const maxCal = Math.max(…chartData.map((d) => d.cal), calTarget || 0, 1);

// Exercise progression
const exerciseHistory = useMemo(() => {
if (!selectedExercise) return [];
const history = [];
const sorted = […sessions].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
sorted.forEach((s) => {
const ex = (s.exercises || []).find((e) => e.exerciseId === selectedExercise);
if (!ex || ex.category === "cardio") return;
const doneSets = (ex.sets || []).filter((st) => st.done);
if (doneSets.length === 0) return;
const best = doneSets.reduce((b, st) => {
const t = (Number(st.weight) || 0) * (Number(st.reps) || 0);
return t > b.tonnage ? { weight: Number(st.weight), reps: Number(st.reps), tonnage: t } : b;
}, { weight: 0, reps: 0, tonnage: 0 });
history.push({ date: s.startedAt, …best });
});
return history;
}, [selectedExercise, sessions]);

const bestTonnage = exerciseHistory.length > 0 ? Math.max(…exerciseHistory.map((h) => h.tonnage)) : 0;

// Unique exercises from sessions
const usedExercises = useMemo(() => {
const ids = new Set();
sessions.forEach((s) => (s.exercises || []).forEach((e) => { if (e.category !== "cardio") ids.add(e.exerciseId); }));
return […ids].map((id) => { const ex = allExercises.find((e) => e.id === id); return ex ? { id: ex.id, name: ex.name, muscle_group: ex.muscle_group } : null; }).filter(Boolean);
}, [sessions, allExercises]);

const handleAddWeight = () => {
const w = Number(newWeight);
if (!Number.isFinite(w) || w < 20 || w > 350) return;
updateState((prev) => ({ …prev, weightLog: […(prev.weightLog || []), { date: new Date().toISOString(), weight: w }] }));
setNewWeight(""); setToast("Poids enregistré"); setTimeout(() => setToast(""), 2000);
};

return (
<PageShell title="Stats" subtitle="Analyse de performance">
{/* Week Summary - visual stats */}
<NutriSection title="Semaine en cours" defaultOpen={true}>
<div className="track-week-grid">
<div className="track-stat-mini">
<span className="track-stat-val">{thisStats.sessCount}</span>
<span className="track-stat-label">séances</span>
{lastStats.sessCount > 0 && <div className={`track-trend ${pctChange(thisStats.sessCount, lastStats.sessCount) >= 0 ? "track-trend-up" : "track-trend-down"}`}>{pctChange(thisStats.sessCount, lastStats.sessCount) >= 0 ? "↑" : "↓"} {Math.abs(pctChange(thisStats.sessCount, lastStats.sessCount))}%</div>}
</div>
<div className="track-stat-mini">
<span className="track-stat-val">{thisStats.volume > 1000 ? `${(thisStats.volume / 1000).toFixed(1)}t` : `${thisStats.volume}kg`}</span>
<span className="track-stat-label">volume</span>
{lastStats.volume > 0 && <div className={`track-trend ${pctChange(thisStats.volume, lastStats.volume) >= 0 ? "track-trend-up" : "track-trend-down"}`}>{pctChange(thisStats.volume, lastStats.volume) >= 0 ? "↑" : "↓"} {Math.abs(pctChange(thisStats.volume, lastStats.volume))}%</div>}
</div>
<div className="track-stat-mini">
<span className="track-stat-val">{thisStats.avgCal}</span>
<span className="track-stat-label">kcal/j</span>
{calTarget && <div className="track-stat-bar"><div className="track-stat-fill" style={{ width: `${Math.min(100, thisStats.avgCal > 0 ? (thisStats.avgCal / calTarget) * 100 : 0)}%` }} /></div>}
</div>
<div className="track-stat-mini">
<span className="track-stat-val">{thisStats.avgProt}g</span>
<span className="track-stat-label">prot/j</span>
{protTarget && <div className="track-stat-bar"><div className="track-stat-fill" style={{ width: `${Math.min(100, thisStats.avgProt > 0 ? (thisStats.avgProt / protTarget) * 100 : 0)}%` }} /></div>}
</div>
</div>
</NutriSection>

```
  {/* Calories Chart */}
  <NutriSection title="Calories (30 jours)" defaultOpen={true}>
    <div className="track-chart-scroll">
      <div className="track-chart">
        {calTarget && <div className="track-chart-target" style={{ bottom: `${(calTarget / maxCal) * 100}%` }}><span className="track-chart-target-label">{calTarget}</span></div>}
        {chartData.map((d, i) => (
          <div key={i} className="track-bar-col">
            <div className="track-bar-wrap">
              <div className={`track-bar ${!d.hasMeals ? "track-bar-empty" : d.cal > (calTarget || Infinity) ? "track-bar-over" : "track-bar-ok"}`} style={{ height: `${d.hasMeals ? Math.max(2, (d.cal / maxCal) * 100) : 4}%` }} />
            </div>
            <span className="track-bar-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  </NutriSection>

  {/* Exercise Progression */}
  <NutriSection title="Progression exercices" defaultOpen={false}>
    {usedExercises.length === 0 ? <p className="card-text" style={{ opacity: 0.5 }}>Termine des séances pour voir ta progression</p> : (<>
      <select className="input input-full select" value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)}>
        <option value="">- Choisir un exercice -</option>
        {MUSCU_GROUPS.map((mg) => { const exs = usedExercises.filter((e) => e.muscle_group === mg); if (exs.length === 0) return null; return <optgroup key={mg} label={MUSCLE_GROUP_LABELS[mg]}>{exs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>; })}
      </select>
      {exerciseHistory.length > 0 && (
        <div className="track-ex-history">{exerciseHistory.map((h, i) => {
          const prev = exerciseHistory[i - 1];
          const improved = prev && h.tonnage > prev.tonnage;
          const isPR = h.tonnage === bestTonnage;
          return (
            <div key={i} className={`track-ex-row ${isPR ? "track-ex-row-pr" : ""}`}>
              <span className="track-ex-date">{formatDateLabel(getDateKey(h.date))}</span>
              <span className="track-ex-perf">
                {h.weight}kg × {h.reps}
                {improved && <span className="track-ex-trend-up">↑</span>}
                {isPR && <span className="track-pr-badge">🏆</span>}
              </span>
            </div>
          );
        })}</div>
      )}
    </>)}
  </NutriSection>

  {/* Weight Log */}
  <NutriSection title="Poids corporel" defaultOpen={false}>
    <div className="track-weight-form">
      <input className="input" type="number" placeholder="Ex : 75.5" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} inputMode="decimal" style={{ flex: 1 }} />
      <button className="btn-save" onClick={handleAddWeight}>Enregistrer</button>
    </div>
    {weightLog.length > 0 && (
      <div className="track-weight-list">
        {[...weightLog].reverse().slice(0, 15).map((w, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? (w.weight - prev.weight).toFixed(1) : null;
          return <div key={i} className="track-weight-row"><span className="track-weight-date">{formatDateLabel(getDateKey(w.date))}</span><span className="track-weight-val">{w.weight} kg</span>{diff !== null && <span className={`track-weight-diff ${Number(diff) > 0 ? "track-up" : Number(diff) < 0 ? "track-down" : ""}`}>{Number(diff) > 0 ? "+" : ""}{diff}</span>}</div>;
        })}
      </div>
    )}
    {toast && <div className="save-toast" style={{ marginTop: 10 }}><span className="status-dot status-ok" /><span>{toast}</span></div>}
  </NutriSection>
</PageShell>
```

);
}

// ─────────────────────────────────────────────
// PROFILE PAGE
// ─────────────────────────────────────────────
function ProfilePage() {
const { state, updateState } = useAppContext();
const saved = state?.userProfile || {};
const sessions = Array.isArray(state?.sessions) ? state.sessions : [];
const prs = state?.personalRecords || {};
const allExercises = getAllExercises(Array.isArray(state?.customExercises) ? state.customExercises : []);
const streak = calculateStreak(sessions);

const [form, setForm] = useState({ name: saved.name || "", birthdate: saved.birthdate || "", sex: saved.sex || "", height: saved.height || "", weight: saved.weight || "", activity: saved.activity || "" });
const [saveMsg, setSaveMsg] = useState("");
const update = (field, raw) => { setForm((prev) => ({ …prev, [field]: raw })); setSaveMsg(""); };
const parseNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const age = calculateAge(form.birthdate);
const profileForCalc = { name: form.name, birthdate: form.birthdate, sex: form.sex, height: parseNum(form.height), weight: parseNum(form.weight), activity: form.activity };
const complete = isProfileComplete(profileForCalc);
const bmr = complete ? calculateBMR(profileForCalc) : null;
const tdee = complete ? calculateTDEE(profileForCalc) : null;

const handleSave = () => {
const toSave = { name: form.name.trim(), birthdate: form.birthdate, sex: form.sex, height: parseNum(form.height) || "", weight: parseNum(form.weight) || "", activity: form.activity };
updateState((prev) => ({ …prev, user: { …prev.user, name: toSave.name }, userProfile: toSave }));
setSaveMsg("Profil enregistré"); setTimeout(() => setSaveMsg(""), 2500);
};

// PRs grouped by muscle
const prsByGroup = useMemo(() => {
const groups = {};
Object.entries(prs).forEach(([exId, pr]) => {
const ex = allExercises.find((e) => e.id === exId);
const group = ex?.muscle_group || "autre";
if (!groups[group]) groups[group] = [];
groups[group].push({ …pr, exerciseId: exId, exerciseName: pr.exerciseName || ex?.name || exId });
});
return groups;
}, [prs, allExercises]);

return (
<PageShell title="Profil" subtitle="Données & métabolisme">
<div className="card"><div className="card-label">Prénom</div><input className="input input-full" type="text" placeholder="Ton prénom…" value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={30} /></div>
<div className="card"><div className="profile-row-2"><div className="profile-field"><div className="card-label">Date de naissance</div><input className="input input-full" type="date" value={form.birthdate} onChange={(e) => update("birthdate", e.target.value)} max={new Date().toISOString().split("T")[0]} />{age !== null && <div className="age-badge">{age} ans</div>}</div><div className="profile-field"><div className="card-label">Sexe</div><select className="input input-full select" value={form.sex} onChange={(e) => update("sex", e.target.value)}><option value="">-</option><option value="male">Homme</option><option value="female">Femme</option></select></div></div></div>
<div className="card"><div className="profile-row-2"><div className="profile-field"><div className="card-label">Taille (cm)</div><input className="input input-full" type="number" placeholder="175" value={form.height} onChange={(e) => update("height", e.target.value)} min={80} max={260} inputMode="numeric" /></div><div className="profile-field"><div className="card-label">Poids (kg)</div><input className="input input-full" type="number" placeholder="75" value={form.weight} onChange={(e) => update("weight", e.target.value)} min={20} max={350} inputMode="numeric" /></div></div></div>
<div className="card"><div className="card-label">Niveau d'activité quotidienne</div><p className="card-text" style={{ marginBottom: 10, fontSize: 12, opacity: 0.5 }}>Hors entraînements</p><select className="input input-full select" value={form.activity} onChange={(e) => update("activity", e.target.value)}><option value="">- Sélectionner -</option>{Object.entries(ACTIVITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
<button className="btn-primary" onClick={handleSave}>Enregistrer</button>
{saveMsg && <div className="save-toast"><span className="status-dot status-ok" /><span>{saveMsg}</span></div>}

```
  {/* Streak */}
  {streak.current > 0 && (
    <div className="card" style={{ textAlign: "center" }}>
      <div className={`dash-streak ${streak.current >= 3 ? "dash-streak-fire" : ""}`} style={{ fontSize: 16 }}>🔥 Streak : {streak.current} jour{streak.current > 1 ? "s" : ""}</div>
      {state?.bestStreak > 0 && <div className="card-text" style={{ marginTop: 4 }}>Record : {state.bestStreak} jours</div>}
    </div>
  )}

  {/* Metabolism */}
  {complete && bmr !== null && tdee !== null && (
    <div className="card metabolism-card"><div className="card-label">Résultats métaboliques</div><div className="metab-grid"><div className="metab-item"><span className="metab-value">{Math.round(bmr)}</span><span className="metab-unit">kcal</span><span className="metab-label">BMR</span></div><div className="metab-divider" /><div className="metab-item"><span className="metab-value">{Math.round(tdee)}</span><span className="metab-unit">kcal</span><span className="metab-label">TDEE</span></div></div></div>
  )}

  {/* Personal Records */}
  {Object.keys(prsByGroup).length > 0 && (
    <NutriSection title="Records personnels" count={Object.keys(prs).length} defaultOpen={false}>
      {MUSCU_GROUPS.filter((g) => prsByGroup[g]).map((g) => (
        <div key={g} style={{ marginBottom: 12 }}>
          <div className="train-group-label">{MUSCLE_GROUP_LABELS[g]}</div>
          {prsByGroup[g].map((pr) => (
            <div key={pr.exerciseId} className="track-ex-row">
              <span className="track-ex-date">{pr.exerciseName}</span>
              <span className="track-ex-perf">{pr.weight}kg × {pr.reps} - {formatDateLabel(getDateKey(pr.date))}</span>
            </div>
          ))}
        </div>
      ))}
    </NutriSection>
  )}

</PageShell>
```

);
}

// ─────────────────────────────────────────────
// TRACK PAGE - unified Training + Nutrition
// ─────────────────────────────────────────────
function TrackPage() {
const [segment, setSegment] = useState("training");
const { state } = useAppContext();
const activeSession = state?.activeSession || null;

// Auto-switch to training if a session is active
useEffect(() => {
if (activeSession) setSegment("training");
}, [activeSession]);

return (
<div className="track-page-wrap">
{/* Segment control */}
<div className="segment-bar">
<div className="segment-control">
<div className="segment-bg" style={{ transform: segment === "training" ? "translateX(0)" : "translateX(100%)" }} />
<button className={`segment-btn ${segment === "training" ? "segment-active" : ""}`} onClick={() => setSegment("training")}>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12h12M4 8h2v8H4zM18 8h2v8h-2zM8 6h2v12H8zM14 6h2v12h-2z" /></svg>
Training
</button>
<button className={`segment-btn ${segment === "nutrition" ? "segment-active" : ""}`} onClick={() => setSegment("nutrition")}>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>
Nutrition
</button>
</div>
</div>
{/* Content */}
<div className="segment-content">
{segment === "training" ? <TrainingPage /> : <NutritionPage />}
</div>
</div>
);
}

// ─────────────────────────────────────────────
// ROUTER + NAV + APP
// ─────────────────────────────────────────────
const PAGES = { home: HomePage, track: TrackPage, progress: TrackingPage, profile: ProfilePage };

function PageRenderer({ activeTab }) {
const Page = PAGES[activeTab] || HomePage;
const [displayTab, setDisplayTab] = useState(activeTab);
const [transitioning, setTransitioning] = useState(false);

useEffect(() => {
if (activeTab !== displayTab) {
setTransitioning(true);
const t = setTimeout(() => { setDisplayTab(activeTab); setTransitioning(false); }, 150);
return () => clearTimeout(t);
}
}, [activeTab, displayTab]);

const DisplayPage = PAGES[displayTab] || HomePage;
return (
<div className={`page-transition ${transitioning ? "page-out" : "page-in"}`}>
<DisplayPage />
</div>
);
}

function BottomNav({ activeTab, onTabChange }) {
return (
<nav className="bottom-nav">
{TABS.map((tab) => {
const isActive = activeTab === tab.id;
return (
<button key={tab.id} className={`nav-btn ${isActive ? "nav-active" : ""}`} onClick={() => onTabChange(tab.id)} aria-label={tab.label}>
<div className="nav-icon">{tab.icon(isActive)}</div>
<span className="nav-label">{tab.label}</span>
{isActive && <div className="nav-indicator" />}
</button>
);
})}
</nav>
);
}

export default function App() {
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);

return (
<ErrorBoundary>
<AppProvider>
<AppInner mounted={mounted} />
</AppProvider>
</ErrorBoundary>
);
}

function AppInner({ mounted }) {
const { activeTab, setActiveTab } = useAppContext();
return (
<div className={`app-root ${mounted ? "app-mounted" : ""}`}>
<style>{GLOBAL_CSS}</style>
<PageRenderer activeTab={activeTab} />
<BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
</div>
);
}

// ─────────────────────────────────────────────
// GLOBAL CSS (prompt 7 - new palette + polish)
// ─────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

:root {
-bg-root: #0B0B0C;
-bg-surface: #121214;
-bg-card: #18181B;
-bg-card-hover: #1f1f23;
-bg-elevated: #222226;
-bg-nav: #0B0B0C;
-border: rgba(255,255,255,0.06);
-border-light: rgba(255,255,255,0.04);
-text-primary: #f0f0f2;
-text-secondary: #A1A1AA;
-text-muted: #4a4a52;
-text-caption: #3d3d44;
-accent: #4ADE80;
-accent-dim: rgba(74, 222, 128, 0.10);
-accent-glow: rgba(74, 222, 128, 0.15);
-ok: #4ADE80;
-danger: #FF5252;
-warn: #ffa726;
-radius: 16px;
-radius-sm: 10px;
-radius-xs: 6px;
-font: 'Outfit', -apple-system, sans-serif;
-mono: 'JetBrains Mono', monospace;
-nav-height: 72px;
-safe-bottom: env(safe-area-inset-bottom, 0px);
}

html, body { background: var(-bg-root); color: var(-text-primary); font-family: var(-font); font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased; overflow: hidden; height: 100%; }
.app-root { display: flex; flex-direction: column; height: 100vh; height: 100dvh; opacity: 0; transition: opacity 0.4s ease; }
.app-mounted { opacity: 1; }

/* Page Shell */
.page-shell { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 16px calc(var(-nav-height) + var(-safe-bottom) + 100px); }
.page-header { padding: 28px 0 28px; }
.page-title { font-size: 28px; font-weight: 800; letter-spacing: -0.8px; color: #fff; }
.page-subtitle { font-size: 13px; color: var(-text-muted); margin-top: 2px; letter-spacing: 0.3px; }
.page-content { display: flex; flex-direction: column; gap: 24px; }

/* Cards - premium layering */
.card { background: var(-bg-card); border: 1px solid var(-border); border-radius: var(-radius); padding: 24px; }
.card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); margin-bottom: 10px; }
.card-text { font-size: 14px; color: var(-text-secondary); line-height: 1.6; }
.card-row { display: flex; align-items: center; gap: 10px; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.status-ok { background: var(-ok); box-shadow: 0 0 8px rgba(74, 222, 128, 0.3); }

/* Inputs - borderless, background contrast */
.input-row { display: flex; gap: 10px; }
.input { flex: 1; padding: 14px 16px; background: rgba(255,255,255,0.04); border: 1px solid transparent; border-radius: var(-radius-sm); color: var(-text-primary); font-family: var(-font); font-size: 16px; outline: none; transition: all 0.2s; }
.input::placeholder { color: var(-text-muted); }
.input:focus { border-color: var(-accent); background: rgba(74,222,128,0.04); }
.input-full { width: 100%; }
.input-error { border-color: var(-danger) !important; }
.select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2355555c' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; cursor: pointer; }
.select option { background: var(-bg-card); color: var(-text-primary); }
.profile-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.profile-field { display: flex; flex-direction: column; }
.age-badge { margin-top: 6px; padding: 4px 10px; background: var(-accent-dim); color: var(-accent); border-radius: var(-radius-xs); font-size: 12px; font-weight: 600; width: fit-content; animation: toastIn 0.3s ease; }
.btn-primary { width: 100%; padding: 14px 20px; background: var(-accent); color: #fff; border: none; border-radius: var(-radius); font-family: var(-font); font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px; min-height: 48px; }
.btn-primary:active { transform: scale(0.97); opacity: 0.85; }
.btn-primary:disabled { opacity: 0.4; cursor: default; }
.btn-save { padding: 12px 20px; background: var(-accent-dim); color: var(-accent); border: 1px solid rgba(74, 222, 128, 0.2); border-radius: var(-radius-sm); font-family: var(-font); font-size: 14px; font-weight: 500; cursor: pointer; }
.btn-save:active { transform: scale(0.96); }
.save-toast { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 16px; background: rgba(74, 222, 128, 0.06); border: 1px solid rgba(74, 222, 128, 0.12); border-radius: var(-radius-sm); font-size: 14px; font-weight: 600; color: var(-accent); font-family: var(-mono); animation: toastReward 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes toastReward { 0% { opacity: 0; transform: translateY(8px) scale(0.95); } 50% { transform: translateY(-2px) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes toastIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* Bottom Nav - 4-tab product navigation */
.bottom-nav {
position: fixed;
bottom: 0; left: 0; right: 0;
height: calc(var(-nav-height) + var(-safe-bottom));
padding-bottom: var(-safe-bottom);
background: var(-bg-surface);
border-top: 1px solid rgba(255,255,255,0.06);
display: flex;
align-items: center;
justify-content: space-around;
z-index: 100;
backdrop-filter: blur(24px);
-webkit-backdrop-filter: blur(24px);
}
.bottom-nav::before { content: ''; position: absolute; top: -28px; left: 0; right: 0; height: 28px; background: linear-gradient(to top, var(-bg-surface), transparent); pointer-events: none; }
.nav-btn {
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 4px;
background: none;
border: none;
cursor: pointer;
padding: 8px 16px;
position: relative;
min-width: 64px;
transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.nav-btn:active { transform: scale(0.88); }
.nav-icon {
width: 24px; height: 24px;
display: flex;
align-items: center;
justify-content: center;
transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.nav-active .nav-icon { transform: translateY(-2px); }
.nav-label {
font-size: 11px;
font-weight: 500;
color: #A1A1AA;
transition: color 0.2s;
}
.nav-active .nav-label { color: #4ADE80; font-weight: 600; }
.nav-indicator {
position: absolute;
top: -1px;
left: 50%;
transform: translateX(-50%);
width: 28px;
height: 3px;
background: #4ADE80;
border-radius: 0 0 3px 3px;
box-shadow: 0 2px 12px rgba(74, 222, 128, 0.35);
}

/* Number input spinners */
input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; }

/* Onboarding */
.ob-progress { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px 0; }
.ob-dot { width: 10px; height: 10px; border-radius: 50%; background: var(-border); transition: all 0.3s; }
.ob-dot-active { background: var(-accent); }
.ob-dot-current { transform: scale(1.3); box-shadow: 0 0 12px var(-accent-glow); }
.ob-step { animation-duration: 0.3s; animation-fill-mode: both; }
.ob-enter { animation-name: obSlideIn; }
.ob-exit { animation-name: obSlideOut; }
.ob-enter-back { animation-name: obSlideInBack; }
.ob-exit-back { animation-name: obSlideOutBack; }
@keyframes obSlideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
@keyframes obSlideOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-30px); } }
@keyframes obSlideInBack { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
@keyframes obSlideOutBack { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(30px); } }
.ob-welcome { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 60px 20px 40px; }
.ob-brand { font-size: 32px; font-weight: 800; font-family: var(-mono); letter-spacing: 8px; color: var(-accent); margin-bottom: 24px; text-shadow: 0 0 40px rgba(74,222,128,0.2); }
.ob-title { font-size: 24px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 12px; color: #fff; }
.ob-subtitle { font-size: 14px; color: var(-text-secondary); line-height: 1.6; max-width: 280px; margin-bottom: 40px; }
.ob-btn { min-height: 52px; }
.ob-form { display: flex; flex-direction: column; gap: 16px; padding: 20px 0; }
.ob-step-title { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 4px; }
.ob-fields { display: flex; flex-direction: column; gap: 12px; }
.ob-sex-row { display: flex; gap: 8px; }
.ob-sex-btn { flex: 1; padding: 14px; background: var(-bg-card); border: 2px solid var(-border); border-radius: var(-radius); color: var(-text-secondary); font-family: var(-font); font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; text-align: center; }
.ob-sex-active { border-color: var(-accent); color: var(-accent); background: var(-accent-dim); }
.ob-nav { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.ob-back { background: none; border: none; color: var(-text-muted); font-family: var(-font); font-size: 14px; cursor: pointer; padding: 8px 0; white-space: nowrap; }
.ob-goals { display: flex; flex-direction: column; gap: 10px; }
.ob-goal-card { display: flex; flex-direction: column; align-items: center; padding: 20px; background: var(-bg-card); border: 2px solid var(-border); border-radius: var(-radius); cursor: pointer; font-family: var(-font); transition: all 0.2s; text-align: center; min-height: 44px; }
.ob-goal-card:active { transform: scale(0.98); }
.ob-goal-active { border-color: var(-accent); background: var(-accent-dim); }
.ob-goal-icon { font-size: 28px; margin-bottom: 6px; }
.ob-goal-label { font-size: 16px; font-weight: 600; color: var(-text-primary); }
.ob-goal-desc { font-size: 12px; color: var(-text-muted); margin-top: 2px; }
.ob-preview { margin-top: 12px; padding: 14px; background: var(-accent-dim); border: 1px solid rgba(74,222,128,0.2); border-radius: var(-radius-sm); display: flex; flex-direction: column; gap: 6px; }
.ob-preview-row { display: flex; justify-content: space-between; font-size: 14px; color: var(-text-secondary); }
.ob-preview-val { color: var(-accent); font-weight: 600; font-family: var(-mono); }

/* Dashboard - HYTRX identity */
.dash-hero-greeting { padding: 32px 4px 0; }
.dash-brand-mark { font-size: 11px; font-weight: 600; font-family: var(-mono); letter-spacing: 4px; color: var(-accent); opacity: 0.5; margin-bottom: 8px; }
.dash-greeting { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2; color: #fff; }
.dash-date { font-size: 11px; color: var(-text-caption); margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; font-family: var(-mono); font-weight: 500; }

/* Weekly activity dots */
.dash-week-row { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; gap: 12px; }
.dash-week-dots { display: flex; gap: 4px; flex: 1; }
.dash-week-dot-col { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
.dash-week-dot-label { font-size: 9px; font-family: var(-mono); font-weight: 600; color: var(-text-caption); letter-spacing: 0.5px; }
.dash-week-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.06); transition: all 0.3s ease; }
.dash-week-dot-active { background: var(-accent); box-shadow: 0 0 6px rgba(74, 222, 128, 0.3); }
.dash-week-dot-today { outline: 2px solid rgba(255,255,255,0.12); outline-offset: 2px; }
.dash-week-dot-future { opacity: 0.3; }

/* Streak - compact pill */
.dash-streak { display: inline-flex; align-items: center; gap: 2px; padding: 5px 12px; background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.1); border-radius: var(-radius-xs); font-size: 14px; font-weight: 700; color: var(-accent); font-family: var(-mono); letter-spacing: -0.5px; flex-shrink: 0; }
.dash-streak-fire { animation: fireGlow 2s ease-in-out infinite; }
@keyframes fireGlow { 0%,100% { box-shadow: 0 0 4px rgba(74,222,128,0.15); } 50% { box-shadow: 0 0 14px rgba(74,222,128,0.35); } }

/* Today wins counter */
.dash-hero-wins { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 20px; }
.dash-hero-wins-count { font-size: 16px; font-weight: 700; font-family: var(-mono); color: var(-accent); animation: winsBump 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes winsBump { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
.dash-hero-wins-label { font-size: 10px; font-family: var(-mono); color: var(-text-caption); text-transform: uppercase; letter-spacing: 1px; }
.dash-suggestions { display: flex; flex-direction: column; gap: 8px; }
.dash-suggestion-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(74,222,128,0.04); border: 1px solid rgba(74,222,128,0.12); border-radius: var(-radius); }
.dash-suggestion-icon { font-size: 20px; flex-shrink: 0; }
.dash-suggestion-text { flex: 1; font-size: 14px; color: var(-text-secondary); line-height: 1.4; }
.dash-suggestion-dismiss { background: none; border: none; color: var(-text-muted); font-size: 16px; cursor: pointer; padding: 6px; }

/* Hero card - dominant, 30-40% screen presence */
.dash-hero-card {
position: relative;
overflow: hidden;
background: var(-bg-card);
border: 1px solid rgba(74, 222, 128, 0.1);
border-radius: 28px;
padding: 36px 28px 32px;
text-align: center;
margin-bottom: 8px;
}
.dash-hero-card-over { border-color: rgba(255, 82, 82, 0.15); }
.dash-hero-glow {
position: absolute;
top: -50%;
left: 50%;
transform: translateX(-50%);
width: 180%;
height: 180%;
background: radial-gradient(ellipse at center, rgba(74, 222, 128, 0.08) 0%, transparent 55%);
pointer-events: none;
}
.dash-hero-card-over .dash-hero-glow {
background: radial-gradient(ellipse at center, rgba(255, 82, 82, 0.06) 0%, transparent 55%);
}

/* Circular progress ring - larger, bolder */
.dash-hero-ring-wrap {
position: relative;
width: 200px;
height: 200px;
margin: 0 auto 24px;
}
.dash-hero-ring { width: 100%; height: 100%; }
.dash-hero-ring-progress {
transition: stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s;
filter: drop-shadow(0 0 6px rgba(74, 222, 128, 0.2));
}
.dash-hero-ring-content {
position: absolute;
inset: 0;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
}
.dash-hero-number {
font-size: 52px;
font-weight: 700;
font-family: var(-mono);
letter-spacing: -3px;
line-height: 1;
color: var(-accent);
text-shadow: 0 0 40px rgba(74, 222, 128, 0.15);
}
.dash-hero-over {
color: var(-danger);
text-shadow: 0 0 40px rgba(255, 82, 82, 0.15);
}
.dash-hero-unit {
font-size: 10px;
font-weight: 600;
color: var(-text-muted);
margin-top: 6px;
letter-spacing: 2px;
text-transform: uppercase;
font-family: var(-mono);
}

.dash-hero-breakdown {
position: relative;
display: flex;
align-items: center;
justify-content: center;
gap: 8px;
flex-wrap: wrap;
font-size: 11px;
color: var(-text-caption);
letter-spacing: 0.8px;
margin-bottom: 24px;
font-family: var(-mono);
font-weight: 500;
text-transform: uppercase;
}
.dash-hero-sep { opacity: 0.25; }

/* Protein progress bar - thicker, more visible */
.dash-hero-prot {
position: relative;
padding-top: 24px;
border-top: 1px solid rgba(255,255,255,0.04);
}
.dash-hero-prot-header {
display: flex;
align-items: center;
justify-content: space-between;
margin-bottom: 10px;
}
.dash-hero-prot-label {
font-size: 13px;
font-weight: 600;
color: var(-text-secondary);
}
.dash-hero-prot-sub {
font-size: 12px;
font-family: var(-mono);
color: var(-text-caption);
}
.dash-hero-prot-bar {
width: 100%;
height: 6px;
background: rgba(255,255,255,0.06);
border-radius: 3px;
overflow: hidden;
margin-bottom: 10px;
}
.dash-hero-prot-fill {
height: 100%;
background: var(-accent);
border-radius: 3px;
transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.dash-hero-prot-fill-over { background: var(-danger); }
.dash-hero-prot-val {
font-size: 13px;
color: var(-text-muted);
text-align: center;
display: block;
}
.dash-hero-empty {
position: relative;
margin-top: 20px;
font-size: 12px;
color: var(-text-caption);
}

/* Quick actions - demoted, not dominant */
.dash-actions { display: flex; flex-direction: column; gap: 6px; }
.dash-action-btn { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 20px; background: var(-bg-card); border: 1px solid var(-border); border-radius: var(-radius); cursor: pointer; font-family: var(-font); transition: all 0.2s ease; text-align: left; min-height: 52px; }
.dash-action-btn:active { transform: scale(0.98); background: var(-bg-card-hover); }
.dash-action-icon { font-size: 20px; flex-shrink: 0; }
.dash-action-label { flex: 1; font-size: 15px; font-weight: 500; color: var(-text-secondary); }
.dash-action-arrow { color: var(-text-caption); flex-shrink: 0; }

/* Section labels - metadata tier */
.dash-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); padding: 4px 4px 0; }
.dash-obj-stack { display: flex; flex-direction: column; background: var(-bg-card); border: 1px solid var(-border); border-radius: var(-radius); overflow: hidden; }
.dash-obj-row { display: flex; align-items: center; padding: 16px 20px; gap: 12px; cursor: pointer; transition: background 0.2s ease; border-bottom: 1px solid var(-border); }
.dash-obj-row:last-child { border-bottom: none; }
.dash-obj-row:active { background: var(-bg-card-hover); }
.dash-obj-row-label { font-size: 15px; font-weight: 500; color: var(-text-secondary); flex: 1; }
.dash-obj-row-val { font-size: 13px; font-family: var(-mono); color: var(-text-caption); }

.dash-metric-sub { margin-top: 8px; font-size: 12px; color: var(-text-muted); }
.dash-progress-bar-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.dash-progress-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.dash-progress-fill { height: 100%; background: var(-accent); border-radius: 2px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
.dash-progress-over { background: var(-danger); }
.dash-progress-pct { font-size: 11px; color: var(-text-muted); font-family: var(-mono); min-width: 32px; text-align: right; }
.dash-inline-form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; animation: slideUp 0.25s ease; }
.dash-suggestion-hint { font-size: 12px; color: var(-ok); background: rgba(74, 222, 128, 0.08); border: 1px solid rgba(74, 222, 128, 0.12); border-radius: var(-radius-sm); padding: 10px 12px; }
.dash-form-actions { display: flex; gap: 8px; }
.dash-cancel-btn, .dash-clear-btn { flex: 1; padding: 12px 10px; background: none; border: 1px solid var(-border); border-radius: var(-radius-sm); color: var(-text-muted); font-family: var(-font); font-size: 14px; cursor: pointer; transition: all 0.15s; min-height: 48px; }
.dash-cancel-btn:active { background: var(-bg-card-hover); }
.dash-clear-btn:active { background: rgba(255, 80, 80, 0.08); color: var(-danger); border-color: rgba(255, 80, 80, 0.2); }
.dash-tdee-compact { text-align: center; font-size: 12px; color: var(-text-muted); font-family: var(-mono); padding: 4px 0 8px; letter-spacing: -0.3px; opacity: 0.6; }

/* Metabolism - elevated surface */
.metabolism-card { background: var(-bg-surface); border-color: rgba(74, 222, 128, 0.08); }
.metab-grid { display: flex; align-items: stretch; gap: 0; margin-top: 8px; }
.metab-item { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 14px 8px; }
.metab-value { font-size: 30px; font-weight: 700; color: #fff; font-family: var(-mono); letter-spacing: -1px; line-height: 1.1; }
.metab-unit { font-size: 10px; color: var(-accent); font-weight: 600; margin-top: 3px; font-family: var(-mono); letter-spacing: 1px; text-transform: uppercase; }
.metab-label { font-size: 10px; color: var(-text-caption); text-align: center; margin-top: 6px; font-family: var(-mono); letter-spacing: 0.5px; }
.metab-divider { width: 1px; background: var(-border); align-self: stretch; margin: 8px 0; }

/* Collapsible - surface layer for depth */
.collapse-card { padding: 0; overflow: hidden; background: var(-bg-surface); }
.collapse-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 18px 20px; background: none; border: none; cursor: pointer; color: var(-text-secondary); font-family: var(-font); text-align: left; gap: 10px; }
.collapse-toggle:active { background: var(-bg-card-hover); }
.collapse-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); display: flex; align-items: center; gap: 8px; }
.collapse-count { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; background: var(-accent-dim); color: var(-accent); border-radius: var(-radius-sm); font-size: 11px; font-weight: 600; font-family: var(-mono); letter-spacing: 0; text-transform: none; }
.collapse-chevron { color: var(-text-muted); transition: transform 0.25s ease; flex-shrink: 0; }
.collapse-chevron-open { transform: rotate(180deg); }
.collapse-body { padding: 0 20px 20px; animation: slideUp 0.2s ease; }

/* Nutrition - progress rings summary */
.nutri-summary { padding: 24px 20px; background: var(-bg-surface); }
.nutri-rings-row { display: flex; align-items: center; justify-content: center; gap: 16px; }
.nutri-ring-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.nutri-ring-wrap { position: relative; width: 72px; height: 72px; }
.nutri-ring-svg { width: 100%; height: 100%; }
.nutri-ring-progress { transition: stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
.nutri-ring-inner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.nutri-ring-val { font-size: 15px; font-weight: 700; font-family: var(-mono); color: #fff; letter-spacing: -0.5px; }
.nutri-ring-label { font-size: 10px; font-weight: 600; color: var(-text-caption); text-transform: uppercase; letter-spacing: 1px; font-family: var(-mono); }
.nutri-remaining-block { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; padding-left: 8px; }
.nutri-remaining-val { font-size: 32px; font-weight: 700; font-family: var(-mono); color: var(-accent); letter-spacing: -2px; line-height: 1; }
.nutri-remaining-val.nutri-over { color: var(-danger); }
.nutri-remaining-unit { font-size: 11px; color: var(-text-muted); margin-top: 4px; }
.nutri-remaining-burned { font-size: 11px; color: var(-accent); margin-top: 2px; font-weight: 500; }
.nutri-ok { color: var(-ok); }
.nutri-over { color: var(-danger); }
.nutri-form { display: flex; flex-direction: column; gap: 14px; }
.nutri-list { display: flex; flex-direction: column; gap: 8px; }
.nutri-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius-sm); gap: 10px; }
.nutri-item-info { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 2px; }
.nutri-item-name { font-size: 15px; font-weight: 500; color: var(-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nutri-item-meta { font-size: 13px; color: var(-text-secondary); }
.nutri-item-time { opacity: 0.6; }
.nutri-item-actions { display: flex; gap: 6px; flex-shrink: 0; }
.nutri-quick-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: rgba(74, 222, 128, 0.08); color: var(-ok); border: none; border-radius: var(-radius-sm); font-size: 18px; font-weight: 600; cursor: pointer; }
.nutri-quick-btn:active { transform: scale(0.9); }
.nutri-del-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: none; color: var(-text-muted); border: none; border-radius: var(-radius-sm); font-size: 16px; cursor: pointer; }
.nutri-del-btn:active { background: rgba(255, 80, 80, 0.08); color: var(-danger); }
.nutri-field-wrap { display: flex; flex-direction: column; gap: 4px; }
.nutri-field-label { font-size: 13px; font-weight: 500; color: var(-text-secondary); }
.nutri-required { color: var(-accent); font-weight: 600; }
.nutri-error { font-size: 12px; color: var(-danger); margin-top: 2px; animation: slideUp 0.2s ease; }
.nutri-autocomplete { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(-bg-card); border: 1px solid var(-border-light); border-radius: var(-radius-sm); margin-top: 4px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); animation: slideUp 0.15s ease; }
.nutri-autocomplete-item { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 12px 14px; background: none; border: none; border-bottom: 1px solid var(-border); cursor: pointer; font-family: var(-font); color: var(-text-primary); font-size: 14px; min-height: 44px; }
.nutri-autocomplete-item:last-child { border-bottom: none; }
.nutri-autocomplete-item:active { background: var(-bg-card-hover); }
.nutri-autocomplete-name { font-weight: 500; }
.nutri-autocomplete-meta { font-size: 12px; color: var(-text-muted); font-family: var(-mono); }
.nutri-frequent { margin-bottom: 4px; }
.nutri-chips { display: flex; gap: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 6px 0 2px; }
.nutri-chips::-webkit-scrollbar { display: none; }
.nutri-chip { flex-shrink: 0; padding: 10px 16px; min-height: 44px; background: var(-bg-card); border: 1px solid var(-border); border-radius: 24px; color: var(-text-secondary); font-family: var(-font); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: all 0.2s ease; display: flex; align-items: center; }
.nutri-chip:active { transform: scale(0.95); background: var(-accent-dim); border-color: var(-accent); color: var(-accent); }

/* History */
.hist-groups { display: flex; flex-direction: column; gap: 14px; }
.hist-day { display: flex; flex-direction: column; gap: 6px; }
.hist-day-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(-border); }
.hist-day-label { font-size: 14px; font-weight: 600; color: var(-text-primary); }
.hist-day-totals { font-size: 12px; font-family: var(-mono); color: var(-text-muted); }
.hist-day-meals { display: flex; flex-direction: column; gap: 6px; }
.hist-meal { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.02); border: none; border-radius: var(-radius-sm); gap: 10px; }
.hist-meal-name { font-size: 14px; color: var(-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.hist-meal-meta { font-size: 12px; font-family: var(-mono); color: var(-text-muted); flex-shrink: 0; }

/* Training */
.train-main-btn { display: flex; align-items: center; justify-content: center; gap: 8px; }
.train-secondary-btn { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 14px 16px; min-height: 52px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius); color: var(-text-secondary); font-family: var(-font); font-size: 14px; font-weight: 500; cursor: pointer; }
.train-secondary-btn:active { transform: scale(0.97); background: rgba(255,255,255,0.06); }
.train-back { display: inline-flex; align-items: center; background: none; border: none; color: var(-accent); font-family: var(-font); font-size: 14px; font-weight: 500; cursor: pointer; padding: 4px 0; margin-bottom: 4px; }
.train-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); padding: 8px 0 2px; }
.train-empty { display: flex; flex-direction: column; align-items: center; padding: 32px 20px; }
.train-banner { display: flex; align-items: center; gap: 10px; width: 100%; padding: 16px 18px; background: rgba(74, 222, 128, 0.06); border: none; border-radius: var(-radius); cursor: pointer; font-family: var(-font); }
.train-banner:active { transform: scale(0.98); }
.train-banner-dot { width: 8px; height: 8px; background: var(-ok); border-radius: 50%; box-shadow: 0 0 8px rgba(74, 222, 128, 0.5); animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.train-banner-txt { flex: 1; font-size: 14px; font-weight: 500; color: var(-ok); }
.train-banner-arrow { font-size: 13px; color: var(-ok); opacity: 0.7; }
.train-prog-list { display: flex; flex-direction: column; gap: 8px; }
.train-prog-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; text-align: left; width: 100%; font-family: var(-font); }
.train-prog-card-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.train-prog-card-name { font-size: 16px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.train-prog-card-meta { font-size: 13px; color: var(-text-muted); margin-top: 3px; }
.train-tabs { display: flex; gap: 4px; border: none; border-radius: var(-radius); overflow: hidden; background: rgba(255,255,255,0.02); padding: 4px; }
.train-tab { flex: 1; padding: 10px 8px; background: transparent; border: none; border-right: none; color: var(-text-muted); font-family: var(-font); font-size: 13px; font-weight: 600; cursor: pointer; text-align: center; border-radius: var(-radius-sm); transition: all 0.15s; }
.train-tab-on { color: #fff; }
.train-tab-musculation { background: rgba(74,222,128,0.2); color: var(-accent); }
.train-tab-cardio { background: rgba(74, 222, 128, 0.2); color: var(-ok); }
.train-tab-crossfit { background: rgba(255, 167, 38, 0.2); color: var(-warn); }
.train-cat-badge { display: inline-block; padding: 4px 10px; border-radius: var(-radius-sm); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; width: fit-content; }
.train-cat-musculation { background: rgba(74,222,128,0.12); color: var(-accent); }
.train-cat-cardio { background: rgba(74, 222, 128, 0.12); color: var(-ok); }
.train-cat-crossfit { background: rgba(255, 167, 38, 0.12); color: var(-warn); }
.train-cat-dot-sm { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-left: 6px; vertical-align: middle; }
.train-cat-dot-sm.train-cat-musculation { background: var(-accent); }
.train-cat-dot-sm.train-cat-cardio { background: var(-ok); }
.train-cat-dot-sm.train-cat-crossfit { background: var(-warn); }
.train-group-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.train-group-label { font-size: 11px; font-weight: 600; color: var(-text-secondary); padding: 8px 4px 2px; text-transform: uppercase; letter-spacing: 0.5px; }
.train-ex-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius-sm); }
.train-ex-row-on { background: rgba(74, 222, 128, 0.06); }
.train-ex-row-dis { opacity: 0.4; }
.train-ex-row-info { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 2px; }
.train-ex-name { font-size: 15px; color: var(-text-primary); }
.train-ex-equip { font-size: 12px; color: var(-text-muted); }
.train-ex-add-btn { flex-shrink: 0; padding: 8px 16px; background: var(-accent-dim); color: var(-accent); border: none; border-radius: var(-radius-sm); font-family: var(-font); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 44px; }
.train-ex-add-btn:active { transform: scale(0.95); }
.train-ex-add-btn:disabled { opacity: 0.3; }
.train-ex-added { font-size: 12px; color: var(-ok); font-weight: 500; }
.train-ex-custom-badge { display: inline-block; margin-left: 6px; padding: 2px 6px; background: rgba(255, 167, 38, 0.12); color: var(-warn); border-radius: var(-radius-xs); font-size: 10px; font-weight: 600; text-transform: uppercase; vertical-align: middle; }
.train-search-wrap { position: relative; display: flex; align-items: center; }
.train-search-icon { position: absolute; left: 14px; color: var(-text-muted); pointer-events: none; }
.train-search-input { width: 100%; padding: 13px 38px 13px 40px; background: rgba(255,255,255,0.04); border: 1px solid transparent; border-radius: var(-radius); color: var(-text-primary); font-family: var(-font); font-size: 16px; outline: none; transition: all 0.2s; }
.train-search-input::placeholder { color: var(-text-muted); }
.train-search-input:focus { border-color: var(-accent); background: rgba(74,222,128,0.04); }
.train-search-clear { position: absolute; right: 10px; background: none; border: none; color: var(-text-muted); font-size: 14px; cursor: pointer; padding: 4px 6px; }
.train-search-count { font-size: 12px; color: var(-text-muted); padding: 2px 0; }
.train-text-link { background: none; border: none; color: var(-text-muted); font-family: var(-font); font-size: 13px; font-weight: 500; cursor: pointer; padding: 6px 0; text-align: center; }
.train-text-link:active { color: var(-accent); }
.train-actions { display: flex; flex-direction: column; gap: 8px; }
.train-prog-sel-list { display: flex; flex-direction: column; gap: 10px; }
.train-prog-sel-item { padding: 14px 16px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius-sm); }
.train-prog-sel-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.train-prog-sel-name { font-size: 14px; font-weight: 500; color: var(-text-primary); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.train-prog-sel-config { display: flex; align-items: flex-end; gap: 8px; margin-top: 8px; }
.train-prog-sel-field { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.train-prog-sel-field label { font-size: 11px; color: var(-text-muted); font-weight: 500; }
.train-prog-sel-input { text-align: center; padding: 8px 6px !important; }
.train-prog-sel-x { font-size: 16px; color: var(-text-muted); padding-bottom: 8px; }
.train-prog-sel-note { font-size: 12px; color: var(-text-muted); margin-top: 6px; font-style: italic; }

/* Detail */
.train-detail-edit-card { display: flex; flex-direction: column; gap: 12px; }
.train-detail-edit-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.train-detail-edit-info { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.train-detail-num { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: var(-accent-dim); color: var(-accent); border-radius: 50%; font-size: 13px; font-weight: 700; font-family: var(-mono); flex-shrink: 0; }
.train-detail-name { font-size: 15px; font-weight: 600; color: var(-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.train-detail-edit-controls { display: flex; align-items: flex-end; gap: 8px; padding: 0 4px; flex-wrap: wrap; }
.train-detail-edit-field { flex: 1; min-width: 80px; display: flex; flex-direction: column; gap: 3px; align-items: center; }
.train-detail-edit-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: var(-text-muted); }
.train-detail-edit-x { font-size: 16px; color: var(-text-muted); padding-bottom: 8px; }
.train-detail-edit-cardio-note { font-size: 12px; color: var(-text-muted); font-style: italic; padding-left: 32px; }
.train-detail-stepper { display: flex; align-items: center; border: none; border-radius: var(-radius-sm); overflow: hidden; background: rgba(255,255,255,0.03); }
.train-stepper-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(-text-primary); font-size: 18px; font-weight: 600; cursor: pointer; }
.train-stepper-btn:active { background: rgba(255,255,255,0.06); }
.train-stepper-val { width: 40px; text-align: center; background: transparent; border: none; border-left: 1px solid var(-border); border-right: 1px solid var(-border); color: var(-text-primary); font-family: var(-mono); font-size: 15px; font-weight: 600; padding: 6px 0; outline: none; }
.train-detail-actions { display: flex; gap: 10px; }

/* Session - surface layer header */
.train-session-header { text-align: center; padding: 28px 16px 20px; background: var(-bg-surface); }
.train-session-time { font-size: 48px; font-weight: 700; font-family: var(-mono); letter-spacing: -2px; line-height: 1; color: #fff; }
.train-session-progress { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 12px; }
.train-session-ring { width: 36px; height: 36px; color: var(-accent); }
.train-session-ring circle { transition: stroke-dasharray 0.5s ease; }
.train-session-sets-label { font-size: 13px; font-family: var(-mono); color: var(-accent); font-weight: 600; letter-spacing: -0.5px; }
.train-session-stats { font-size: 12px; color: var(-text-caption); margin-top: 8px; }
.train-rest-toggle { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 16px; background: rgba(255,255,255,0.04); border: none; border-radius: var(-radius); cursor: pointer; font-family: var(-font); }
.train-rest-toggle:active { transform: scale(0.95); }
.train-rest-toggle-dot { width: 10px; height: 10px; border-radius: 50%; background: var(-text-muted); transition: all 0.2s; }
.train-rest-toggle-on { background: var(-accent); box-shadow: 0 0 8px var(-accent-glow); }
.train-rest-toggle-label { font-size: 12px; font-weight: 500; color: var(-text-secondary); }
.train-rest-bar { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: rgba(74,222,128,0.06); border: none; border-radius: var(-radius-sm); cursor: pointer; font-family: var(-font); width: 100%; }
.train-rest-fill { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(74,222,128,0.1); transition: width 1s linear; }
.train-rest-txt { position: relative; font-size: 14px; font-weight: 600; color: var(-accent); font-family: var(-mono); }
.train-rest-dismiss { position: relative; font-size: 14px; color: var(-text-muted); }

/* Per-exercise completion */
.train-ex-progress { display: flex; align-items: center; gap: 8px; }
.train-ex-progress-bar { flex: 1; height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.train-ex-progress-fill { height: 100%; background: var(-accent); border-radius: 2px; transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.train-ex-progress-complete { background: var(-accent); box-shadow: 0 0 8px rgba(74, 222, 128, 0.4); }
.train-ex-progress-label { font-size: 11px; font-family: var(-mono); color: var(-text-muted); font-weight: 600; min-width: 32px; text-align: right; transition: color 0.2s ease; }
.train-ex-progress-done { color: var(-accent); font-weight: 700; animation: donePulse 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes donePulse { 0% { transform: scale(0.8); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }

.train-sess-ex { display: flex; flex-direction: column; gap: 12px; }
.train-sess-ex-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.train-sess-ex-head > div { display: flex; align-items: center; }
.train-sess-ex-name { font-size: 17px; font-weight: 600; color: #fff; }
.train-sets-head { display: grid; grid-template-columns: 36px 1fr 1fr 48px; gap: 8px; padding: 0 2px; margin-bottom: 4px; }
.train-sets-col-num, .train-sets-col, .train-sets-col-chk { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(-text-muted); }
.train-sets-col { text-align: center; }
.train-sets-col-chk { text-align: center; }
.train-set-row { display: grid; grid-template-columns: 36px 1fr 1fr 48px; gap: 8px; align-items: center; padding: 6px 2px; border-radius: var(-radius-sm); transition: background 0.2s ease; }
.train-set-done { background: rgba(74, 222, 128, 0.04); }
.train-set-num { font-size: 14px; font-weight: 600; color: var(-text-muted); text-align: center; font-family: var(-mono); width: 32px; transition: color 0.2s ease; }
.train-set-done .train-set-num { color: var(-accent); }
.train-set-input-wrap { position: relative; }
.train-set-input { width: 100%; padding: 12px 10px; background: rgba(255,255,255,0.04); border: 1px solid transparent; border-radius: var(-radius-sm); color: var(-text-primary); font-family: var(-mono); font-size: 16px; text-align: center; outline: none; transition: all 0.2s ease; }
.train-set-input:focus { border-color: var(-accent); background: rgba(74,222,128,0.04); }
.train-set-input::placeholder { color: var(-text-muted); }
.train-set-done .train-set-input { opacity: 0.5; }
.train-set-hint { position: absolute; bottom: -14px; left: 0; right: 0; text-align: center; font-size: 10px; color: var(-text-muted); font-family: var(-mono); }
.train-set-chk { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(-radius-sm); border: none; background: rgba(255,255,255,0.04); color: var(-text-muted); font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
.train-set-chk:active { transform: scale(0.9); }
.train-set-chk-on { background: rgba(74, 222, 128, 0.12); color: var(-accent); transform: scale(1); animation: checkBounce 0.3s ease; }
@keyframes checkBounce { 0% { transform: scale(1); } 40% { transform: scale(1.18); } 70% { transform: scale(0.96); } 100% { transform: scale(1); } }
.train-set-btns { display: flex; gap: 8px; margin-top: 8px; }
.train-set-btn { flex: 1; padding: 7px 8px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius-sm); color: var(-text-muted); font-family: var(-font); font-size: 12px; font-weight: 500; cursor: pointer; min-height: 48px; display: flex; align-items: center; justify-content: center; transition: background 0.2s ease; }
.train-set-btn:active { background: rgba(255,255,255,0.06); }

/* Cardio */
.train-cardio-section { display: flex; flex-direction: column; gap: 10px; }
.train-cardio-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.train-cardio-field { display: flex; flex-direction: column; gap: 3px; }
.train-cardio-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: var(-text-muted); }
.train-cardio-auto { border-color: rgba(74,222,128,0.2) !important; color: var(-accent) !important; }
.train-cardio-auto::placeholder { color: rgba(74,222,128,0.35) !important; font-style: italic; }
.train-hms-row { display: flex; align-items: center; gap: 4px; }
.train-hms-input { flex: 1; text-align: center; padding: 9px 4px !important; font-family: var(-mono); font-size: 16px; min-width: 0; }
.train-hms-sep { font-size: 16px; font-weight: 600; color: var(-text-muted); }

/* Popup */
.train-popup-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0, 0, 0, 0.7); display: flex; align-items: flex-end; justify-content: center; padding: 20px; animation: overlayIn 0.2s ease; backdrop-filter: blur(4px); }
.train-popup { width: 100%; max-width: 400px; background: var(-bg-card); border: 1px solid var(-border-light); border-radius: var(-radius); padding: 24px 20px; animation: popupSlide 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.train-popup-title { font-size: 18px; font-weight: 600; color: var(-text-primary); text-align: center; margin-bottom: 16px; }
.train-popup-cal { text-align: center; padding: 20px; background: rgba(74, 222, 128, 0.04); border: none; border-radius: var(-radius-sm); margin-bottom: 12px; }
.train-popup-cal-big { font-size: 40px; font-weight: 700; font-family: var(-mono); color: #4ADE80; line-height: 1.1; letter-spacing: -2px; }
.train-popup-cal-unit { font-size: 13px; color: var(-text-muted); margin-top: 2px; }
.train-popup-cal-detail { font-size: 12px; color: var(-text-secondary); margin-top: 8px; }
.train-popup-changes { padding: 14px; background: rgba(255, 167, 38, 0.06); border: 1px solid rgba(255, 167, 38, 0.15); border-radius: var(-radius-sm); display: flex; flex-direction: column; gap: 10px; }
.train-popup-changes-title { font-size: 14px; font-weight: 600; color: var(-warn); }
.train-popup-changes-list { display: flex; flex-direction: column; gap: 4px; }
.train-popup-change-item { font-size: 13px; color: var(-text-secondary); padding: 4px 0; border-bottom: 1px solid var(-border); }
.train-popup-change-item:last-child { border-bottom: none; }
.train-popup-change-btns { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.custom-ex-modal { max-height: 85vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.custom-ex-fields { display: flex; flex-direction: column; gap: 10px; }
.custom-ex-group-row { display: flex; gap: 6px; }
.custom-ex-group-btn { flex: 1; padding: 10px 8px; background: var(-bg-root); border: 1px solid var(-border); border-radius: var(-radius-sm); color: var(-text-secondary); font-family: var(-font); font-size: 13px; font-weight: 500; cursor: pointer; text-align: center; min-height: 44px; }
.custom-ex-group-on { border-width: 2px; }
.custom-ex-group-musculation { background: rgba(74,222,128,0.08); border-color: var(-accent); color: var(-accent); }
.custom-ex-group-cardio { background: rgba(74, 222, 128, 0.08); border-color: var(-ok); color: var(-ok); }
.custom-ex-group-crossfit { background: rgba(255, 167, 38, 0.08); border-color: var(-warn); color: var(-warn); }
.train-exlist-modal { max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.train-exlist-header { display: flex; align-items: center; justify-content: space-between; }
.train-exlist-close { background: none; border: none; color: var(-text-muted); font-size: 18px; cursor: pointer; padding: 4px 8px; }

/* History */
.train-hist-list { display: flex; flex-direction: column; gap: 6px; }
.train-hist-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius-sm); cursor: pointer; font-family: var(-font); text-align: left; width: 100%; min-height: 44px; }
.train-hist-row:active { background: rgba(255,255,255,0.06); }
.train-hist-row-info { flex: 1; min-width: 0; }
.train-hist-row-name { font-size: 14px; font-weight: 500; color: var(-text-primary); display: block; }
.train-hist-row-meta { font-size: 12px; color: var(-text-muted); margin-top: 1px; display: block; }

/* Review - surface header */
.train-review-header { display: flex; align-items: center; justify-content: center; gap: 0; padding: 20px; background: var(-bg-surface); }
.train-review-stat { flex: 1; display: flex; flex-direction: column; align-items: center; }
.train-review-stat-val { font-size: 26px; font-weight: 700; font-family: var(-mono); color: #fff; line-height: 1.2; letter-spacing: -0.5px; }
.train-review-stat-label { font-size: 10px; color: var(-text-caption); text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; font-family: var(-mono); font-weight: 500; }
.train-review-divider { width: 1px; height: 32px; background: var(-border); flex-shrink: 0; }
.train-review-cardio { display: flex; flex-direction: column; gap: 4px; }
.train-review-cardio-row { font-size: 14px; color: var(-text-secondary); }

/* PR overlay */
.pr-overlay { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(255, 183, 0, 0.08); pointer-events: none; animation: prFade 3s ease forwards; }
@keyframes prFade { 0% { opacity: 0; } 10% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
.pr-popup { text-align: center; animation: prBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes prBounce { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.pr-trophy { font-size: 64px; margin-bottom: 8px; }
.pr-text { font-size: 22px; font-weight: 700; color: #FFD700; letter-spacing: 2px; text-shadow: 0 0 20px rgba(255,215,0,0.5); }
.pr-detail { font-size: 14px; color: var(-text-secondary); margin-top: 4px; }

/* Tracking - consistent metric pattern */
.track-week-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.track-stat-mini { display: flex; flex-direction: column; align-items: center; padding: 20px 14px; background: var(-bg-surface); border: none; border-radius: var(-radius); position: relative; overflow: hidden; }
.track-stat-mini::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 32px; height: 2px; background: var(-accent); border-radius: 0 0 2px 2px; opacity: 0.5; }
.track-stat-val { font-size: 26px; font-weight: 700; font-family: var(-mono); color: #fff; letter-spacing: -1px; }
.track-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(-text-caption); margin-top: 4px; font-family: var(-mono); font-weight: 500; }
.track-stat-change { font-size: 11px; font-weight: 600; margin-top: 3px; }
.track-trend { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 600; margin-top: 6px; padding: 2px 8px; border-radius: var(-radius-xs); }
.track-trend-up { color: var(-accent); background: rgba(74, 222, 128, 0.1); }
.track-trend-down { color: var(-danger); background: rgba(255, 82, 82, 0.1); }
.track-stat-bar { width: 100%; height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-top: 8px; }
.track-stat-fill { height: 100%; background: var(-accent); border-radius: 2px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
.track-up { color: var(-accent); }
.track-down { color: var(-danger); }
.track-chart-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -18px; padding: 0 18px; }
.track-chart-scroll::-webkit-scrollbar { display: none; }
.track-chart { display: flex; align-items: flex-end; gap: 4px; height: 180px; min-width: max-content; position: relative; padding-bottom: 22px; }
.track-chart-target { position: absolute; left: 0; right: 0; border-top: 1px dashed var(-accent); z-index: 1; opacity: 0.4; }
.track-chart-target-label { position: absolute; right: 0; top: -14px; font-size: 9px; color: var(-accent); font-family: var(-mono); }
.track-bar-col { display: flex; flex-direction: column; align-items: center; width: 24px; flex-shrink: 0; }
.track-bar-wrap { flex: 1; display: flex; align-items: flex-end; width: 100%; height: 158px; }
.track-bar { width: 100%; border-radius: 4px; transition: height 0.3s ease; min-height: 2px; }
.track-bar-ok { background: #4ADE80; }
.track-bar-over { background: var(-danger); }
.track-bar-empty { background: rgba(255,255,255,0.04); border-radius: 4px; }
.track-bar-label { font-size: 8px; color: var(-text-caption); margin-top: 4px; white-space: nowrap; }
.track-ex-history { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.track-ex-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius-sm); transition: background 0.15s; }
.track-ex-row-pr { background: rgba(74, 222, 128, 0.06); }
.track-ex-date { font-size: 13px; color: var(-text-secondary); }
.track-ex-perf { font-size: 13px; font-family: var(-mono); color: var(-text-primary); display: flex; align-items: center; gap: 4px; }
.track-ex-trend-up { color: var(-accent); font-weight: 700; font-size: 14px; }
.track-pr-badge { font-size: 14px; }
.track-weight-form { display: flex; gap: 10px; margin-bottom: 12px; }
.track-weight-list { display: flex; flex-direction: column; gap: 6px; }
.track-weight-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.03); border: none; border-radius: var(-radius-sm); }
.track-weight-date { font-size: 13px; color: var(-text-secondary); }
.track-weight-val { font-size: 14px; font-family: var(-mono); font-weight: 600; color: var(-text-primary); }
.track-weight-diff { font-size: 12px; font-weight: 600; font-family: var(-mono); }

/* ══════════════════════════════════════
TRACK PAGE - segment control
══════════════════════════════════════ */
.track-page-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.segment-bar {
flex-shrink: 0;
padding: 16px 16px 0;
background: var(-bg-root);
}
.segment-control {
position: relative;
display: flex;
background: var(-bg-surface);
border-radius: 14px;
padding: 3px;
gap: 0;
}
.segment-bg {
position: absolute;
top: 3px; left: 3px;
width: calc(50% - 3px);
height: calc(100% - 6px);
background: var(-bg-card);
border-radius: 11px;
transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.segment-btn {
flex: 1;
position: relative;
z-index: 1;
display: flex;
align-items: center;
justify-content: center;
gap: 6px;
padding: 12px 10px;
min-height: 48px;
background: none;
border: none;
color: #A1A1AA;
font-family: var(-font);
font-size: 14px;
font-weight: 500;
cursor: pointer;
transition: color 0.2s;
border-radius: 11px;
}
.segment-active { color: #fff; font-weight: 600; }
.segment-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.segment-content > * { flex: 1; }

/* Scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(-border-light); border-radius: 4px; }

/* ══════════════════════════════════════
HYTRX SIGNATURE - visual language
══════════════════════════════════════ */

/* Accent line - signature top indicator on elevated elements */
.card::before { content: none; }
.card-accent::before {
content: '';
position: absolute;
top: 0; left: 24px;
width: 32px; height: 2px;
background: var(-accent);
border-radius: 0 0 2px 2px;
opacity: 0.4;
}
.card-accent { position: relative; }

/* Data readout - mono numbers everywhere */
.data-val { font-family: var(-mono); font-weight: 600; letter-spacing: -0.5px; color: #fff; }
.data-accent { color: var(-accent); }
.data-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px; color: var(-text-caption); font-family: var(-mono); }

/* Section divider - subtle accent line */
.section-divider { height: 1px; background: linear-gradient(to right, var(-accent), transparent); opacity: 0.1; margin: 4px 0; }

/* Card label - HYTRX style: mono, uppercase, tracked */
.card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); margin-bottom: 12px; font-family: var(-mono); }

/* Section labels - same pattern */
.dash-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); padding: 4px 4px 0; font-family: var(-mono); }
.train-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); padding: 8px 4px 2px; font-family: var(-mono); }
.collapse-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(-text-caption); display: flex; align-items: center; gap: 8px; font-family: var(-mono); }
.train-group-label { font-size: 10px; font-weight: 600; color: var(-text-muted); padding: 10px 4px 4px; text-transform: uppercase; letter-spacing: 1px; font-family: var(-mono); }

/* ══════════════════════════════════════
STICKY CTA BAR - dominant, unmissable
══════════════════════════════════════ */
.sticky-cta {
position: fixed;
bottom: calc(var(-nav-height) + var(-safe-bottom));
left: 0; right: 0;
z-index: 90;
padding: 16px 16px;
padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
background: linear-gradient(to top, #0B0B0C 70%, transparent);
display: flex;
flex-direction: column;
gap: 8px;
pointer-events: none;
}
.sticky-cta > * { pointer-events: auto; }
.sticky-cta-main {
width: 100%;
padding: 18px 24px;
min-height: 56px;
background: var(-accent);
color: #0B0B0C;
border: none;
border-radius: 16px;
font-family: var(-font);
font-size: 16px;
font-weight: 700;
letter-spacing: 0.3px;
cursor: pointer;
transition: transform 0.15s ease, opacity 0.15s, box-shadow 0.2s;
box-shadow: 0 8px 32px rgba(74, 222, 128, 0.35), 0 2px 8px rgba(74, 222, 128, 0.2);
will-change: transform;
}
.sticky-cta-main:active { transform: scale(0.97); opacity: 0.9; box-shadow: 0 4px 16px rgba(74, 222, 128, 0.2); }
.sticky-cta-tertiary {
width: 100%;
padding: 10px 20px;
min-height: 44px;
background: none;
border: none;
color: var(-text-caption);
font-family: var(-font);
font-size: 13px;
cursor: pointer;
text-align: center;
}
.sticky-cta-tertiary:active { color: var(-text-secondary); }

/* Links row for secondary actions */
.train-links-row {
display: flex;
align-items: center;
justify-content: center;
gap: 20px;
}

/* ══════════════════════════════════════
TOUCH TARGET ENFORCEMENT (44px min)
══════════════════════════════════════ */
.train-prog-card { min-height: 60px; }
.train-hist-row { min-height: 56px; }
.train-ex-row { min-height: 52px; }
.train-ex-add-btn { min-height: 44px; min-width: 72px; }
.nutri-chip { min-height: 48px; }
.nutri-item { min-height: 52px; }
.nutri-del-btn, .nutri-quick-btn { min-width: 44px; min-height: 44px; width: 44px; height: 44px; }
.train-set-btn { min-height: 48px; }
.collapse-toggle { min-height: 52px; }
.dash-action-btn { min-height: 56px; }
.dash-obj-row { min-height: 52px; }
.ob-sex-btn { min-height: 52px; }
.ob-goal-card { min-height: 72px; }
.btn-save { min-height: 48px; }
.train-stepper-btn { min-width: 40px; min-height: 40px; width: 40px; height: 40px; }

/* ══════════════════════════════════════
MICRO-INTERACTIONS & MOTION
══════════════════════════════════════ */

/* Page transitions (tab switching) */
.page-transition { display: flex; flex-direction: column; flex: 1; will-change: opacity, transform; }
.page-in { animation: pageEnter 0.25s ease both; }
.page-out { animation: pageExit 0.12s ease both; }
@keyframes pageEnter {
from { opacity: 0; transform: translateY(6px); }
to { opacity: 1; transform: translateY(0); }
}
@keyframes pageExit {
from { opacity: 1; transform: translateY(0); }
to { opacity: 0; transform: translateY(-4px); }
}

/* Page shell entrance - every screen fades in */
.page-shell { animation: shellEnter 0.2s ease both; }
@keyframes shellEnter {
from { opacity: 0; }
to { opacity: 1; }
}

/* Card tap feedback */
.card { transition: transform 0.15s ease, background 0.2s; will-change: transform; }
.card:active { transform: scale(0.985); }
.train-prog-card:active { transform: scale(0.98); }

/* Universal button feedback */
.btn-primary { transition: transform 0.15s ease, opacity 0.15s; will-change: transform; }
.btn-save { transition: transform 0.15s ease; will-change: transform; }
.dash-cancel-btn, .dash-clear-btn { transition: transform 0.12s ease, background 0.15s, color 0.15s; will-change: transform; }
.dash-cancel-btn:active, .dash-clear-btn:active { transform: scale(0.97); }
.train-back { transition: opacity 0.15s; }
.train-back:active { opacity: 0.5; }
.train-text-link { transition: color 0.15s, transform 0.12s; }
.train-text-link:active { transform: scale(0.97); }

/* Input focus glow */
.input { transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease; }
.input:focus { box-shadow: 0 0 0 3px rgba(74,222,128,0.08); }
.train-search-input { transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease; }
.train-search-input:focus { box-shadow: 0 0 0 3px rgba(74,222,128,0.08); }
.train-set-input { transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.15s ease; }
.train-set-input:focus { box-shadow: 0 0 0 3px rgba(74,222,128,0.06); }

/* Set done - satisfaction pulse */
.train-set-done { animation: setDonePulse 0.3s ease; }
@keyframes setDonePulse {
0% { background: transparent; }
40% { background: rgba(74, 222, 128, 0.1); }
100% { background: rgba(74, 222, 128, 0.04); }
}

/* Check button bounce (enhanced) */
@keyframes checkBounce {
0% { transform: scale(1); }
30% { transform: scale(1.18); }
60% { transform: scale(0.95); }
100% { transform: scale(1); }
}

/* Nav indicator - animate position with layout */
.nav-indicator { transition: width 0.2s ease; animation: indicatorIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes indicatorIn {
from { transform: translateX(-50%) scaleX(0); opacity: 0; }
to { transform: translateX(-50%) scaleX(1); opacity: 1; }
}

/* Nav button - spring on press */
.nav-btn { transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* Toast - spring entrance from bottom */
.save-toast { animation: toastSpring 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes toastSpring {
0% { opacity: 0; transform: translateY(12px) scale(0.95); }
60% { opacity: 1; transform: translateY(-2px) scale(1.01); }
100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* Collapse body entrance */
.collapse-body { animation: collapseOpen 0.2s ease; }
@keyframes collapseOpen {
from { opacity: 0; transform: translateY(-4px); }
to { opacity: 1; transform: translateY(0); }
}

/* Chip tap feedback */
.nutri-chip { transition: transform 0.12s ease, background 0.15s, border-color 0.15s, color 0.15s; will-change: transform; }

/* Exercise row tap */
.train-ex-row { transition: background 0.15s ease; }
.train-ex-row:active { background: rgba(255,255,255,0.06); }

/* History row tap */
.train-hist-row { transition: background 0.15s ease; }

/* Popup overlay - fade backdrop */
.train-popup-overlay { animation: overlayIn 0.2s ease; }
@keyframes overlayIn {
from { opacity: 0; }
to { opacity: 1; }
}

/* Popup slide - spring from bottom */
@keyframes popupSlide {
0% { opacity: 0; transform: translateY(40px) scale(0.97); }
60% { opacity: 1; transform: translateY(-4px) scale(1.005); }
100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* PR overlay - enhanced */
@keyframes prFade {
0% { opacity: 0; backdrop-filter: blur(0); }
8% { opacity: 1; backdrop-filter: blur(4px); }
75% { opacity: 1; }
100% { opacity: 0; }
}
@keyframes prBounce {
0% { transform: scale(0.2); opacity: 0; }
50% { transform: scale(1.08); opacity: 1; }
70% { transform: scale(0.96); }
100% { transform: scale(1); }
}

/* Streak badge pulse */
.dash-streak { transition: transform 0.15s ease; }
.dash-streak:active { transform: scale(0.95); }

/* Sticky CTA entrance */
.sticky-cta { animation: stickyIn 0.3s ease 0.1s both; }
@keyframes stickyIn {
from { opacity: 0; transform: translateY(16px); }
to { opacity: 1; transform: translateY(0); }
}
.sticky-cta-main { transition: transform 0.15s ease, opacity 0.15s, box-shadow 0.2s; will-change: transform; }
.sticky-cta-main:active { box-shadow: 0 2px 10px rgba(74, 222, 128, 0.15); }
.sticky-cta-secondary { transition: transform 0.15s ease, background 0.15s; will-change: transform; }

/* Hero card - entrance animations */
.dash-hero-number { transition: color 0.3s ease; animation: heroNumberIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both; }
@keyframes heroNumberIn {
from { opacity: 0; transform: scale(0.85); }
to { opacity: 1; transform: scale(1); }
}
.dash-hero-card { animation: heroCardIn 0.4s ease both; }
@keyframes heroCardIn {
from { opacity: 0; transform: translateY(8px); }
to { opacity: 1; transform: translateY(0); }
}
.dash-hero-ring-progress { animation: ringDraw 1s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both; }
@keyframes ringDraw {
from { stroke-dasharray: 0 339.3; }
}
.dash-hero-prot-fill { animation: barFill 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s both; }
.nutri-ring-progress { animation: ringDraw 1s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both; }
@keyframes barFill { from { width: 0; } }
.dash-hero-prot-val { transition: color 0.3s ease; }

/* Obj row tap */
.dash-obj-row { transition: background 0.15s ease; }

/* Onboarding goal cards */
.ob-goal-card { transition: transform 0.15s ease, border-color 0.2s, background 0.2s; will-change: transform; }
.ob-sex-btn { transition: transform 0.15s ease, border-color 0.2s, background 0.2s, color 0.2s; will-change: transform; }
.ob-sex-btn:active { transform: scale(0.97); }

/* Progress bar fill - smooth on change */
.dash-hero-fill { transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
.dash-progress-fill { transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
