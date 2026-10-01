# MyTrainSession (MTS)

Web app per iPhone: carichi il PDF della scheda del personal trainer, scegli la scheda, il giorno (Scheda A, B, C…) e la settimana, e registri per ogni serie carico (kg) e ripetizioni. Funziona offline e i dati restano sul telefono.

## Cosa fa
- **Carica scheda PDF**: legge sul telefono le tabelle "Scheda A/B/C/D" (esercizio, distretto, video, set up, recupero e, per ogni settimana, serie × ripetizioni e RIR). Riconosce anche le serie grigie in back off.
- **Giorni e settimane**: selettore S1–S8. Le settimane di test (una sola serie "Test N") sono segnate.
- **Serie**: kg e ripetizioni per ogni serie, con il valore della settimana precedente accanto. Con la spunta parte il timer di recupero.
- **Note** per ogni esercizio e settimana, con la nota della settimana prima.
- **Ripresa**: ogni serie si salva subito. Se lasci una scheda a metà, l'app ti riporta al primo esercizio che manca.
- **Report settimanale**: volume e ripetizioni rispetto alla settimana prima, grafico S1–S8, e per ogni esercizio il carico massimo e le ripetizioni della serie migliore (↑ progresso, ↓ regresso).
- **Modifica esercizio**: serve a correggere quello che è stato letto male dal PDF (nome, video, recupero, back off).
- **Salute**: passi, calorie attive e a riposo, distanza, minuti di esercizio, battito a riposo, peso e sonno da Apple Salute (quindi anche da Apple Watch e dai wearable che scrivono in Salute). Grafico degli ultimi 7 giorni con i giorni di allenamento segnati.
- **Backup**: esporta e ripristina un file .json, da salvare su Drive o su File.

## Installarla sull'iPhone
Una web app va messa online su un indirizzo https. Dopo, dall'iPhone:
1. apri l'indirizzo con **Safari**;
2. tocca **Condividi** e poi **Aggiungi alla schermata Home**;
3. apri MTS dalla Home: si apre a tutto schermo e funziona anche senza rete.

Due modi gratuiti per metterla online:
- **GitHub Pages**: questo repository è già pronto. In Settings > Pages scegli "Deploy from a branch", branch `main`, cartella `/ (root)`. L'app sarà su https://peppef7.github.io/MyTrainSession/
- **Netlify Drop**: da un computer apri https://app.netlify.com/drop e trascina la cartella. Per tenere il sito online devi creare un account gratuito.

## Collegare Apple Salute
Una web app non può leggere Salute direttamente (Apple lo permette solo alle app native). I dati li porta un Comando Rapido di iOS, "MTS Salute", che si crea una volta sola nell'app Comandi: legge i valori di oggi, li scrive come testo (`data=…`, `passi=…`, `kcal_attive=…`) e li copia negli appunti. In MTS si tocca **Salute > Incolla da Salute**. Le istruzioni passo passo sono nell'app (**Come collegare Salute**).

Per non doverci pensare, il comando può anche aggiungere ogni sera i dati a un file `MTS-Salute.txt` in iCloud Drive, con un'automazione "Ora del giorno". Il file si importa quando vuoi con **Importa file dal Comando Rapido**: ogni giorno viene aggiornato, non duplicato.

## I dati
Serie, note e schede sono salvate nel browser della web app installata. Se cancelli l'app dalla Home, i dati vengono cancellati: esporta ogni tanto un backup (pulsante **Backup** nella schermata iniziale).

## File
- `index.html`, `manifest.webmanifest`, `sw.js`: la pagina, i dati per l'installazione e la cache offline
- `css/app.css`: grafica
- `js/app.js`: schermate
- `js/store.js`: salvataggio e backup
- `js/parser.js`: lettura del PDF
- `js/health.js`: schermata Salute e lettura dei dati del Comando Rapido
- `js/sample-plan.js`: la scheda di esempio (Marcello Manghisi, dal 17/03/26)
- `vendor/`: libreria pdf.js 4.10.38 (Mozilla, licenza Apache 2.0) per leggere i PDF
- `icons/`: icona dell'app
