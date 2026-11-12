# GraphXDico — demo per Mario

Editor dimostrativo statico: Mario apre una finestra, la demo restituisce insieme un disegno PNG/JPEG e le tabelle richieste. Mario mostra l'anteprima e applica i dati solo dopo la conferma dell'utente.

## Pubblicazione con Coolify

1. Collega questo repository e il branch `main`.
2. Scegli il build pack **Dockerfile**, directory base `/`, file `/Dockerfile` e porta interna **80**.
3. Assegna un dominio **HTTPS** con certificato valido e avvia il deploy.
4. `/healthz` deve rispondere `ok`. La pagina dell'editor è `/index.html`.

Non servono Node, PHP, database o comandi di build aggiuntivi. Il Dockerfile usa Nginx e include soltanto `public/`. Per il deploy automatico sui nuovi commit occorre configurare in Coolify l'integrazione GitHub/webhook e abilitare Auto Deploy.

## Configurazione obbligatoria

Prima del collegamento, sostituisci entrambe le occorrenze di `https://mario.example.invalid` in `public/config/graphxdico.config.json` con l'origine esatta del **Client Mario** (protocollo, dominio ed eventuale porta, senza percorso e senza barra finale). Non è l'indirizzo di Central né della demo. Il file è pubblico: non inserirvi segreti.

Ogni modifica del file richiede commit e nuovo deploy dell'immagine.

Nel `.env` del Client Mario configura:

```dotenv
GRAFXDICO_URL=https://DOMINIO-DELLA-DEMO/index.html
GRAFXDICO_ALLOWED_ORIGINS=https://DOMINIO-DELLA-DEMO
GRAFXDICO_FIXTURE=false
```

Usa l'origine esatta, mai `*`. La demo aperta senza sessione invita ad aprirla da Mario: è previsto. Il collegamento dal sito pubblico verso un Mario locale richiede una prova reale dei permessi di rete del browser; non disabilitarne le protezioni.

## Uso

Dal documento Mario apri GraphXDico, prepara disegno e righe, quindi premi **Esporta verso Mario**. Dopo la ricezione la finestra si chiude; in Mario verifica l'anteprima e premi **Applica**. La X senza esportazione non invia dati. Le colonne accettate arrivano dalla richiesta di Mario; i valori sono prodotti dall'editor. Non sono supportate automaticamente colonne aggiuntive.

La cartella `public/vendor/` contiene l'adapter del protocollo `mario.grafxdico` versione 1. Il token temporaneo resta in memoria, non deve essere registrato o salvato. Questa demo non è il vero servizio GraphXDico.
