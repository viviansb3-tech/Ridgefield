require("dotenv").config({path:process.env.ENV_FILE||undefined});
const path=require("path");
const nodemailer=require("nodemailer");
const Database=require("better-sqlite3");

const db=new Database(path.join(__dirname,"data","ridgefield.db"));
db.pragma("journal_mode = WAL");

function heartbeat(name,status="Running",details={}){
  try{
    db.prepare(`INSERT INTO worker_heartbeats(worker_name,status,last_seen_at,details_json)
      VALUES(?,?,?,?)
      ON CONFLICT(worker_name) DO UPDATE SET status=excluded.status,last_seen_at=excluded.last_seen_at,details_json=excluded.details_json`)
      .run(name,status,new Date().toISOString(),JSON.stringify(details||{}));
  }catch(e){}
}


const POLL_MS=Number(process.env.EMAIL_WORKER_POLL_MS||5000);
const BATCH_SIZE=Number(process.env.EMAIL_WORKER_BATCH_SIZE||10);

function now(){return new Date().toISOString()}
function nextAttempt(attempt){
  const minutes=Math.min(60,Math.pow(2,Math.max(0,attempt-1)));
  return new Date(Date.now()+minutes*60*1000).toISOString();
}
function config(){
  return {
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT||587),
    secure:String(process.env.SMTP_SECURE||"false")==="true",
    auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined
  };
}
function ready(){
  return !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
}
const transporter=ready()?nodemailer.createTransport(config()):null;

async function send(job){
  const attempt=job.attempts+1;
  try{
    if(!transporter)throw new Error("SMTP is not configured. Set SMTP_HOST and SMTP_FROM.");
    const info=await transporter.sendMail({
      from:process.env.SMTP_FROM,
      to:job.recipient_email,
      subject:job.subject,
      text:job.body_text,
      html:job.body_html||undefined,
      replyTo:process.env.SMTP_REPLY_TO||undefined
    });
    db.prepare("UPDATE email_jobs SET status='Sent',attempts=?,updated_at=?,sent_at=?,last_error=NULL WHERE id=?")
      .run(attempt,now(),now(),job.id);
    db.prepare(`INSERT INTO email_delivery_log(email_job_id,attempt_number,status,provider_message_id,error_message,attempted_at)
      VALUES(?,?, 'Sent',?,NULL,?)`).run(job.id,attempt,String(info.messageId||""),now());
    console.log("Sent",job.job_ref,job.recipient_email);
  }catch(err){
    const final=attempt>=job.max_attempts;
    db.prepare("UPDATE email_jobs SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?")
      .run(final?"Failed":"Retry",attempt,final?null:nextAttempt(attempt),String(err.message||err),now(),job.id);
    db.prepare(`INSERT INTO email_delivery_log(email_job_id,attempt_number,status,provider_message_id,error_message,attempted_at)
      VALUES(?,?,?,NULL,?,?)`).run(job.id,attempt,final?"Failed":"Retry",String(err.message||err),now());
    console.error(final?"Failed":"Retry",job.job_ref,err.message);
  }
}
async function processBatch(){
  const due=db.prepare(`SELECT * FROM email_jobs
    WHERE status IN ('Queued','Retry')
      AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY id ASC LIMIT ?`).all(now(),BATCH_SIZE);
  for(const job of due)await send(job);
}
async function loop(){
  await processBatch();
  setTimeout(loop,POLL_MS);
}
heartbeat("email-worker","Running",{pid:process.pid}); setInterval(()=>heartbeat("email-worker","Running",{pid:process.pid}),60000);
console.log("Ridgefield email worker started.",ready()?"SMTP configured":"SMTP NOT configured");
loop();
