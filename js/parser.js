// Legge una scheda PDF (tabella esportata da Excel: una pagina per "Scheda X",
// colonne Distretto / Esercizio / Video / Set Up / Tempo recupero / T.U.T,
// poi per ogni "Settim N" le colonne SERIE, REPS, %-RIR) e restituisce un piano.
// Funziona sia nel browser sia in Node: riceve la libreria pdf.js come parametro.

const GREY_MIN = 90, GREY_MAX = 170;

export async function parsePlanPdf(pdfjs, data, fileName = 'scheda.pdf') {
  const doc = await pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const H = page.getViewport({ scale: 1 }).height;
    const tc = await page.getTextContent();
    const items = tc.items
      .filter(it => it.str && it.str.trim())
      .map(it => {
        const x = it.transform[4], base = it.transform[5], h = Math.abs(it.transform[3]) || 8;
        return { s: it.str.trim(), x, w: it.width, cx: x + it.width / 2, y: H - base, base, h };
      });
    const greys = await greyRects(pdfjs, page);
    pages.push({ n, H, items, greys });
  }
  return buildPlan(pages, fileName);
}

// Rettangoli riempiti di grigio (le celle "back off")
async function greyRects(pdfjs, page) {
  const out = [];
  try {
    const ops = await page.getOperatorList();
    const O = pdfjs.OPS;
    let fill = null, pending = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.setFillRGBColor) {
        fill = typeof a === 'string' ? hexToRgb(a) : Array.isArray(a) ? a : a ? [a[0], a[1], a[2]] : null;
        if (typeof a?.[0] === 'string') fill = hexToRgb(a[0]);
      } else if (fn === O.constructPath) {
        pending = [];
        const [opsList, coords] = a;
        let c = 0;
        for (const op of opsList) {
          if (op === O.rectangle) { pending.push(coords.slice(c, c + 4)); c += 4; }
          else if (op === O.moveTo || op === O.lineTo) c += 2;
          else if (op === O.curveTo) c += 6;
          else if (op === O.curveTo2 || op === O.curveTo3) c += 4;
        }
      } else if (fn === O.fill || fn === O.eoFill || fn === O.fillStroke || fn === O.eoFillStroke) {
        if (fill && isGrey(fill)) for (const [x, y, w, h] of pending) out.push({ x0: Math.min(x, x + w), x1: Math.max(x, x + w), y0: Math.min(y, y + h), y1: Math.max(y, y + h) });
        pending = [];
      }
    }
  } catch (e) { /* senza colori non si riconosce il back off: non è bloccante */ }
  return out;
}
const hexToRgb = h => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ''); return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null; };
const isGrey = ([r, g, b]) => Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r >= GREY_MIN && r <= GREY_MAX;

const norm = s => s.replace(/\s+/g, ' ').trim();
const find = (items, re) => items.find(i => re.test(i.s));

function buildPlan(pages, fileName) {
  const plan = { title: '', trainer: '', client: '', validFrom: '', weeks: 0, fileName, notes: [], days: [] };
  const first = pages[0];
  if (first) {
    const lines = toLines(first.items);
    for (const l of lines) {
      let m;
      if (!plan.trainer && (m = /^(.*?)\s*PERSONAL\s+TRAINER/i.exec(l))) plan.trainer = titleCase(m[1]);
      if (!plan.validFrom && (m = /Valida\s+da:?\s*(\S+)/i.exec(l))) plan.validFrom = m[1];
      if (!plan.title && (m = /Schema:?\s*(.+)/i.exec(l))) plan.schema = m[1].trim();
      if (!plan.client && (m = /per:\s*(.+)/i.exec(l))) plan.client = titleCase(m[1]);
    }
  }
  const schemaParts = (plan.schema || '').split('/').map(s => s.trim()).filter(Boolean);
  plan.title = schemaParts.length ? schemaParts.map(sentenceCase).join(' / ') : fileName.replace(/\.pdf$/i, '').replace(/_/g, ' ');

  const seenNotes = new Set();
  for (const pg of pages) {
    const dayItem = find(pg.items, /^Scheda\s+[A-Z0-9]{1,2}$/i);
    if (!dayItem) continue;
    const dayId = dayItem.s.split(/\s+/)[1].toUpperCase();
    const blocks = noteBlocks(pg.items.filter(i => i.y < dayItem.y - 4));
    const dayNotes = [];
    for (const b of blocks) {
      if (/Scheda professionale|Valida da|Schema:|DI MEDIA|^VOL\b|PERSONAL TRAINER|^NOTE:?$/i.test(b)) continue;
      const key = b.toLowerCase();
      if (seenNotes.has(key)) continue;
      seenNotes.add(key);
      (plan.days.length === 0 ? plan.notes : dayNotes).push(cleanNote(b));
    }
    const day = parseTable(pg, dayItem, dayId);
    if (!day) continue;
    day.notes = dayNotes;
    plan.weeks = Math.max(plan.weeks, day.weekCount);
    delete day.weekCount;
    plan.days.push(day);
  }
  // Nomi dei giorni dallo schema (es. PUSH/PULL/FULL FOCUS ARM)
  const normal = plan.days.filter(d => !d.circuit);
  if (schemaParts.length === normal.length) normal.forEach((d, i) => d.focus = sentenceCase(schemaParts[i]));
  plan.days.forEach(d => { if (!d.focus) d.focus = d.circuit ? 'Circuito' : ''; });
  return plan;
}

