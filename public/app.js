const $ = id => document.getElementById(id);
let config, session, popup, timer, received, deliveries = [], lastStamp = '', closedNotice = false, polling = false;
function status(text, type = '') { $('status').textContent = text; $('status').className = `status ${type}`; }
function node(tag, text, cls) { const e = document.createElement(tag); if(text !== undefined) e.textContent = text; if(cls) e.className = cls; return e; }
async function api(url, options = {}) {
  const response = await fetch(url, {cache:'no-store', ...options});
  const data = await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error?.message || `Errore HTTP ${response.status}`), {status:response.status});
  return data;
}
function render(data) {
  deliveries = data.deliveries ?? (data.received ? [data.received] : []);
  received = deliveries.at(-1);
  $('received').hidden = !received;
  $('rejected').hidden = !data.last_rejection;
  if(data.last_rejection) $('rejection-message').textContent = `${data.last_rejection.code}: ${data.last_rejection.message}`;
  const manifest = received || data.last_rejection ? {invii:deliveries.map(d=>d.manifest), ...(data.last_rejection ? {ultimoInvioRifiutato:data.last_rejection.manifest} : {})} : null;
  $('json-panel').hidden = !manifest;
  $('json').textContent = manifest ? JSON.stringify(manifest, null, 2) : '';
  if(!received) return;
  $('deliveries').replaceChildren();
  for(const [index,delivery] of deliveries.entries()) {
    const article=node('article',undefined,'delivery'); article.append(node('h3',`Invio ${index+1}`));
    const layout=node('div',undefined,'results');const images=node('section',undefined,'images');const tables=node('section',undefined,'tables');
    images.append(node('h4','Disegno'));tables.append(node('h4','Tabelle associate'));layout.append(images,tables);article.append(layout);$('deliveries').append(article);
  const native=delivery.manifest.grafxdico_tabelle;
  const displayTargets=native ? [
    ...delivery.manifest.targets.filter(t=>t.kind==='image'),
    ...native.map(t=>({kind:'table',native:true,label:t.titolo,schema_id:t.id,columns:t.colonne,rows:t.righe,text:t.testo}))
  ] : delivery.manifest.targets;
  for(const target of displayTargets) {
    const original = target.native ? target : data.request.targets.find(t=>t.target_id===target.target_id);
    if(target.kind==='image') for(const id of target.asset_ids) {
      const asset = delivery.images[id]; const fig = node('figure'); const img = node('img');
      img.src = `data:${asset.media_type};base64,${asset.base64}`;
      img.alt = original?.label || 'Disegno ricevuto da GraphXDico';
      fig.append(img, node('figcaption', `${asset.media_type} · ${asset.width} × ${asset.height} px`));
      images.append(fig);
    }
    if(target.kind==='table') {
      tables.append(node('p', original?.label || target.schema_id, 'table-title'));
      if(target.native && target.text) tables.append(node('p',target.text,'muted'));
      if(!target.rows.length) { tables.append(node('p','Nessuna riga per questa tabella.','empty')); continue; }
      const wrap = node('div',undefined,'scroll'); wrap.tabIndex = 0; wrap.setAttribute('aria-label',original?.label || 'Tabella ricevuta');
      const table=node('table'); const head=node('thead'); const tr=node('tr'); const body=node('tbody');
      const columns=original.columns;
      for(const c of columns) {const th=node('th',c.label); th.scope='col';tr.append(th);}
      head.append(tr); table.append(head,body);
      for(const row of target.rows) { const r=node('tr'); for(const c of columns) {const v=row[c.key];r.append(node('td', v===null||v===undefined?'—':typeof v==='boolean'?(v?'Sì':'No'):String(v)));} body.append(r); }
      wrap.append(table);tables.append(wrap);
    }
  }
  }
}
async function poll() {
  if(!session || polling) return;
  polling=true;
  try {
    let data=await api(`/demo/sessions/${session.session_id}/status`,{headers:{Authorization:`Bearer ${session.viewer_token}`}});
    if(popup?.closed && !closedNotice && !['closed','discarded'].includes(data.status)) {
      data=await api(`/demo/sessions/${session.session_id}/close`,{method:'POST',headers:{Authorization:`Bearer ${session.viewer_token}`}});
      closedNotice=true;
    }
    const stamp=JSON.stringify([data.status,data.deliveries?.map(d=>d.manifest.result_id),data.last_rejection]);
    if(stamp!==lastStamp) { render(data);lastStamp=stamp; }
    if(['closed','discarded'].includes(data.status)) {
      closedNotice=true;
      status(deliveries.length ? `Sessione conclusa. ${deliveries.length} invii ricevuti e conservati qui sotto.` : 'Sessione conclusa senza invii.','success');
      clearInterval(timer);$('open').textContent='Avvia una nuova prova';$('editor-url').disabled=false;
    } else if(data.last_rejection) status('Ultimo invio da correggere. Gli invii precedenti restano disponibili.','error');
    else if(deliveries.length) status(`${deliveries.length} invii ricevuti. Mario resta in ascolto: puoi inviare ancora dalla stessa finestra GraphXDico.`,'success');
  } catch(e) { status(e.message,'error'); if([401,410].includes(e.status)) {clearInterval(timer);closedNotice=true;$('editor-url').disabled=false;$('open').textContent='Avvia una nuova prova';} }
  finally { polling=false; }
}
$('open').addEventListener('click',async()=>{
  if(session && popup && !popup.closed && !closedNotice) {popup.focus();return;}
  if(deliveries.length && !confirm('Avviare una nuova sessione? Scarica il JSON se vuoi conservare gli invii mostrati prima di sostituire questa vista.')) return;
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
    session=created;popup=next;received=null;deliveries=[];lastStamp='';closedNotice=false;
    $('received').hidden=true;$('rejected').hidden=true;$('json-panel').hidden=true;
    $('request-panel').hidden=false;$('request').textContent=JSON.stringify(created.request,null,2);
    popup.location.href=created.editor_url;
    // Never retain or render the editor token after navigation.
    delete session.editor_url;
    status('In attesa di GraphXDico. Completa lo schema e premi «Esporta verso Mario» nell’altra finestra.');
    $('open').textContent='Torna a GraphXDico';$('editor-url').disabled=true;
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
  const url=URL.createObjectURL(new Blob([JSON.stringify({invii:deliveries.map(d=>d.manifest)},null,2)],{type:'application/json'}));
  const link=node('a');link.href=url;link.download='graphxdico-risultato.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try {
  config=await api('/demo/config');
  let saved;try {saved=localStorage.getItem('mario-demo-editor-url');} catch {}
  $('editor-url').value=saved || config.editorUrl;
  $('open').disabled=false;status('Pronto. Il pulsante apre il vero GraphXDico e prepara la ricezione del risultato.');
} catch(e) {status(`Impossibile preparare il collegamento: ${e.message}`,'error');}
