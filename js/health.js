// Dati di Apple Salute (passi, calorie, wearable). Una web app non può leggere Salute:
// li porta qui un Comando Rapido di iOS, che li copia negli appunti o li scrive in un file di testo.
import { S, save } from './store.js';

export const METRICS = [
  { k: 'passi', l: 'Passi', u: '', int: true, alias: ['steps', 'passi_oggi'] },
  { k: 'kcal_attive', l: 'Calorie attive', u: 'kcal', int: true, alias: ['energia_attiva', 'active_energy', 'calorie_attive', 'calorie', 'kcal', 'cal_attive'] },
  { k: 'kcal_riposo', l: 'Calorie a riposo', u: 'kcal', int: true, alias: ['energia_a_riposo', 'energia_riposo', 'resting_energy', 'calorie_riposo', 'calorie_a_riposo', 'basal_energy'] },
  { k: 'km', l: 'Distanza', u: 'km', dec: 2, alias: ['distanza', 'distance', 'distanza_camminata_e_corsa'] },
  { k: 'piani', l: 'Piani saliti', u: '', int: true, alias: ['piani_saliti', 'flights', 'flights_climbed'] },
  { k: 'min_esercizio', l: 'Minuti di esercizio', u: 'min', int: true, alias: ['minuti_esercizio', 'esercizio', 'exercise', 'exercise_minutes', 'tempo_esercizio'] },
  { k: 'fc_riposo', l: 'FC a riposo', u: 'bpm', int: true, alias: ['frequenza_cardiaca_a_riposo', 'resting_heart_rate', 'fc_a_riposo', 'battito_riposo'] },
  { k: 'fc_media', l: 'FC media', u: 'bpm', int: true, alias: ['frequenza_cardiaca', 'heart_rate', 'fc', 'battito'] },
  { k: 'hrv', l: 'Variabilità cardiaca', u: 'ms', int: true, alias: ['variabilita_cardiaca', 'heart_rate_variability'] },
  { k: 'sonno', l: 'Sonno', u: 'h', dec: 1, alias: ['sleep', 'ore_sonno', 'sonno_h'] },
  { k: 'peso', l: 'Peso', u: 'kg', dec: 1, alias: ['weight', 'peso_kg'] },
];
const BY_KEY = {};
METRICS.forEach(m => [m.k, ...m.alias].forEach(a => BY_KEY[a] = m));
const DATE_KEYS = new Set(['data', 'date', 'giorno', 'day']);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function okDate(y, m, d) {
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? iso(x) : null;
}
// Accetta 2026-10-01, 01/10/2026, 1.10.26, "1 ott 2026" (il formato italiano di Comandi), oggi, ieri
export function parseDate(v) {
  const s = norm(v).replace(/_/g, ' ');
  if (s === 'oggi' || s === 'today') return today();
  if (s === 'ieri' || s === 'yesterday') return addDays(today(), -1);
  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
  if (m) return okDate(+m[1], +m[2], +m[3]);
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(v);
  if (m) return okDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})/.exec(s);
  if (m && MESI.includes(m[2])) return okDate(+m[3], MESI.indexOf(m[2]) + 1, +m[1]);
  return null;
}

