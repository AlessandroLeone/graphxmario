/** Adapter di riferimento per il browser GrafxDico. Non è un SDK già collaudato live.
 * L'origine Mario va configurata: l'apertura attuale non la passa automaticamente.
 * Non loggare il client, il token, gli header o l'URL con il frammento.
 *
 * Revisione 2026-11-12 (contratto CONTRATTO_GRAPHXDICO_ATTUALE.md): la richiesta porta `group` e `required: true` sui
 * target. Il risultato deve contenere OGNI target obbligatorio (disegno E tabelle) e almeno una riga fra le tabelle:
 * `prepara()` lo verifica prima di inviare, così un risultato parziale non parte nemmeno (Mario lo rifiuterebbe con
 * 422 `result_incomplete` / `group_tables_empty`).
 */
export function creaClientMario({ marioOrigin, originiConsentite }) {
  function origineEsatta(value) {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== value) {
      throw new Error('Configurare una origine esatta: protocollo, host e porta, senza percorso.');
    }
    return u.origin;
  }
  const origine = origineEsatta(marioOrigin);
  if (!Array.isArray(originiConsentite) || !originiConsentite.includes(origine)) {
    throw new Error('Origine Mario non approvata nella configurazione GrafxDico.');
  }
  const sessionId = new URLSearchParams(window.location.search).get('session');
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (!sessionId || !token) throw new Error('Aprire questa integrazione da Mario.');
  const base = `${origine}/grafxdico/sessions/${encodeURIComponent(sessionId)}`;

  async function api(suffisso, { method = 'GET', body } = {}) {
    const r = await fetch(`${base}/${suffisso}`, {
      method, body, mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      // Non impostare Content-Type per FormData: il browser genera il boundary.
    });
    let data;
    try { data = await r.json(); }
    catch { throw new Error(`Risposta Mario non leggibile (HTTP ${r.status}). Conservare il lavoro.`); }
    if (!r.ok) {
      const errore = new Error(data.error?.message || `Invio non riuscito (HTTP ${r.status}).`);
      errore.code = data.error?.code;
      errore.status = r.status;
      throw errore;
    }
    return data;
  }
  function notifica(type) {
    window.opener?.postMessage({ type, session_id: sessionId }, origine);
  }
  async function leggiRichiesta() {
    const richiesta = await api('request');
    if (richiesta.protocol !== 'mario.grafxdico' || richiesta.version !== 1 ||
        richiesta.session_id !== sessionId || !Array.isArray(richiesta.targets)) {
      throw new Error('Protocollo, versione o sessione non supportati.');
    }
    return richiesta;
  }
  async function prepara(richiesta, { tabelle = [], disegni = [] }) {
    if (richiesta.session_id !== sessionId || richiesta.protocol !== 'mario.grafxdico' || richiesta.version !== 1) {
      throw new Error('Richiesta non appartenente a questa integrazione.');
    }
    const presi = new Set();
    function target(id, kind) {
      const t = richiesta.targets.find((voce) => voce.target_id === id && voce.kind === kind);
      if (!t || presi.has(id)) throw new Error('Destinazione non richiesta o duplicata.');
      presi.add(id);
      return { target_id: t.target_id, kind: t.kind, schema_id: t.schema_id, schema_version: t.schema_version };
    }
    const manifest = {
      protocol: richiesta.protocol, version: richiesta.version, session_id: sessionId,
      request_id: richiesta.request_id, document_revision: richiesta.document_revision,
      result_id: `grafxdico-${crypto.randomUUID()}`, targets: [], assets: []
    };
    const file = [];
    for (const tabella of tabelle) {
      if (!Array.isArray(tabella.rows)) throw new Error('Le righe devono essere un array.');
      // Il chiamante costruisce le righe secondo columns/key/type della richiesta.
      // Non convertire automaticamente false/null/testo e non aggiungere colonne.
      manifest.targets.push({ ...target(tabella.targetId, 'table'), rows: structuredClone(tabella.rows) });
    }
    for (const disegno of disegni) {
      const t = target(disegno.targetId, 'image');
      const blob = disegno.blob;
      if (!(blob instanceof Blob) || !['image/png', 'image/jpeg'].includes(blob.type)) {
        throw new Error('Esportare il disegno come Blob PNG o JPEG reale.');
      }
      if (blob.size > richiesta.limits.image_bytes) throw new Error('Immagine troppo pesante.');
      const bitmap = await createImageBitmap(blob);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (width * height > richiesta.limits.image_megapixels * 1e6) throw new Error('Troppi megapixel.');
      const assetId = `drawing-${file.length + 1}`;
      const estensione = blob.type === 'image/png' ? 'png' : 'jpg';
      const sha = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(sha), (v) => v.toString(16).padStart(2, '0')).join('');
      manifest.targets.push({ ...t, asset_ids: [assetId] });
      manifest.assets.push({
        asset_id: assetId, path: `assets/${assetId}.${estensione}`, media_type: blob.type,
        sha256, width, height, caption: disegno.caption ?? null
      });
      file.push({ assetId, filename: `${assetId}.${estensione}`, blob });
    }
    if (!manifest.targets.length) throw new Error('Nessun risultato selezionato.');
    // Gruppo obbligatorio: disegno E tabelle insieme, nessuna metà.
    const obbligatori = richiesta.group?.required_target_ids
      ?? richiesta.targets.filter((t) => t.required === true).map((t) => t.target_id);
    const mancanti = obbligatori.filter((id) => !presi.has(id));
    if (mancanti.length) {
      const nomi = richiesta.targets.filter((t) => mancanti.includes(t.target_id)).map((t) => t.label).join(', ');
      throw new Error(`Risultato incompleto: invia insieme disegno e tabelle. Mancano: ${nomi}.`);
    }
    const tabelleDelGruppo = manifest.targets.filter((t) => t.kind === 'table' && obbligatori.includes(t.target_id));
    if (tabelleDelGruppo.length && tabelleDelGruppo.every((t) => t.rows.length === 0)) {
      throw new Error('Le tabelle del gruppo sono tutte vuote: compila la distinta del disegno.');
    }
    if (file.length > richiesta.limits.max_images) throw new Error('Troppe immagini.');
    const righe = manifest.targets.reduce((n, t) => n + (t.rows?.length || 0), 0);
    if (righe > richiesta.limits.max_rows) throw new Error('Troppe righe.');
    // Congelare il JSON qui: i retry devono inviare gli stessi dati e lo stesso ID.
    return { manifestJson: JSON.stringify(manifest), resultId: manifest.result_id, file };
  }
  async function invia(pacchetto, { chiudiDopoInvio = false } = {}) {
    const body = new FormData();
    body.append('manifest', pacchetto.manifestJson);
    for (const f of pacchetto.file) body.append(`assets[${f.assetId}]`, f.blob, f.filename);
    const ack = await api('result', { method: 'POST', body });
    if (ack.status !== 'staged' || ack.session_id !== sessionId || ack.result_id !== pacchetto.resultId) {
      throw new Error('Conferma Mario inattesa: non chiudere il lavoro.');
    }
    notifica('GRAFXDICO_DONE');
    // Per un nuovo invio richiamare prepara(); per un retry riusare lo stesso pacchetto.
    // Il flusso normale lascia la finestra aperta per altre esportazioni.
    if (chiudiDopoInvio) window.close();
    return ack;
  }
  async function annulla({ chiudiDopoAnnulla = false } = {}) {
    const ack = await api('cancel', { method: 'POST' });
    if (!['discarded','closed'].includes(ack.status) || ack.session_id !== sessionId) throw new Error('Annullamento non confermato.');
    notifica('GRAFXDICO_CANCELLED');
    if (chiudiDopoAnnulla) window.close();
    return ack;
  }
  return { leggiRichiesta, prepara, invia, annulla };
}
