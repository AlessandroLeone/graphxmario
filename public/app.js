// GraphXDico — demo. Editor dimostrativo autonomo sul protocollo REALE `mario.grafxdico` v1 (contratto 12/11/2026).
// Trasporto: adapter di riferimento consegnato da Mario (vendor/grafxdico-mario-client.js, copia identica).
// ⛔ Il token resta solo in memoria (nell'adapter): mai in log, URL, storage, file o postMessage.

import { creaClientMario } from './vendor/grafxdico-mario-client.js';
import { analizzaRichiesta, proporzioniFoglio, minutiResidui } from './lib/richiesta.js';
import { rigaVuota, righeDaInviare, righeDemo, verificaGruppo, pulisciTesto, tipoDi, MAX_CELLA } from './lib/tabelle.js';
import { classificaErrore, serializzaStabile } from './lib/esito.js';
import { serializzaLavoro, importaLavoro } from './lib/lavoro.js';
import {
  RETI, SIMBOLI, GRIGLIA, aGriglia, nuovoId, scenaDemo, scenaVuota, scenaValida, adattaScena,
  colpisci, sposta, disegna, disegnaIcona, esportaImmagine,
} from './lib/disegno.js';

const URL_CONFIG = new URL('./config/graphxdico.config.json', import.meta.url);
const DIDASCALIA = 'Schema dimostrativo GraphXDico (demo) — dati non reali';

const stato = {
  client: null,
  richiesta: null,
  analisi: null,
  scene: new Map(),
  storia: new Map(),
  righe: new Map(),
  disegnoAttivo: null,
  formato: 'image/png',
  fase: 'pronto', // pronto | invio | inviato | annullato | chiuso
  ultimo: null, // { impronta, pacchetto } — riusato per i retry: stesso result_id, stessi byte
  modificato: false,
};

const ui = {};

// ── Utilità DOM (nessun innerHTML: la CSP non consente stili inline e i testi arrivano da Mario) ─────────────

function h(tag, attributi = {}, ...figli) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attributi)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'testo') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of figli.flat()) if (f !== null && f !== undefined && f !== false) el.append(f);
  return el;
}

const main = () => document.getElementById('contenuto');

function schermata({ tipo = 'info', titolo, testo, dettagli = [], azioni = [], testid }) {
  const sezione = h('section', { class: `schermata schermata-${tipo}`, 'data-testid': testid ?? `schermata-${tipo}` },
    h('p', { class: 'schermata-titolo', testo: titolo }),
    testo ? h('p', { class: 'schermata-testo', testo }) : null,
    dettagli.length ? h('ul', { class: 'schermata-dettagli' }, dettagli.map((d) => h('li', { testo: d }))) : null,
    azioni.length ? h('div', { class: 'schermata-azioni' }, azioni) : null);
  main().replaceChildren(sezione);
  main().focus({ preventScroll: true });
}

function pulisciFrammento() {
  if (window.location.hash) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }
}

// ── Avvio ────────────────────────────────────────────────────────────────────────────────────────────────

async function caricaConfig() {
  const r = await fetch(URL_CONFIG, { cache: 'no-store', credentials: 'same-origin' });
  if (!r.ok) throw new Error(`File di configurazione non trovato (HTTP ${r.status}).`);
  const c = await r.json();
  if (typeof c?.marioOrigin !== 'string' || !Array.isArray(c?.originiConsentite)) {
    throw new Error('La configurazione deve indicare «marioOrigin» e «originiConsentite».');
  }
  return { marioOrigin: c.marioOrigin, originiConsentite: c.originiConsentite };
}

async function avvio() {
  window.addEventListener('beforeunload', (ev) => {
    if (stato.modificato && !['inviato', 'annullato'].includes(stato.fase)) { ev.preventDefault(); ev.returnValue = ''; }
  });

  if (!window.isSecureContext || !globalThis.crypto?.subtle || typeof crypto.randomUUID !== 'function') {
    pulisciFrammento();
    schermata({
      tipo: 'errore', titolo: 'Serve una connessione sicura',
      testo: 'GraphXDico — demo calcola le impronte SHA-256 con le API crittografiche del browser, disponibili solo in HTTPS (o da localhost). Pubblica la demo su un indirizzo HTTPS.',
    });
    return;
  }

  const query = new URLSearchParams(window.location.search);
  const conToken = new URLSearchParams(window.location.hash.slice(1)).has('token');
  if (!query.get('session') || !conToken) {
    pulisciFrammento();
    schermata({
      tipo: 'info', testid: 'schermata-apri-da-mario', titolo: 'Apri GraphXDico da Mario',
      testo: 'Questa pagina si apre dal documento in Mario, con il pulsante «Apri GraphXDico (disegno + tabelle)». Mario le consegna una sessione temporanea: senza quella non c\'è nulla da compilare e nulla viene inviato.',
    });
    return;
  }

  let config;
  try {
    config = await caricaConfig();
    stato.client = creaClientMario(config); // legge sessione e token dall'URL una sola volta
    stato.marioOrigin = new URL(config.marioOrigin).origin;
  } catch (e) {
    pulisciFrammento();
    schermata({ tipo: 'errore', titolo: 'Configurazione della demo non valida', testo: e.message, testid: 'schermata-configurazione' });
    return;
  } finally {
    pulisciFrammento(); // il token non resta nella barra degli indirizzi né nella cronologia
  }
  await caricaRichiesta();
}

