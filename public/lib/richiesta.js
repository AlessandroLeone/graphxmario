// GraphXDico — demo. Lettura della richiesta Mario (protocollo `mario.grafxdico` v1, contratto 12/11/2026).
// Modulo puro: nessun accesso a DOM, rete o storage. Gli identificativi restano OPACHI: si ricopiano, non si interpretano.

export const TIPI_COLONNA = ['text', 'boolean'];
export const FORMATI_SUPPORTATI = ['image/png', 'image/jpeg'];

function intero(valore, minimo = 1) {
  return Number.isInteger(valore) && valore >= minimo;
}

/**
 * Verifica che la richiesta sia utilizzabile per un risultato COMPLETO (disegno E tabelle).
 * Non corregge e non completa nulla: se il gruppo non è valido, la demo non permette di esportare.
 * @returns {{ ok: boolean, errori: string[], gruppo: object|null, disegni: object[], tabelle: object[], formati: string[], limiti: object|null, obbligatori: string[] }}
 */
export function analizzaRichiesta(richiesta) {
  const errori = [];
  const esito = { ok: false, errori, gruppo: null, disegni: [], tabelle: [], formati: [], limiti: null, obbligatori: [] };

  if (!richiesta || typeof richiesta !== 'object') {
    errori.push('La risposta di Mario non contiene una richiesta.');
    return esito;
  }
  if (richiesta.protocol !== 'mario.grafxdico' || richiesta.version !== 1) {
    errori.push('Protocollo o versione non supportati da questa demo (atteso mario.grafxdico v1).');
  }
  for (const campo of ['session_id', 'request_id', 'document_revision']) {
    if (typeof richiesta[campo] !== 'string' || richiesta[campo] === '') {
      errori.push(`Campo «${campo}» mancante nella richiesta.`);
    }
  }

  const l = richiesta.limits;
  if (!l || !intero(l.max_images) || !intero(l.image_bytes) || !(Number(l.image_megapixels) > 0) || !intero(l.max_rows)
      || !Array.isArray(l.media_types)) {
    errori.push('Limiti della richiesta mancanti o non validi.');
  } else {
    esito.limiti = l;
    esito.formati = FORMATI_SUPPORTATI.filter((f) => l.media_types.includes(f));
    if (!esito.formati.length) errori.push('Mario non accetta né PNG né JPEG per questa sessione.');
  }

  if (!Array.isArray(richiesta.targets) || !richiesta.targets.length) {
    errori.push('La richiesta non contiene destinazioni.');
    return esito;
  }

  const visti = new Set();
  for (const t of richiesta.targets) {
    if (!t || typeof t.target_id !== 'string' || !t.target_id || visti.has(t.target_id)) {
      errori.push('Destinazione senza identificativo o duplicata.');
      continue;
    }
    visti.add(t.target_id);
    if (typeof t.schema_id !== 'string' || !Number.isInteger(t.schema_version)) {
      errori.push(`Destinazione «${t.label ?? t.target_id}» senza schema.`);
      continue;
    }
    if (t.kind === 'image') {
      esito.disegni.push(t);
    } else if (t.kind === 'table') {
      if (!Array.isArray(t.columns) || !t.columns.length) {
        errori.push(`La tabella «${t.label ?? t.schema_id}» non ha colonne.`);
        continue;
      }
      const chiavi = new Set();
      for (const c of t.columns) {
        if (!c || typeof c.key !== 'string' || !c.key || chiavi.has(c.key)) {
          errori.push(`La tabella «${t.label ?? t.schema_id}» ha una colonna senza chiave o duplicata.`);
        } else if (!TIPI_COLONNA.includes(c.type ?? 'text')) {
          errori.push(`La colonna «${c.label ?? c.key}» ha un tipo non supportato («${c.type}»): la demo non lo indovina.`);
        }
        if (c?.key) chiavi.add(c.key);
      }
      esito.tabelle.push(t);
    } else {
      errori.push(`Destinazione di tipo sconosciuto («${t.kind}»).`);
    }
  }

  const g = richiesta.group;
  if (!g || typeof g.group_id !== 'string' || !Array.isArray(g.required_target_ids) || !g.required_target_ids.length) {
    errori.push('La richiesta non indica il gruppo disegno + tabelle: riaprire l\'editor da Mario.');
  } else {
    esito.gruppo = g;
    esito.obbligatori = [...g.required_target_ids];
    const sconosciuti = g.required_target_ids.filter((id) => !visti.has(id));
    if (sconosciuti.length) errori.push('Il gruppo richiede destinazioni che la richiesta non descrive.');
    const kindDi = (id) => richiesta.targets.find((t) => t.target_id === id)?.kind;
    if (!g.required_target_ids.some((id) => kindDi(id) === 'image')) errori.push('Il gruppo non contiene un disegno.');
    if (!g.required_target_ids.some((id) => kindDi(id) === 'table')) errori.push('Il gruppo non contiene tabelle.');
  }
  // Un target marcato `required` fuori dall'elenco del gruppo resta comunque obbligatorio.
  for (const t of richiesta.targets) {
    if (t?.required === true && !esito.obbligatori.includes(t.target_id)) esito.obbligatori.push(t.target_id);
  }
  if (esito.limiti && esito.disegni.length > esito.limiti.max_images) errori.push('La richiesta chiede più disegni del limite di immagini.');

  esito.ok = errori.length === 0;
  return esito;
}

/** Proporzioni del foglio di disegno dallo spazio indicativo del modulo (non è la risoluzione di stampa). */
export function proporzioniFoglio(targetDisegno, larghezzaLogica = 1000) {
  const w = Number(targetDisegno?.width);
  const h = Number(targetDisegno?.height);
  let rapporto = w > 0 && h > 0 ? h / w : 0.75;
  rapporto = Math.min(2, Math.max(0.5, rapporto));
  return { w: larghezzaLogica, h: Math.round(larghezzaLogica * rapporto) };
}

/** Minuti residui (arrotondati per difetto) rispetto a `expires_at`; null se non leggibile. */
export function minutiResidui(expiresAt, adesso = Date.now()) {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - adesso) / 60000);
}
