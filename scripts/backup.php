<?php
// Run from cron/CLI: php scripts/backup.php
if(PHP_SAPI!=='cli') exit("CLI only\n");
require __DIR__.'/../cms/config.php';
$dir=__DIR__.'/../backups'; if(!is_dir($dir))mkdir($dir,0700,true);
$stamp=date('Y-m-d_H-i-s');$file="$dir/ridgefield_$stamp.zip";$zip=new ZipArchive();
if($zip->open($file,ZipArchive::CREATE)!==true)exit("Cannot create backup\n");
$storage=realpath(__DIR__.'/../storage'); if($storage){
    $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($storage,FilesystemIterator::SKIP_DOTS));
    foreach($it as $f)if($f->isFile()){$path=$f->getPathname();$rel=substr($path,strlen($storage)+1);$zip->addFile($path,'storage/'.$rel);}
}
$zip->addFile(__DIR__.'/../database/phase10-schema.sql','database/phase10-schema.sql');
$zip->addFile(__DIR__.'/../database/schema.sql','database/schema.sql');
$zip->close();chmod($file,0600);
echo "Backup created: $file\n";