function parseTable(pg, dayItem, dayId) {
  const it = pg.items.filter(i => i.y > dayItem.y - 2);
  const hEx = find(it, /^Esercizio$/i);
  if (!hEx) return null;
  const hDist = it.find(i => /^Distr/i.test(i.s)) || { cx: hEx.x - 40 };
  const hVid = find(it, /^Video/i), hSet = find(it, /^Set\s*Up/i), hRest = find(it, /^Tempo/i), hTut = find(it, /^T\.?U\.?T/i);
  const headerY = hEx.y;
  const serHeads = it.filter(i => /^SER$/i.test(i.s) && Math.abs(i.y - headerY) < 10).sort((a, b) => a.x - b.x);
  const weekStarts = serHeads.map(s => s.x - 3);
  const tableEnd = weekStarts[0] ?? Infinity;
  // colonne a sinistra: confini a metà tra i centri delle intestazioni
  const heads = [['dist', hDist], ['name', hEx], ['video', hVid], ['setup', hSet], ['rest', hRest], ['tut', hTut]].filter(([, h]) => h);
  const bounds = heads.map(([k, h], i) => ({ k, from: i ? (heads[i - 1][1].cx + h.cx) / 2 : -Infinity, to: i < heads.length - 1 ? (h.cx + heads[i + 1][1].cx) / 2 : tableEnd - 1 }));
  const colOf = i => { if (i.cx >= tableEnd - 1) return 'week'; return bounds.find(b => i.cx >= b.from && i.cx < b.to)?.k; };

  const body = it.filter(i => i.y > headerY + 7);
  // righe: una per ogni codice distretto (unisce "Cardi" + "o")
  let anchors = body.filter(i => colOf(i) === 'dist' && i.x < hEx.x).sort((a, b) => a.y - b.y);
  const merged = [];
  for (const a of anchors) {
    const last = merged[merged.length - 1];
    if (last && a.y - last.y < 12) { last.s += a.s; last.y2 = a.y; }
    else merged.push({ ...a, y2: a.y });
  }
  anchors = merged.map(a => ({ ...a, y: (a.y + a.y2) / 2 }));
  if (!anchors.length) return null;

  const ex = anchors.map(a => ({ d: normDist(a.s), n: '', video: '', setup: '', rest: '', cue: '', weeks: [], _y: a.y, _items: [] }));
  for (const i of body) {
    const c = colOf(i);
    if (c === 'dist' && i.x < hEx.x) continue;
    let best = -1, bd = 1e9;
    anchors.forEach((a, k) => { const d = Math.abs(i.y - a.y); if (d < bd) { bd = d; best = k; } });
    if (bd <= 11) ex[best]._items.push({ ...i, c });
    else if (c !== 'week') {
      // riga di nota sotto l'esercizio (es. "FAI FERMO IN BASSO")
      const above = anchors.map((a, k) => [a, k]).filter(([a]) => a.y < i.y).pop();
      if (above && !/^https?:|youtu/i.test(i.s)) ex[above[1]].cue = norm(ex[above[1]].cue + ' ' + i.s);
    }
  }
  let weekCount = weekStarts.length;
  for (const e of ex) {
    const by = c => e._items.filter(i => i.c === c).sort((a, b) => a.y - b.y || a.x - b.x);
    e.n = prettyName(by('name').map(i => i.s).join(''));
    e.video = cleanUrl(by('video').map(i => i.s).join(''));
    e.setup = sentenceCase(norm(by('setup').map(i => i.s).join(' ')));
    e.rest = prettyRest(by('rest').map(i => i.s).join(''));
    e.cue = e.cue ? sentenceCase(e.cue) : '';
    for (let w = 0; w < weekCount; w++) {
      const from = weekStarts[w], to = weekStarts[w + 1] ?? Infinity;
      const cellItems = e._items.filter(i => i.c === 'week' && i.x >= from && i.x < to).sort((a, b) => a.cx - b.cx || a.y - b.y);
      const cells = [];
      for (const ci of cellItems) {
        const last = cells[cells.length - 1];
        if (last && Math.abs(ci.cx - last.cx) < 5) { last.s += ci.s; last.items.push(ci); }
        else cells.push({ s: ci.s, cx: ci.cx, items: [ci] });
      }
      e.weeks.push(cellsToPrescription(cells, pg.greys));
    }
    delete e._y; delete e._items;
    if (!e.video) delete e.video;
  }
  const hasPresc = ex.some(e => e.weeks.some(Boolean));
  const day = { id: dayId, focus: '', ex, weekCount };
  if (!hasPresc) {
    ex.forEach(e => delete e.weeks);
    day.circuit = { rounds: 3 };
  }
  return day;
}

