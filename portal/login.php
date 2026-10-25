<?php
require __DIR__.'/../cms/config.php';
if(current_user()) redirect('index.php');
$error='';
if($_SERVER['REQUEST_METHOD']==='POST'){
 check_csrf(); $u=trim($_POST['username']??'');$p=$_POST['password']??'';
 foreach(read_json('users') as $x){
  if(($x['username']??'')===$u && password_verify($p,$x['password_hash']??'')){
   session_regenerate_id(true);$_SESSION['user']=['id'=>(int)$x['id'],'username'=>$u,'role'=>$x['role']??'student','name'=>$x['name']??$u,'profile_id'=>(int)($x['profile_id']??0)];
   $_SESSION['csrf']=bin2hex(random_bytes(32));redirect('index.php');
  }
 }
 $error='Incorrect username or password.';
}
?><!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ridgefield Student & Parent Portal</title><link rel="stylesheet" href="../cms/cms.css"><link rel="stylesheet" href="../assets/phase53-complete.css"><style>body.auth{min-height:100vh;display:grid;place-items:center;background:linear-gradient(180deg,#f5f2e9,#eaf0ec)}.auth-card{max-width:520px!important;width:calc(100% - 32px);padding:34px!important;border:1px solid #d9d3c4!important;border-radius:4px!important;box-shadow:0 18px 45px rgba(13,59,46,.10)}.portal-real-logo{display:flex;justify-content:center;margin-bottom:24px}.portal-real-logo img{display:block;width:auto;height:76px;max-width:320px;object-fit:contain}.auth-card h1{font-family:Georgia,serif;color:#0d3b2e}.auth-card .btn.primary{background:#b88624;border-color:#b88624}</style>
</head><body class="auth"><div class="auth-card"><div class="portal-real-logo"><img src="../assets/2026.png" alt="Ridgefield Academy"></div><div class="brand">RIDGEFIELD ACADEMY<small>SECURE FAMILY & STUDENT PORTAL</small></div><h1>Student & Parent Portal</h1><p>Secure access to academic progress, attendance, messages and account information.</p><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><label>Username<input name="username" required></label><label>Password<input type="password" name="password" required></label><button class="btn primary">Sign in</button></form><p class="small">If you have forgotten your login, contact the school administration.</p><a class="back" href="../index.html">← Return to Ridgefield website</a></div><script src="assets/dynamic-site.js"></script>
</body></html>