"""Focused receiver checks; temporary isolated storage, no real Mario services."""
import base64, hashlib, json, os, socket, subprocess, tempfile, time, urllib.request, urllib.error, uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PHP=os.environ.get('PHP_BINARY','php')
passed=[]
def check(ok, name):
    assert ok, name
    passed.append(name)
def call(path, method='GET', token=None, origin=None, manifest=None, files=None, json_body=None):
    headers={}
    if token: headers['Authorization']='Bearer '+token
    if origin: headers['Origin']=origin
    body=None
    if json_body is not None:
        body=json.dumps(json_body).encode();headers['Content-Type']='application/json'
    if manifest is not None:
        boundary='----demo'+uuid.uuid4().hex
        chunks=[]
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n'.encode()+json.dumps(manifest).encode()+b'\r\n')
        for key,blob in (files or {}).items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="assets[{key}]"; filename="drawing.png"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+blob+b'\r\n')
        chunks.append(f'--{boundary}--\r\n'.encode());body=b''.join(chunks)
        headers['Content-Type']='multipart/form-data; boundary='+boundary
    req=urllib.request.Request(BASE+path,data=body,headers=headers,method=method)
    try: r=OPENER.open(req,timeout=15)
    except urllib.error.HTTPError as e: r=e
    raw=r.read()
    return r.status,json.loads(raw) if raw else {},r.headers
def create():
    code,s,_=call('/demo/sessions','POST',origin=BASE)
    check(code==201,'create session')
    return s,s['editor_url'].split('#token=')[1]
def payload(s, mime='image/png'):
    # Valid 1x1 PNG. JPEG fixture is supplied by the existing contract when available.
    blob=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4X8AAAAASUVORK5CYII=')
    if mime=='image/jpeg':
        blob=(ROOT.parent/'esempi-contratto-attuale/assets/drawing-1.jpg').read_bytes()
        sample=json.loads((ROOT.parent/'esempi-contratto-attuale/03-manifest-JPEG-disegno-e-tabelle.json').read_text(encoding='utf-8-sig'))
        width,height=sample['assets'][0]['width'],sample['assets'][0]['height']
    else: width=height=1
    q=s['request']; m={k:q[k] for k in ['protocol','version','session_id','request_id','document_revision']}
    m.update(result_id='result-'+uuid.uuid4().hex,targets=[],assets=[dict(asset_id='drawing-1',path='assets/drawing-1.png',media_type=mime,sha256=hashlib.sha256(blob).hexdigest(),width=width,height=height)])
    for i,t in enumerate(q['targets']):
        target={k:t[k] for k in ['target_id','kind','schema_id','schema_version']}
        if t['kind']=='image': target['asset_ids']=['drawing-1']
        else: target['rows']=[{c['key']:('Valore demo' if c['type']=='text' else True) for c in t['columns']}] if i==1 else []
        m['targets'].append(target)
    return m,{'drawing-1':blob}

