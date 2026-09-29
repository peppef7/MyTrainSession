// Prova la lettura di un PDF da riga di comando:
//   npm install pdfjs-dist@4.10.38 && node tools/test-parser.mjs scheda.pdf
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import { parsePlanPdf } from '../js/parser.js';

const file = process.argv[2];
if (!file) { console.error('Uso: node tools/test-parser.mjs scheda.pdf'); process.exit(1); }
const plan = await parsePlanPdf(pdfjs, new Uint8Array(fs.readFileSync(file)), file);
const { days, ...meta } = plan;
console.log(JSON.stringify(meta, null, 1));
for (const d of days) {
  console.log(`\n## Scheda ${d.id} · ${d.focus}${d.circuit ? ` · circuito ${d.circuit.rounds} giri` : ''}`);
  for (const e of d.ex) {
    console.log(` ${e.d} | ${e.n} | ${e.setup} | ${e.rest} | ${e.cue} | ${e.video || ''}`);
    if (e.weeks) console.log('   ', e.weeks.map(w => w ? `${w.sets}x${w.reps}${w.rir != null ? ' rir' + w.rir : ''}${w.bo ? ' BO' : ''}` : '-').join(' | '));
  }
}
