<?php
declare(strict_types=1);
$secureCookie = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params([
    'httponly'=>true,
    'secure'=>$secureCookie,
    'samesite'=>'Lax'
]);
session_start();

const ROOT_DIR = __DIR__ . '/..';
const STORAGE_DIR = ROOT_DIR . '/storage';
const DATA_DIR = ROOT_DIR . '/data';
const UPLOAD_DIR = ROOT_DIR . '/uploads';
const PRIVATE_DIR = STORAGE_DIR . '/private';
require_once __DIR__ . '/db.php';

foreach ([STORAGE_DIR, DATA_DIR, UPLOAD_DIR, PRIVATE_DIR] as $d) {
    if (!is_dir($d)) mkdir($d, 0755, true);
}

function file_path(string $name): string { return PRIVATE_DIR . '/' . $name . '.json'; }
function db_has_collection(string $name): bool {
    $pdo=db(); if(!$pdo)return false;
    try {$st=$pdo->prepare('SELECT COUNT(*) FROM ridgefield_records WHERE collection=?');$st->execute([$name]);return (int)$st->fetchColumn()>0;}
    catch(Throwable $e){return false;}
}
function read_json(string $name, array $default=[]): array {
    if (function_exists('db') && db()) {
        $dbRows=db_read_json($name,$default);
        if ($dbRows!==$default || db_has_collection($name)) return $dbRows;
    }
    $f=file_path($name);
    if(!file_exists($f)) return $default;
    $d=json_decode((string)file_get_contents($f),true);
    return is_array($d)?$d:$default;
}
function write_json(string $name,array $data):void {
    if (function_exists('db') && db()) {
        if (db_write_json($name,$data)) return;
    }
    $f=file_path($name); $tmp=$f.'.tmp';
    file_put_contents($tmp,json_encode($data,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX);
    rename($tmp,$f);
}
function next_id(array $items):int { $m=0; foreach($items as $x)$m=max($m,(int)($x['id']??0)); return $m+1; }
function install_schema():void {
    foreach([
      'users'=>[], 'news'=>[], 'staff'=>[], 'fees'=>[], 'documents'=>[], 'applications'=>[], 'enquiries'=>[],
      'students'=>[], 'parents'=>[], 'teachers'=>[], 'classes'=>[], 'subjects'=>[],
      'attendance'=>[], 'results'=>[], 'ledger'=>[], 'messages'=>[], 'audit'=>[], 'enrolments'=>[], 'invoices'=>[], 'payments'=>[], 'receipts'=>[], 'notifications'=>[]
    ] as $n=>$default) if(!file_exists(file_path($n))) write_json($n,$default);
    if(!file_exists(file_path('settings'))) write_json('settings',[
      'school_name'=>'Ridgefield Academy','address'=>'Cambridge Campus: 25 Wilcock Road, Noordhoek',
      'phone'=>'063 697 0178','email'=>'revvdw@gmail.com',
      'hero_title'=>'Prepare for your future with an internationally recognised qualification.',
      'hero_text'=>'Receive instruction in classes that are big enough for group work, but small enough for individualised attention.',
      'announcement'=>'Applications and enquiries are welcome.'
    ]);
}
install_schema();
function is_installed():bool{return count(read_json('users'))>0;}
function current_user():?array { $u=$_SESSION['user']??null; return is_array($u)?$u:null; }
function require_login():void { if(!current_user()){header('Location: login.php');exit;} }
function require_role(array $roles):void { require_login(); if(!in_array((string)($_SESSION['user']['role']??''),$roles,true)){http_response_code(403);exit('Access denied.');} }
function csrf():string { if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32)); return $_SESSION['csrf']; }
function check_csrf():void { if(!hash_equals($_SESSION['csrf']??'',$_POST['csrf']??'')){http_response_code(419);exit('Invalid security token.');} }
function h(?string $v):string{return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');}
function redirect(string $u):never{header('Location: '.$u);exit;}
function flash(string $m,string $t='success'):void{$_SESSION['flash']=[$t,$m];}
function get_flash():?array{$f=$_SESSION['flash']??null;unset($_SESSION['flash']);return $f;}
function set_setting(string $key,string $value):void {
    $s=read_json('settings'); $s[$key]=$value; write_json('settings',$s);
}
function setting(string $key):string{$s=read_json('settings');return (string)($s[$key]??'');}
function log_action(string $action,string $entity,int $entityId=0):void{
  $a=read_json('audit');$a[]=['id'=>next_id($a),'user'=>$_SESSION['user']['username']??'system','action'=>$action,'entity'=>$entity,'entity_id'=>$entityId,'created_at'=>date('c')];
  write_json('audit',array_slice($a,-500));
}
function publish_data():void{
 $news=array_values(array_filter(read_json('news'),fn($x)=>(int)($x['published']??0)===1));
 usort($news,fn($a,$b)=>strcmp((string)($b['event_date']?:$b['created_at']),(string)($a['event_date']?:$a['created_at'])));
 $staff=array_values(array_filter(read_json('staff'),fn($x)=>(int)($x['published']??0)===1));
 usort($staff,fn($a,$b)=>((int)($a['sort_order']??0)<=>((int)($b['sort_order']??0)))?:strnatcasecmp($a['name']??'',$b['name']??''));
 $fees=array_values(array_filter(read_json('fees'),fn($x)=>(int)($x['active']??0)===1));
 $docs=array_values(array_filter(read_json('documents'),fn($x)=>(int)($x['published']??0)===1));
 foreach(['news'=>$news,'staff'=>$staff,'fees'=>$fees,'documents'=>$docs,'settings'=>read_json('settings')] as $n=>$d)
   file_put_contents(DATA_DIR.'/'.$n.'.json',json_encode($d,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX);
}

function average_for_student(array $results,int $studentId,?int $subjectId=null,?string $term=null):?float{
    $sum=0.0;$n=0;
    foreach($results as $r){
        if((int)($r['student_id']??0)!==$studentId) continue;
        if($subjectId!==null && (int)($r['subject_id']??0)!==$subjectId) continue;
        if($term!==null && ($r['term']??'')!==$term) continue;
        $out=(float)($r['out_of']??0);
        if($out<=0) continue;
        $sum += ((float)($r['mark']??0)/$out)*100; $n++;
    }
    return $n?round($sum/$n,1):null;
}
function attendance_rate_for_student(array $attendance,int $studentId):?float{
    $rows=array_values(array_filter($attendance,fn($x)=>(int)($x['student_id']??0)===$studentId));
    if(!$rows)return null;
    $good=count(array_filter($rows,fn($x)=>in_array($x['status']??'', ['Present','Late'],true)));
    return round($good/count($rows)*100,1);
}