// Numeri come li scrive Comandi in italiano: "8.234" (migliaia), "6,2" (decimali), con o senza unità
export function parseNum(raw, met) {
  let s = String(raw ?? '').replace(/[\s'’  ]/g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const ld = s.lastIndexOf('.'), lc = s.lastIndexOf(',');
  if (ld >= 0 && lc >= 0) {
    const dec = ld > lc ? '.' : ',', grp = dec === '.' ? ',' : '.';
    s = s.split(grp).join('').replace(dec, '.');
  } else if (ld >= 0 || lc >= 0) {
    const parts = s.split(ld >= 0 ? '.' : ',');
    s = parts.length > 2 || (!met.dec && parts[1].length === 3) ? parts.join('') : parts.join('.');
  }
  let x = parseFloat(s);
  if (!isFinite(x) || x < 0) return null;
  if (met.k === 'km' && x > 300) x /= 1000;                       // metri
  if (met.k === 'sonno') x = x > 1440 ? x / 3600 : x > 24 ? x / 60 : x; // secondi o minuti
  const f = met.int ? 1 : 10 ** met.dec;
  return Math.round(x * f) / f;
}

// Testo dal Comando Rapido: righe "chiave=valore" (o "chiave: valore", separate da a capo, ; o |).
// Ogni "data=" apre un nuovo giorno, così un file con più giorni si importa tutto insieme. Accetta anche JSON.
export function parseHealthText(text) {
  const t = String(text || '').trim(), recs = [];
  if (!t) return recs;
  let pairs = null;
  if (/^[[{]/.test(t)) {
    try { const j = JSON.parse(t); pairs = (Array.isArray(j) ? j : [j]).flatMap(o => [['__new', ''], ...Object.entries(o || {})]); } catch (e) { /* non è JSON */ }
  }
  if (!pairs) pairs = t.split(/[\n\r;|]+/).map(tok => /^\s*([^=:]+?)\s*[=:]\s*(.*?)\s*$/.exec(tok)).filter(Boolean).map(m => [m[1], m[2]]);
  let cur = null;
  for (const [rk, v] of pairs) {
    const k = norm(rk);
    if (k === '_new') { cur = null; continue; }
    if (DATE_KEYS.has(k)) { cur = { date: parseDate(String(v)), raw: String(v), v: {} }; recs.push(cur); continue; }
    const met = BY_KEY[k]; if (!met) continue;
    const x = parseNum(v, met); if (x == null) continue;
    if (!cur) { cur = { date: today(), v: {} }; recs.push(cur); }
    cur.v[met.k] = x;
  }
  return recs.filter(r => Object.keys(r.v).length);
}

export function importHealth(text) {
  const recs = parseHealthText(text), days = new Set();
  let bad = 0;
  for (const r of recs) {
    if (!r.date) { bad++; continue; }
    S.health[r.date] = { ...S.health[r.date], ...r.v };
    days.add(r.date);
  }
  if (days.size) save();
  return { days: [...days].sort(), bad };
}

/* ---------- Schermata Salute ---------- */
const TEMPLATE = 'data=\npassi=\nkcal_attive=\nkcal_riposo=\nkm=\nmin_esercizio=\nfc_riposo=\npeso=';
let chartK = 'passi';

const show = (x, m) => x == null ? '–' : m.int ? Math.round(x).toLocaleString('it-IT') : String(x).replace('.', ',');
const dow = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const dayLabel = s => { const [, m, d] = s.split('-').map(Number); return s === today() ? 'Oggi' : s === addDays(today(), -1) ? 'Ieri' : `${GIORNI[dow(s)]} ${d} ${MESI[m - 1]}`; };

// Giorni in cui hai spuntato almeno una serie, con le schede fatte
function trainedOn() {
  const out = {};
  for (const [k, v] of Object.entries(S.log)) if (v?.done && v.at) (out[v.at] ||= new Set()).add(k.split('|')[2]);
  return out;
}

export function homeRow(esc) {
  const h = S.health[today()], y = S.health[addDays(today(), -1)];
  const de = h?.passi != null ? `Oggi ${show(h.passi, METRICS[0])} passi${h.kcal_attive != null ? ` · ${show(h.kcal_attive, METRICS[1])} kcal attive` : ''}`
    : y?.passi != null ? `Ieri ${show(y.passi, METRICS[0])} passi` : 'Passi, calorie e dati del tuo wearable';
  return `<div class="sec">Attività</div><div class="group"><button class="row" data-go="health"><span class="badge" style="background:var(--bad);color:#fff;font-size:20px">♥</span><span class="grow"><div class="ti">Salute</div><div class="de">${esc(de)}</div></span><span class="chev">›</span></button></div>`;
}

export function healthView(ui) {
  const { esc } = ui;
  return {
    title: 'Salute',
    render() {
      const dates = Object.keys(S.health).filter(d => Object.keys(S.health[d] || {}).length).sort().reverse();
      const buttons = `<div class="stack"><button class="btn" id="hpaste">Incolla da Salute</button>
        <label class="btn ghost" for="hfile">Importa file dal Comando Rapido</label><input type="file" id="hfile" accept="text/plain,.txt,application/json,.json" hidden>
        <div class="links" style="justify-content:center"><button class="edit" id="hman">Inserisci a mano</button><button class="edit" id="hguide">Come collegare Salute</button></div></div>`;
      const head = `<h1>Salute</h1><p class="sub">Passi, calorie, battito e peso da Apple Salute, compresi i dati di Apple Watch o del wearable che sincronizzi con Salute.</p>`;
      if (!dates.length) return head + `<div class="empty"><strong>Nessun dato ancora</strong>Una web app non può leggere Salute da sola. Crea una volta il Comando Rapido "MTS Salute": copia i dati di oggi e tu li incolli qui con un tocco.</div>
        <div class="stack"><button class="btn" id="hguide2">Crea il Comando Rapido</button></div><div style="margin-top:10px">${buttons}</div>`;

      const last = dates[0], L = S.health[last];
      const tiles = METRICS.filter(m => L[m.k] != null).slice(0, 6)
        .map(m => `<div><b>${show(L[m.k], m)}</b><span>${esc(m.l)}${m.u ? ' (' + m.u + ')' : ''}</span></div>`).join('');

      const avail = METRICS.filter(m => dates.some(d => S.health[d][m.k] != null));
      if (!avail.some(m => m.k === chartK)) chartK = avail[0].k;
      const M = METRICS.find(m => m.k === chartK), tr = trainedOn();
      const days7 = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
      const vals = days7.map(d => S.health[d]?.[chartK]), mx = Math.max(1, ...vals.filter(v => v != null));
      const bars = days7.map((d, i) => `<div class="${i === 6 ? 'on' : ''}"><span>${vals[i] != null ? (M.int && vals[i] >= 10000 ? Math.round(vals[i] / 100) / 10 + 'k' : show(vals[i], M)) : ''}</span><i style="height:${(vals[i] || 0) / mx * 75}%"></i>${GIORNI[dow(d)].slice(0, 2)}${tr[d] ? '<em class="trn" title="Allenamento"></em>' : '<em class="trn off"></em>'}</div>`).join('');
      const avg = ds => { const v = ds.map(d => S.health[d]?.[chartK]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const a1 = avg(days7), a0 = avg(days7.map(d => addDays(d, -7)));
      const cmp = a1 != null && a0 ? (() => { const p = Math.round((a1 - a0) / a0 * 100); return ` · <span style="color:${p > 0 ? 'var(--ok)' : p < 0 ? 'var(--bad)' : 'var(--muted)'}">${p > 0 ? '+' : ''}${p}% sulla settimana prima</span>`; })() : '';
      const chips = avail.map(m => `<button class="wk ${m.k === chartK ? 'on' : ''}" data-hk="${m.k}">${esc(m.l)}</button>`).join('');

      const rows = dates.slice(0, 21).map(d => {
        const h = S.health[d], parts = METRICS.filter(m => h[m.k] != null).slice(0, 4).map(m => `${show(h[m.k], m)}${m.u ? ' ' + m.u : ' ' + m.l.toLowerCase()}`);
        const t = tr[d] ? `<div style="margin-top:6px"><span class="pill okp">Allenamento · Scheda ${esc([...tr[d]].join(', '))}</span></div>` : '';
        return `<button class="row" data-hd="${d}"><span class="grow"><div class="ti">${dayLabel(d)}</div><div class="de">${esc(parts.join(' · '))}</div>${t}</span><span class="chev">›</span></button>`;
      }).join('');

      return head + `<div class="sec">${dayLabel(last)}</div><div class="stats">${tiles}</div>
        <div class="sec">Ultimi 7 giorni</div><div class="weeks">${chips}</div>
        <div class="bars" style="grid-template-columns:repeat(7,1fr);margin-top:8px">${bars}</div>
        <p class="tiny" style="margin:8px 4px 0">${a1 != null ? `Media ${show(M.int ? Math.round(a1) : Math.round(a1 * 10) / 10, M)}${M.u ? ' ' + M.u : ''} al giorno${cmp}. ` : ''}Il pallino sotto il giorno indica un allenamento registrato.</p>
        <div class="sec">Aggiorna</div>${buttons}
        <div class="sec">Giorni</div><div class="group">${rows}</div>
        <p class="demo">I dati di Salute restano su questo iPhone e finiscono nel backup insieme alle schede.</p>`;
    },
    bind(el) {
      el.querySelector('#hpaste')?.addEventListener('click', () => pasteFromClipboard(ui));
      el.querySelector('#hfile')?.addEventListener('change', async ev => {
        const f = ev.target.files[0]; if (!f) return;
        report(ui, importHealth(await f.text()), 'Nel file non ci sono dati di Salute riconoscibili.');
      });
      el.querySelector('#hman')?.addEventListener('click', () => editDay(ui, today()));
      ['#hguide', '#hguide2'].forEach(s => el.querySelector(s)?.addEventListener('click', () => guide(ui)));
      el.querySelectorAll('[data-hk]').forEach(b => b.addEventListener('click', () => { chartK = b.dataset.hk; ui.redraw(); }));
      el.querySelectorAll('[data-hd]').forEach(b => b.addEventListener('click', () => editDay(ui, b.dataset.hd)));
    }
  };
}

function report(ui, res, emptyMsg) {
  if (!res.days.length) { pasteSheet(ui, emptyMsg); return false; }
  ui.closeSheet(); ui.redraw();
  ui.toast(res.days.length === 1 ? `Salute: ${dayLabel(res.days[0]).toLowerCase()} aggiornato` : `Salute: ${res.days.length} giorni importati`);
  return true;
}

async function pasteFromClipboard(ui) {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { /* permesso negato o non supportato */ }
  if (!text) { pasteSheet(ui, ''); return; }
  report(ui, importHealth(text), 'Negli appunti non ci sono dati di Salute. Esegui prima il Comando Rapido "MTS Salute", oppure incolla qui sotto.');
}

function pasteSheet(ui, msg) {
  ui.sheet(`<h2 style="margin:0 0 4px;font-size:22px">Incolla i dati</h2>
    <p class="sub" style="margin-bottom:0">Tieni premuto nel riquadro e scegli Incolla.</p>
    ${msg ? `<p class="err">${ui.esc(msg)}</p>` : ''}
    <div class="fld"><textarea id="hpt" rows="7" placeholder="data=2026-10-01&#10;passi=8234&#10;kcal_attive=512"></textarea></div>
    <div class="stack"><button class="btn" id="hpok">Importa</button><button class="btn ghost" data-close>Annulla</button></div>`, sh => {
    sh.querySelector('#hpok').addEventListener('click', () => {
      const res = importHealth(sh.querySelector('#hpt').value);
      if (!res.days.length) { const e = sh.querySelector('.err') || sh.querySelector('.sub').insertAdjacentElement('afterend', Object.assign(document.createElement('p'), { className: 'err' })); e.textContent = res.bad ? 'Non riesco a leggere la data. Usa il formato 2026-10-01.' : 'Non trovo dati: servono righe come passi=8234.'; return; }
      report(ui, res);
    });
  });
}

function editDay(ui, d) {
  const h = S.health[d] || {};
  ui.sheet(`<h2 style="margin:0 0 4px;font-size:22px">${S.health[d] ? 'Dati del giorno' : 'Inserisci a mano'}</h2>
    <div class="fld"><label for="hdate">Giorno</label><input type="date" id="hdate" value="${d}" max="${today()}" style="width:100%;box-sizing:border-box;padding:11px 12px;border:0;border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:16px"></div>
    <div class="hgrid">${METRICS.map(m => `<div class="fld"><label for="hm-${m.k}">${ui.esc(m.l)}${m.u ? ' (' + m.u + ')' : ''}</label><input type="text" id="hm-${m.k}" data-hm="${m.k}" inputmode="decimal" value="${h[m.k] != null ? show(h[m.k], { ...m, int: false }) : ''}"></div>`).join('')}</div>
    <div class="stack"><button class="btn" id="hsave">Salva</button>${S.health[d] ? '<button class="btn danger small" id="hdel">Elimina il giorno</button>' : ''}<button class="btn ghost small" data-close>Annulla</button></div>`, sh => {
    sh.querySelector('#hsave').addEventListener('click', () => {
      const nd = sh.querySelector('#hdate').value || d, v = {};
      sh.querySelectorAll('[data-hm]').forEach(i => { const m = BY_KEY[i.dataset.hm], x = i.value.trim() ? parseNum(i.value, m) : null; if (x != null) v[m.k] = x; });
      if (nd !== d) delete S.health[d];
      if (Object.keys(v).length) S.health[nd] = v; else delete S.health[nd];
      save(); ui.closeSheet(); ui.redraw(); ui.toast('Salvato');
    });
    sh.querySelector('#hdel')?.addEventListener('click', () => { delete S.health[d]; save(); ui.closeSheet(); ui.redraw(); ui.toast('Giorno eliminato'); });
  });
}

function guide(ui) {
  ui.sheet(`<h2 style="margin:0 0 4px;font-size:22px">Collega Apple Salute</h2>
    <p class="sub">Si fa una volta sola, nell'app <b>Comandi</b> dell'iPhone. Il comando legge Salute e passa i numeri a MTS. Funziona con Apple Watch e con i wearable che scrivono in Salute (Garmin, Amazfit, Polar, Withings, bilance smart…).</p>
    <ol class="guide">
      <li>Apri <b>Comandi</b>, tocca <b>+</b> e chiama il comando <b>MTS Salute</b>.</li>
      <li>Aggiungi l'azione <b>Trova campioni di Salute</b> (cerca "Salute"). Tipo: <b>Passi</b>. Filtro: <b>Data di inizio</b> è <b>Oggi</b>.</li>
      <li>Aggiungi <b>Calcola statistiche</b> e scegli <b>Somma</b>: è il totale dei passi di oggi.</li>
      <li>Ripeti i due passi per <b>Energia attiva</b> (somma) e <b>Distanza camminata + corsa</b> (somma). Se vuoi anche <b>Frequenza cardiaca a riposo</b> (media), <b>Energia a riposo</b> e <b>Minuti di esercizio</b> (somma). Per il <b>Peso</b>: ordina per data di inizio, dal più recente, limite 1.</li>
      <li>Aggiungi l'azione <b>Testo</b> e incollaci il modello qui sotto. Dopo ogni <b>=</b> inserisci la variabile giusta (la statistica dei passi dopo passi=, e così via). Dopo <b>data=</b> metti <b>Data corrente</b>. Le righe che non ti servono cancellale.</li>
      <li>Aggiungi <b>Copia negli appunti</b>. Fine.</li>
    </ol>
    <pre class="code">${TEMPLATE}</pre>
    <button class="btn ghost small" id="hcopy">Copia il modello</button>
    <div class="sec">Ogni volta</div>
    <p class="tiny" style="font-size:14px;margin:0 4px">Esegui <b>MTS Salute</b> (anche dal widget o chiedendo a Siri), poi apri MTS, vai su <b>Salute</b> e tocca <b>Incolla da Salute</b>. La prima volta iPhone ti chiede di consentire l'accesso a Salute.</p>
    <div class="sec">In automatico, senza pensarci</div>
    <p class="tiny" style="font-size:14px;margin:0 4px">Nel comando, dopo Testo, aggiungi <b>Aggiungi a file di testo</b> con il file <b>MTS-Salute.txt</b> in iCloud Drive. Poi in Comandi, scheda <b>Automazione</b>: <b>Ora del giorno</b>, alle 23:30, ogni giorno, <b>Esegui subito</b>, azione <b>Esegui comando MTS Salute</b>. Ogni sera il file si allunga di un giorno: quando vuoi, tocca <b>Importa file dal Comando Rapido</b> e scegli MTS-Salute.txt. I giorni già importati si aggiornano, non si duplicano.</p>
    <div class="stack"><button class="btn" data-close>Ho capito</button></div>`, sh => {
    sh.querySelector('#hcopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(TEMPLATE); ui.toast('Modello copiato'); } catch (e) { ui.toast('Tieni premuto sul modello per copiarlo'); }
    });
  });
}
