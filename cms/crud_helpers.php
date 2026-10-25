<?php
require_once __DIR__.'/config.php';
function collection_post(string $name): array {
    $rows=read_json($name);
    $id=next_id($rows);
    $row=['id'=>$id,'created_at'=>date('c')];
    foreach($_POST as $k=>$v) if($k!=='csrf' && $k!=='action') $row[$k]=is_string($v)?trim($v):$v;
    $rows[]=$row; write_json($name,$rows); return $row;
}
function collection_update(string $name,int $id,array $fields): bool {
    $rows=read_json($name);$found=false;
    foreach($rows as &$r) if((int)($r['id']??0)===$id){foreach($fields as $k=>$v)$r[$k]=$v;$r['updated_at']=date('c');$found=true;break;}
    unset($r); if($found)write_json($name,$rows); return $found;
}
function collection_delete(string $name,int $id): bool {
    $rows=read_json($name);$new=[];$found=false;
    foreach($rows as $r){if((int)($r['id']??0)===$id){$found=true;continue;}$new[]=$r;}
    if($found)write_json($name,$new); return $found;
}
function h12($v):string{return h((string)$v);}
