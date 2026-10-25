<?php
declare(strict_types=1);

/*
 * Ridgefield Phase 9 database layer.
 * Set RF_DB_* environment variables to enable MySQL/MariaDB.
 * The JSON store remains available as a safe local fallback.
 */
function db_enabled(): bool {
    return getenv('RF_DB_HOST') !== false && getenv('RF_DB_NAME') !== false && getenv('RF_DB_USER') !== false;
}
function db(): ?PDO {
    static $pdo = null;
    static $attempted = false;
    if ($attempted) return $pdo;
    $attempted = true;
    if (!db_enabled()) return null;
    try {
        $host=getenv('RF_DB_HOST'); $name=getenv('RF_DB_NAME'); $user=getenv('RF_DB_USER'); $pass=getenv('RF_DB_PASS') ?: '';
        $port=getenv('RF_DB_PORT') ?: '3306';
        $pdo=new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",$user,$pass,[
            PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES=>false
        ]);
    } catch(Throwable $e) {
        error_log('Ridgefield DB connection failed: '.$e->getMessage());
        $pdo=null;
    }
    return $pdo;
}
function db_read_json(string $name, array $default=[]): array {
    $pdo=db(); if(!$pdo)return $default;
    try {
        $st=$pdo->prepare('SELECT record_id,payload FROM ridgefield_records WHERE collection=? ORDER BY record_id');
        $st->execute([$name]); $rows=$st->fetchAll();
        if(!$rows)return $default;
        $out=[]; foreach($rows as $r){$x=json_decode($r['payload'],true);if(is_array($x))$out[]=$x;}
        return $out;
    } catch(Throwable $e){ error_log('Ridgefield DB read failed: '.$e->getMessage()); return $default; }
}
function db_write_json(string $name,array $data): bool {
    $pdo=db(); if(!$pdo)return false;
    try {
        $pdo->beginTransaction();
        $del=$pdo->prepare('DELETE FROM ridgefield_records WHERE collection=?'); $del->execute([$name]);
        $ins=$pdo->prepare('INSERT INTO ridgefield_records(collection,record_id,payload) VALUES(?,?,?)');
        foreach($data as $i=>$row){
            $id=(int)($row['id']??($i+1));
            $ins->execute([$name,$id,json_encode($row,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
        }
        $pdo->commit(); return true;
    } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_log('Ridgefield DB write failed: '.$e->getMessage());return false;}
}
function db_replace_from_json(string $name,array $data): bool { return db_write_json($name,$data); }