async function caricaRichiesta() {
  schermata({ tipo: 'info', titolo: 'Lettura della richiesta da Mario…', testid: 'caricamento' });
  let richiesta;
  try {
    richiesta = await stato.client.leggiRichiesta();
  } catch (e) {
    const esito = classificaErrore(e, 'request');
    schermata({
      tipo: 'errore', titolo: 'Impossibile leggere la richiesta di Mario', testo: esito.messaggio, testid: 'schermata-errore-richiesta',
      dettagli: esito.tipo === 'incerto' || esito.tipo === 'configurazione'
        ? [`Indirizzo Mario configurato: ${stato.marioOrigin}`, 'Se la demo è in HTTPS e Mario in HTTP sulla rete locale, il browser può bloccare la richiesta o chiedere un permesso.']
        : [],
      azioni: esito.esportaAbilitata ? [h('button', { class: 'pulsante primario', onclick: caricaRichiesta, testo: 'Riprova' })] : [],
    });
    return;
  }
  const analisi = analizzaRichiesta(richiesta);
  stato.richiesta = richiesta;
  stato.analisi = analisi;
  if (!analisi.ok) {
    schermata({
      tipo: 'errore', titolo: 'Richiesta non utilizzabile per un risultato completo', testid: 'schermata-richiesta-non-valida',
      testo: 'GraphXDico restituisce sempre disegno e tabelle insieme. Questa richiesta non lo consente: nulla è stato inventato e nulla verrà inviato.',
      dettagli: analisi.errori,
      azioni: [h('button', { class: 'pulsante', onclick: () => chiediAnnulla(), testo: 'Annulla la sessione' })],
    });
    return;
  }
  if (analisi.formati.includes('image/png')) stato.formato = 'image/png'; else [stato.formato] = analisi.formati;
  for (const d of analisi.disegni) {
    const foglio = proporzioniFoglio(d);
    stato.scene.set(d.target_id, scenaDemo(foglio));
    stato.storia.set(d.target_id, []);
  }
  for (const t of analisi.tabelle) stato.righe.set(t.target_id, []);
  stato.disegnoAttivo = analisi.disegni[0].target_id;
  costruisciEditor();
}

// ── Editor ───────────────────────────────────────────────────────────────────────────────────────────────

function etichettaTarget(id) {
  return stato.richiesta.targets.find((t) => t.target_id === id)?.label ?? id;
}

function costruisciEditor() {
  const { analisi } = stato;
  document.querySelector('[data-testid="gruppo-etichetta"]').textContent = analisi.gruppo.label
    ? `Gruppo: ${analisi.gruppo.label}` : 'Gruppo disegno + tabelle';
  aggiornaScadenza();
  setInterval(aggiornaScadenza, 15000);

  const nomiDisegni = analisi.disegni.map((d) => `«${d.label}»`).join(', ');
  const nomiTabelle = analisi.tabelle.map((t) => `«${t.label}»`).join(', ');

  ui.schedaDisegno = h('button', { class: 'scheda', role: 'tab', id: 'scheda-disegno', 'aria-controls': 'pannello-disegno', 'aria-selected': 'true', 'data-testid': 'scheda-disegno', onclick: () => mostraScheda('disegno') },
    h('span', { class: 'scheda-numero', testo: '1' }), h('span', { testo: 'Disegno' }), h('span', { class: 'scheda-stato', 'data-ruolo': 'stato-disegno' }));
  ui.schedaTabelle = h('button', { class: 'scheda', role: 'tab', id: 'scheda-tabelle', 'aria-controls': 'pannello-tabelle', 'aria-selected': 'false', tabindex: '-1', 'data-testid': 'scheda-tabelle', onclick: () => mostraScheda('tabelle') },
    h('span', { class: 'scheda-numero', testo: '2' }), h('span', { testo: `Tabelle (${analisi.tabelle.length})` }), h('span', { class: 'scheda-stato', 'data-ruolo': 'stato-tabelle' }));
  const schede = h('div', { class: 'schede', role: 'tablist', 'aria-label': 'Parti del risultato' }, ui.schedaDisegno, ui.schedaTabelle);
  schede.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      const prossima = document.activeElement === ui.schedaDisegno ? 'tabelle' : 'disegno';
      mostraScheda(prossima); (prossima === 'disegno' ? ui.schedaDisegno : ui.schedaTabelle).focus();
    }
  });

  const avviso = h('p', { class: 'avviso-gruppo', 'data-testid': 'avviso-gruppo' },
    h('strong', { testo: 'Si restituisce tutto insieme: ' }),
    `il disegno ${nomiDisegni} e le tabelle ${nomiTabelle}. Mario mostra prima un'anteprima: il documento cambia solo dopo «Applica al documento» in Mario.`);

  ui.pannelloDisegno = costruisciPannelloDisegno();
  ui.pannelloTabelle = costruisciPannelloTabelle();
  ui.barra = costruisciBarraInvio();

  main().replaceChildren(h('div', { class: 'editor', 'data-testid': 'editor' }, avviso, schede, ui.pannelloDisegno, ui.pannelloTabelle), ui.barra);
  for (const c of document.querySelectorAll('canvas[data-simbolo]')) disegnaIcona(c, c.dataset.simbolo);
  new ResizeObserver(() => ridimensionaFoglio()).observe(ui.contenitoreFoglio);
  window.addEventListener('resize', ridimensionaFoglio);
  ridimensionaFoglio();
  aggiornaIspettore();
  aggiornaRiepilogo();
}

function mostraScheda(nome) {
  const disegno = nome === 'disegno';
  ui.schedaDisegno.setAttribute('aria-selected', String(disegno));
  ui.schedaTabelle.setAttribute('aria-selected', String(!disegno));
  ui.schedaDisegno.tabIndex = disegno ? 0 : -1;
  ui.schedaTabelle.tabIndex = disegno ? -1 : 0;
  ui.pannelloDisegno.hidden = !disegno;
  ui.pannelloTabelle.hidden = disegno;
  if (disegno) ridimensionaFoglio();
}

