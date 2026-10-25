<?php
require_once __DIR__.'/config.php';
function client_ip_hash(): string {
    return hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|' . (getenv('RF_IP_SALT') ?: 'ridgefield-change-this'));
}
function login_rate_limited(string $username): bool {
    $pdo=db(); if(!$pdo)return false;
    $st=$pdo->prepare("SELECT COUNT(*) FROM login_attempts WHERE (username=? OR ip_hash=?) AND attempted_at >= (NOW() - INTERVAL 15 MINUTE)");
    $st->execute([$username,client_ip_hash()]);
    return (int)$st->fetchColumn() >= 8;
}
function record_login_attempt(string $username): void {
    $pdo=db(); if(!$pdo)return;
    $st=$pdo->prepare("INSERT INTO login_attempts(username,ip_hash) VALUES(?,?)");
    $st->execute([$username,client_ip_hash()]);
}
function clear_login_attempts(string $username): void {
    $pdo=db(); if(!$pdo)return;
    $st=$pdo->prepare("DELETE FROM login_attempts WHERE username=? OR ip_hash=?");
    $st->execute([$username,client_ip_hash()]);
}
function audit_security(string $action,string $entity='security',?int $id=null): void {
    $pdo=db(); if(!$pdo)return;
    $u=current_user(); $username=$u['username']??null;
    $st=$pdo->prepare("INSERT INTO audit_events(username,action,entity,entity_id,ip_hash) VALUES(?,?,?,?,?)");
    $st->execute([$username,$action,$entity,$id,client_ip_hash()]);
}
function password_reset_create(int $userId): ?string {
    $pdo=db(); if(!$pdo)return null;
    $token=bin2hex(random_bytes(32)); $hash=hash('sha256',$token); $expires=date('Y-m-d H:i:s',time()+3600);
    $pdo->prepare("DELETE FROM password_resets WHERE user_id=? OR expires_at<NOW()")->execute([$userId]);
    $pdo->prepare("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)")->execute([$userId,$hash,$expires]);
    return $token;
}
function password_reset_consume(string $token, string $newPassword): bool {
    $pdo=db(); if(!$pdo || strlen($newPassword)<12)return false;
    $hash=hash('sha256',$token);
    $st=$pdo->prepare("SELECT id,user_id FROM password_resets WHERE token_hash=? AND expires_at>NOW() AND used_at IS NULL");
    $st->execute([$hash]);$row=$st->fetch();if(!$row)return false;
    $pdo->beginTransaction();
    try{
        $pdo->prepare("UPDATE users_rel SET password_hash=? WHERE id=?")->execute([password_hash($newPassword,PASSWORD_DEFAULT),$row['user_id']]);
        $pdo->prepare("UPDATE password_resets SET used_at=NOW() WHERE id=?")->execute([$row['id']]);
        $pdo->commit(); audit_security('password_reset','user',(int)$row['user_id']); return true;
    }catch(Throwable $e){$pdo->rollBack();return false;}
}
