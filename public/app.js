const $ = id => document.getElementById(id);
let config, session, popup, timer, received, lastStamp = '', closedNotice = false, polling = false;
function status(text, type = '') { $('status').textContent = text; $('status').className = `status ${type}`; }
function node(tag, text, cls) { const e = document.createElement(tag); if(text !== undefined) e.textContent = text; if(cls) e.className = cls; return e; }
async function api(url, options = {}) {
  const response = await fetch(url, {cache:'no-store', ...options});
  const data = await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error?.message || `Errore HTTP ${response.status}`), {status:response.status});
  return data;
}
function render(data) {
  received = data.received;
  $('received').hidden = !received;
  $('rejected').hidden = !data.last_rejection;
  if(data.last_rejection) $('rejection-message').textContent = `${data.last_rejection.code}: ${data.last_rejection.message}`;
  const manifest = data.last_rejection?.manifest ?? received?.manifest;
  $('json-panel').hidden = !manifest;
  $('json').textContent = manifest ? JSON.stringify(manifest, null, 2) : '';
  if(!received) return;
  $('images').replaceChildren(); $('tables').replaceChildren();
  for(const target of received.manifest.targets) {
    const original = data.request.targets.find(t=>t.target_id===target.target_id);
    if(target.kind==='image') for(const id of target.asset_ids) {
      const asset = received.images[id]; const fig = node('figure'); const img = node('img');
      img.src = `data:${asset.media_type};base64,${asset.base64}`;
      img.alt = original?.label || 'Disegno ricevuto da GraphXDico';
      fig.append(img, node('figcaption', `${asset.media_type} · ${asset.width} × ${asset.height} px`));
      $('images').append(fig);
    }
    if(target.kind==='table') {
      $('tables').append(node('p', original?.label || target.schema_id, 'table-title'));
      if(!target.rows.length) { $('tables').append(node('p','Nessuna riga per questa tabella.','empty')); continue; }
      const wrap = node('div',undefined,'scroll'); wrap.tabIndex = 0; wrap.setAttribute('aria-label',original?.label || 'Tabella ricevuta');
      const table=node('table'); const head=node('thead'); const tr=node('tr'); const body=node('tbody');
      const columns=original.columns;
      for(const c of columns) {const th=node('th',c.label); th.scope='col';tr.append(th);}
      head.append(tr); table.append(head,body);
      for(const row of target.rows) { const r=node('tr'); for(const c of columns) {const v=row[c.key];r.append(node('td', v===null||v===undefined?'—':typeof v==='boolean'?(v?'Sì':'No'):String(v)));} body.append(r); }
      wrap.append(table);$('tables').append(wrap);
    }
  }
}
async function poll() {
  if(!session || polling) return;
  polling=true;
  try {
    const data=await api(`/demo/sessions/${session.session_id}/status`,{headers:{Authorization:`Bearer ${session.viewer_token}`}});
    const stamp=JSON.stringify([data.status,data.received?.at,data.last_rejection]);
    if(stamp!==lastStamp) { render(data);lastStamp=stamp; }
    if(data.status==='staged') { status('Ricevuto: immagine e tabelle sono arrivate da GraphXDico.','success');clearInterval(timer);$('open').textContent='Avvia una nuova prova'; }
    else if(data.status==='discarded') { status('Operazione annullata. Nessun risultato ricevuto.');clearInterval(timer);$('open').textContent='Riapri GraphXDico'; }
    else if(data.last_rejection) status('GraphXDico ha inviato un risultato da correggere. Leggi il dettaglio e il JSON ricevuto.','error');
    else if(popup?.closed && !closedNotice) {closedNotice=true;status('Finestra chiusa senza risultato. Nessun dato è stato inviato. Puoi avviare una nuova prova.');}
  } catch(e) { status(e.message,'error'); if([401,410].includes(e.status)) clearInterval(timer); }
  finally { polling=false; }
}
$('open').addEventListener('click',async()=>{
  if(!$('editor-url').reportValidity()) return;
  let editorUrl;
  try {
    const url=new URL($('editor-url').value.trim());
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password || url.hash || url.searchParams.has('session') || url.searchParams.has('token')) throw new Error('Usa l’URL dell’editor senza credenziali, #, session o token.');
    if(location.protocol==='https:' && url.protocol!=='https:') throw new Error('Dalla demo HTTPS serve un indirizzo editor HTTPS.');
    editorUrl=url.href;
  } catch(e) {status(e.message || 'Indirizzo non valido.','error');$('editor-url').focus();return;}
  if(session && !received && popup && !popup.closed && !confirm('C’è già una finestra GraphXDico aperta. Avviare una nuova prova?')) {popup.focus();return;}
  const next=window.open('','GraphXDico','width=1200,height=850');
  if(!next) {status('Il browser ha bloccato la finestra. Consenti i popup per questo sito e riprova.','error');return;}
  $('open').disabled=true;clearInterval(timer);
  try {
    const created=await api('/demo/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({editor_url:editorUrl})});
    try {localStorage.setItem('mario-demo-editor-url',editorUrl);} catch {}
    session=created;popup=next;received=null;lastStamp='';closedNotice=false;
    $('received').hidden=true;$('rejected').hidden=true;$('json-panel').hidden=true;
    $('request-panel').hidden=false;$('request').textContent=JSON.stringify(created.request,null,2);
    popup.location.href=created.editor_url;
    // Never retain or render the editor token after navigation.
    delete session.editor_url;
    status('In attesa di GraphXDico. Completa lo schema e premi «Esporta verso Mario» nell’altra finestra.');
    timer=setInterval(poll,1500);
  } catch(e) { next.close();status(e.message,'error'); }
  finally {$('open').disabled=false;}
});
window.addEventListener('message',e=>{
  if(e.origin!==session?.editor_origin || e.source!==popup || e.data?.session_id!==session?.session_id) return;
  if(['GRAFXDICO_DONE','GRAFXDICO_CANCELLED'].includes(e.data?.type)) poll();
});
$('download').addEventListener('click',()=>{
  if(!received) return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(received.manifest,null,2)],{type:'application/json'}));
  const link=node('a');link.href=url;link.download='graphxdico-risultato.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try {
  config=await api('/demo/config');
  let saved;try {saved=localStorage.getItem('mario-demo-editor-url');} catch {}
  $('editor-url').value=saved || config.editorUrl;
  $('open').disabled=false;status('Pronto. Il pulsante apre il vero GraphXDico e prepara la ricezione del risultato.');
} catch(e) {status(`Impossibile preparare il collegamento: ${e.message}`,'error');}