function aggiornaScadenza() {
  const el = document.querySelector('[data-testid="scadenza"]');
  const min = minutiResidui(stato.richiesta?.expires_at);
  if (min === null) { el.hidden = true; return; }
  const ora = new Date(Date.parse(stato.richiesta.expires_at)).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  el.hidden = false;
  el.classList.toggle('in-scadenza', min < 5);
  el.textContent = min < 0
    ? 'Sessione probabilmente scaduta: salva una copia del lavoro'
    : `Sessione valida fino alle ${ora} (${min < 1 ? 'meno di 1 min' : `${min} min`})`;
}

// ── Disegno ──────────────────────────────────────────────────────────────────────────────────────────────

const editorDisegno = { strumento: 'seleziona', rete: 'gas', selezionato: null, trascina: null, anteprima: null, scala: 1 };

const scena = () => stato.scene.get(stato.disegnoAttivo);
const bloccato = () => stato.fase !== 'pronto';

function memorizza() {
  const storia = stato.storia.get(stato.disegnoAttivo);
  storia.push(JSON.stringify(scena()));
  if (storia.length > 60) storia.shift();
  segnaModificato();
}

function annullaAzione() {
  if (bloccato()) return;
  const storia = stato.storia.get(stato.disegnoAttivo);
  const precedente = storia.pop();
  if (!precedente) { mostraInfo('Nessuna azione da annullare.'); return; }
  stato.scene.set(stato.disegnoAttivo, JSON.parse(precedente));
  editorDisegno.selezionato = null;
  ridisegna(); aggiornaIspettore(); aggiornaRiepilogo();
}

function segnaModificato() {
  stato.modificato = true;
  if (ui.esporta && stato.fase === 'pronto') {
    ui.esporta.textContent = 'Esporta verso Mario'; // dati cambiati: il prossimo invio è un risultato nuovo
    if (!ui.errore.hidden) { ui.errore.hidden = true; ui.errore.textContent = ''; }
  }
  aggiornaRiepilogo();
}

function testiCartiglio() {
  const data = new Date().toLocaleDateString('it-IT');
  return {
    titolo: 'GraphXDico — demo · SCHEMA DIMOSTRATIVO',
    sottotitolo: `${etichettaTarget(stato.disegnoAttivo)} · ${data}`,
  };
}

function pulsanteStrumento(id, etichetta, scorciatoia, icona) {
  return h('button', {
    class: 'strumento', type: 'button', 'aria-pressed': String(editorDisegno.strumento === id), 'data-strumento': id,
    'data-testid': `strumento-${id.replace(':', '-')}`, title: scorciatoia ? `${etichetta} (${scorciatoia})` : etichetta,
    onclick: () => scegliStrumento(id),
  }, icona, h('span', { testo: etichetta }));
}

function svgIcona(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icona');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  svg.append(p);
  return svg;
}

function costruisciPannelloDisegno() {
  const { analisi } = stato;
  const sceltaDisegno = analisi.disegni.length > 1
    ? h('label', { class: 'campo' }, h('span', { testo: 'Disegno' }),
      h('select', { onchange: (ev) => { stato.disegnoAttivo = ev.target.value; editorDisegno.selezionato = null; ridimensionaFoglio(); aggiornaIspettore(); } },
        analisi.disegni.map((d) => h('option', { value: d.target_id, testo: d.label }))))
    : null;

  ui.selectRete = h('select', { 'data-testid': 'rete', 'aria-label': 'Rete della tubazione o linea', onchange: (ev) => { editorDisegno.rete = ev.target.value; } },
    Object.entries(RETI).map(([k, r]) => h('option', { value: k, testo: r.nome })));

  const strumenti = h('div', { class: 'gruppo-strumenti', role: 'group', 'aria-label': 'Strumenti' },
    pulsanteStrumento('seleziona', 'Seleziona e sposta', 'V', svgIcona('M5 3l13 8-6 1.5L15 20l-2.6 1-3-7.4L5 18z')),
    pulsanteStrumento('linea', 'Tubazione / linea', 'L', svgIcona('M4 20 20 4')),
    pulsanteStrumento('testo', 'Testo', 'T', svgIcona('M5 5h14M12 5v14')));

  const tavolozza = h('div', { class: 'tavolozza', role: 'group', 'aria-label': 'Simboli da posizionare' },
    Object.entries(SIMBOLI).map(([k, nome]) => pulsanteStrumento(`simbolo:${k}`, nome, null,
      h('canvas', { class: 'icona-simbolo', 'data-simbolo': k, 'aria-hidden': 'true' }))));

  const azioni = h('div', { class: 'azioni-disegno' },
    h('button', { class: 'pulsante piccolo', type: 'button', onclick: annullaAzione, title: 'Annulla l\'ultima azione (Ctrl+Z)', testo: 'Annulla azione' }),
    h('button', { class: 'pulsante piccolo', type: 'button', 'data-testid': 'svuota', onclick: () => { if (bloccato()) return; memorizza(); stato.scene.set(stato.disegnoAttivo, scenaVuota(scena())); editorDisegno.selezionato = null; ridisegna(); aggiornaIspettore(); aggiornaRiepilogo(); }, testo: 'Svuota foglio' }),
    h('button', { class: 'pulsante piccolo', type: 'button', onclick: () => { if (bloccato()) return; memorizza(); stato.scene.set(stato.disegnoAttivo, scenaDemo(scena())); editorDisegno.selezionato = null; ridisegna(); aggiornaIspettore(); aggiornaRiepilogo(); }, testo: 'Schema d\'esempio' }));

  ui.ispettore = h('div', { class: 'ispettore', 'data-testid': 'ispettore', 'aria-live': 'polite' });

  ui.foglio = h('canvas', {
    class: 'foglio', tabindex: '0', 'data-testid': 'foglio', role: 'img',
    'aria-label': 'Foglio dello schema dimostrativo. Con il foglio attivo: frecce per spostare l\'elemento selezionato, Canc per eliminarlo, Esc per deselezionare, N per selezionare l\'elemento successivo.',
  });
  ui.contenitoreFoglio = h('div', { class: 'contenitore-foglio' }, ui.foglio);
  collegaFoglio(ui.foglio);

  return h('section', { class: 'pannello pannello-disegno', id: 'pannello-disegno', role: 'tabpanel', 'aria-labelledby': 'scheda-disegno', 'data-testid': 'pannello-disegno' },
    h('aside', { class: 'colonna-strumenti' },
      sceltaDisegno,
      h('p', { class: 'etichetta-sezione', testo: 'Strumenti' }), strumenti,
      h('label', { class: 'campo' }, h('span', { testo: 'Rete per nuove linee' }), ui.selectRete),
      h('p', { class: 'etichetta-sezione', testo: 'Simboli' }), tavolozza,
      h('p', { class: 'etichetta-sezione', testo: 'Elemento selezionato' }), ui.ispettore,
      azioni),
    h('div', { class: 'area-foglio' },
      h('p', { class: 'nota-foglio', testo: `${etichettaTarget(stato.disegnoAttivo)} — schema tecnico dimostrativo. La griglia non compare nell'immagine esportata.` }),
      ui.contenitoreFoglio));
}

