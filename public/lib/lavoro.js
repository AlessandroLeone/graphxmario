// GraphXDico — demo. Copia del lavoro scaricata ESPLICITAMENTE dall'utente (per riprenderlo in una nuova sessione).
// Contiene solo disegno e righe: nessun token, nessun identificativo di sessione, richiesta o documento.
// Modulo puro.

import { tipoDi, pulisciTesto, MAX_CELLA } from './tabelle.js';

export const FORMATO_LAVORO = 'graphxdico-demo-lavoro';

export function serializzaLavoro({ analisi, scene, righe }) {
  return {
    formato: FORMATO_LAVORO,
    versione: 1,
    nota: 'Copia di lavoro della demo GraphXDico: dati dimostrativi, nessun token o identificativo di sessione.',
    salvato_il: new Date().toISOString(),
    disegni: analisi.disegni.map((d) => ({ schema_id: d.schema_id, scena: scene.get(d.target_id) })),
    tabelle: analisi.tabelle.map((t) => ({ schema_id: t.schema_id, righe: righe.get(t.target_id) ?? [] })),
  };
}

/**
 * Riporta una copia di lavoro sulla richiesta CORRENTE: tabelle abbinate per `schema_id`, solo le colonne
 * della richiesta, con il tipo della richiesta. Nulla viene inventato; ciò che non combacia è segnalato.
 */
export function importaLavoro(dati, analisi, scenaValida) {
  if (!dati || dati.formato !== FORMATO_LAVORO || dati.versione !== 1) {
    throw new Error('Il file non è una copia di lavoro della demo GraphXDico.');
  }
  const avvisi = [];
  const scene = new Map();
  const righe = new Map();

  for (const d of analisi.disegni) {
    const trovato = (dati.disegni ?? []).find((x) => x.schema_id === d.schema_id)
      ?? (analisi.disegni.length === 1 && (dati.disegni ?? []).length === 1 ? dati.disegni[0] : null);
    if (trovato && scenaValida(trovato.scena)) scene.set(d.target_id, trovato.scena);
    else avvisi.push(`Nessun disegno utilizzabile per «${d.label}».`);
  }

  for (const t of analisi.tabelle) {
    const trovata = (dati.tabelle ?? []).find((x) => x.schema_id === t.schema_id);
    if (!trovata) { avvisi.push(`Nessuna riga per «${t.label}».`); continue; }
    const chiavi = new Set(t.columns.map((c) => c.key));
    const ignorate = new Set();
    const lette = [];
    for (const r of Array.isArray(trovata.righe) ? trovata.righe : []) {
      if (!r || typeof r !== 'object') continue;
      for (const k of Object.keys(r)) if (!chiavi.has(k)) ignorate.add(k);
      const riga = {};
      for (const c of t.columns) {
        const v = r[c.key];
        if (tipoDi(c) === 'boolean') riga[c.key] = v === true || v === false ? v : null;
        else riga[c.key] = typeof v === 'string' ? pulisciTesto(v).slice(0, MAX_CELLA) : '';
      }
      lette.push(riga);
    }
    if (ignorate.size) avvisi.push(`«${t.label}»: colonne non richieste ignorate (${[...ignorate].join(', ')}).`);
    righe.set(t.target_id, lette);
  }
  return { scene, righe, avvisi };
}
