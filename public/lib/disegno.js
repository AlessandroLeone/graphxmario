// GraphXDico — demo. Modello dello schema tecnico DIMOSTRATIVO, disegno su Canvas 2D ed esportazione PNG/JPEG reale.
// Non è un CAD: simboli, tubazioni/linee e testi su un foglio a griglia.

export const GRIGLIA = 10;
export const ALTEZZA_CARTIGLIO = 86;

export const RETI = {
  gas: { nome: 'Gas', colore: '#b98900', tratteggio: [] },
  acqua_fredda: { nome: 'Acqua fredda', colore: '#1d5fc2', tratteggio: [] },
  acqua_calda: { nome: 'Acqua calda / riscaldamento', colore: '#c23a22', tratteggio: [] },
  elettrico: { nome: 'Linea elettrica', colore: '#6d3fc0', tratteggio: [10, 7] },
};

export const SIMBOLI = {
  contatore: 'Contatore gas',
  valvola: 'Valvola',
  caldaia: 'Caldaia',
  radiatore: 'Radiatore',
  piano_cottura: 'Piano cottura',
  punto_acqua: 'Punto acqua',
  quadro: 'Quadro elettrico',
  presa: 'Presa',
  punto_luce: 'Punto luce',
};

const MEZZO = 30; // metà lato del simbolo (unità logiche)
const SOTTO = MEZZO + 30; // sotto il simbolo E la sua etichetta: le linee non coprono il testo
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

export const aGriglia = (v) => Math.round(v / GRIGLIA) * GRIGLIA;

let progressivo = 0;
export function nuovoId(prefisso = 'el') {
  progressivo += 1;
  return `${prefisso}${Date.now().toString(36)}${progressivo}`;
}

export function scenaVuota({ w, h }) {
  return { w, h, elementi: [] };
}

/** Schema d'esempio, chiaramente dimostrativo, adattato alle proporzioni del foglio. */
export function scenaDemo({ w, h }) {
  const area = h - ALTEZZA_CARTIGLIO - 40;
  const y = (f) => aGriglia(40 + area * f);
  const x = (f) => aGriglia(w * f);
  const s = (simbolo, fx, fy, etichetta) => ({ id: nuovoId('s'), tipo: 'simbolo', simbolo, x: x(fx), y: y(fy), etichetta });
  const l = (rete, a, b) => ({ id: nuovoId('l'), tipo: 'linea', rete, x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
  const t = (fx, fy, testo) => ({ id: nuovoId('t'), tipo: 'testo', x: x(fx), y: y(fy), testo });

  const contatore = s('contatore', 0.12, 0.12, 'Contatore (demo)');
  const valvola = s('valvola', 0.36, 0.12, 'Valvola V1');
  const caldaia = s('caldaia', 0.62, 0.12, 'Caldaia (demo)');
  const cottura = s('piano_cottura', 0.36, 0.42, 'Piano cottura');
  const rad1 = s('radiatore', 0.86, 0.36, 'Radiatore R1');
  const rad2 = s('radiatore', 0.86, 0.6, 'Radiatore R2');
  const acqua = s('punto_acqua', 0.62, 0.42, 'Lavello');
  const quadro = s('quadro', 0.12, 0.8, 'Quadro QE');
  const presa = s('presa', 0.4, 0.8, 'Presa cucina');
  const luce = s('punto_luce', 0.66, 0.8, 'Punto luce');

  const elementi = [
    t(0.04, 0.0, 'SCHEMA DIMOSTRATIVO — dati non reali'),
    contatore, valvola, caldaia, cottura, rad1, rad2, acqua, quadro, presa, luce,
    l('gas', [contatore.x + MEZZO, contatore.y], [valvola.x - MEZZO, valvola.y]),
    l('gas', [valvola.x + MEZZO, valvola.y], [caldaia.x - MEZZO, caldaia.y]),
    l('gas', [valvola.x, valvola.y + SOTTO], [cottura.x, cottura.y - MEZZO]),
    l('acqua_calda', [caldaia.x + MEZZO, caldaia.y], [rad1.x, caldaia.y]),
    l('acqua_calda', [rad1.x, caldaia.y], [rad1.x, rad1.y - MEZZO]),
    l('acqua_calda', [rad1.x, rad1.y + SOTTO], [rad2.x, rad2.y - MEZZO]),
    l('acqua_fredda', [caldaia.x, caldaia.y + SOTTO], [acqua.x, acqua.y - MEZZO]),
    l('elettrico', [quadro.x + MEZZO, quadro.y], [presa.x - MEZZO, presa.y]),
    l('elettrico', [presa.x + MEZZO, presa.y], [luce.x - MEZZO, luce.y]),
  ];
  return { w, h, elementi };
}

/** Struttura minima di una scena importata da una copia di lavoro. */
export function scenaValida(scena) {
  return !!scena && Number.isFinite(scena.w) && Number.isFinite(scena.h) && Array.isArray(scena.elementi)
    && scena.elementi.every((e) => e && typeof e.id === 'string' && ['simbolo', 'linea', 'testo'].includes(e.tipo)
      && (e.tipo !== 'simbolo' || e.simbolo in SIMBOLI) && (e.tipo !== 'linea' || e.rete in RETI));
}

/** Riporta una scena importata sulle proporzioni del foglio corrente (scala uniforme sull'area utile). */
export function adattaScena(scena, foglio) {
  if (scena.w === foglio.w && scena.h === foglio.h) return structuredClone(scena);
  const k = Math.min(foglio.w / scena.w, (foglio.h - ALTEZZA_CARTIGLIO) / Math.max(1, scena.h - ALTEZZA_CARTIGLIO));
  const elementi = scena.elementi.map((e) => {
    const c = structuredClone(e);
    for (const p of ['x', 'y', 'x1', 'y1', 'x2', 'y2']) if (p in c) c[p] = aGriglia(c[p] * k);
    return c;
  });
  return { w: foglio.w, h: foglio.h, elementi };
}

// ── Selezione ────────────────────────────────────────────────────────────────

function distanzaSegmento(px, py, e) {
  const dx = e.x2 - e.x1;
  const dy = e.y2 - e.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - e.x1) * dx + (py - e.y1) * dy) / len2));
  return Math.hypot(px - (e.x1 + t * dx), py - (e.y1 + t * dy));
}