function scegliStrumento(id) {
  if (bloccato()) return;
  editorDisegno.strumento = id;
  for (const b of document.querySelectorAll('[data-strumento]')) b.setAttribute('aria-pressed', String(b.dataset.strumento === id));
  ui.foglio.dataset.strumento = id.split(':')[0];
}

function ridimensionaFoglio() {
  if (!ui.foglio || ui.pannelloDisegno?.hidden) return;
  const s = scena();
  const disponibile = ui.contenitoreFoglio.clientWidth || 600;
  const altezzaUtile = Math.max(380, window.innerHeight - 250);
  const larghezza = Math.floor(Math.min(disponibile, Math.max(520, altezzaUtile * (s.w / s.h))));
  const altezza = Math.round(larghezza * (s.h / s.w));
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  ui.foglio.style.width = `${larghezza}px`;
  ui.foglio.style.height = `${altezza}px`;
  ui.foglio.width = Math.round(larghezza * dpr);
  ui.foglio.height = Math.round(altezza * dpr);
  editorDisegno.scala = (larghezza * dpr) / s.w;
  ridisegna();
}

function ridisegna() {
  if (!ui.foglio) return;
  disegna(ui.foglio.getContext('2d'), scena(), {
    scala: editorDisegno.scala,
    schermo: { selezionato: editorDisegno.selezionato, anteprima: editorDisegno.anteprima },
    cartiglio: testiCartiglio(),
  });
}

function puntoLogico(ev) {
  const r = ui.foglio.getBoundingClientRect();
  const s = scena();
  return { x: ((ev.clientX - r.left) * s.w) / r.width, y: ((ev.clientY - r.top) * s.h) / r.height };
}

function dentroFoglio(p) {
  const s = scena();
  return { x: Math.max(0, Math.min(s.w, aGriglia(p.x))), y: Math.max(0, Math.min(s.h - 90, aGriglia(p.y))) };
}

function collegaFoglio(canvas) {
  canvas.addEventListener('pointerdown', (ev) => {
    if (bloccato() || ev.button !== 0) return;
    canvas.focus({ preventScroll: true });
    const p = puntoLogico(ev);
    const q = dentroFoglio(p);
    const { strumento } = editorDisegno;
    if (strumento === 'linea') {
      editorDisegno.trascina = { tipo: 'linea', x1: q.x, y1: q.y };
      editorDisegno.anteprima = { tipo: 'linea', rete: editorDisegno.rete, x1: q.x, y1: q.y, x2: q.x, y2: q.y };
    } else if (strumento.startsWith('simbolo:')) {
      memorizza();
      const nome = strumento.split(':')[1];
      const nuovo = { id: nuovoId('s'), tipo: 'simbolo', simbolo: nome, x: q.x, y: q.y, etichetta: SIMBOLI[nome] };
      scena().elementi.push(nuovo);
      editorDisegno.selezionato = nuovo;
      scegliStrumento('seleziona');
      aggiornaRiepilogo();
    } else if (strumento === 'testo') {
      memorizza();
      const nuovo = { id: nuovoId('t'), tipo: 'testo', x: q.x, y: q.y, testo: 'Nota' };
      scena().elementi.push(nuovo);
      editorDisegno.selezionato = nuovo;
      scegliStrumento('seleziona');
      aggiornaIspettore();
      ui.ispettore.querySelector('input')?.select();
      ridisegna();
      return;
    } else {
      const colpo = colpisci(scena(), p.x, p.y, editorDisegno.selezionato);
      editorDisegno.selezionato = colpo?.elemento ?? null;
      if (colpo) {
        editorDisegno.trascina = { tipo: colpo.maniglia ? 'maniglia' : 'sposta', maniglia: colpo.maniglia, da: p, originale: structuredClone(colpo.elemento), memorizzato: false };
      }
    }
    canvas.setPointerCapture(ev.pointerId);
    ridisegna();
    aggiornaIspettore();
  });

  canvas.addEventListener('pointermove', (ev) => {
    const t = editorDisegno.trascina;
    if (!t) return;
    const p = puntoLogico(ev);
    if (t.tipo === 'linea') {
      const q = dentroFoglio(p);
      const a = editorDisegno.anteprima;
      // Tratti ortogonali per difetto (tubazioni); Maiusc per un tratto libero.
      if (!ev.shiftKey) { if (Math.abs(q.x - t.x1) >= Math.abs(q.y - t.y1)) q.y = t.y1; else q.x = t.x1; }
      a.x2 = q.x; a.y2 = q.y;
    } else {
      if (!t.memorizzato) {
        const s = scena();
        const indice = s.elementi.findIndex((e) => e.id === t.originale.id);
        const copia = structuredClone(s.elementi[indice]);
        Object.assign(s.elementi[indice], t.originale);
        memorizza();
        Object.assign(s.elementi[indice], copia);
        t.memorizzato = true;
      }
      const e = editorDisegno.selezionato;
      const dx = aGriglia(p.x - t.da.x);
      const dy = aGriglia(p.y - t.da.y);
      Object.assign(e, structuredClone(t.originale));
      if (t.tipo === 'maniglia') { e[`x${t.maniglia}`] = e[`x${t.maniglia}`] + dx; e[`y${t.maniglia}`] = e[`y${t.maniglia}`] + dy; } else sposta(e, dx, dy);
    }
    ridisegna();
  });

  const fine = () => {
    const t = editorDisegno.trascina;
    editorDisegno.trascina = null;
    if (t?.tipo === 'linea') {
      const a = editorDisegno.anteprima;
      editorDisegno.anteprima = null;
      if (Math.hypot(a.x2 - a.x1, a.y2 - a.y1) >= GRIGLIA) {
        memorizza();
        const nuova = { ...a, id: nuovoId('l') };
        scena().elementi.push(nuova);
        editorDisegno.selezionato = nuova;
        aggiornaIspettore();
      }
    }
    aggiornaRiepilogo();
    ridisegna();
  };
  canvas.addEventListener('pointerup', fine);
  canvas.addEventListener('pointercancel', fine);

  canvas.addEventListener('keydown', (ev) => {
    if (bloccato()) return;
    const e = editorDisegno.selezionato;
    const passo = ev.shiftKey ? GRIGLIA * 5 : GRIGLIA;
    const frecce = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] };
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); annullaAzione(); return; }
    if (frecce[ev.key] && e) { ev.preventDefault(); memorizza(); sposta(e, ...frecce[ev.key]); ridisegna(); return; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && e) { ev.preventDefault(); eliminaSelezionato(); return; }
    if (ev.key === 'Escape') { editorDisegno.selezionato = null; scegliStrumento('seleziona'); ridisegna(); aggiornaIspettore(); return; }
    if (ev.key.toLowerCase() === 'n') {
      const el = scena().elementi;
      if (!el.length) return;
      const i = e ? el.indexOf(e) : -1;
      editorDisegno.selezionato = el[(i + 1) % el.length];
      ridisegna(); aggiornaIspettore(); return;
    }
    const scorciatoie = { v: 'seleziona', l: 'linea', t: 'testo' };
    if (!ev.ctrlKey && !ev.metaKey && scorciatoie[ev.key.toLowerCase()]) scegliStrumento(scorciatoie[ev.key.toLowerCase()]);
  });
}

