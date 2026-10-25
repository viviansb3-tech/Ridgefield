<?php
require __DIR__.'/config.php';
require_role(['admin']);
if(!db()){http_response_code(500);exit('Database is not configured. Set RF_DB_HOST, RF_DB_NAME, RF_DB_USER and RF_DB_PASS first.');}
$names=['users','news','staff','fees','documents','applications','enquiries','students','parents','teachers','classes','subjects','attendance','results','ledger','messages','audit','enrolments','invoices','payments','receipts','notifications','settings'];
$done=[];$errors=[];
foreach($names as $n){$data=read_json($n);if(db_replace_from_json($n,$data))$done[]=$n;else$errors[]=$n;}
log_action('database_migration','system',0);
?><!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Database Migration — Ridgefield</title><link rel="stylesheet" href="cms.css"><link rel="stylesheet" href="assets/dynamic-site.css">
</head><body class="rf-dynamic"><div class="layout"><aside class="sidebar"><div class="brand">A C A D E M Y<small>RIDGEFIELD CMS</small></div><nav><a href="index.php">Dashboard</a><a href="settings.php">Settings</a><a href="logout.php">Sign out</a></nav></aside><div class="main"><main class="content"><h1>Database migration</h1><div class="alert success">Migrated <?=count($done)?> collections to MySQL/MariaDB.</div><p><?=h(implode(', ',$done))?></p><?php if($errors):?><div class="alert error">Failed: <?=h(implode(', ',$errors))?></div><?php endif;?><p><strong>Next:</strong> test login, students, results, attendance, finance and messaging before deleting any JSON backups.</p></main></div></div><script src="assets/dynamic-site.js"></script>
</body></html>