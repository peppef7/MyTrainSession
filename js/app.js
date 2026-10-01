import { S, save, addPlan, deletePlan, plan as getPlan, key, exportBackup, importBackup, askPersistence } from './store.js';
import { parsePlanPdf } from './parser.js';
import { healthView, homeRow, today } from './health.js';

const DIST = { S: 'Spalle', P: 'Petto', Q: 'Quadricipiti', E: 'Femorali', D: 'Dorsali', T: 'Centro schiena', B: 'Bicipiti', TB: 'Tricipiti', A: 'Addome', C: 'Cardio', G: 'Glutei', Z: 'Polpacci' };
const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = x => String(x).replace('.', ',');
const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };

/* ---------- Regole della scheda ---------- */
function presc(day, e, w) {
  if (day.circuit) return { sets: day.circuit.rounds, circuit: true };
  const p = e.weeks?.[w - 1] || e.weeks?.find(Boolean) || { sets: 1, reps: '' };
  return { ...p, bo: p.bo || e.bo };
}
const isTimed = (day, e) => day.circuit || /["”]/.test(e.weeks?.find(Boolean)?.reps || '');
function nSets(P, day, i, w) {
  const extra = S.log[key(P, w, day.id, i, 'x')] || 0;
  return presc(day, day.ex[i], w).sets + extra;
}
function exDone(P, day, i, w) { const n = nSets(P, day, i, w); let d = 0; for (let s = 0; s < n; s++) if (S.log[key(P, w, day.id, i, s)]?.done) d++; return [d, n]; }
function dayProgress(P, day, w) { let t = 0, d = 0; day.ex.forEach((e, i) => { const [a, n] = exDone(P, day, i, w); d += a; t += n; }); return [d, t]; }
const dayState = (P, day, w) => { const [d, t] = dayProgress(P, day, w); return d === 0 ? 'todo' : d >= t ? 'done' : 'partial'; };
const firstOpen = (P, day, w) => day.ex.findIndex((e, i) => { const [d, n] = exDone(P, day, i, w); return d < n; });
const exLeft = (P, day, w) => day.ex.filter((e, i) => { const [d, n] = exDone(P, day, i, w); return d < n; }).length;

/* ---------- Navigazione a pila ---------- */
const stack = [];
function push(view) {
  const el = document.createElement('section'); el.className = 'screen off-right';
  app.appendChild(el);
  const prev = stack[stack.length - 1];
  stack.push({ el, ...view });
  draw(stack.length - 1);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.remove('off-right'); prev && prev.el.classList.add('off-left'); }));
}
function pop() {
  if (stack.length < 2) return;
  const top = stack.pop(), prev = stack[stack.length - 1];
  top.el.classList.add('off-right'); prev.el.classList.remove('off-left');
  draw(stack.length - 1);
  setTimeout(() => top.el.remove(), 340);
}
function popToRoot() { while (stack.length > 1) { const t = stack.pop(); t.el.remove(); } stack[0].el.classList.remove('off-left'); draw(0); }
function draw(i) {
  const sc = stack[i]; const back = i > 0 ? stack[i - 1].title : null;
  const y = sc.el.querySelector('.scroll')?.scrollTop || 0;
  sc.el.innerHTML = `<div class="nav">${back ? `<button data-back aria-label="Indietro">‹ ${esc(back)}</button>` : '<span style="width:60px"></span>'}<span class="t">${esc(sc.title)}</span><span class="act" style="display:flex">${sc.action ? sc.action() : ''}</span></div><div class="scroll">${sc.render()}</div>`;
  const scr = sc.el.querySelector('.scroll'), t = sc.el.querySelector('.t');
  scr.scrollTop = y; scr.onscroll = () => t.style.opacity = scr.scrollTop > 40 ? 1 : 0;
  sc.el.querySelector('[data-back]')?.addEventListener('click', pop);
  sc.bind && sc.bind(sc.el);
}
const redraw = () => draw(stack.length - 1);

app.addEventListener('click', e => {
  const a = e.target.closest('[data-go]'); if (!a) return;
  const [what, arg, arg2] = a.dataset.go.split(':');
  if (what === 'plan') openPlan(arg);
  if (what === 'day') openDay(arg, arg2);
  if (what === 'import') openImport();
  if (what === 'report') openReport(arg);
  if (what === 'settings') openSettings();
  if (what === 'health') push(healthView({ esc, sheet, closeSheet, toast, redraw }));
  if (what === 'week') { const P = getPlan(arg); P.currentWeek = +arg2; save(); redraw(); }
});