function eliminaSelezionato() {
  const e = editorDisegno.selezionato;
  if (!e || bloccato()) return;
  memorizza();
  const s = scena();
  s.elementi = s.elementi.filter((x) => x !== e);
  editorDisegno.selezionato = null;
  ridisegna(); aggiornaIspettore(); aggiornaRiepilogo();
}

function aggiornaIspettore() {
  if (!ui.ispettore) return;
  const e = editorDisegno.selezionato;
  if (!e) {
    ui.ispettore.replaceChildren(h('p', { class: 'suggerimento', testo: 'Clicca un elemento per modificarlo e trascinalo per spostarlo. Una linea selezionata si allunga dalle maniglie.' }));
    return;
  }
  const campi = [];
  let memorizzato = false;
  const primaModifica = () => { if (!memorizzato) { memorizza(); memorizzato = true; } };
  if (e.tipo === 'simbolo' || e.tipo === 'testo') {
    const chiave = e.tipo === 'simbolo' ? 'etichetta' : 'testo';
    campi.push(h('label', { class: 'campo' },
      h('span', { testo: e.tipo === 'simbolo' ? `Etichetta · ${SIMBOLI[e.simbolo]}` : 'Testo' }),
      h('input', {
        type: 'text', value: e[chiave] ?? '', maxlength: '60', 'data-testid': 'ispettore-testo', disabled: bloccato(),
        oninput: (ev) => { primaModifica(); e[chiave] = pulisciTesto(ev.target.value); ridisegna(); },
      })));
  } else {
    campi.push(h('label', { class: 'campo' }, h('span', { testo: 'Rete' }),
      h('select', {
        disabled: bloccato(),
        onchange: (ev) => { memorizza(); e.rete = ev.target.value; ridisegna(); },
      }, Object.entries(RETI).map(([k, r]) => h('option', { value: k, selected: k === e.rete, testo: r.nome })))));
  }
  campi.push(h('button', { class: 'pulsante piccolo pericolo-leggero', type: 'button', onclick: eliminaSelezionato, disabled: bloccato(), testo: 'Elimina elemento' }));
  ui.ispettore.replaceChildren(...campi);
}

// ── Tabelle ──────────────────────────────────────────────────────────────────────────────────────────────