with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));PORT=sock.getsockname()[1]
BASE=f'http://127.0.0.1:{PORT}'
EDITOR='https://graphxdico.it'
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))
(ROOT/'.runtime').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='receiver-', dir=ROOT/'.runtime') as data:
    assert Path(data).resolve().is_relative_to((ROOT/'.runtime').resolve())
    env={**os.environ,'PUBLIC_ORIGIN':BASE,'GRAPHXDICO_URL':EDITOR+'/','DEMO_DATA_DIR':data}
    proc=subprocess.Popen([PHP,'-d','xdebug.mode=off','-d','xdebug.log=','-S',f'127.0.0.1:{PORT}','-t','public','server/router.php'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    try:
        for _ in range(40):
            try:
                if call('/healthz')[0]==200: break
            except OSError: time.sleep(.1)
        s,t=create();path='/grafxdico/sessions/'+s['session_id']
        code,q,h=call(path+'/request',token=t,origin=EDITOR)
        check(code==200 and q['session_id']==s['session_id'] and h['Access-Control-Allow-Origin']==EDITOR,'GET request + CORS exact')
        check(call(path+'/request',token='wrong',origin=EDITOR)[0]==401,'bad token')
        code,_,h=call(path+'/request',token=t,origin='https://foreign.invalid')
        check(code==403 and 'Access-Control-Allow-Origin' not in h,'foreign origin denied')
        check(call(path+'/result','OPTIONS',origin=EDITOR)[0]==204,'preflight')
        m,f=payload(s); partial={**m,'targets':m['targets'][:1]}
        check(call(path+'/result','POST',t,EDITOR,partial,f)[1]['error']['code']=='result_incomplete','partial rejected')
        multiple=json.loads(json.dumps(m));multiple['targets'][0]['asset_ids'].append('drawing-2')
        check(call(path+'/result','POST',t,EDITOR,multiple,f)[1]['error']['code']=='asset_required','one image per export enforced')
        malformed=json.loads(json.dumps(m));malformed['targets'][1]['rows'][0]['extra_column']='extra'
        check(call(path+'/result','POST',t,EDITOR,malformed,f)[1]['error']['code']=='column_unknown','extra column rejected')
        code,state,_=call('/demo/sessions/'+s['session_id']+'/status',token=s['viewer_token'])
        check(code==200 and state['last_rejection']['manifest']==malformed and state['status']=='open','rejected JSON inspectable, not accepted')
        check(call('/demo/sessions/'+s['session_id']+'/status',token=t)[0]==401,'editor cannot read viewer endpoint')
        code,ack,_=call(path+'/result','POST',t,EDITOR,m,f)
        check(code==201 and ack['status']=='staged','PNG accepted')
        check(call(path+'/result','POST',t,EDITOR,m,f)[1]['replayed'] is True,'identical retry')
        changed={**m,'result_id':'changed-'+uuid.uuid4().hex}
        check(call(path+'/result','POST',t,EDITOR,changed,f)[0]==201,'second distinct export accepted')
        conflicting={**m,'targets':json.loads(json.dumps(m['targets']))};conflicting['targets'][1]['rows'][0][next(iter(conflicting['targets'][1]['rows'][0]))]='changed'
        check(call(path+'/result','POST',t,EDITOR,conflicting,f)[0]==409,'same result ID changed data refused')
        check(call(path+'/result','POST',t,EDITOR,m,f)[1]['replayed'] is True,'retry first export after second')
        state=call('/demo/sessions/'+s['session_id']+'/status',token=s['viewer_token'])[1]
        check(state['deliveries'][0]['manifest']==m and state['deliveries'][1]['manifest']==changed and len(state['deliveries'])==2,'both exports retained once')
        code,closed,_=call('/demo/sessions/'+s['session_id']+'/close','POST',token=s['viewer_token'],origin=BASE)
        check(code==200 and closed['status']=='closed' and len(closed['deliveries'])==2,'viewer closes without deleting deliveries')
        check(call(path+'/result','POST',t,EDITOR,changed,f)[0]==410,'closed session rejects further exports')
        s,t=create();path='/grafxdico/sessions/'+s['session_id']
        check(call(path+'/cancel','POST',t,EDITOR)[1]['status']=='discarded','cancel')
        check(call(path+'/request',token=t,origin=EDITOR)[0]==410,'cancelled expired')
        s,t=create();p=Path(data)/(s['session_id']+'.json');r=json.loads(p.read_text());r['expires']=int(time.time())+1680;p.write_text(json.dumps(r))
        check(call('/demo/sessions/'+s['session_id']+'/status',token=s['viewer_token'])[0]==200 and json.loads(p.read_text())['expires']>r['expires'],'active viewer extends idle timeout')
        r=json.loads(p.read_text());r['expires']=int(time.time())-1;p.write_text(json.dumps(r))
        check(call('/grafxdico/sessions/'+s['session_id']+'/request',token=t,origin=EDITOR)[0]==410,'TTL')
        if (ROOT.parent/'esempi-contratto-attuale/assets/drawing-1.jpg').exists():
            s,t=create();m,f=payload(s,'image/jpeg')
            check(call('/grafxdico/sessions/'+s['session_id']+'/result','POST',t,EDITOR,m,f)[0]==201,'JPEG accepted')
        custom='https://other-editor.example.test'
        code,s,_=call('/demo/sessions','POST',origin=BASE,json_body={'editor_url':custom+'/editor?mode=mario'})
        check(code==201 and s['editor_url'].startswith(custom+'/editor?mode=mario&session='),'custom URL preserves path/query')
        t=s['editor_url'].split('#token=')[1];path='/grafxdico/sessions/'+s['session_id']
        check(call(path+'/request',token=t,origin=EDITOR)[0]==403,'old editor cannot access custom session')
        code,_,headers=call(path+'/result','OPTIONS',origin=custom)
        check(code==204 and headers['Access-Control-Allow-Origin']==custom,'custom editor CORS')
        check(call(path+'/request',token=t,origin=custom)[0]==200,'custom editor token works')
        m,f=payload(s)
        check(call(path+'/result','POST',t,custom,m,f)[0]==201,'custom editor image and tables accepted')
        for invalid in ['javascript:alert(1)','https://user:pass@example.test/','https://example.test/#fragment','https://example.test/?session=old']:
            check(call('/demo/sessions','POST',origin=BASE,json_body={'editor_url':invalid})[0]==422,'invalid editor URL rejected')
        print('PASS',len(passed),'checks:',', '.join(passed))
    finally:
        proc.terminate();proc.wait(timeout=10)
