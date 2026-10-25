<?php
require __DIR__.'/portal.php'; require __DIR__.'/communication-functions.php'; p17_require(['admin']); $u=p17_user();
$messages=read_json('messages');$notifications=read_json('notifications');$announcements=read_json('announcements');$users=comm_users();
if($_SERVER['REQUEST_METHOD']==='POST'){
 check_csrf();$action=$_POST['action']??'';
 if($action==='announcement'){
  $title=trim($_POST['title']??'');$body=trim($_POST['body']??'');$audience=$_POST['audience']??'all';
  if($title!==''&&$body!==''){
   $announcements[]=['id'=>next_id($announcements),'title'=>$title,'body'=>$body,'audience'=>$audience,'author_id'=>(int)$u['id'],'created_at'=>date('c')];write_json('announcements',$announcements);
   foreach($users as $r){$role=$r['role']??'';$send=$audience==='all'||($audience==='parents'&&$role==='parent')||($audience==='students'&&$role==='student')||($audience==='teachers'&&$role==='teacher')||($audience==='staff'&&in_array($role,['teacher','admin'],true));if($send){comm_add_notification($r['id'],$title,$body,'announcement');comm_log('announcement',$u['id'],$r['id'],'in-app',$title);}}
  }
 }
 if($action==='message'){
  $recipient=(int)($_POST['recipient_id']??0);$subject=trim($_POST['subject']??'');$body=trim($_POST['body']??'');
  if($recipient&&$subject!==''&&$body!==''){comm_add_message($u['id'],$recipient,$subject,$body);comm_add_notification($recipient,$subject,$body,'message');comm_log('message',$u['id'],$recipient,'in-app',$subject);}
 }
 header('Location: communication-centre.php');exit;
}
?><!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Communication Centre</title>
<style>body{margin:0;background:#f4f6f7;font-family:Arial;color:#17201d}.wrap{max-width:1180px;margin:auto;padding:25px}.card{background:white;border:1px solid #ddd;border-radius:16px;padding:20px;margin:12px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat{font-size:30px;font-weight:700}input,select,textarea{width:100%;box-sizing:border-box;padding:11px;border:1px solid #bbb;border-radius:8px;margin:6px 0 14px}textarea{min-height:120px}button{background:#17201d;color:#fff;border:0;padding:11px 16px;border-radius:8px}.table{width:100%;border-collapse:collapse}.table td,.table th{padding:10px;border-bottom:1px solid #ddd;text-align:left}@media(max-width:700px){.grid,.stats{grid-template-columns:1fr}}</style></head>
<body><main class="wrap"><p><a href="dashboard.php">← Dashboard</a></p><div class="card"><h1>Communication Centre</h1><p>Announcements, private messages and notifications.</p></div>
<div class="stats"><div class="card">Messages<div class="stat"><?=count($messages)?></div></div><div class="card">Notifications<div class="stat"><?=count($notifications)?></div></div><div class="card">Announcements<div class="stat"><?=count($announcements)?></div></div><div class="card">Users<div class="stat"><?=count($users)?></div></div></div>
<div class="grid"><section class="card"><h2>School Announcement</h2><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="announcement"><label>Title<input name="title" required></label><label>Audience<select name="audience"><option value="all">Everyone</option><option value="parents">Parents</option><option value="students">Students</option><option value="teachers">Teachers</option><option value="staff">Staff</option></select></label><label>Message<textarea name="body" required></textarea></label><button>Publish</button></form></section>
<section class="card"><h2>Private Message</h2><form method="post"><input type="hidden" name="csrf" value="<?=h(csrf())?>"><input type="hidden" name="action" value="message"><label>Recipient<select name="recipient_id" required><option value="">Select</option><?php foreach($users as $r):if((int)$r['id']===(int)$u['id'])continue;?><option value="<?=$r['id']?>"><?=h(comm_user_name($r['id']))?> — <?=h($r['role']??'')?></option><?php endforeach;?></select></label><label>Subject<input name="subject" required></label><label>Message<textarea name="body" required></textarea></label><button>Send</button></form></section></div>
<div class="card"><h2>Recent Announcements</h2><table class="table"><tr><th>Title</th><th>Audience</th><th>Date</th></tr><?php foreach(array_slice(array_reverse($announcements),0,10) as $a):?><tr><td><?=h($a['title'])?></td><td><?=h($a['audience'])?></td><td><?=h(substr($a['created_at'],0,16))?></td></tr><?php endforeach;?></table></div></main></body></html>