function cellsToPrescription(cells, greys) {
  if (!cells.length) return null;
  const sets = parseInt(cells[0].s, 10);
  let reps = '', rir = null, repsCells = [];
  if (cells.length >= 3) { repsCells = cells.slice(1, -1); rir = parseInt(cells[cells.length - 1].s, 10); }
  else repsCells = cells.slice(1);
  reps = norm(repsCells.map(c => c.s).join(' ')).replace(/^(\d+)_(\d+)$/, '$1–$2');
  const test = /^test/i.test(reps);
  const bo = repsCells.some(c => c.items.some(i => greys.some(g => i.cx >= g.x0 && i.cx <= g.x1 && i.base + 2 >= g.y0 && i.base + 2 <= g.y1)));
  const p = { sets: isNaN(sets) ? 1 : sets, reps };
  if (rir != null && !isNaN(rir)) p.rir = rir;
  if (test) p.test = true;
  if (bo) p.bo = true;
  return p;
}

// Raggruppa le scritte vicine in blocchi di testo (le note del trainer)
function noteBlocks(items) {
  const n = items.length, parent = items.map((_, i) => i);
  const root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = items[a], B = items[b];
    const dy = Math.abs(A.y - B.y);
    const overlapX = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
    const gapX = Math.max(A.x, B.x) - Math.min(A.x + A.w, B.x + B.w);
    if ((dy < 13 && overlapX > -2) || (dy < 3 && gapX < 8)) parent[root(a)] = root(b);
  }
  const groups = {};
  items.forEach((it, i) => (groups[root(i)] ||= []).push(it));
  return Object.values(groups)
    .map(g => toLines(g).join(' '))
    .map(norm)
    .filter(t => t.split(' ').length >= 3);
}
function toLines(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const i of sorted) {
    const l = lines[lines.length - 1];
    if (l && Math.abs(l.y - i.y) < 3) l.parts.push(i); else lines.push({ y: i.y, parts: [i] });
  }
  // sulla stessa altezza, scritte lontane tra loro sono righe diverse
  const out = [];
  for (const l of lines) {
    let cur = [];
    for (const p of l.parts.sort((a, b) => a.x - b.x)) {
      const prev = cur[cur.length - 1];
      if (prev && p.x - (prev.x + prev.w) > 30) { out.push(cur); cur = []; }
      cur.push(p);
    }
    out.push(cur);
  }
  return out.map(ps => norm(ps.map(p => p.s).join(' ')));
}

const DISTS = { S: 'S', P: 'P', Q: 'Q', E: 'E', D: 'D', T: 'T', B: 'B', TB: 'TB', A: 'A', C: 'C', G: 'G', Z: 'Z', CARDIO: 'C' };
const normDist = s => DISTS[s.toUpperCase()] || s.toUpperCase().slice(0, 3);
function prettyName(s) {
  s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (s === s.toUpperCase()) s = s.toLowerCase();
  s = s.replace(/\bdumbell\b/i, 'dumbbell').replace(/\bbilaciere\b/i, 'bilanciere').replace(/\bp\.90°/i, '90°');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prettyRest(s) {
  if (!s) return '';
  let m;
  if ((m = /da_?(\d+)'?a_?(\d+)'/i.exec(s))) return `${m[1]}'–${m[2]}'`;
  if (/jump/i.test(s)) return `${(/(\d+)'/.exec(s) || [, '2'])[1]}' + jump set ↓↓↓`;
  return s.replace(/_/g, ' ');
}
function cleanUrl(s) {
  if (!s) return '';
  s = s.replace(/\s+/g, '');
  if (/^\/+www\./i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  if (/^www\./i.test(s)) s = 'https://' + s;
  s = s.replace(/&feature=[^&]*$/i, '').replace(/[&?]$/, '');
  return /^https?:\/\//i.test(s) ? s : '';
}
const sentenceCase = s => { s = norm(s); if (!s) return s; if (s === s.toUpperCase()) s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const titleCase = s => norm(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
const cleanNote = s => sentenceCase(s.replace(/’/g, "'"));