/* ---------- Home: le mie schede ---------- */
function homeView() {
  return {
    title: 'Schede',
    action: () => `<button data-go="settings" aria-label="Impostazioni">Backup</button>`,
    render() {
      if (!S.plans.length) return `<h1>MyTrainSession</h1><p class="sub">Le tue schede, serie per serie.</p>
        <div class="empty"><strong>Nessuna scheda</strong>Carica il PDF che ti ha mandato il personal trainer: l'app riconosce giorni, esercizi, serie e ripetizioni.</div>
        <div class="stack"><button class="btn" data-go="import">＋ Carica scheda PDF</button><button class="btn ghost" id="sample">Usa la scheda di esempio</button></div>`;
      const act = getPlan(S.activePlanId);
      let res = '';
      if (act) {
        const w = act.currentWeek, open = act.days.filter(d => dayState(act, d, w) === 'partial');
        if (open.length) { const d = open[0]; res = `<button class="resume" data-go="day:${act.id}:${d.id}" style="width:100%;border:0;text-align:left;color:inherit;font:inherit;font-size:14px;cursor:pointer"><span class="grow"><b>Scheda ${esc(d.id)} da finire</b><br><span style="color:var(--muted)">Mancano ${exLeft(act, d, w)} esercizi. Riprendi da ${esc(d.ex[firstOpen(act, d, w)].n)}.</span></span><span class="chev">›</span></button>`; }
      }
      const rows = S.plans.map(p => `<button class="row" data-go="plan:${p.id}">
        <span class="pdf">PDF</span>
        <span class="grow"><div class="ti">${esc(p.title)}</div>
        <div class="de">${esc([p.trainer, p.validFrom && 'dal ' + p.validFrom].filter(Boolean).join(' · ') || p.fileName)}</div>
        <div style="margin-top:6px">${p.id === S.activePlanId ? '<span class="pill active">In uso</span>' : '<span class="pill">Archiviata</span>'} <span class="pill">${p.days.length} giorni · ${p.weeks || 1} settimane</span></div></span>
        <span class="chev">›</span></button>`).join('');
      const sub = act ? (() => { const w = act.currentWeek; const [d, t] = act.days.reduce((a, day) => { const [x, y] = dayProgress(act, day, w); return [a[0] + x, a[1] + y]; }, [0, 0]); return `Settimana ${w} di ${act.weeks}: ${d} serie su ${t} completate.`; })() : '';
      return `<h1>Le mie schede</h1><p class="sub">${esc(sub)}</p>${res}
        <div class="group" style="margin-top:${res ? 12 : 0}px">${rows}</div>
        <div style="margin-top:14px"><button class="btn ghost" data-go="import">＋ Carica scheda PDF</button></div>
        ${homeRow(esc)}`;
    },
    bind(el) {
      el.querySelector('#sample')?.addEventListener('click', async () => {
        const { default: sample } = await import('./sample-plan.js');
        addPlan(structuredClone(sample)); toast('Scheda di esempio aggiunta'); redraw();
      });
    }
  };
}