export function larghezzaTesto(testo) {
  return Math.max(20, String(testo).length * 9.2);
}

/** Elemento sotto il punto (il più in alto), oppure l'estremo di una linea selezionata. */
export function colpisci(scena, px, py, selezionato = null) {
  if (selezionato?.tipo === 'linea') {
    if (Math.hypot(px - selezionato.x1, py - selezionato.y1) <= 12) return { elemento: selezionato, maniglia: 1 };
    if (Math.hypot(px - selezionato.x2, py - selezionato.y2) <= 12) return { elemento: selezionato, maniglia: 2 };
  }
  for (let i = scena.elementi.length - 1; i >= 0; i -= 1) {
    const e = scena.elementi[i];
    if (e.tipo === 'simbolo' && Math.abs(px - e.x) <= MEZZO + 4 && py >= e.y - MEZZO - 4 && py <= e.y + MEZZO + 24) {
      return { elemento: e, maniglia: 0 };
    }
    if (e.tipo === 'testo' && px >= e.x - 4 && px <= e.x + larghezzaTesto(e.testo) && py >= e.y - 18 && py <= e.y + 6) {
      return { elemento: e, maniglia: 0 };
    }
    if (e.tipo === 'linea' && distanzaSegmento(px, py, e) <= 8) return { elemento: e, maniglia: 0 };
  }
  return null;
}

export function sposta(e, dx, dy) {
  if (e.tipo === 'linea') { e.x1 += dx; e.y1 += dy; e.x2 += dx; e.y2 += dy; } else { e.x += dx; e.y += dy; }
}

// ── Disegno ──────────────────────────────────────────────────────────────────

