# Mario demo — ricevitore GraphXDico

Questo sito **simula Mario**, non GraphXDico.

- Ricevitore: **https://mario.meralab.it**
- Editor esterno: **https://graphxdico.it/**

L'utente apre GraphXDico dal pulsante della demo. L'editor legge la richiesta e restituisce immagine PNG/JPEG e tabelle JSON. La demo mostra i dati ricevuti, il JSON originale e gli eventuali errori. Non richiede il Mario locale e non accede ai suoi database.

## Coolify

Collega il repository, branch `main`, build pack **Dockerfile**, directory base `/`, file `/Dockerfile`, porta interna **80**. Assegna `https://mario.meralab.it` e fai **Redeploy/Rebuild**: rispetto alla prima versione il container usa ora PHP/Apache, non il vecchio sito Nginx statico. Il file Dockerfile include tutto. Nessun comando npm o database richiesto.

Variabili runtime già preimpostate, modificabili in Coolify:

```dotenv
PUBLIC_ORIGIN=https://mario.meralab.it
GRAPHXDICO_URL=https://graphxdico.it/
DEMO_DATA_DIR=/var/lib/mario-demo
```

Se l'editor reale è su una sottopagina, cambia `GRAPHXDICO_URL` con l'indirizzo preciso. `PUBLIC_ORIGIN` non ha barra finale. Il CORS autorizza soltanto l'origine dell'editor configurato. Nessun wildcard. Mantieni HTTPS e non aggiungere header che separino `window.opener` senza verificarne l'effetto.

`/healthz` risponde con JSON `status: ok`. `/demo/config` espone soltanto gli indirizzi pubblici, non segreti. Aprendo la home deve apparire **Mario demo / Ricevitore GraphXDico**, non l'editor di disegno della versione precedente.

Le sessioni durano 30 minuti, sono isolate da token e conservate fuori dalla cartella pubblica. Non serve un volume permanente: il redeploy può eliminare le sessioni di prova. Limiti di capienza e frequenza impediscono accumulo indefinito; i file scaduti vengono eliminati alle richieste successive. Usa esclusivamente dati dimostrativi. Non è un archivio né un servizio di produzione.

## Protocollo dell'editor

L'apertura aggiunge `?session=ID#token=TOKEN`. L'editor configura la propria origine Mario come `https://mario.meralab.it` e usa l'adapter consegnato in `integration/`.

- `GET /grafxdico/sessions/{id}/request`
- `POST /grafxdico/sessions/{id}/result` — multipart `manifest` JSON + `assets[id]`
- `POST /grafxdico/sessions/{id}/cancel`

Autenticazione `Authorization: Bearer TOKEN`; niente cookie Mario. Richiesta e risposta usano `mario.grafxdico`, versione 1. Il risultato completo viene confermato con 201/staged; il retry identico con 200/replayed. Dopo il successo l'editor invia `GRAFXDICO_DONE` via postMessage all'origine esatta e chiude. La demo interroga anche il server. La X non esporta.

Questa versione prova il percorso **multipart** dell'adapter, non l'import alternativo ZIP. Non replica i permessi, lock, revisioni storiche, stampa PDF e applicazione ai documenti del Mario completo. Verifica identità della richiesta, gruppo completo, tipi di colonna, file, MIME, dimensioni e SHA256. Il superamento di questo ricevitore dimostra lo scambio; non certifica tutte le validazioni del prodotto completo.

I valori delle tabelle sono prodotti da GraphXDico; per ora le colonne sono quelle nella richiesta. Un JSON con colonne diverse resta visibile come risultato rifiutato, per concordare l'adattamento: non viene dichiarato compatibile automaticamente.

## Controlli

- `PHP_BINARY=/percorso/php python tests/receiver.py`: API, token, origini, gruppo, PNG, retry, annullamento, scadenza. JPEG incluso quando è disponibile la fixture del contratto.
- `PHP_BINARY=/percorso/php CHROME_PATH=/percorso/chrome node tests/browser.mjs`: browser con editor esterno di prova, PNG/JPEG, tabelle, JSON, annullamento, desktop/mobile. Non contatta il vero GraphXDico.

PHP 8.4 e Chrome; nessuna libreria installata via npm. Gli artefatti temporanei sono in `.runtime/`, esclusa da Git. Il Dockerfile va costruito e verificato nell'ambiente di deploy.

## URL editor modificabile

La pagina contiene il campo Indirizzo di GraphXDico: inserire l’URL completo e avviare una nuova prova. L’ultimo URL usato resta nel solo browser (localStorage), non cambia altri utenti. GRAPHXDICO_URL è solo il valore iniziale. La sessione fissa l’origine CORS del destinatario selezionato; i token restano obbligatori. Nessuna richiesta dal server all’URL scelto. In HTTPS usare un editor HTTPS. Indicare l’URL finale, senza credenziali, frammenti # o parametri session/token. Le sottopagine e gli altri parametri query sono conservati.