/* ---------- Giorni della scheda ---------- */
function weekBtns(P) {
  return Array.from({ length: P.weeks || 1 }, (_, i) => {
    const w = i + 1, test = P.days.some(d => d.ex.some(e => e.weeks?.[i]?.test));
    return `<button class="wk ${w === P.currentWeek ? 'on' : ''}" data-go="week:${P.id}:${w}">S${w}<small>${test ? 'test' : '&nbsp;'}</small></button>`;
  }).join('');
}
function openPlan(id) {
  const P = getPlan(id); if (!P) return;
  push({
    title: 'Schede',
    render() {
      const w = P.currentWeek;
      const days = P.days.map(day => {
        const [d, t] = dayProgress(P, day, w), st = dayState(P, day, w);
        const pill = st === 'done' ? '<span class="pill okp">Completata</span>' : st === 'partial' ? `<span class="pill todo">Da finire · mancano ${exLeft(P, day, w)} esercizi</span>` : '';
        return `<button class="row" data-go="day:${P.id}:${day.id}">
          <span class="badge">${esc(day.id)}</span>
          <span class="grow"><div class="ti">Scheda ${esc(day.id)}${day.focus ? ' · ' + esc(day.focus) : ''}</div>
          <div class="de">${day.ex.length} esercizi${day.circuit ? ' · ' + day.circuit.rounds + ' giri' : ''}</div>
          ${pill ? `<div style="margin-top:6px">${pill}</div>` : ''}
          <div class="prog" style="margin:8px 0 0"><i style="width:${t ? d / t * 100 : 0}%"></i></div></span>
          <span class="chev">›</span></button>`;
      }).join('');
      const notes = (P.notes || []).map(t => { const c = /back\s*off/i.test(t) ? 'var(--backoff)' : /rip\s*range/i.test(t) ? 'var(--hl)' : 'var(--line)'; return `<div class="note"><span class="sw" style="background:${c}"></span><span>${esc(t)}</span></div>`; }).join('');
      return `<h1>${esc(P.title)}</h1><p class="sub">${esc([P.trainer, P.validFrom && 'valida dal ' + P.validFrom].filter(Boolean).join(' · '))}</p>
        <div class="sec">Settimana</div><div class="weeks">${weekBtns(P)}</div>
        <div class="sec">Giorni di allenamento</div><div class="group">${days}</div>
        <div class="sec">Andamento</div><div class="group"><button class="row" data-go="report:${P.id}"><span class="badge" style="background:var(--accent);color:#fff;font-size:18px">↗</span><span class="grow"><div class="ti">Report settimana ${w}</div><div class="de">Progressi e regressi rispetto alla settimana ${w > 1 ? w - 1 : 'precedente'}</div></span><span class="chev">›</span></button></div>
        ${notes ? `<div class="sec">Note del trainer</div>${notes}` : ''}
        <div class="sec">Scheda</div>
        <div class="stack" style="margin-top:0">
          ${P.id !== S.activePlanId ? '<button class="btn ghost small" id="activate">Usa questa scheda</button>' : ''}
          <button class="btn danger small" id="del">Elimina scheda</button>
          <div id="delc" hidden class="note" style="display:block"><b>Eliminare "${esc(P.title)}"?</b><br>Spariscono anche tutte le serie e le note registrate.<div class="stack"><button class="btn danger small" id="del2">Elimina definitivamente</button><button class="btn ghost small" id="delno">Annulla</button></div></div>
        </div>
        <p class="demo">Importata da ${esc(P.fileName || 'PDF')}</p>`;
    },
    bind(el) {
      el.querySelector('#activate')?.addEventListener('click', () => { S.activePlanId = P.id; save(); toast('Scheda in uso'); redraw(); });
      el.querySelector('#del').addEventListener('click', () => { el.querySelector('#delc').hidden = false; });
      el.querySelector('#delno')?.addEventListener('click', () => { el.querySelector('#delc').hidden = true; });
      el.querySelector('#del2')?.addEventListener('click', () => { deletePlan(P.id); toast('Scheda eliminata'); popToRoot(); });
    }
  });
}

