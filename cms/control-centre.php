<?php
require __DIR__.'/config.php'; require_role(['admin']);

$collections=['students','teachers','parents','classes','subjects','results','attendance','invoices','payments','messages','applications','enquiries','news','documents','notifications'];
$counts=[];
foreach($collections as $c){$counts[$c]=count(read_json($c));}
$recent=[];
foreach(['applications','enquiries','messages'] as $c){
 foreach(read_json($c) as $r){$r['_collection']=$c;$recent[]=$r;}
}
usort($recent,fn($a,$b)=>strcmp($b['created_at']??'',$a['created_at']??''));
$recent=array_slice($recent,0,8);
?><!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Control Centre — Ridgefield</title><link rel="stylesheet" href="cms.css"><style>
:root{--ink:#17231f;--gold:#b28b45;--paper:#f7f5ef;--line:#dfe4df}body{background:var(--paper)}.cc{max-width:1450px;margin:auto;padding:28px}.hero{background:var(--ink);color:#fff;border-radius:18px;padding:28px;margin-bottom:20px}.hero h1{margin:5px 0}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px}.metric{font-size:30px;font-weight:800}.muted{color:#68746e}.modules{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}.module{display:block;text-decoration:none;color:var(--ink);background:#fff;border:1px solid var(--line);padding:18px;border-radius:14px}.module:hover{border-color:var(--gold);transform:translateY(-1px)}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid var(--line);text-align:left}@media(max-width:950px){.cards,.modules{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.cards,.modules{grid-template-columns:1fr}.cc{padding:16px}}
</style><link rel="stylesheet" href="assets/dynamic-site.css">
</head><body class="rf-dynamic"><div class="cc">
<div class="hero"><p style="letter-spacing:.25em;color:#d8b56e">RIDGEFIELD ACADEMY</p><h1>Admin Control Centre</h1><p>One place to manage the school platform.</p></div>
<div class="cards"><?php foreach(['students','teachers','parents','classes'] as $c):?><div class="card"><div class="metric"><?=$counts[$c]?></div><div class="muted"><?=ucfirst($c)?></div></div><?php endforeach;?></div>
<h2>School management</h2><div class="modules">
<a class="module" href="school.php"><strong>👥 Students & Staff</strong><p>Manage learner, teacher and parent records.</p></a>
<a class="module" href="student-links.php"><strong>🔗 Parent Links</strong><p>Connect parents to their children.</p></a>
<a class="module" href="timetable.php"><strong>📅 Timetable</strong><p>Create and maintain the weekly timetable.</p></a>
<a class="module" href="documents.php"><strong>📁 Documents</strong><p>Manage school documents and uploads.</p></a>
<a class="module" href="notifications.php"><strong>🔔 Notifications</strong><p>Publish announcements to users.</p></a>
<a class="module" href="accounts.php"><strong>🔐 Accounts</strong><p>Create and disable user accounts.</p></a>
<a class="module" href="finance.php"><strong>💳 Finance</strong><p>Invoices, payments and financial records.</p></a>
<a class="module" href="database-status.php"><strong>🗄 Database</strong><p>Check database connection and records.</p></a>
<a class="module" href="settings.php"><strong>⚙ Settings</strong><p>Configure website settings.</p></a><a class="module" href="admissions.php"><strong>🎓 Admissions</strong><p>Review and process applications.</p></a><a class="module" href="content.php"><strong>🌐 Website Content</strong><p>Update settings and publish news.</p></a><a class="module" href="reports.php"><strong>📊 Reports</strong><p>Review performance and export data.</p></a>
</div>
<h2>Recent activity</h2><div class="card"><table><tr><th>Area</th><th>Record</th><th>Date</th></tr><?php foreach($recent as $r):?><tr><td><?=h(ucfirst($r['_collection']))?></td><td><?=h($r['title']??$r['name']??$r['subject']??$r['username']??'Record')?></td><td><?=h($r['created_at']??'')?></td></tr><?php endforeach;?></table></div>
<p><a href="index.php">← Classic CMS dashboard</a> · <a href="logout.php">Sign out</a></p>
</div><script src="assets/dynamic-site.js"></script>
</body></html>