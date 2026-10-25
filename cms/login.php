<?php
require __DIR__.'/config.php'; require __DIR__.'/security.php';
if(!is_installed()){header('Location: setup.php');exit;}
if(current_user()) redirect('index.php');
$error='';
if($_SERVER['REQUEST_METHOD']==='POST'){check_csrf(); $loginUser=trim($_POST['username']??''); if(login_rate_limited($loginUser)){flash('Too many login attempts. Please wait 15 minutes.'); redirect('login.php');} record_login_attempt($loginUser);
 check_csrf(); $u=trim($_POST['username']??'');$p=$_POST['password']??'';
 foreach(read_json('users') as $x){
   if(($x['username']??'')===$u && password_verify($p,$x['password_hash']??'')){
     session_regenerate_id(true); $_SESSION['user']=['id'=>(int)$x['id'],'username'=>$u,'role'=>$x['role']??'admin','name'=>$x['name']??$u];
     $_SESSION['csrf']=bin2hex(random_bytes(32)); redirect('index.php');
   }
 }
 $error='Incorrect username or password.';
}
?><!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ridgefield Portal Login</title><link rel="stylesheet" href="cms.css"><link rel="stylesheet" href="assets/dynamic-site.css">
</head><body class="auth"><div class="auth-card"><div class="brand">A C A D E M Y<small>RIDGEFIELD PORTAL</small></div><h1>Sign in</h1><p>Private administration and staff portal.</p><?php if($error):?><div class="alert error"><?=h($error)?></div><?php endif;?><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button class="btn primary">Sign in</button></form><p class="small">Students and parents use the separate portal login.</p><a class="back" href="../index.html">← Return to website</a></div><script src="assets/dynamic-site.js"></script>
</body></html>