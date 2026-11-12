// GraphXDico — demo. Classificazione delle risposte Mario (contratto §8) e impronta del lavoro per i retry.
// Modulo puro.

/**
 * @param {Error & {status?: number, code?: string}} errore errore dell'adapter o di fetch
 * @param {'request'|'result'|'cancel'} fase
 * @returns {{ tipo: 'incerto'|'rifiuto'|'chiuso'|'configurazione'|'limite', messaggio: string, esportaAbilitata: boolean }}
 */
export function classificaErrore(errore, fase = 'result') {
  const status = errore?.status;
  const code = errore?.code;
  const testoMario = typeof errore?.message === 'string' ? errore.message : '';

  if (!status) {
    const base = fase === 'result'
      ? 'Mario non ha confermato la ricezione (rete, indirizzo, HTTPS, blocco del browser oppure origine della demo non autorizzata in Mario). Non è detto che il risultato sia arrivato: il lavoro è conservato e «Riprova» reinvia lo stesso risultato con lo stesso identificativo.'
      : 'Mario non è raggiungibile: rete o indirizzo errati, HTTPS/rete locale bloccati dal browser, oppure origine della demo non inserita in GRAFXDICO_ALLOWED_ORIGINS (in quel caso Mario risponde 403 senza intestazioni CORS e il browser lo mostra come errore di rete).';
    return { tipo: 'incerto', messaggio: `${base}${testoMario ? ` Dettaglio: ${testoMario}` : ''}`, esportaAbilitata: true };
  }
  if (status === 401) {
    return { tipo: 'chiuso', messaggio: 'Sessione non riconosciuta da Mario. Riapri GraphXDico dal documento in Mario.', esportaAbilitata: false };
  }
  if (status === 410) {
    return {
      tipo: 'chiuso',
      messaggio: 'La sessione è scaduta o è stata annullata. Il lavoro resta in questa finestra: salvane una copia, riapri GraphXDico da Mario e ricaricala.',
      esportaAbilitata: false,
    };
  }
  if (status === 409 && (code === 'session_used' || code === 'result_replayed')) {
    return {
      tipo: 'chiuso',
      messaggio: fase === 'cancel'
        ? 'Mario ha già ricevuto un risultato per questa sessione: per scartarlo usa Mario.'
        : 'Mario ha già ricevuto un risultato per questa sessione (anche da un tentativo precedente). Controlla l\'anteprima in Mario; per un invio diverso riapri GraphXDico da Mario.',
      esportaAbilitata: false,
    };
  }
  if (status === 409) {
    return { tipo: 'chiuso', messaggio: `La richiesta non corrisponde più al documento in Mario (${code ?? 'conflitto'}). Riapri GraphXDico da Mario.`, esportaAbilitata: false };
  }
  if (status === 403 && code === 'origin_not_allowed') {
    return {
      tipo: 'configurazione',
      messaggio: 'Mario non autorizza l\'indirizzo di questa demo: l\'origine va aggiunta a GRAFXDICO_ALLOWED_ORIGINS del Client Mario.',
      esportaAbilitata: true,
    };
  }
  if (status === 403) {
    return { tipo: 'chiuso', messaggio: `Mario ha rifiutato la destinazione: ${testoMario}`, esportaAbilitata: false };
  }
  if (status === 413) {
    return { tipo: 'limite', messaggio: `Il risultato supera i limiti di Mario: ${testoMario} Riduci righe o dimensione e riprova.`, esportaAbilitata: true };
  }
  if (status === 422) {
    return { tipo: 'rifiuto', messaggio: `Mario ha rifiutato il risultato: ${testoMario} Nulla è stato applicato; correggi e riprova.`, esportaAbilitata: true };
  }
  if (status === 429) {
    return { tipo: 'incerto', messaggio: 'Troppe richieste ravvicinate a Mario: attendi un minuto e riprova.', esportaAbilitata: true };
  }
  return {
    tipo: 'incerto',
    messaggio: `Mario ha risposto con un errore (HTTP ${status}${code ? `, ${code}` : ''}). Il lavoro è conservato: riprova; verrà reinviato lo stesso risultato.`,
    esportaAbilitata: true,
  };
}

/** JSON con chiavi ordinate: due stati equivalenti danno la stessa impronta. */
export function serializzaStabile(valore) {
  if (Array.isArray(valore)) return `[${valore.map(serializzaStabile).join(',')}]`;
  if (valore && typeof valore === 'object') {
    return `{${Object.keys(valore).sort().map((k) => `${JSON.stringify(k)}:${serializzaStabile(valore[k])}`).join(',')}}`;
  }
  return JSON.stringify(valore ?? null);
}
