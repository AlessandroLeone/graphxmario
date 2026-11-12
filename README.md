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

Le sessioni scadono dopo 30 minuti di inattivita', sono isolate da token e conservate fuori dalla cartella pubblica. Non serve un volume permanente: il redeploy può eliminare le sessioni di prova. Limiti di capienza e frequenza impediscono accumulo indefinito; i file scaduti vengono eliminati alle richieste successive. Usa esclusivamente dati dimostrativi. Non è un archivio né un servizio di produzione.

## Protocollo dell'editor

L'apertura aggiunge `?session=ID#token=TOKEN`. L'editor configura la propria origine Mario come `https://mario.meralab.it` e usa l'adapter consegnato in `integration/`.

- `GET /grafxdico/sessions/{id}/request`
- `POST /grafxdico/sessions/{id}/result` — multipart `manifest` JSON + `assets[id]`
- `POST /grafxdico/sessions/{id}/cancel`

Autenticazione `Authorization: Bearer TOKEN`; niente cookie Mario. Richiesta e risposta usano `mario.grafxdico`, versione 1. Il risultato completo viene confermato con 201/staged; il retry identico con 200/replayed. Dopo il successo l'editor invia `GRAFXDICO_DONE` via postMessage all'origine esatta e resta aperto per altri invii. La demo interroga anche il server. La X non esporta.

Questa versione prova il percorso **multipart** dell'adapter, non l'import alternativo ZIP. Non replica i permessi, lock, revisioni storiche, stampa PDF e applicazione ai documenti del Mario completo. Verifica identità della richiesta, gruppo completo, tipi di colonna, file, MIME, dimensioni e SHA256. Il superamento di questo ricevitore dimostra lo scambio; non certifica tutte le validazioni del prodotto completo.

I valori delle tabelle sono prodotti da GraphXDico; per ora le colonne sono quelle nella richiesta. Un JSON con colonne diverse resta visibile come risultato rifiutato, per concordare l'adattamento: non viene dichiarato compatibile automaticamente.

## Controlli

- `PHP_BINARY=/percorso/php python tests/receiver.py`: API, token, origini, gruppo, PNG, retry, annullamento, scadenza. JPEG incluso quando è disponibile la fixture del contratto.
- `PHP_BINARY=/percorso/php CHROME_PATH=/percorso/chrome node tests/browser.mjs`: browser con editor esterno di prova, PNG/JPEG, tabelle, JSON, annullamento, desktop/mobile. Non contatta il vero GraphXDico.

PHP 8.4 e Chrome; nessuna libreria installata via npm. Gli artefatti temporanei sono in `.runtime/`, esclusa da Git. Il Dockerfile va costruito e verificato nell'ambiente di deploy.

## URL editor modificabile

La pagina contiene il campo Indirizzo di GraphXDico: inserire l’URL completo e avviare una nuova prova. L’ultimo URL usato resta nel solo browser (localStorage), non cambia altri utenti. GRAPHXDICO_URL è solo il valore iniziale. La sessione fissa l’origine CORS del destinatario selezionato; i token restano obbligatori. Nessuna richiesta dal server all’URL scelto. In HTTPS usare un editor HTTPS. Indicare l’URL finale, senza credenziali, frammenti # o parametri session/token. Le sottopagine e gli altri parametri query sono conservati.

## Invii successivi dalla stessa finestra

Ogni invio contiene una immagine PNG/JPEG e un solo manifest JSON con piu' tabelle. La sessione conserva una lista ordinata di deliveries, senza sovrascrivere gli invii precedenti. Il result_id rende idempotente il retry di uno stesso pacchetto; un nuovo lavoro usa un nuovo result_id. L'adapter non deve chiudere la finestra dopo l'invio: usare chiudiDopoInvio: false.

La chiusura della finestra viene osservata da Mario, che chiude la sessione via endpoint viewer autenticato /demo/sessions/{id}/close. Anche cancel dall'editor conclude la sessione conservando gli invii esistenti. Dopo la chiusura nuovi invii sono rifiutati. Il token resta valido durante la sessione: scadenza dopo 30 minuti di inattivita', rinnovata mentre la pagina resta in ascolto. Il limite dimostrativo e' 100 invii e 64 MiB di stato per sessione, con una immagine di massimo 10 MiB per invio. Non e' un archivio persistente: scaricare i dati prima di avviare un'altra sessione o chiudere Mario.

Il Mario completo non e' stato modificato: il flusso attuale e' a risultato singolo. Occorre adeguare sessione, append dei blocchi immagine+tabelle, persistenza e stampa. Questo lavoro sostituisce l'ipotesi NON pubblicata di N immagini in un unico invio.

## Tabelle native GraphXDico

Supportata l'estensione esplicita grafxdico_tabelle (id, titolo, colonne key/label, righe, livello/testo facoltativi) con riferimenti_url. I target possono contenere il formato grafxdico-tabella-v1, come nel payload reale ricevuto: le copie devono coincidere con la fonte e i riferimenti devono appartenere alla sessione. Non si accettano indiscriminatamente chiavi sconosciute.

L'adapter accetta tabelleNative al posto di tabelle e costruisce una singola rappresentazione canonica. Il renderer usa titoli/colonne originari e testo escapato. Non classifica un'unita' clima come materiale F1 solo perche' il vecchio target di trasporto aveva quel nome. La conversione nei moduli reali Mario rimane separata. L'immagine resta un file multipart assets[drawing-1], validato per MIME, dimensioni e SHA-256; il solo manifest non contiene l'immagine.
