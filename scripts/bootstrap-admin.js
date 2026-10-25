#!/usr/bin/env node
const path=require("path");
const crypto=require("crypto");
const Database=require("better-sqlite3");

const db=new Database(path.join(__dirname,"..","server","data","ridgefield.db"));
function hashPassword(password){
  const salt=crypto.randomBytes(16).toString("hex");
  const hash=crypto.scryptSync(password,salt,64).toString("hex");
  return `${salt}:${hash}`;
}
const email=(process.argv[2]||"").trim().toLowerCase();
const password=process.argv[3]||"";
if(!email || !password || password.length<10){
  console.error("Usage: node scripts/bootstrap-admin.js admin@example.com 'strong-password-at-least-10'");
  process.exit(1);
}
const exists=db.prepare("SELECT id FROM auth_accounts WHERE email=?").get(email);
if(exists){
  console.error("Account already exists for",email);
  process.exit(1);
}
const ref=`RF-ACT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const now=new Date().toISOString();
db.prepare(`INSERT INTO auth_accounts(account_ref,email,password_hash,role,linked_student_id,linked_teacher_id,status,failed_attempts,locked_until,last_login_at,password_changed_at,created_at,updated_at)
VALUES(?,?,?,?,NULL,NULL,'Active',0,NULL,NULL,?,?,?)`)
.run(ref,email,hashPassword(password),"admin",now,now,now);
console.log("Created admin account:",email,ref);
