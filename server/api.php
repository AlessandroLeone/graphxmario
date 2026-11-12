<?php
declare(strict_types=1);

// Standalone Mario receiver. No connection to the real Mario database.
const PROTOCOL = 'mario.grafxdico';
const TTL = 1800;
require_once __DIR__.'/native-tables.php';
function reply(int $status, array $data): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function fail(int $status, string $code, string $message): never {
    reply($status, ['protocol'=>PROTOCOL,'error'=>['code'=>$code,'message'=>$message]]);
}
function requireThat(bool $condition, string $code, string $message): void {
    if (!$condition) throw new InvalidArgumentException($code.'|'.$message);
}
function bearer(): string {
    return preg_replace('/^Bearer /', '', $_SERVER['HTTP_AUTHORIZATION'] ?? '') ?? '';
}
function editorAddress(mixed $value, string $publicOrigin): array {
    if (!is_string($value) || strlen($value)>2048) fail(422,'editor_url','Inserisci un indirizzo completo per GraphXDico.');
    $value=trim($value); $p=parse_url($value);
    if (!filter_var($value,FILTER_VALIDATE_URL) || !is_array($p) || !in_array($p['scheme']??'', ['https','http'],true)
        || isset($p['user']) || isset($p['pass']) || isset($p['fragment'])) {
        fail(422,'editor_url','Usa un URL http/https senza credenziali o frammento #.');
    }
    if (str_starts_with($publicOrigin,'https://') && $p['scheme']!=='https') fail(422,'editor_url','Dalla demo HTTPS serve un editor HTTPS per ricevere i dati.');
    parse_str($p['query']??'', $query);
    if (isset($query['session']) || isset($query['token'])) fail(422,'editor_url','Inserisci l’indirizzo dell’editor senza session o token.');
    $port=$p['port']??null;
    $origin=$p['scheme'].'://'.strtolower($p['host']).(($port && !(($p['scheme']==='https' && $port===443)||($p['scheme']==='http' && $port===80)))?':'.$port:'');
    return [$value,$origin];
}
function saveRecord($handle, array $record): void {
    $bytes=json_encode($record, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    rewind($handle); ftruncate($handle, 0); fwrite($handle, $bytes); fflush($handle);
}
function validate(array $manifest, array $request): array {
    $allowed=['protocol','version','session_id','request_id','document_revision','result_id','targets','assets','riferimenti_url','grafxdico_tabelle'];
    requireThat(!array_diff(array_keys($manifest),$allowed),'manifest_keys','Il manifest contiene chiavi non previste.');
    foreach (['protocol','version','session_id','request_id','document_revision'] as $key) {
        requireThat(($manifest[$key]??null)===$request[$key],$key,'Identificativo o versione non corrispondente: '.$key);
    }
    requireThat(is_string($manifest['result_id']??null) && preg_match('/^[A-Za-z0-9._:-]{8,128}$/D',$manifest['result_id'])===1,'manifest_result_id','result_id non valido.');
    requireThat(is_array($manifest['targets']??null) && array_is_list($manifest['targets']),'manifest_targets','targets deve essere un elenco.');
    requireThat(is_array($manifest['assets']??null) && array_is_list($manifest['assets']),'manifest_assets','assets deve essere un elenco.');
    $expected=array_column($request['targets'],null,'target_id'); $seen=[]; $used=[]; $rowCount=0;
    nativeReferences($manifest['riferimenti_url']??null,$request);
    $native=isset($manifest['grafxdico_tabelle'])?nativeTables($manifest['grafxdico_tabelle'],$request):null;
    $nativeById=$native===null?[]:array_column($native,null,'id'); $nativeSeen=[]; $nativeExtensions=false;
    if ($native!==null) $rowCount=array_sum(array_map(fn($t)=>count($t['righe']),$native));
    foreach ($manifest['targets'] as $target) {
        requireThat(is_array($target),'target_invalid','Destinazione non valida.');
        $id=$target['target_id']??'';
        requireThat(is_string($id) && isset($expected[$id]) && !isset($seen[$id]),'target_unknown','Destinazione sconosciuta o duplicata.');
        $original=$expected[$id]; $seen[$id]=true;
        foreach (['kind','schema_id','schema_version'] as $key) requireThat(($target[$key]??null)===$original[$key],'target_schema','Schema della destinazione non corrispondente.');
        $keys=$original['kind']==='image'?['target_id','kind','schema_id','schema_version','asset_ids']:['target_id','kind','schema_id','schema_version','rows','grafxdico'];
        requireThat(!array_diff(array_keys($target),$keys),'target_keys','Chiavi della destinazione non previste.');
        if ($original['kind']==='image') {
            requireThat(is_array($target['asset_ids']??null) && count($target['asset_ids'])===1 && is_string($target['asset_ids'][0]??null),'asset_required','Invia una sola immagine per ogni esportazione.');
            $used[]=$target['asset_ids'][0];
        } else {
            requireThat(is_array($target['rows']??null) && array_is_list($target['rows']),'rows_invalid','rows deve essere un elenco.');
            if ($native!==null) {
                $projected=[];
                if (isset($target['grafxdico'])) {
                    $nativeExtensions=true; $extra=$target['grafxdico'];
                    requireThat(is_array($extra) && !array_diff(array_keys($extra),['formato','tabelle','riferimenti_url']) && ($extra['formato']??null)==='grafxdico-tabella-v1','native_format','Estensione GraphXDico non valida.');
                    nativeReferences($extra['riferimenti_url']??null,$request);
                    foreach (nativeTables($extra['tabelle']??null,$request) as $table) {
                        requireThat(isset($nativeById[$table['id']]) && $nativeById[$table['id']]===$table && !isset($nativeSeen[$table['id']]),'native_mismatch','Le copie della tabella non coincidono o sono duplicate.');
                        $nativeSeen[$table['id']]=true;
                        foreach ($table['righe'] as $row) $projected[]=['title'=>$table['titolo'],'row'=>$row];
                    }
                }
                requireThat(count($target['rows'])===count($projected),'native_mismatch','Righe duplicate diverse dalla tabella originale.');
                foreach ($target['rows'] as $i=>$row) {
                    requireThat(is_array($row),'native_rows','Riga non valida.');
                    if (isset($row['_tabella'])) requireThat($row['_tabella']===$projected[$i]['title'],'native_mismatch','Titolo della tabella non corrispondente.');
                    unset($row['_tabella']);$expectedRow=$projected[$i]['row'];ksort($row);ksort($expectedRow);
                    requireThat($row===$expectedRow,'native_mismatch','I dati della tabella sono discordanti.');
                }
                continue;
            }
            requireThat(!isset($target['grafxdico']),'native_tables','Inviare grafxdico_tabelle insieme all’estensione grafxdico.');
            $columns=array_column($original['columns'],null,'key');
            foreach ($target['rows'] as $row) {
                requireThat(is_array($row),'rows_invalid','Riga non valida.');
                requireThat(!array_diff(array_keys($row),array_keys($columns)),'column_unknown','Colonna aggiuntiva: concordare la mappatura con Mario. Il JSON ricevuto è visibile nella demo.');
                $nonempty=false;
                foreach ($row as $key=>$value) {
                    requireThat($value===null || ($columns[$key]['type']==='boolean'?is_bool($value):is_string($value)),'cell_type','Tipo della cella non valido: '.$key);
                    if (is_string($value)) requireThat(preg_match_all('/./us',$value)<=2000 && preg_match('/[\x00-\x1f\x7f]/u',$value)!==1,'cell_value','Testo troppo lungo o caratteri non ammessi.');
                    $nonempty=$nonempty || ($value!==null && (!is_string($value) || trim($value)!==''));
                }
                requireThat($nonempty,'rows_empty','Omettere le righe interamente vuote.');
                $rowCount++;
            }
        }
    }
    requireThat(!array_diff($request['group']['required_target_ids'],array_keys($seen)),'result_incomplete','Inviare insieme il disegno e tutte le tabelle richieste.');
    if ($nativeExtensions) requireThat(!array_diff(array_keys($nativeById),array_keys($nativeSeen)),'native_mismatch','Una tabella dichiarata non compare nei target.');
    requireThat($rowCount>0,'group_tables_empty','Almeno una tabella deve contenere righe.');
    requireThat($rowCount<=$request['limits']['max_rows'],'rows_limit','Troppe righe.');
    requireThat(count($manifest['assets'])<=$request['limits']['max_images'],'asset_limit','Troppe immagini.');
    $files=$_FILES['assets']??[]; $images=[]; $total=0;
    foreach ($manifest['assets'] as $asset) {
        requireThat(is_array($asset),'asset_invalid','Asset non valido.');
        requireThat(!array_diff(array_keys($asset),['asset_id','path','media_type','sha256','width','height','caption']),'asset_keys','Chiavi asset non previste.');
        $id=$asset['asset_id']??'';
        requireThat(is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,100}$/D',$id)===1 && in_array($id,$used,true) && !isset($images[$id]),'asset_id','Asset sconosciuto o duplicato.');
        requireThat(is_string($asset['path']??null) && preg_match('~^assets/[A-Za-z0-9_.-]+$~D',$asset['path'])===1,'asset_path','Percorso asset non valido.');
        requireThat(($files['error'][$id]??-1)===UPLOAD_ERR_OK,'asset_upload','File mancante o upload non riuscito.');
        $tmp=$files['tmp_name'][$id];
        requireThat(is_string($tmp) && is_uploaded_file($tmp),'asset_upload','Upload non valido.');
        $size=filesize($tmp); $total+=$size;
        requireThat($size>0 && $size<=$request['limits']['image_bytes'] && $total<=20971520,'asset_size','Immagini troppo pesanti.');
        $dimensions=@getimagesize($tmp);
        requireThat($dimensions!==false && in_array($dimensions['mime'],['image/png','image/jpeg'],true),'asset_type','Serve un file PNG o JPEG reale.');
        requireThat(($asset['media_type']??null)===$dimensions['mime'] && ($asset['width']??null)===$dimensions[0] && ($asset['height']??null)===$dimensions[1],'asset_dimensions','MIME o dimensioni dichiarate non corrispondono al file.');
        requireThat($dimensions[0]*$dimensions[1]<=$request['limits']['image_megapixels']*1000000,'asset_pixels','Troppi megapixel.');
        requireThat(is_string($asset['sha256']??null) && hash_equals(hash_file('sha256',$tmp),$asset['sha256']),'asset_checksum','Impronta SHA-256 non corrispondente.');
        requireThat(!isset($asset['caption']) || (is_string($asset['caption']) && preg_match_all('/./us',$asset['caption'])<=500),'asset_caption','Didascalia non valida.');
        $images[$id]=['media_type'=>$dimensions['mime'],'width'=>$dimensions[0],'height'=>$dimensions[1],'base64'=>base64_encode(file_get_contents($tmp))];
    }
    requireThat(!array_diff($used,array_keys($images)) && !array_diff(array_keys($files['name']??[]),array_keys($images)),'asset_missing','File mancanti o non dichiarati.');
    return $images;
}

try {
    $path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
    $method=$_SERVER['REQUEST_METHOD'];
    $editorUrl=getenv('GRAPHXDICO_URL') ?: 'https://graphxdico.it/';
    $editorParts=parse_url($editorUrl);
    $editorOrigin=($editorParts['scheme']??'https').'://'.($editorParts['host']??'graphxdico.it').(isset($editorParts['port'])?':'.$editorParts['port']:'');
    $publicOrigin=rtrim(getenv('PUBLIC_ORIGIN') ?: 'https://mario.meralab.it','/');
    $origin=$_SERVER['HTTP_ORIGIN']??'';
    $editorRoute=str_starts_with($path,'/grafxdico/');
    if (!$editorRoute && $method==='POST' && $origin!==$publicOrigin) {
        fail(403,'origin_not_allowed','Aprire la demo dalla propria origine configurata.');
    }
    if ($path==='/healthz') reply(200,['status'=>'ok','role'=>'mario-receiver']);
    if ($path==='/demo/config' && $method==='GET') reply(200,['editorUrl'=>$editorUrl,'editorOrigin'=>$editorOrigin,'marioOrigin'=>$publicOrigin]);
    $dir=getenv('DEMO_DATA_DIR') ?: dirname(__DIR__).'/storage';
    if (!is_dir($dir) && !mkdir($dir,0700,true) && !is_dir($dir)) throw new RuntimeException('storage');
    // Bound storage and remove expired sessions opportunistically; no real data belongs here.
    $global=fopen($dir.'/.allocation','c+'); flock($global,LOCK_EX);
    $count=0; $bytes=0;
    foreach (glob($dir.'/gds_*.json') as $file) {
        if (filemtime($file)<time()-TTL-300) { @unlink($file); continue; }
        $count++; $bytes+=filesize($file);
    }
    if ($path==='/demo/sessions' && $method==='POST') {
        if ((int)($_SERVER['CONTENT_LENGTH']??0)>4096) fail(413,'request_large','Indirizzo troppo lungo.');
        $body=file_get_contents('php://input');
        try { $input=$body===''?[]:json_decode($body,true,16,JSON_THROW_ON_ERROR); }
        catch (JsonException $e) { fail(422,'editor_url','Richiesta non valida.'); }
        if (!is_array($input)) fail(422,'editor_url','Richiesta non valida.');
        [$editorUrl,$editorOrigin]=editorAddress($input['editor_url']??$editorUrl,$publicOrigin);
        if ($count>=64 || $bytes>134217728) fail(429,'demo_capacity','La demo è piena. Attendi la scadenza delle sessioni.');
        $rate=json_decode(stream_get_contents($global) ?: '{}',true)?:[];
        $ip=hash('sha256',$_SERVER['REMOTE_ADDR']??''); $now=time();
        $rate=array_filter($rate,fn($v)=>$v['at']>$now-60);
        if (($rate[$ip]['count']??0)>=12) fail(429,'rate_limit','Attendi un minuto prima di aprire altre sessioni.');
        $rate[$ip]=['at'=>$rate[$ip]['at']??$now,'count'=>($rate[$ip]['count']??0)+1]; saveRecord($global,$rate);
        $id='gds_'.bin2hex(random_bytes(16)); $token=bin2hex(random_bytes(24)); $viewer=bin2hex(random_bytes(24));
        $request=json_decode(file_get_contents(__DIR__.'/request-template.json'),true,512,JSON_THROW_ON_ERROR);
        $request['session_id']=$id; $request['request_id']='req_'.bin2hex(random_bytes(16));
        $request['document_revision']=bin2hex(random_bytes(16)); $request['expires_at']=gmdate('c',$now+TTL);
        $map=[];
        foreach ($request['targets'] as &$target) { $old=$target['target_id']; $target['target_id']='tgt_'.bin2hex(random_bytes(12)); $map[$old]=$target['target_id']; } unset($target);
        $request['group']['group_id']='grp_'.bin2hex(random_bytes(12));
        $request['group']['required_target_ids']=array_values($map);
        $record=['editor_origin'=>$editorOrigin,'token_hash'=>hash('sha256',$token),'viewer_hash'=>hash('sha256',$viewer),'expires'=>$now+TTL,'request'=>$request,'status'=>'open','received'=>null,'deliveries'=>[],'last_rejection'=>null];
        file_put_contents($dir.'/'.$id.'.json',json_encode($record,JSON_THROW_ON_ERROR),LOCK_EX);
        flock($global,LOCK_UN); fclose($global);
        reply(201,['session_id'=>$id,'viewer_token'=>$viewer,'request'=>$request,'editor_origin'=>$editorOrigin,'editor_url'=>$editorUrl.(str_contains($editorUrl,'?')?'&':'?').'session='.$id.'#token='.$token]);
    }
    flock($global,LOCK_UN); fclose($global);
    if (!preg_match('~^/(grafxdico|demo)/sessions/(gds_[a-f0-9]{32})(?:/(request|result|cancel|status|close))?$~D',$path,$matches)) fail(404,'not_found','Percorso inesistente.');
    [$full,$area,$id]=$matches; $action=$matches[3]??'status';
    $file=$dir.'/'.$id.'.json';
    if (!is_file($file)) fail(401,'unauthorized','Sessione non valida.');
    $handle=fopen($file,'r+'); flock($handle,LOCK_EX);
    $record=json_decode(stream_get_contents($handle),true,512,JSON_THROW_ON_ERROR);
    if ($area==='grafxdico') {
        if ($origin!=='' && $origin!==($record['editor_origin']??$editorOrigin)) fail(403,'origin_not_allowed','Origine editor non autorizzata per questa sessione.');
        if ($origin!=='') header('Access-Control-Allow-Origin: '.$origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With');
        header('Access-Control-Max-Age: 600');
        if ($method==='OPTIONS') { http_response_code(204); exit; }
    }
    $hash=$area==='demo'?'viewer_hash':'token_hash';
    if (!hash_equals($record[$hash],hash('sha256',bearer()))) fail(401,'unauthorized','Sessione non valida.');
    if ($record['expires']<time()) fail(410,'session_expired','Sessione scaduta. Riapri GraphXDico.');
    $record['deliveries'] ??= $record['received'] ? [$record['received']+['digest'=>$record['digest']??'']] : [];
    if (!in_array($record['status'],['closed','discarded'],true) && $record['expires']<time()+TTL-60) {
        $record['expires']=time()+TTL; $record['request']['expires_at']=gmdate('c',$record['expires']); saveRecord($handle,$record);
    }
    if ($area==='demo') {
        if ($action==='close' && $method==='POST') {
            $record['status']=$record['deliveries']?'closed':'discarded'; saveRecord($handle,$record);
        } elseif ($action!=='status' || $method!=='GET') fail(405,'method_not_allowed','Operazione non disponibile.');
        $deliveries=array_map(fn($d)=>array_diff_key($d,['digest'=>true]),$record['deliveries']);
        reply(200,['status'=>$record['status'],'request'=>$record['request'],'received'=>$record['received'],'deliveries'=>$deliveries,'last_rejection'=>$record['last_rejection']]);
    }
    if (in_array($record['status'],['closed','discarded'],true)) fail(410,'session_closed','Finestra chiusa: avvia una nuova sessione. Gli invii precedenti restano ricevuti.');
    if ($action==='request' && $method==='GET') reply(200,$record['request']);
    if ($action==='cancel' && $method==='POST') {
        $record['status']=$record['deliveries']?'closed':'discarded'; saveRecord($handle,$record);
        reply(200,['protocol'=>PROTOCOL,'version'=>1,'session_id'=>$id,'status'=>$record['status']]);
    }
    if ($action!=='result' || $method!=='POST') fail(405,'method_not_allowed','Operazione non disponibile.');
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>25165824) fail(413,'payload_large','Invio troppo grande (massimo 24 MiB).');
    $raw=$_POST['manifest']??'';
    if (!is_string($raw) || strlen($raw)>2097152) fail(413,'manifest_large','Manifest troppo grande.');
    try { $manifest=json_decode($raw,true,128,JSON_THROW_ON_ERROR); } catch (JsonException) { fail(422,'manifest_json','Inviare il manifest JSON e i file come multipart/form-data.'); }
    try {
        requireThat(is_array($manifest),'manifest_json','Manifest non valido.');
        $images=validate($manifest,$record['request']);
    } catch (InvalidArgumentException $e) {
        [$code,$message]=explode('|',$e->getMessage(),2);
        $record['last_rejection']=['code'=>$code,'message'=>$message,'manifest'=>$manifest]; saveRecord($handle,$record);
        $status=in_array($code,['session_id','request_id','document_revision'],true)?409:422;
        fail($status,$code,$message);
    }
    $digest=hash('sha256',$raw);
    $replayed=false; $sequence=null;
    foreach ($record['deliveries'] as $i=>$delivery) {
        if ($delivery['manifest']['result_id']!==$manifest['result_id']) continue;
        if (!hash_equals($delivery['digest'],$digest)) fail(409,'result_conflict','Questo result_id appartiene a un invio diverso.');
        $replayed=true; $sequence=$i+1; break;
    }
    if (!$replayed) {
        if (count($record['deliveries'])>=($record['request']['limits']['max_deliveries']??100)) fail(413,'delivery_limit','Raggiunto il limite di invii della demo. Scarica i risultati e avvia una nuova sessione.');
        $record['status']='open'; $record['last_rejection']=null;
        $record['received']=['at'=>gmdate('c'),'manifest'=>$manifest,'images'=>$images];
        $record['deliveries'][]=$record['received']+['digest'=>$digest];
        $sequence=count($record['deliveries']);
        if (strlen(json_encode($record,JSON_THROW_ON_ERROR))>($record['request']['limits']['session_bytes']??67108864)) fail(413,'session_size','Sessione demo piena. Gli invii precedenti sono conservati: scaricali e avvia una nuova sessione.');
        saveRecord($handle,$record);
    }
    reply($replayed?200:201,['protocol'=>PROTOCOL,'version'=>1,'session_id'=>$id,'result_id'=>$manifest['result_id'],'status'=>'staged','sequence'=>$sequence,'replayed'=>$replayed,'message'=>'Invio ricevuto. Puoi continuare a lavorare e inviare dalla stessa finestra.']);
} catch (Throwable $e) {
    // No request/token/manifest logging.
    fail(500,'server_error','Il ricevitore non riesce a completare la richiesta. Controlla la configurazione del server.');
}