function costruisciPannelloTabelle() {
  const blocchi = stato.analisi.tabelle.map((t) => {
    const corpo = h('tbody');
    const vuota = h('p', { class: 'tabella-vuota', testo: 'Nessuna riga. Aggiungine una o inserisci le righe d\'esempio.' });
    const blocco = h('section', { class: 'tabella-blocco', 'data-testid': 'tabella', 'data-target': t.target_id, 'data-schema': t.schema_id },
      h('header', { class: 'tabella-testa' },
        h('h3', { testo: t.label }),
        h('p', { class: 'meta', testo: `${t.columns.length} colonne${stato.analisi.obbligatori.includes(t.target_id) ? ' · si restituisce insieme al disegno' : ''}` })),
      h('div', { class: 'scorrimento', role: 'region', 'aria-label': `Tabella ${t.label}`, tabindex: '0' },
        h('table', {},
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col', class: 'col-numero', testo: 'N.' }),
            t.columns.map((c) => h('th', { scope: 'col', 'data-key': c.key },
              h('span', { testo: c.label ?? c.key }),
              tipoDi(c) === 'boolean' ? h('span', { class: 'tipo', testo: 'sì/no' }) : null)),
            h('th', { scope: 'col', class: 'col-azioni' }, h('span', { class: 'solo-lettori', testo: 'Azioni' })))),
          corpo)),
      vuota,
      h('div', { class: 'azioni-tabella' },
        h('button', { class: 'pulsante piccolo', type: 'button', 'data-testid': 'aggiungi-riga', onclick: () => aggiungiRighe(t, [rigaVuota(t)], true), testo: '+ Aggiungi riga' }),
        h('button', { class: 'pulsante piccolo', type: 'button', 'data-testid': 'righe-demo', onclick: () => aggiungiRighe(t, righeDemo(t, 2, (stato.righe.get(t.target_id).length) + 1)), testo: 'Righe d\'esempio (demo)' })));
    blocco.corpo = corpo;
    blocco.vuota = vuota;
    ui[`tabella:${t.target_id}`] = blocco;
    disegnaRighe(t);
    return blocco;
  });

  return h('section', { class: 'pannello pannello-tabelle', id: 'pannello-tabelle', role: 'tabpanel', 'aria-labelledby': 'scheda-tabelle', hidden: true, 'data-testid': 'pannello-tabelle' },
    h('div', { class: 'testa-tabelle' },
      h('p', { testo: 'Colonne e tipi arrivano dalla richiesta di Mario. Basta una riga in una delle tabelle; le righe completamente vuote non vengono inviate.' }),
      h('button', { class: 'pulsante piccolo', type: 'button', 'data-testid': 'righe-demo-tutte', onclick: riempiTutteDemo, testo: 'Inserisci righe d\'esempio in tutte (demo)' })),
    blocchi);
}

function riempiTutteDemo() {
  if (bloccato()) return;
  for (const t of stato.analisi.tabelle) aggiungiRighe(t, righeDemo(t, 1, stato.righe.get(t.target_id).length + 1));
}

function aggiungiRighe(target, nuove, focus = false) {
  if (bloccato()) return;
  const righe = stato.righe.get(target.target_id);
  const totale = [...stato.righe.values()].reduce((n, r) => n + r.length, 0);
  if (totale + nuove.length > stato.analisi.limiti.max_rows) { mostraErrore(`Limite di ${stato.analisi.limiti.max_rows} righe raggiunto.`); return; }
  righe.push(...nuove);
  disegnaRighe(target);
  segnaModificato();
  if (focus) ui[`tabella:${target.target_id}`].corpo.lastElementChild?.querySelector('input, select')?.focus();
}

function disegnaRighe(target) {
  const blocco = ui[`tabella:${target.target_id}`];
  const righe = stato.righe.get(target.target_id);
  blocco.vuota.hidden = righe.length > 0;
  blocco.corpo.replaceChildren(...righe.map((riga, i) => h('tr', {},
    h('td', { class: 'col-numero', testo: String(i + 1) }),
    target.columns.map((c) => h('td', {}, cella(target, c, riga, i))),
    h('td', { class: 'col-azioni' }, h('button', {
      class: 'icona-pulsante', type: 'button', title: `Elimina riga ${i + 1}`, 'aria-label': `Elimina riga ${i + 1} di ${target.label}`, disabled: bloccato(),
      onclick: () => { if (bloccato()) return; righe.splice(i, 1); disegnaRighe(target); segnaModificato(); },
    }, svgIcona('M6 6l12 12M18 6 6 18'))))));
}

function cella(target, colonna, riga, i) {
  const etichetta = `${colonna.label ?? colonna.key}, riga ${i + 1}`;
  if (tipoDi(colonna) === 'boolean') {
    const valore = riga[colonna.key] === true ? 'true' : riga[colonna.key] === false ? 'false' : '';
    return h('select', {
      'aria-label': etichetta, 'data-key': colonna.key, disabled: bloccato(),
      onchange: (ev) => { riga[colonna.key] = ev.target.value === '' ? null : ev.target.value === 'true'; segnaModificato(); },
    }, h('option', { value: '', selected: valore === '', testo: '—' }), h('option', { value: 'true', selected: valore === 'true', testo: 'Sì' }),
    h('option', { value: 'false', selected: valore === 'false', testo: 'No' }));
  }
  return h('input', {
    type: 'text', value: riga[colonna.key] ?? '', maxlength: String(MAX_CELLA), 'aria-label': etichetta, 'data-key': colonna.key, disabled: bloccato(),
    oninput: (ev) => { riga[colonna.key] = pulisciTesto(ev.target.value); segnaModificato(); },
  });
}

// ── Barra di invio ───────────────────────────────────────────────────────────────────────────────────────

function costruisciBarraInvio() {
  const nomi = { 'image/png': ['PNG', 'consigliato per schemi'], 'image/jpeg': ['JPEG', 'per contenuti fotografici'] };
  const formati = h('fieldset', { class: 'formato' },
    h('legend', { testo: 'Formato immagine' }),
    stato.analisi.formati.map((f) => h('label', { class: 'opzione' },
      h('input', { type: 'radio', name: 'formato', value: f, checked: f === stato.formato, 'data-testid': `formato-${nomi[f][0].toLowerCase()}`, onchange: () => { stato.formato = f; aggiornaRiepilogo(); } }),
      h('span', {}, h('strong', { testo: nomi[f][0] }), ` · ${nomi[f][1]}`))));

  ui.riepilogo = h('ul', { class: 'riepilogo', 'data-testid': 'riepilogo' });
  ui.stato = h('p', { class: 'messaggio', role: 'status', 'aria-live': 'polite', 'data-testid': 'stato' });
  ui.errore = h('p', { class: 'messaggio messaggio-errore', role: 'alert', 'data-testid': 'errore', hidden: true });
  ui.esporta = h('button', { class: 'pulsante primario', type: 'button', 'data-testid': 'esporta', onclick: esporta, testo: 'Esporta verso Mario' });
  ui.annulla = h('button', { class: 'pulsante', type: 'button', 'data-testid': 'annulla', onclick: () => chiediAnnulla(), testo: 'Annulla' });
  ui.file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'data-testid': 'file-copia', onchange: caricaCopia });
  const copia = h('div', { class: 'copia-lavoro' },
    h('button', { class: 'collegamento', type: 'button', 'data-testid': 'salva-copia', onclick: salvaCopia, testo: 'Salva copia del lavoro' }),
    h('button', { class: 'collegamento', type: 'button', 'data-testid': 'carica-copia', onclick: () => ui.file.click(), testo: 'Carica copia' }),
    ui.file);

  return h('footer', { class: 'barra-invio', 'data-testid': 'barra-invio' },
    h('div', { class: 'barra-sinistra' }, formati, ui.riepilogo),
    h('div', { class: 'barra-destra' },
      ui.errore, ui.stato,
      h('div', { class: 'pulsanti' }, copia, ui.annulla, ui.esporta)));
}

