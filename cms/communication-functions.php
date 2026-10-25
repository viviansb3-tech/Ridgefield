<?php
function comm_users(){ return read_json('users'); }
function comm_user_name($id){
 foreach(comm_users() as $u) if((int)($u['id']??0)===(int)$id) return $u['name']??$u['full_name']??$u['email']??('User '.$id);
 return 'User '.$id;
}
function comm_add_notification($recipient,$title,$message,$type='general',$meta=[]){
 $rows=read_json('notifications');
 $rows[]=['id'=>next_id($rows),'recipient_user_id'=>(int)$recipient,'title'=>$title,'message'=>$message,'type'=>$type,'meta'=>$meta,'read'=>false,'created_at'=>date('c')];
 write_json('notifications',$rows);
}
function comm_add_message($sender,$recipient,$subject,$body,$type='internal'){
 $rows=read_json('messages');
 $rows[]=['id'=>next_id($rows),'sender_id'=>(int)$sender,'recipient_id'=>(int)$recipient,'subject'=>$subject,'body'=>$body,'type'=>$type,'read'=>false,'created_at'=>date('c')];
 write_json('messages',$rows);
}
function comm_log($action,$actor,$recipient,$channel,$subject,$status='sent'){
 $rows=read_json('communication_logs');
 $rows[]=['id'=>next_id($rows),'action'=>$action,'actor_user_id'=>(int)$actor,'recipient_user_id'=>(int)$recipient,'channel'=>$channel,'subject'=>$subject,'status'=>$status,'created_at'=>date('c')];
 write_json('communication_logs',$rows);
}
?>