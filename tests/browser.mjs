// Isolated cross-origin browser test. The external editor is a test double, never graphxdico.it.
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const out=resolve(root,'.runtime',`browser-${Date.now()}`);mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const [mp,ep,cp]=await Promise.all([port(),port(),port()]);
const origin=`http://127.0.0.1:${mp}`,editor=`http://127.0.0.1:${ep}`;
const html=`<!doctype html><title>External editor test double</title><button id="export">Esporta</button><button id="cancel">Annulla</button><script type="module">
import {creaClientMario} from '/adapter.mjs';
const client=creaClientMario({marioOrigin:${JSON.stringify(origin)},originiConsentite:[${JSON.stringify(origin)}]});
const q=await client.leggiRichiesta();window.ready=true;window.format='image/png';
document.querySelector('#export').onclick=async()=>{try{
const c=document.createElement('canvas');c.width=640;c.height=400;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,640,400);x.fillStyle='#0b63ce';x.fillRect(50,50,220,120);x.fillStyle='black';x.font='24px sans-serif';x.fillText('Schema di prova',50,220);
const blob=await new Promise(r=>c.toBlob(r,window.format));
const images=q.targets.filter(t=>t.kind==='image').map(t=>({targetId:t.target_id,blob}));
const tables=q.targets.filter(t=>t.kind==='table').map((t,i)=>({targetId:t.target_id,rows:i===0?[Object.fromEntries(t.columns.map(c=>[c.key,c.type==='boolean'?true:'Riga ricevuta']))]:[]}));
const p=await client.prepara(q,{disegni:images,tabelle:tables});await client.invia(p,{chiudiDopoInvio:true});
}catch(e){document.body.append(e.message);window.failure=e.message;}};
document.querySelector('#cancel').onclick=()=>client.annulla({chiudiDopoAnnulla:true});
</script>`;
const external=http.createServer((req,res)=>{if(req.url.startsWith('/adapter.mjs')){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(resolve(root,'integration/grafxdico-mario-client.mjs')));}else{res.setHeader('Content-Type','text/html');res.end(html);}});
await new Promise(r=>external.listen(ep,'127.0.0.1',r));
const php=spawn(process.env.PHP_BINARY??'php',['-d','xdebug.mode=off','-d','xdebug.log=','-S',`127.0.0.1:${mp}`,'-t','public','server/router.php'],{cwd:root,env:{...process.env,PUBLIC_ORIGIN:origin,GRAPHXDICO_URL:editor+'/',DEMO_DATA_DIR:resolve(out,'data')},windowsHide:true,stdio:'ignore'});
const chrome=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${cp}`,`--user-data-dir=${resolve(out,'chrome')}`,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;let cdp;const checks=[];
function assert(c,n){if(!c)throw new Error(n);checks.push(n);}
try{
 let info;
 for(let i=0;i<70;i++){try{info=await(await fetch(`http://127.0.0.1:${cp}/json/version`)).json();await fetch(origin+'/healthz');break;}catch{await wait(150);}}
 if(!info)throw new Error('Chrome not ready');
 ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
 let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 cdp=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const k=++id;pending.set(k,{resolve,reject});ws.send(JSON.stringify({id:k,method,params,sessionId}));});
 async function attach(targetId){const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});return sessionId;}
 async function evaluate(s,fn,...args){const r=await cdp('Runtime.evaluate',{expression:`(${fn})(...${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true,userGesture:true},s);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;}
 async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await wait(100);}throw new Error('Browser wait timed out');}
 const {targetId}=await cdp('Target.createTarget',{url:origin});const page=await attach(targetId);
 await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false},page);
 await until(()=>evaluate(page,()=>document.querySelector('#open')?.disabled===false));
 await evaluate(page,url=>{document.querySelector('#editor-url').value=url;},editor+'/custom-editor?mode=mario');
 for(const format of ['image/png','image/jpeg']){
  await evaluate(page,()=>document.querySelector('#open').click());
  let pop;
  await until(async()=>{const t=await cdp('Target.getTargets');pop=t.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(editor));return !!pop;});
  const popup=await attach(pop.targetId);
  assert(pop.url.startsWith(editor+'/custom-editor?mode=mario&session='),'textbox URL used for popup');
  await until(()=>evaluate(popup,()=>window.ready===true));
  await evaluate(popup,f=>{window.format=f;document.querySelector('#export').click();},format);
  await until(()=>evaluate(page,()=>!document.querySelector('#received').hidden));
  assert(await evaluate(page,f=>document.querySelector('#images img').src.startsWith('data:'+f),format),format+' rendered');
  assert(await evaluate(page,()=>document.querySelector('#tables').textContent.includes('Riga ricevuta')),'JSON rendered as table');
  assert(await evaluate(page,()=>document.querySelector('#json').textContent.includes('mario.grafxdico')),'raw manifest visible');
  assert(await evaluate(page,()=>document.documentElement.scrollWidth<=innerWidth+1),'desktop no horizontal page overflow');
 }
 let shot=await cdp('Page.captureScreenshot',{format:'png'},page);writeFileSync(resolve(out,'desktop.png'),Buffer.from(shot.data,'base64'));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},page);
 assert(await evaluate(page,()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile no horizontal page overflow');
 shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},page);writeFileSync(resolve(out,'mobile.png'),Buffer.from(shot.data,'base64'));
 await evaluate(page,()=>document.querySelector('#open').click());
 let pop;
 await until(async()=>{const t=await cdp('Target.getTargets');pop=t.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(editor));return !!pop;});
 const popup=await attach(pop.targetId);await until(()=>evaluate(popup,()=>window.ready===true));
 await evaluate(popup,()=>document.querySelector('#cancel').click());
 await until(()=>evaluate(page,()=>document.querySelector('#status').textContent.includes('annullata')));
 assert(await evaluate(page,()=>document.querySelector('#received').hidden),'cancel leaves no received result');
 await cdp('Page.reload',{},page);
 await until(()=>evaluate(page,()=>document.querySelector('#open')?.disabled===false));
 assert(await evaluate(page,url=>document.querySelector('#editor-url').value===url,editor+'/custom-editor?mode=mario'),'editor URL remembered after reload');
 writeFileSync(resolve(out,'result.json'),JSON.stringify({checks,external:'test double, not real GraphXDico'},null,2));
 console.log('PASS',checks.length,'browser checks. Screenshots:',out);
} finally {
 if(cdp){try{await cdp('Browser.close');}catch{}} ws?.close();
 chrome.kill();php.kill();external.close();
}