function righePerInvio() {
  const mappa = new Map();
  const errori = [];
  let escluse = 0;
  for (const t of stato.analisi.tabelle) {
    const r = righeDaInviare(t, stato.righe.get(t.target_id));
    mappa.set(t.target_id, r.rows);
    errori.push(...r.errori);
    escluse += r.escluse;
  }
  return { mappa, errori, escluse };
}

function aggiornaRiepilogo() {
  if (!ui.riepilogo) return;
  const { mappa } = righePerInvio();
  const elementi = stato.analisi.disegni.reduce((n, d) => n + stato.scene.get(d.target_id).elementi.length, 0);
  const righe = [...mappa.values()].reduce((n, r) => n + r.length, 0);
  const compilate = [...mappa.values()].filter((r) => r.length).length;
  const okDisegno = stato.analisi.disegni.every((d) => stato.scene.get(d.target_id).elementi.length > 0);
  const okTabelle = righe > 0;
  const voce = (ok, testo) => h('li', { class: ok ? 'ok' : 'manca' }, h('span', { class: 'segno', 'aria-hidden': 'true', testo: ok ? '✓' : '•' }), h('span', { class: 'solo-lettori', testo: ok ? 'Pronto: ' : 'Da completare: ' }), testo);
  ui.riepilogo.replaceChildren(
    voce(okDisegno, okDisegno ? `Disegno: ${elementi} elementi` : 'Disegno vuoto'),
    voce(okTabelle, okTabelle ? `Tabelle: ${righe} righe in ${compilate} di ${stato.analisi.tabelle.length}` : 'Tabelle: nessuna riga compilata'));
  document.querySelector('[data-ruolo="stato-disegno"]').textContent = okDisegno ? '✓' : '';
  document.querySelector('[data-ruolo="stato-tabelle"]').textContent = okTabelle ? `✓ ${righe}` : '';
}

function mostraInfo(testo) { ui.errore.hidden = true; ui.errore.textContent = ''; ui.stato.textContent = testo; }
function mostraErrore(testo) { ui.stato.textContent = ''; ui.errore.textContent = testo; ui.errore.hidden = false; }

function aggiornaPulsanti({ esporta = stato.fase === 'pronto', annulla = stato.fase === 'pronto' || stato.fase === 'chiuso' } = {}) {
  ui.esporta.disabled = !esporta;
  ui.annulla.disabled = !annulla;
  ui.esporta.setAttribute('aria-busy', String(stato.fase === 'invio'));
}

function impostaBloccoEditor() {
  // Riallinea controlli disabilitati senza perdere il lavoro (le righe restano in memoria).
  for (const t of stato.analisi.tabelle) disegnaRighe(t);
  aggiornaIspettore();
}

async function esporta() {
  if (stato.fase !== 'pronto') return;
  const { analisi } = stato;
  const { mappa, errori } = righePerInvio();
  const disegnoPresente = new Map(analisi.disegni.map((d) => [d.target_id, stato.scene.get(d.target_id).elementi.length > 0]));
  const problemi = [...errori, ...verificaGruppo(analisi, mappa, disegnoPresente)];
  if (problemi.length) {
    mostraErrore(`Non ancora esportabile: ${problemi.join(' ')}`);
    if (problemi.some((p) => p.includes('tabelle'))) mostraScheda('tabelle');
    return;
  }

  const impronta = serializzaStabile({
    formato: stato.formato,
    scene: analisi.disegni.map((d) => stato.scene.get(d.target_id)),
    righe: analisi.tabelle.map((t) => mappa.get(t.target_id)),
  });

  stato.fase = 'invio';
  aggiornaPulsanti({ esporta: false, annulla: false });
  impostaBloccoEditor();
  let pacchetto;
  try {
    if (stato.ultimo?.impronta === impronta) {
      ({ pacchetto } = stato.ultimo); // retry: stesso manifest, stesso result_id, stessi byte dell'immagine
    } else {
      mostraInfo('Preparazione dell\'immagine e del risultato…');
      const disegni = [];
      for (const d of analisi.disegni) {
        const { blob } = await esportaImmagine(stato.scene.get(d.target_id), {
          tipo: stato.formato, limiti: analisi.limiti,
          cartiglio: { titolo: 'GraphXDico — demo · SCHEMA DIMOSTRATIVO', sottotitolo: `${d.label} · ${new Date().toLocaleDateString('it-IT')}` },
        });
        disegni.push({ targetId: d.target_id, blob, caption: DIDASCALIA });
      }
      const tabelle = analisi.tabelle.map((t) => ({ targetId: t.target_id, rows: mappa.get(t.target_id) }));
      pacchetto = await stato.client.prepara(stato.richiesta, { tabelle, disegni });
      stato.ultimo = { impronta, pacchetto, incerto: false };
    }
  } catch (e) {
    stato.fase = 'pronto';
    aggiornaPulsanti();
    impostaBloccoEditor();
    mostraErrore(`Risultato non preparato: ${e.message} Nulla è stato inviato.`);
    return;
  }

  mostraInfo('Invio a Mario… attendi la conferma.');
  try {
    const ack = await stato.client.invia(pacchetto); // notifica GRAFXDICO_DONE all'origine esatta SOLO dopo 200/201 «staged»
    stato.fase = 'inviato';
    concludi({
      titolo: 'Risultato ricevuto da Mario',
      testo: 'Torna a Mario: controlla l\'anteprima del disegno e delle tabelle e premi «Applica al documento». Fino ad allora il documento non cambia.',
      dettagli: [`Formato immagine: ${stato.formato === 'image/png' ? 'PNG' : 'JPEG'}`, ack.replayed ? 'Mario aveva già ricevuto questo stesso risultato (reinvio riconosciuto).' : 'Prima ricezione del risultato.'],
      testid: 'schermata-inviato',
    });
  } catch (e) {
    const esito = classificaErrore(e, 'result');
    if (stato.ultimo) stato.ultimo.incerto = esito.tipo === 'incerto';
    stato.fase = esito.esportaAbilitata ? 'pronto' : 'chiuso';
    aggiornaPulsanti();
    impostaBloccoEditor();
    mostraErrore(esito.messaggio);
    ui.esporta.textContent = esito.tipo === 'incerto' ? 'Riprova invio' : 'Esporta verso Mario';
    if (stato.fase === 'chiuso') stato.modificato = true;
  }
}