/* ---------- Esercizi del giorno ---------- */
function openDay(pid, did) {
  const P = getPlan(pid), day = P?.days.find(d => d.id === did); if (!day) return;
  push({ title: 'Scheda ' + day.id, render: () => dayView(P, day), bind: el => bindDay(el, P, day) });
}
function dayView(P, day) {
  const w = P.currentWeek, [d, t] = dayProgress(P, day, w);
  let vol = 0; day.ex.forEach((e, i) => { for (let s = 0; s < nSets(P, day, i, w); s++) { const v = S.log[key(P, w, day.id, i, s)]; if (v?.done && v.kg && v.r) vol += v.kg * v.r; } });
  const dn = day.notes?.length ? day.notes.map(n => `<div class="note"><span class="sw" style="background:var(--hl)"></span><span>${esc(n)}</span></div>`).join('') : '';
  const test = day.ex.some(e => e.weeks?.[w - 1]?.test);
  const res = dayState(P, day, w) === 'partial' ? `<div class="resume"><span class="grow"><b>Allenamento lasciato a metà</b><br><span style="color:var(--muted)">Mancano ${exLeft(P, day, w)} esercizi. Riprendi da ${esc(day.ex[firstOpen(P, day, w)].n)}.</span></span><button id="resume">Riprendi</button></div>` : '';
  return `<h1>Scheda ${esc(day.id)}</h1><p class="sub">${esc(day.focus || '')}${day.focus ? ' · ' : ''}settimana ${w}${test ? ' (serie test)' : ''}</p>
    <div class="stats"><div><b>${d}/${t}</b><span>serie fatte</span></div><div><b>${Math.round(vol).toLocaleString('it-IT')}</b><span>kg sollevati</span></div><div><b>${day.ex.filter((e, i) => { const [a, n] = exDone(P, day, i, w); return a >= n; }).length}/${day.ex.length}</b><span>esercizi fatti</span></div></div>
    <div class="prog" style="margin-top:12px"><i style="width:${t ? d / t * 100 : 0}%"></i></div>
    ${res}${dn}${day.ex.map((e, i) => exCard(P, day, e, i, w)).join('')}
    <div style="margin-top:18px"><button class="btn" id="finish">Salva e chiudi</button></div>
    <p class="demo">Ogni serie si salva appena la scrivi. Se chiudi a metà, la prossima volta riparti dagli esercizi che mancano.</p>`;
}
function exCard(P, day, e, i, w) {
  const p = presc(day, e, w), n = nSets(P, day, i, w), [dn] = exDone(P, day, i, w), complete = dn >= n, ok = key(P, w, day.id, i, 'o');
  const unit = isTimed(day, e) ? 'sec' : 'reps';
  const note = S.notes[key(P, w, day.id, i, 'n')] || '', pnote = w > 1 ? S.notes[key(P, w - 1, day.id, i, 'n')] : '';
  const dist = DIST[e.d] || e.d;
  const head = `<div class="ex-h${complete ? ' tg' : ''}" ${complete ? `data-tg="${ok}"` : ''}><span class="dist" title="${esc(dist)}">${esc(e.d)}</span><div class="grow" style="min-width:0">
    <div class="ex-n">${esc(e.n)}</div><div style="font-size:13px;color:var(--muted)">${esc(dist)}${e.setup ? ' · ' + esc(e.setup) : ''}</div></div>${complete ? `<span class="chev">${S.open[ok] ? '⌃' : '⌄'}</span>` : ''}</div>`;
  if (complete && !S.open[ok]) {
    const sets = []; for (let s = 0; s < n; s++) { const v = S.log[key(P, w, day.id, i, s)]; sets.push(`${fmt(v.kg ?? 0)}×${v.r ?? '–'}`); }
    return `<article class="ex complete" id="ex-${i}">${head}<div class="sumline">✓ ${sets.join(' · ')} <small>${note ? '· nota salvata ' : ''}· tocca per modificare</small></div></article>`;
  }
  const chips = p.circuit ? `<span class="hl">${day.circuit.rounds} giri</span>` :
    `<span class="hl">${p.sets} × ${esc(p.reps)}</span>${p.rir != null ? `<span>RIR ${p.rir}</span>` : ''}${e.rest ? `<span>Recupero ${esc(e.rest)}</span>` : ''}${p.bo ? '<span class="bo">Ultima back off −20%</span>' : ''}`;
  let rows = '';
  for (let s = 0; s < n; s++) {
    const v = S.log[key(P, w, day.id, i, s)] || {}, pv = w > 1 ? S.log[key(P, w - 1, day.id, i, s)] : null;
    const isBo = p.bo && s === p.sets - 1;
    rows += `<tr class="${v.done ? 'done' : ''}" data-i="${i}" data-s="${s}">
      <td><span class="sn ${isBo ? 'bo' : ''}" title="${isBo ? 'Back off' : ''}">${day.circuit ? 'G' : ''}${s + 1}</span></td>
      <td class="prev">${pv && pv.kg != null ? `${fmt(pv.kg)} × ${pv.r ?? '–'}` : '–'}</td>
      <td><input id="kg-${day.id}-${i}-${s}" inputmode="decimal" enterkeyhint="next" placeholder="${pv?.kg != null ? fmt(pv.kg) : 'kg'}" value="${v.kg != null ? fmt(v.kg) : ''}" data-f="kg" aria-label="Carico serie ${s + 1} in kg"></td>
      <td><input id="r-${day.id}-${i}-${s}" inputmode="numeric" enterkeyhint="done" placeholder="${pv?.r ?? unit}" value="${v.r ?? ''}" data-f="r" aria-label="${unit} serie ${s + 1}"></td>
      <td><button class="chk" data-f="done" aria-label="Serie ${s + 1} fatta">✓</button></td></tr>`;
  }
  return `<article class="ex" id="ex-${i}">${head}
    <div class="presc">${chips}</div>
    ${e.cue ? `<div class="cue">“${esc(e.cue)}”</div>` : ''}
    <table class="sets"><thead><tr><th>${day.circuit ? 'Giro' : 'Serie'}</th><th>Prec.</th><th>Kg</th><th>${unit === 'sec' ? 'Sec' : 'Reps'}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <button class="addset" data-add="${i}">＋ Aggiungi serie</button>
    <div class="nt"><label for="note-${day.id}-${i}">Note</label>
    <textarea id="note-${day.id}-${i}" data-note="${i}" rows="2" placeholder="Es. sedile al buco 4, presa larga, fastidio al gomito…">${esc(note)}</textarea>
    ${pnote ? `<div class="pn">Settimana ${w - 1}: ${esc(pnote)}</div>` : ''}</div>
    <div class="links">${e.video ? `<a class="vid" href="${esc(e.video)}" target="_blank" rel="noopener">▶ Video esecuzione</a>` : ''}<button class="edit" data-edit="${i}">Modifica esercizio</button></div></article>`;
}
function bindDay(el, P, day) {
  const w = P.currentWeek;
  el.querySelectorAll('.sets input').forEach(inp => inp.addEventListener('change', () => {
    const tr = inp.closest('tr'), k = key(P, w, day.id, tr.dataset.i, tr.dataset.s);
    const v = S.log[k] || (S.log[k] = {}); v[inp.dataset.f] = num(inp.value); save();
  }));
  el.querySelectorAll('[data-note]').forEach(ta => ta.addEventListener('input', () => { const k = key(P, w, day.id, ta.dataset.note, 'n'); const t = ta.value.trim(); if (t) S.notes[k] = t; else delete S.notes[k]; save(); }));
  el.querySelectorAll('[data-tg]').forEach(h => h.addEventListener('click', () => { S.open[h.dataset.tg] = !S.open[h.dataset.tg]; save(); redraw(); }));
  el.querySelectorAll('.chk').forEach(b => b.addEventListener('click', () => {
    const tr = b.closest('tr'), i = +tr.dataset.i, k = key(P, w, day.id, i, tr.dataset.s);
    const v = S.log[k] || (S.log[k] = {});
    tr.querySelectorAll('input').forEach(inp => { if (inp.value === '' && /^[\d,.]+$/.test(inp.placeholder)) inp.value = inp.placeholder; v[inp.dataset.f] = num(inp.value); });
    v.done = v.done ? 0 : 1;
    if (v.done) v.at = today(); // giorno dell'allenamento, per la schermata Salute
    const [d, n] = exDone(P, day, i, w); if (d >= n) delete S.open[key(P, w, day.id, i, 'o')];
    save(); redraw();
    if (v.done) startTimer(day.circuit ? 90 : restSeconds(day.ex[i].rest), day.ex[i].n);
  }));
  el.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { const k = key(P, w, day.id, b.dataset.add, 'x'); S.log[k] = (S.log[k] || 0) + 1; save(); redraw(); }));
  el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editExercise(P, day, +b.dataset.edit)));
  el.querySelector('#resume')?.addEventListener('click', () => { el.querySelector(`#ex-${firstOpen(P, day, w)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  el.querySelector('#finish').addEventListener('click', () => { const [d, t] = dayProgress(P, day, w); toast(d >= t ? `Scheda ${day.id} completata` : `Salvato: riprendi quando vuoi (${d}/${t} serie)`); stopTimer(); pop(); });
}
const restSeconds = r => { const m = /(\d+)'/.exec(r || ''); return m ? Math.min(+m[1], 5) * 60 : 120; };

/* ---------- Modifica esercizio (per correggere la lettura del PDF) ---------- */
function editExercise(P, day, i) {
  const e = day.ex[i];
  sheet(`<h2 style="margin:0 0 4px;font-size:22px">Modifica esercizio</h2>
    <p class="sub" style="margin-bottom:0">Correggi quello che l'app ha letto dal PDF. Vale per tutte le settimane.</p>
    <div class="fld"><label for="e-n">Nome</label><input type="text" id="e-n" value="${esc(e.n)}"></div>
    <div class="fld"><label for="e-v">Link video</label><input type="url" id="e-v" value="${esc(e.video || '')}" placeholder="https://www.youtube.com/…"></div>
    <div class="fld"><label for="e-r">Recupero</label><input type="text" id="e-r" value="${esc(e.rest || '')}" placeholder="2'–3'"></div>
    <div class="fld"><label for="e-c">Indicazioni del trainer</label><input type="text" id="e-c" value="${esc(e.cue || '')}"></div>
    ${day.circuit ? '' : `<div class="fld check"><input type="checkbox" id="e-b" ${e.bo || e.weeks?.some(x => x?.bo) ? 'checked' : ''}><label for="e-b">Ultima serie in back off (−20%)</label></div>`}
    <div class="stack"><button class="btn" id="e-save">Salva</button><button class="btn ghost" data-close>Annulla</button></div>`, sh => {
    sh.querySelector('#e-save').addEventListener('click', () => {
      e.n = sh.querySelector('#e-n').value.trim() || e.n;
      const v = sh.querySelector('#e-v').value.trim(); if (v && /^https?:\/\//i.test(v)) e.video = v; else delete e.video;
      e.rest = sh.querySelector('#e-r').value.trim();
      e.cue = sh.querySelector('#e-c').value.trim();
      const b = sh.querySelector('#e-b');
      if (b) { e.bo = b.checked; if (!b.checked) e.weeks?.forEach(x => x && delete x.bo); }
      save(); closeSheet(); redraw(); toast('Esercizio aggiornato');
    });
  });
}

/* ---------- Report settimanale ---------- */
function exStats(P, day, i, w) {
  const n = nSets(P, day, i, w); let maxKg = null, best = null, reps = 0, vol = 0, c = 0;
  for (let s = 0; s < n; s++) {
    const v = S.log[key(P, w, day.id, i, s)]; if (!v?.done || v.r == null) continue; c++;
    const kg = v.kg ?? 0; reps += v.r; vol += kg * v.r;
    if (maxKg == null || kg > maxKg) { maxKg = kg; best = v.r; } else if (kg === maxKg && v.r > best) best = v.r;
  }
  return c ? { maxKg, best, reps, vol } : null;
}
const weekTot = (P, w, f) => P.days.reduce((a, day) => a + day.ex.reduce((b, e, i) => b + (exStats(P, day, i, w)?.[f] || 0), 0), 0);
function dlt(a, b, u = '') { const d = Math.round((a - b) * 10) / 10; return `<span class="dl ${d > 0 ? 'up' : d < 0 ? 'down' : 'eq'}">${d > 0 ? '+' : ''}${fmt(d)}${u}</span>`; }
function pct(a, b, pw) { if (!b) return ''; const p = Math.round((a - b) / b * 100); return `<div class="d" style="color:${p > 0 ? 'var(--ok)' : p < 0 ? 'var(--bad)' : 'var(--muted)'}">${p > 0 ? '+' : ''}${p}% vs S${pw}</div>`; }
function openReport(pid) {
  const P = getPlan(pid);
  push({
    title: 'Giorni',
    render() {
      const w = P.currentWeek, pw = w - 1; let up = 0, down = 0, eq = 0;
      const sections = P.days.map(day => {
        const rows = day.ex.map((e, i) => {
          const c = exStats(P, day, i, w), p = pw > 0 ? exStats(P, day, i, pw) : null;
          let cls = 'na', ico = '·', m;
          if (!c) m = 'Non ancora fatto questa settimana';
          else if (!p) m = `<b>${fmt(c.maxKg)} kg × ${c.best}</b> · nessun dato in S${pw || '–'}`;
          else {
            const dk = c.maxKg - p.maxKg, dr = c.best - p.best;
            cls = dk > 0 || (dk === 0 && dr > 0) ? 'up' : dk < 0 || (dk === 0 && dr < 0) ? 'down' : 'eq';
            ico = cls === 'up' ? '↑' : cls === 'down' ? '↓' : '=';
            if (cls === 'up') up++; else if (cls === 'down') down++; else eq++;
            m = `Carico max <b>${fmt(p.maxKg)} → ${fmt(c.maxKg)} kg</b>${dlt(c.maxKg, p.maxKg, ' kg')}<br>Reps serie migliore <b>${p.best} → ${c.best}</b>${dlt(c.best, p.best)} · reps totali ${p.reps} → ${c.reps}`;
          }
          const nt = S.notes[key(P, w, day.id, i, 'n')];
          return `<div class="rrow"><span class="ico ${cls}">${ico}</span><div class="grow" style="min-width:0"><div style="font-weight:600">${esc(e.n)}</div><div class="m">${m}</div>${nt ? `<div class="m" style="font-style:italic">“${esc(nt)}”</div>` : ''}</div></div>`;
        }).join('');
        return `<div class="sec">Scheda ${esc(day.id)}${day.focus ? ' · ' + esc(day.focus) : ''}</div><div class="group">${rows}</div>`;
      }).join('');
      const vols = Array.from({ length: P.weeks || 1 }, (_, i) => weekTot(P, i + 1, 'vol')), mx = Math.max(1, ...vols);
      const bars = vols.map((v, i) => `<div class="${i + 1 === w ? 'on' : ''}"><span>${v ? Math.round(v / 100) / 10 + 't' : ''}</span><i style="height:${v / mx * 80}%"></i>S${i + 1}</div>`).join('');
      const v = vols[w - 1], pv = pw > 0 ? vols[pw - 1] : 0, r = weekTot(P, w, 'reps'), pr = pw > 0 ? weekTot(P, pw, 'reps') : 0;
      const testNow = P.days.some(d => d.ex.some(e => e.weeks?.[w - 1]?.test)), testPrev = pw > 0 && P.days.some(d => d.ex.some(e => e.weeks?.[pw - 1]?.test));
      return `<h1>Report settimana ${w}</h1><p class="sub">Confronto con la settimana ${pw || 'precedente'}${testNow || testPrev ? '. Settimana di test: poche serie, i totali non sono confrontabili, guarda soprattutto il carico.' : ''}</p>
        <div class="weeks">${weekBtns(P)}</div>
        <div class="stats" style="margin-top:12px"><div><b>${Math.round(v).toLocaleString('it-IT')}</b><span>kg volume</span>${pct(v, pv, pw)}</div><div><b>${r}</b><span>ripetizioni</span>${pct(r, pr, pw)}</div><div><b><i style="font-style:normal;color:var(--ok)">${up}↑</i> <i style="font-style:normal;color:var(--bad)">${down}↓</i></b><span>${eq} stabili</span></div></div>
        <div class="sec">Volume per settimana (kg × reps)</div><div class="bars" style="grid-template-columns:repeat(${vols.length},1fr)">${bars}</div>
        ${sections}
        <p class="demo">↑ progresso: più carico, oppure stesso carico con più ripetizioni. ↓ regresso: il contrario.</p>`;
    }
  });
}

/* ---------- Import PDF ---------- */
let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
function openImport() {
  sheet(`<h2 style="margin:0 0 4px;font-size:22px">Carica scheda</h2>
    <p class="sub" style="margin-bottom:14px">Scegli il PDF del trainer da File, Mail o WhatsApp. L'app riconosce giorni, esercizi, serie e ripetizioni.</p>
    <label class="drop" for="pdfin" id="drop"><strong>Scegli PDF</strong>la lettura avviene sul telefono, il file non viene inviato a nessuno</label>
    <input type="file" id="pdfin" accept="application/pdf,.pdf" hidden>
    <ul class="steps" id="steps" hidden></ul><div id="out"></div>
    <div class="stack"><button class="btn ghost" data-close>Annulla</button></div>`, sh => {
    sh.querySelector('#pdfin').addEventListener('change', async ev => {
      const f = ev.target.files[0]; if (!f) return;
      const st = sh.querySelector('#steps'), out = sh.querySelector('#out');
      sh.querySelector('#drop').hidden = true; st.hidden = false;
      const step = (t, ok) => st.insertAdjacentHTML('beforeend', `<li class="${ok ? 'ok' : ''}"><i>${ok ? '✓' : ''}</i>${esc(t)}</li>`);
      try {
        step('Lettura di ' + f.name, true);
        const lib = await loadPdfjs();
        const plan = await parsePlanPdf(lib, new Uint8Array(await f.arrayBuffer()), f.name);
        if (!plan.days.length) throw new Error('Non ho trovato nessuna tabella "Scheda A, B, …" in questo PDF.');
        const nEx = plan.days.reduce((a, d) => a + d.ex.length, 0);
        step(`Trovati ${plan.days.length} giorni e ${nEx} esercizi su ${plan.weeks || 1} settimane`, true);
        out.innerHTML = `<div class="group" style="margin-top:14px">${plan.days.map(d => `<div class="row" style="cursor:default"><span class="badge">${esc(d.id)}</span><span class="grow"><div class="ti">${esc(d.focus || 'Scheda ' + d.id)}</div><div class="de">${d.ex.map(e => esc(e.n)).join(', ')}</div></span></div>`).join('')}</div>
          <p class="tiny" style="margin-top:8px">Se qualcosa è letto male potrai correggerlo con "Modifica esercizio".</p>
          <div class="stack"><button class="btn" id="keep">Salva scheda</button></div>`;
        out.querySelector('#keep').addEventListener('click', () => { const p = addPlan(plan); closeSheet(); popToRoot(); openPlan(p.id); toast('Scheda salvata'); });
      } catch (err) {
        console.error(err);
        out.innerHTML = `<p class="err">${esc(err.message || 'Non sono riuscito a leggere questo PDF.')} Controlla che sia la scheda esportata dal trainer e riprova.</p>`;
        sh.querySelector('#drop').hidden = false; ev.target.value = '';
      }
    });
  });
}

/* ---------- Backup ---------- */
function openSettings() {
  push({
    title: 'Schede',
    render: () => `<h1>Backup</h1><p class="sub">I dati restano su questo iPhone. Esporta un backup ogni tanto e salvalo su Drive o su File: ti serve se cambi telefono o cancelli l'app.</p>
      <div class="stack"><button class="btn" id="exp">Esporta backup</button>
      <label class="btn ghost" for="impf">Ripristina da backup</label><input type="file" id="impf" accept="application/json,.json" hidden></div>
      <div id="bmsg"></div>
      <p class="demo">MyTrainSession · ${S.plans.length} schede · ${Object.values(S.log).filter(v => v?.done).length} serie registrate</p>`,
    bind(el) {
      el.querySelector('#exp').addEventListener('click', async () => {
        const blob = exportBackup(), name = `MyTrainSession-backup-${new Date().toISOString().slice(0, 10)}.json`;
        const file = new File([blob], name, { type: 'application/json' });
        try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e.name === 'AbortError') return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      });
      el.querySelector('#impf').addEventListener('change', async ev => {
        const f = ev.target.files[0]; if (!f) return;
        try { importBackup(await f.text()); toast('Backup ripristinato'); popToRoot(); }
        catch (e) { el.querySelector('#bmsg').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      });
    }
  });
}

/* ---------- Timer di recupero, toast, fogli ---------- */
let tmr = null, tEl = null, endAt = 0;
function startTimer(sec, name) {
  stopTimer(); endAt = Date.now() + sec * 1000;
  tEl = document.createElement('div'); tEl.className = 'timer';
  const paint = () => { const left = Math.max(0, Math.round((endAt - Date.now()) / 1000)); tEl.innerHTML = `<b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b><span class="grow">Recupero · ${esc(name)}</span><button data-p>+30"</button><button data-x>Salta</button>`; return left; };
  paint(); app.appendChild(tEl);
  tEl.addEventListener('click', e => { if (e.target.dataset.p != null) { endAt += 30000; paint(); } if (e.target.dataset.x != null) stopTimer(); });
  tmr = setInterval(() => { if (paint() <= 0) { stopTimer(); toast('Recupero finito, vai!'); try { navigator.vibrate?.(300); } catch (e) { } } }, 500);
}
function stopTimer() { clearInterval(tmr); tEl?.remove(); tEl = null; }
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; app.appendChild(t); setTimeout(() => t.remove(), 2200); }
let sheetEls = null;
function sheet(html, bind) {
  closeSheet();
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.innerHTML = '<div class="grab"></div>' + html;
  app.append(scrim, sh); sheetEls = [scrim, sh];
  scrim.onclick = closeSheet; sh.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
  bind && bind(sh);
}
function closeSheet() { sheetEls?.forEach(x => x.remove()); sheetEls = null; }

/* ---------- Avvio ---------- */
askPersistence();
push(homeView());
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai|claudeusercontent/.test(location.host)) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
