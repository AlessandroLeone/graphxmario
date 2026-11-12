// GraphXDico — demo. Righe delle tabelle secondo le colonne DICHIARATE nella richiesta (chiavi e tipi dinamici).
// Modulo puro. Nessuna tabella è codificata: tutto deriva da `target.columns`.

const CONTROLLO = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
export const MAX_CELLA = 2000;

export function tipoDi(colonna) {
  return colonna.type ?? 'text';
}

/** Rimuove i caratteri di controllo che Mario rifiuta (tab e a capo restano ammessi). */
export function pulisciTesto(valore) {
  return String(valore ?? '').replace(CONTROLLO, '');
}

/** Riga vuota dell'editor: testo '' e caselle non compilate (null). */
export function rigaVuota(target) {
  const valori = {};
  for (const c of target.columns) valori[c.key] = tipoDi(c) === 'boolean' ? null : '';
  return valori;
}

/** Valore di cella da inviare: testo → stringa o null; boolean → true/false/null. Mai conversioni «sì»/1/"X". */
export function valoreDaInviare(colonna, valore) {
  if (tipoDi(colonna) === 'boolean') return valore === true || valore === false ? valore : null;
  const testo = pulisciTesto(valore);
  return testo.trim() === '' ? null : testo;
}

/**
 * Righe nel formato del manifest: oggetti con le SOLE chiavi della richiesta. Le righe interamente vuote sono escluse.
 * @returns {{ rows: object[], escluse: number, errori: string[] }}
 */
export function righeDaInviare(target, righeEditor) {
  const rows = [];
  const errori = [];
  let escluse = 0;
  righeEditor.forEach((riga, i) => {
    const out = {};
    let piena = false;
    for (const c of target.columns) {
      const v = valoreDaInviare(c, riga[c.key]);
      if (typeof v === 'string' && v.length > MAX_CELLA) {
        errori.push(`«${target.label}», riga ${i + 1}: la cella «${c.label ?? c.key}» supera ${MAX_CELLA} caratteri.`);
      }
      if (v !== null) piena = true;
      out[c.key] = v;
    }
    if (piena) rows.push(out); else escluse += 1;
  });
  return { rows, escluse, errori };
}

function etichettaBreve(colonna) {
  const base = String(colonna.label ?? colonna.key).split('(')[0].trim() || colonna.key;
  return base.length > 28 ? `${base.slice(0, 27)}…` : base;
}

/**
 * Righe dimostrative RICONOSCIBILI («Demo n – …»), costruite solo con le colonne della richiesta.
 * Le caselle (boolean) alternano true/false.
 */
export function righeDemo(target, quante = 2, partenza = 1) {
  const righe = [];
  for (let n = partenza; n < partenza + quante; n += 1) {
    const valori = {};
    for (const c of target.columns) {
      valori[c.key] = tipoDi(c) === 'boolean' ? n % 2 === 1 : `Demo ${n} – ${etichettaBreve(c)}`;
    }
    righe.push(valori);
  }
  return righe;
}

/**
 * Controllo locale della completezza del gruppo, prima di qualsiasi invio (Mario lo ripete comunque).
 * @param analisi esito di analizzaRichiesta
 * @param righePerTarget Map target_id → rows già nel formato del manifest
 * @param disegnoPresente Map target_id → boolean (il disegno ha almeno un elemento)
 */
export function verificaGruppo(analisi, righePerTarget, disegnoPresente) {
  const problemi = [];
  for (const d of analisi.disegni) {
    if (analisi.obbligatori.includes(d.target_id) && !disegnoPresente.get(d.target_id)) {
      problemi.push(`Il disegno «${d.label}» è vuoto: disegna lo schema prima di esportare.`);
    }
  }
  const tabelleGruppo = analisi.tabelle.filter((t) => analisi.obbligatori.includes(t.target_id));
  const totale = tabelleGruppo.reduce((n, t) => n + (righePerTarget.get(t.target_id)?.length ?? 0), 0);
  if (tabelleGruppo.length && totale === 0) {
    problemi.push(`Le tabelle sono tutte vuote: compila almeno una riga in ${tabelleGruppo.map((t) => `«${t.label}»`).join(', ')}.`);
  }
  const righeTotali = [...righePerTarget.values()].reduce((n, r) => n + r.length, 0);
  if (analisi.limiti && righeTotali > analisi.limiti.max_rows) {
    problemi.push(`Troppe righe (${righeTotali}): il limite di Mario è ${analisi.limiti.max_rows}.`);
  }
  return problemi;
}