function concludi({ titolo, testo, dettagli = [], testid }) {
  stato.modificato = false;
  schermata({ tipo: 'ok', titolo, testo, dettagli, testid });
  const nota = h('p', { class: 'schermata-testo nota-chiusura', 'data-testid': 'nota-chiusura', role: 'status' });
  main().firstElementChild.append(nota);
  setTimeout(() => {
    window.close();
    setTimeout(() => { if (!window.closed) nota.textContent = 'Invio riuscito, puoi chiudere questa finestra.'; }, 400);
  }, 900);
}

// ── Annulla ──────────────────────────────────────────────────────────────────────────────────────────────

function chiediAnnulla() {
  if (!stato.client || ['invio', 'inviato', 'annullato'].includes(stato.fase)) return;
  const dialogo = document.querySelector('[data-testid="dialogo-annulla"]');
  dialogo.addEventListener('close', () => { if (dialogo.returnValue === 'si') annullaSessione(); }, { once: true });
  dialogo.returnValue = '';
  dialogo.showModal();
}

async function annullaSessione() {
  const faseInizio = stato.fase;
  stato.fase = 'invio';
  if (ui.esporta) { aggiornaPulsanti({ esporta: false, annulla: false }); mostraInfo('Annullamento della sessione in Mario…'); }
  try {
    await stato.client.annulla(); // POST …/cancel, poi GRAFXDICO_CANCELLED all'origine esatta
    stato.fase = 'annullato';
    stato.modificato = false;
    schermata({ tipo: 'info', titolo: 'Sessione annullata', testo: 'Mario non ha ricevuto alcun risultato e il documento non è cambiato.', testid: 'schermata-annullato' });
    const nota = h('p', { class: 'schermata-testo', 'data-testid': 'nota-chiusura', role: 'status' });
    main().firstElementChild.append(nota);
    setTimeout(() => { window.close(); setTimeout(() => { if (!window.closed) nota.textContent = 'Puoi chiudere questa finestra.'; }, 400); }, 700);
  } catch (e) {
    const esito = classificaErrore(e, 'cancel');
    stato.fase = esito.tipo === 'chiuso' ? 'chiuso' : faseInizio;
    if (ui.esporta) {
      aggiornaPulsanti({ esporta: stato.fase === 'pronto', annulla: esito.tipo !== 'chiuso' });
      impostaBloccoEditor();
      mostraErrore(`Annullamento non riuscito: ${esito.messaggio}`);
    } else {
      schermata({ tipo: 'errore', titolo: 'Annullamento non riuscito', testo: esito.messaggio });
    }
  }
}

// ── Copia del lavoro (file scaricato dall'utente: niente token né identificativi) ─────────────────────────

function salvaCopia() {
  const dati = serializzaLavoro({ analisi: stato.analisi, scene: stato.scene, righe: stato.righe });
  const url = URL.createObjectURL(new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `graphxdico-demo-lavoro-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  mostraInfo('Copia del lavoro salvata (solo disegno e righe, nessun dato di sessione).');
}

async function caricaCopia(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file || bloccato()) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('File troppo grande per una copia di lavoro.');
    const dati = JSON.parse(await file.text());
    const { scene, righe, avvisi } = importaLavoro(dati, stato.analisi, scenaValida);
    for (const [id, s] of scene) {
      const prec = stato.disegnoAttivo; stato.disegnoAttivo = id; memorizza(); stato.disegnoAttivo = prec;
      stato.scene.set(id, adattaScena(s, proporzioniFoglio(stato.analisi.disegni.find((d) => d.target_id === id))));
    }
    for (const [id, r] of righe) { stato.righe.set(id, r); disegnaRighe(stato.analisi.tabelle.find((t) => t.target_id === id)); }
    editorDisegno.selezionato = null;
    ridimensionaFoglio(); aggiornaIspettore(); segnaModificato();
    mostraInfo(`Copia caricata.${avvisi.length ? ` ${avvisi.join(' ')}` : ''}`);
  } catch (e) {
    mostraErrore(`Copia non caricata: ${e.message}`);
  }
}

avvio().catch(() => {
  schermata({ tipo: 'errore', titolo: 'Errore imprevisto della demo', testo: 'Ricarica la finestra da Mario. Nessun risultato è stato inviato da questo errore.' });
});