function simbolo(ctx, e) {
  const { x, y } = e;
  const m = MEZZO;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#1b2433';
  ctx.fillStyle = '#ffffff';
  const quadrato = () => { ctx.beginPath(); ctx.rect(x - m, y - m, 2 * m, 2 * m); ctx.fill(); ctx.stroke(); };
  const sigla = (txt, size = 20) => {
    ctx.fillStyle = '#1b2433';
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
  };
  switch (e.simbolo) {
    case 'contatore':
      quadrato(); sigla('G'); break;
    case 'valvola':
      ctx.beginPath();
      ctx.moveTo(x - m, y - m * 0.6); ctx.lineTo(x + m, y + m * 0.6); ctx.lineTo(x + m, y - m * 0.6); ctx.lineTo(x - m, y + m * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'caldaia':
      quadrato();
      ctx.beginPath();
      ctx.moveTo(x, y - m * 0.65);
      ctx.bezierCurveTo(x + m * 0.6, y - m * 0.1, x + m * 0.45, y + m * 0.6, x, y + m * 0.6);
      ctx.bezierCurveTo(x - m * 0.45, y + m * 0.6, x - m * 0.6, y - m * 0.1, x, y - m * 0.65);
      ctx.fillStyle = '#f3b13a'; ctx.fill(); ctx.stroke();
      break;
    case 'radiatore':
      ctx.beginPath(); ctx.rect(x - m, y - m * 0.6, 2 * m, 1.2 * m); ctx.fill(); ctx.stroke();
      for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.moveTo(x + i * m * 0.36, y - m * 0.6); ctx.lineTo(x + i * m * 0.36, y + m * 0.6); ctx.stroke(); }
      break;
    case 'piano_cottura':
      quadrato();
      for (const [dx, dy] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
        ctx.beginPath(); ctx.arc(x + dx * m, y + dy * m, m * 0.26, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    case 'punto_acqua':
      ctx.beginPath(); ctx.arc(x, y, m * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); sigla('A', 18); break;
    case 'quadro':
      quadrato(); sigla('QE', 17); break;
    case 'presa':
      ctx.beginPath(); ctx.arc(x, y + m * 0.25, m * 0.75, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + m * 0.25); ctx.lineTo(x, y + m * 0.75); ctx.stroke();
      break;
    case 'punto_luce':
      ctx.beginPath(); ctx.arc(x, y, m * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - m * 0.5, y - m * 0.5); ctx.lineTo(x + m * 0.5, y + m * 0.5);
      ctx.moveTo(x + m * 0.5, y - m * 0.5); ctx.lineTo(x - m * 0.5, y + m * 0.5);
      ctx.stroke();
      break;
    default:
      quadrato(); sigla('?');
  }
  if (e.etichetta) {
    ctx.fillStyle = '#1b2433';
    ctx.font = `500 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(e.etichetta, x, y + m + 6);
  }
  ctx.restore();
}

function linea(ctx, e) {
  const rete = RETI[e.rete] ?? RETI.gas;
  ctx.save();
  ctx.strokeStyle = rete.colore;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash(rete.tratteggio);
  ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
  ctx.restore();
}

function testo(ctx, e) {
  ctx.save();
  ctx.fillStyle = '#1b2433';
  ctx.font = `600 16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(e.testo, e.x, e.y);
  ctx.restore();
}

function cartiglio(ctx, scena, { titolo, sottotitolo }) {
  const y0 = scena.h - ALTEZZA_CARTIGLIO;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, y0, scena.w, ALTEZZA_CARTIGLIO);
  ctx.strokeStyle = '#1b2433';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, y0 + 8, scena.w - 24, ALTEZZA_CARTIGLIO - 20);

  // Legenda delle sole reti usate.
  const usate = Object.entries(RETI).filter(([k]) => scena.elementi.some((e) => e.tipo === 'linea' && e.rete === k));
  let lx = 28;
  const ly = y0 + 58;
  ctx.font = `500 12px ${FONT}`;
  ctx.textBaseline = 'middle';
  for (const [, r] of usate) {
    ctx.strokeStyle = r.colore; ctx.lineWidth = 4; ctx.setLineDash(r.tratteggio);
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 26, ly); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#1b2433';
    ctx.fillText(r.nome, lx + 32, ly);
    lx += 32 + ctx.measureText(r.nome).width + 22;
  }

  ctx.fillStyle = '#1b2433';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(titolo, 28, y0 + 32);
  ctx.font = `500 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(sottotitolo, scena.w - 28, y0 + 32);
  ctx.restore();
}

/**
 * Disegna la scena. `scala` converte unità logiche → pixel. Con `schermo` compaiono griglia, selezione e anteprime,
 * che NON entrano nell'immagine esportata.
 */
export function disegna(ctx, scena, { scala, schermo = null, cartiglio: testi }) {
  ctx.save();
  ctx.setTransform(scala, 0, 0, scala, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, scena.w, scena.h);

  if (schermo) {
    ctx.fillStyle = '#c9d2df';
    const passo = GRIGLIA * 2;
    for (let gx = passo; gx < scena.w; gx += passo) {
      for (let gy = passo; gy < scena.h - ALTEZZA_CARTIGLIO; gy += passo) ctx.fillRect(gx - 0.8, gy - 0.8, 1.6, 1.6);
    }
  }

  for (const e of scena.elementi) if (e.tipo === 'linea') linea(ctx, e);
  for (const e of scena.elementi) if (e.tipo === 'simbolo') simbolo(ctx, e);
  for (const e of scena.elementi) if (e.tipo === 'testo') testo(ctx, e);
  if (schermo?.anteprima) linea(ctx, schermo.anteprima);

  cartiglio(ctx, scena, testi);

  const sel = schermo?.selezionato;
  if (sel) {
    ctx.save();
    ctx.strokeStyle = '#0b63ce';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    if (sel.tipo === 'simbolo') ctx.strokeRect(sel.x - MEZZO - 6, sel.y - MEZZO - 6, 2 * MEZZO + 12, 2 * MEZZO + 32);
    if (sel.tipo === 'testo') ctx.strokeRect(sel.x - 6, sel.y - 20, larghezzaTesto(sel.testo) + 12, 28);
    if (sel.tipo === 'linea') {
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      for (const [hx, hy] of [[sel.x1, sel.y1], [sel.x2, sel.y2]]) {
        ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Icona di un simbolo per la tavolozza (canvas quadrato). */
export function disegnaIcona(canvas, nome) {
  const dpr = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
  const lato = canvas.clientWidth || 28;
  canvas.width = Math.round(lato * dpr);
  canvas.height = Math.round(lato * dpr);
  const ctx = canvas.getContext('2d');
  const k = (lato * dpr) / 72;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, 72, 72);
  simbolo(ctx, { x: 36, y: 36, simbolo: nome });
}

function canvasABlob(canvas, tipo, qualita) {
  return new Promise((risolvi, rifiuta) => {
    canvas.toBlob((b) => (b ? risolvi(b) : rifiuta(new Error('Il browser non ha generato l\'immagine.'))), tipo, qualita);
  });
}

/**
 * Esporta un'immagine RASTER reale (PNG o JPEG) entro i limiti della richiesta.
 * Larghezza indicativa 2400 px (circa 20 cm a 300 dpi), ridotta se servono meno megapixel o meno byte.
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function esportaImmagine(scena, { tipo, limiti, cartiglio: testi, larghezza = 2400 }) {
  if (!['image/png', 'image/jpeg'].includes(tipo)) throw new Error('Formato non supportato: solo PNG o JPEG.');
  const maxPixel = Number(limiti.image_megapixels) * 1e6 * 0.98;
  let w = larghezza;
  const rapporto = scena.h / scena.w;
  if (w * w * rapporto > maxPixel) w = Math.floor(Math.sqrt(maxPixel / rapporto));
  const qualita = tipo === 'image/jpeg' ? [0.92, 0.85, 0.75] : [undefined];

  for (let tentativo = 0; tentativo < 6; tentativo += 1) {
    const width = Math.max(200, Math.round(w));
    const height = Math.max(150, Math.round(width * rapporto));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    disegna(ctx, scena, { scala: width / scena.w, cartiglio: testi });
    for (const q of qualita) {
      const blob = await canvasABlob(canvas, tipo, q);
      if (blob.type !== tipo) throw new Error(`Il browser non sa produrre ${tipo}.`);
      if (blob.size <= limiti.image_bytes) return { blob, width, height };
    }
    w *= 0.8;
  }
  throw new Error('Impossibile restare entro il limite di dimensione dell\'immagine di Mario.');
}
