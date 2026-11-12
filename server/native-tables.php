<?php
declare(strict_types=1);

// Explicit GraphXDico extension: display source tables, without classifying them as Mario F1/F2.
function nativeReferences(mixed $refs, array $request): void {
    if ($refs===null) return;
    requireThat(is_array($refs),'references','Riferimenti non validi.');
    requireThat(!array_diff(array_keys($refs),['session_id','request_id','document_revision','parametri','invio','data_invio']),'references','Chiavi dei riferimenti non previste.');
    foreach (['session_id','request_id','document_revision'] as $key) {
        if (isset($refs[$key])) requireThat($refs[$key]===$request[$key],'references','Riferimenti di un’altra sessione o revisione.');
    }
    if (isset($refs['parametri'])) requireThat(is_array($refs['parametri']) && $refs['parametri']===['session'=>$request['session_id']],'references','Parametro session non corrispondente.');
    if (isset($refs['invio'])) requireThat(is_int($refs['invio']) && $refs['invio']>0,'references','Numero invio non valido.');
    if (isset($refs['data_invio'])) requireThat(is_string($refs['data_invio']) && strlen($refs['data_invio'])<=64,'references','Data invio non valida.');
}
function nativeTables(mixed $tables, array $request): array {
    requireThat(is_array($tables) && array_is_list($tables) && count($tables)<=100,'native_tables','Inviare un elenco di massimo 100 tabelle.');
    $ids=[]; $total=0;
    foreach ($tables as $table) {
        requireThat(is_array($table) && !array_diff(array_keys($table),['id','titolo','livello','colonne','righe','testo','riferimenti_url']),'native_tables','Struttura della tabella GraphXDico non valida.');
        $id=$table['id']??null;
        requireThat(is_string($id) && strlen($id)>0 && strlen($id)<=200 && !isset($ids[$id]),'native_table_id','Identificativo tabella mancante o duplicato.');$ids[$id]=true;
        foreach (['titolo','livello','testo'] as $key) {
            if (isset($table[$key])) requireThat(is_string($table[$key]) && strlen($table[$key])<=8000,'native_text','Testo tabella non valido.');
        }
        requireThat(is_string($table['titolo']??null) && trim($table['titolo'])!=='','native_title','Manca il titolo della tabella.');
        $columns=$table['colonne']??null;
        requireThat(is_array($columns) && array_is_list($columns) && count($columns)>0 && count($columns)<=100,'native_columns','Colonne non valide.');
        $keys=[];
        foreach ($columns as $column) {
            requireThat(is_array($column) && !array_diff(array_keys($column),['key','label','type']),'native_columns','Descrizione colonna non valida.');
            $key=$column['key']??null;
            requireThat(is_string($key) && preg_match('/^[A-Za-z][A-Za-z0-9_]{0,99}$/D',$key)===1 && !isset($keys[$key]),'native_columns','Chiave colonna non valida o duplicata.');$keys[$key]=true;
            requireThat(is_string($column['label']??null) && strlen($column['label'])<=500,'native_columns','Etichetta colonna non valida.');
            if (isset($column['type'])) requireThat(in_array($column['type'],['text','number','boolean'],true),'native_columns','Tipo colonna non riconosciuto.');
        }
        $rows=$table['righe']??null;
        requireThat(is_array($rows) && array_is_list($rows),'native_rows','Righe non valide.');
        $total+=count($rows);requireThat($total<=$request['limits']['max_rows'],'rows_limit','Troppe righe.');
        foreach ($rows as $row) {
            requireThat(is_array($row) && !array_diff_key($row,$keys),'native_rows','Cella senza una colonna dichiarata.');
            foreach ($row as $value) requireThat($value===null || is_bool($value) || is_int($value) || is_float($value) || (is_string($value) && strlen($value)<=8000),'native_cell','La cella deve contenere un valore semplice.');
            requireThat(count(array_filter($row,fn($v)=>$v!==null && (!is_string($v) || trim($v)!=='')))>0,'native_rows','Omettere le righe interamente vuote.');
        }
        nativeReferences($table['riferimenti_url']??null,$request);
    }
    return $tables;
}
