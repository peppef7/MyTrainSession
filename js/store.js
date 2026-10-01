// Stato dell'app salvato sul dispositivo (localStorage), con backup esportabile.
const KEY = 'mts-v1';

const empty = () => ({ version: 1, activePlanId: null, plans: [], log: {}, notes: {}, open: {}, health: {} });

export const S = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return Object.assign(empty(), s);
  } catch (e) { /* storage non disponibile */ }
  return empty();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch (e) { return false; }
}

// Chiedi al browser di non cancellare i dati (Safari la concede alle app nella Home)
export function askPersistence() {
  try { navigator.storage?.persist?.(); } catch (e) { }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function addPlan(plan) {
  plan.id = uid();
  plan.importedAt = new Date().toISOString();
  plan.currentWeek = 1;
  S.plans.unshift(plan);
  S.activePlanId = plan.id;
  save();
  return plan;
}

export function deletePlan(id) {
  S.plans = S.plans.filter(p => p.id !== id);
  const pre = id + '|';
  for (const bag of [S.log, S.notes, S.open]) for (const k of Object.keys(bag)) if (k.startsWith(pre)) delete bag[k];
  if (S.activePlanId === id) S.activePlanId = S.plans[0]?.id ?? null;
  save();
}

export const plan = id => S.plans.find(p => p.id === id);

// chiavi: piano | settimana | giorno | esercizio | serie (o 'n' per le note, 'x' per le serie aggiunte)
export const key = (p, w, d, i, s) => `${p.id}|${w}|${d}|${i}|${s}`;

export function exportBackup() {
  return new Blob([JSON.stringify({ app: 'MyTrainSession', exportedAt: new Date().toISOString(), data: S }, null, 1)], { type: 'application/json' });
}

export function importBackup(text) {
  const j = JSON.parse(text);
  const d = j && j.app === 'MyTrainSession' ? j.data : null;
  if (!d || d.version !== 1 || !Array.isArray(d.plans)) throw new Error('Il file non è un backup di MyTrainSession.');
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, empty(), d);
  save();
}
