require("dotenv").config({path:process.env.ENV_FILE||undefined});

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = typeof Bun !== "undefined" ? require("bun:sqlite").Database : require("better-sqlite3");

const app = express();
app.disable("x-powered-by");

const IS_PROD = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",").map(x=>x.trim()).filter(Boolean);

function validateProductionSecrets(){
  if(!IS_PROD)return;
  const missing=[];
  if(!process.env.SMTP_HOST)missing.push("SMTP_HOST");
  if(!process.env.SMTP_FROM)missing.push("SMTP_FROM");
  if(ALLOWED_ORIGINS.length===0)missing.push("ALLOWED_ORIGINS");
  if(missing.length){
    console.error("Production configuration is incomplete:",missing.join(", "));
    process.exit(1);
  }
}
validateProductionSecrets();

app.set("trust proxy", IS_PROD ? 1 : false);
app.use(helmet({
  contentSecurityPolicy:{
    useDefaults:true,
    directives:{
      "default-src":["'self'"],
      "script-src":["'self'","https://cdn.jsdelivr.net"],
      "style-src":["'self'","'unsafe-inline'"],
      "img-src":["'self'","data:"],
      "connect-src":["'self'"],
      "font-src":["'self'","data:"],
      "object-src":["'none'"],
      "frame-ancestors":["'self'"],
      "base-uri":["'self'"],
      "form-action":["'self'"]
    }
  },
  crossOriginEmbedderPolicy:false
}));

app.use(morgan(IS_PROD ? "combined" : "dev"));

const globalLimiter=rateLimit({
  windowMs:15*60*1000,
  limit:Number(process.env.RATE_LIMIT_GLOBAL||500),
  standardHeaders:"draft-7",
  legacyHeaders:false,
  message:{ok:false,error:"Too many requests. Please try again later."}
});
const authLimiter=rateLimit({
  windowMs:15*60*1000,
  limit:Number(process.env.RATE_LIMIT_AUTH||20),
  standardHeaders:"draft-7",
  legacyHeaders:false,
  message:{ok:false,error:"Too many authentication attempts. Please try again later."}
});
app.use("/api/",globalLimiter);
app.use("/api/v1/auth/",authLimiter);
app.use("/api/v1",csrfProtect);

app.use("/api/v1/admin",(req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
app.use("/api/v1/parent",(req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
app.use("/api/v1/rbac",(req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
app.use("/api/v1/portal",(req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});


app.use(cors({
  origin:(origin,cb)=>{
    if(!origin)return cb(null,true);
    if(!IS_PROD)return cb(null,true);
    if(ALLOWED_ORIGINS.includes(origin))return cb(null,true);
    return cb(new Error("Origin not allowed by CORS"));
  },
  credentials:true,
  methods:["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders:["Content-Type","Authorization","x-admin-key"]
}));

app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","SAMEORIGIN");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");next();});
const sessions = new Map();
const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || "CHANGE_THIS_ADMIN_KEY";

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, "data", "ridgefield.db");
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(path.dirname(DB_PATH), {recursive:true});
fs.mkdirSync(UPLOAD_DIR, {recursive:true});

const db = new Database(DB_PATH);
if (typeof db.pragma === "function") db.pragma("journal_mode = WAL"); else db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  pathway TEXT NOT NULL DEFAULT 'Cambridge',
  campus TEXT NOT NULL,
  learner_first TEXT NOT NULL,
  learner_last TEXT NOT NULL,
  dob TEXT NOT NULL,
  learner_grade TEXT NOT NULL,
  current_school TEXT NOT NULL,
  parent_first TEXT NOT NULL,
  parent_last TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  cambridge_level TEXT NOT NULL,
  subjects_json TEXT NOT NULL,
  academic_notes TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  admin_notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_ref TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  pathway TEXT NOT NULL,
  campus TEXT NOT NULL,
  parent_email TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS website_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_ref TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  student_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id)
);
CREATE TABLE IF NOT EXISTS academic_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  score REAL,
  max_score REAL,
  term TEXT,
  academic_year TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_ref TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  campus TEXT NOT NULL,
  pathway TEXT NOT NULL,
  subjects_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teacher_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(teacher_id,student_id,subject),
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  teacher_id INTEGER,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS generated_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_ref TEXT UNIQUE NOT NULL,
  student_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  report_status TEXT NOT NULL DEFAULT 'Draft',
  generated_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Uploaded',
  admin_note TEXT DEFAULT '',
  uploaded_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  ip_address TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parent_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_ref TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parent_students (
  parent_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Parent/Guardian',
  PRIMARY KEY(parent_id,student_id),
  FOREIGN KEY(parent_id) REFERENCES parent_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS finance_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_ref TEXT UNIQUE NOT NULL,
  student_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Outstanding',
  created_at TEXT NOT NULL,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS finance_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_ref TEXT UNIQUE NOT NULL,
  invoice_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  external_reference TEXT,
  paid_at TEXT NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES finance_invoices(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_type TEXT NOT NULL,
  sender_id INTEGER,
  recipient_type TEXT NOT NULL,
  recipient_id INTEGER,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Sent',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_ref TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  linked_student_id INTEGER,
  linked_teacher_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Active',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  password_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(linked_student_id) REFERENCES students(id) ON DELETE SET NULL,
  FOREIGN KEY(linked_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  account_id INTEGER NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES auth_accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES auth_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_account_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  priority TEXT NOT NULL DEFAULT 'Normal',
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(recipient_account_id) REFERENCES auth_accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notification_preferences_v3 (
  account_id INTEGER PRIMARY KEY,
  academics INTEGER NOT NULL DEFAULT 1,
  attendance INTEGER NOT NULL DEFAULT 1,
  finance INTEGER NOT NULL DEFAULT 1,
  admissions INTEGER NOT NULL DEFAULT 1,
  documents INTEGER NOT NULL DEFAULT 1,
  reports INTEGER NOT NULL DEFAULT 1,
  announcements INTEGER NOT NULL DEFAULT 1,
  messages INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(account_id) REFERENCES auth_accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS announcements_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  pathway TEXT,
  campus TEXT,
  priority TEXT NOT NULL DEFAULT 'Normal',
  author_account_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(author_account_id) REFERENCES auth_accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_ref TEXT UNIQUE NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'Queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT,
  last_error TEXT,
  source_entity_type TEXT,
  source_entity_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS email_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_job_id INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  attempted_at TEXT NOT NULL,
  FOREIGN KEY(email_job_id) REFERENCES email_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_key TEXT UNIQUE NOT NULL,
  job_type TEXT NOT NULL,
  schedule_minutes INTEGER NOT NULL DEFAULT 1440,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  last_status TEXT,
  last_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS automation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_key TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_ref TEXT UNIQUE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  restored_at TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS system_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  severity TEXT NOT NULL DEFAULT 'Info',
  component TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`);



for (const stmt of [
  "ALTER TABLE application_documents ADD COLUMN mime_type TEXT",
  "ALTER TABLE application_documents ADD COLUMN file_size INTEGER DEFAULT 0",
  "ALTER TABLE application_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'Uploaded'",
  "ALTER TABLE application_documents ADD COLUMN admin_note TEXT DEFAULT ''",
  "ALTER TABLE application_documents ADD COLUMN reviewed_at TEXT",
  "ALTER TABLE applications ADD COLUMN application_ref TEXT",
  "ALTER TABLE applications ADD COLUMN applicant_first_name TEXT",
  "ALTER TABLE applications ADD COLUMN applicant_last_name TEXT",
  "ALTER TABLE applications ADD COLUMN date_of_birth TEXT",
  "ALTER TABLE applications ADD COLUMN grade_applying TEXT",
  "ALTER TABLE applications ADD COLUMN parent_name TEXT",
  "ALTER TABLE applications ADD COLUMN parent_email TEXT",
  "ALTER TABLE applications ADD COLUMN parent_phone TEXT",
  "ALTER TABLE applications ADD COLUMN preferred_start_date TEXT",
  "ALTER TABLE applications ADD COLUMN notes TEXT"
]) { try { db.exec(stmt); } catch(e) {} }

db.exec(`
CREATE TABLE IF NOT EXISTS enquiries_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_ref TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  enquiry_type TEXT NOT NULL,
  pathway TEXT,
  campus TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  admin_note TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true,limit:"1mb"}));
app.use(express.static(path.join(__dirname,"..")));
app.use(cookieParser());

app.use((req,res,next)=>{
  const requestId=req.get("x-request-id")||crypto.randomBytes(8).toString("hex");
  req.requestId=requestId;
  res.setHeader("X-Request-ID",requestId);
  if(req.path.startsWith("/api/v1/auth/"))res.setHeader("Cache-Control","no-store");
  next();
});


const upload=multer({
  storage:multer.diskStorage({
    destination:(_,__,cb)=>cb(null,UPLOAD_DIR),
    filename:(_,file,cb)=>{
      const safe=crypto.randomBytes(10).toString("hex")+"-"+file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_");
      cb(null,safe);
    }
  }),
  limits:{fileSize:10*1024*1024}
});

function auth(req,res,next){
  const key=req.get("x-admin-key");
  if(!key || key!==ADMIN_KEY) return res.status(401).json({error:"Unauthorised"});
  next();
}
function ref(){
  return `RF-CAM-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function now(){return new Date().toISOString();}

function jsonError(res,status,message,details=null){
  const payload={ok:false,error:message};
  if(details!==null) payload.details=details;
  return res.status(status).json(payload);
}
function normaliseEmail(v){return String(v||"").trim().toLowerCase();}
function validEmail(v){return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v||""));}
function cleanString(v,max=1000){return String(v??"").trim().slice(0,max);}
function asNumber(v){
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function pathwayCampus(pathway){
  if(pathway==="Cambridge")return "25 Wilcock Road, Noordhoek";
  if(pathway==="CAPS Secondary"||pathway==="Primary")return "22 Maartens Street";
  return null;
}
function requireFields(body,fields){
  return fields.filter(k=>!cleanString(body?.[k]));
}
function requireAdmin(req,res,next){return auth(req,res,next);}


const AUTH_SESSION_HOURS = Number(process.env.AUTH_SESSION_HOURS || 12);
const MAX_LOGIN_FAILURES = Number(process.env.MAX_LOGIN_FAILURES || 5);
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 15);

function tokenHash(token){
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
function futureIso(hours){
  return new Date(Date.now()+hours*60*60*1000).toISOString();
}
function minutesFromNow(minutes){
  return new Date(Date.now()+minutes*60*1000).toISOString();
}
function accountPublic(a){
  return {
    id:a.id,accountRef:a.account_ref,email:a.email,role:a.role,status:a.status,
    linkedStudentId:a.linked_student_id,linkedTeacherId:a.linked_teacher_id,
    lastLoginAt:a.last_login_at,createdAt:a.created_at
  };
}

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "rf_session";
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "rf_csrf";
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? String(process.env.COOKIE_SECURE)==="true"
  : IS_PROD;

function sessionCookieOptions(){
  return {httpOnly:true,secure:COOKIE_SECURE,sameSite:"lax",path:"/",maxAge:AUTH_SESSION_HOURS*60*60*1000};
}
function csrfCookieOptions(){
  return {httpOnly:false,secure:COOKIE_SECURE,sameSite:"lax",path:"/",maxAge:AUTH_SESSION_HOURS*60*60*1000};
}
function getSessionToken(req){
  const bearer=(req.get("authorization")||"").replace(/^Bearer\s+/,"").trim();
  return bearer || req.cookies?.[SESSION_COOKIE_NAME] || "";
}
function issueCsrf(res){
  const token=crypto.randomBytes(24).toString("hex");
  res.cookie(CSRF_COOKIE_NAME,token,csrfCookieOptions());
  return token;
}
function clearAuthCookies(res){
  res.clearCookie(SESSION_COOKIE_NAME,{path:"/"});
  res.clearCookie(CSRF_COOKIE_NAME,{path:"/"});
}
function csrfProtect(req,res,next){
  if(["GET","HEAD","OPTIONS"].includes(req.method)) return next();
  if((req.originalUrl||"").includes("/auth/login") || (req.originalUrl||"").includes("/public/")) return next();
  if((req.get("authorization")||"").match(/^Bearer\s+/)) return next();
  const cookieToken=req.cookies?.[CSRF_COOKIE_NAME]||"";
  const headerToken=req.get("x-csrf-token")||"";
  if(!cookieToken || !headerToken || cookieToken!==headerToken)
    return jsonError(res,403,"Invalid CSRF token");
  next();
}

function createPersistentSession(req,account){
  const token=crypto.randomBytes(32).toString("hex");
  const hash=tokenHash(token);
  const stamp=now();
  db.prepare(`INSERT INTO auth_sessions(token_hash,account_id,user_agent,ip_address,expires_at,revoked_at,created_at,last_seen_at)
    VALUES(?,?,?,?,?,NULL,?,?)`).run(hash,account.id,cleanString(req.get("user-agent"),500),req.ip||"",futureIso(AUTH_SESSION_HOURS),stamp,stamp);
  return token;
}
function persistentAuth(req,res,next){
  const token=getSessionToken(req);
  if(!token)return jsonError(res,401,"Authentication required");
  const hash=tokenHash(token);
  const session=db.prepare(`SELECT s.*,a.account_ref,a.email,a.role,a.status,a.linked_student_id,a.linked_teacher_id
    FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL`).get(hash);
  if(!session)return jsonError(res,401,"Invalid session");
  if(session.status!=="Active")return jsonError(res,403,"Account is not active");
  if(new Date(session.expires_at).getTime()<=Date.now()){
    db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE id=?").run(now(),session.id);
    return jsonError(res,401,"Session expired");
  }
  db.prepare("UPDATE auth_sessions SET last_seen_at=? WHERE id=?").run(now(),session.id);
  req.auth={
    accountId:session.account_id,accountRef:session.account_ref,email:session.email,role:session.role,
    studentId:session.linked_student_id,teacherId:session.linked_teacher_id,sessionId:session.id
  };
  next();
}
function requireRoles(...roles){
  return (req,res,next)=>{
    persistentAuth(req,res,()=>{
      if(!roles.includes(req.auth.role))return jsonError(res,403,"Insufficient permission");
      next();
    });
  };
}
function requireAdminAccount(req,res,next){return requireRoles("admin")(req,res,next);}
function requireTeacherAccount(req,res,next){return requireRoles("teacher","admin")(req,res,next);}
function requireStudentAccount(req,res,next){return requireRoles("student")(req,res,next);}
function requireParentAccount(req,res,next){return requireRoles("parent")(req,res,next);}

function audit(req,actorType,actorId,action,entityType=null,entityId=null,metadata={}){
  try{
    db.prepare(`INSERT INTO api_audit_log(actor_type,actor_id,action,entity_type,entity_id,ip_address,metadata_json,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(actorType,actorId||null,action,entityType,entityId?String(entityId):null,req.ip||"",JSON.stringify(metadata||{}),now());
  }catch(e){ console.error("audit log failed",e.message); }
}



function hashPassword(password){
  const salt=crypto.randomBytes(16).toString("hex");
  const hash=crypto.scryptSync(password,salt,64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password,stored){
  const [salt,hash]=String(stored).split(":");
  if(!salt||!hash)return false;
  const test=crypto.scryptSync(password,salt,64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(test,"hex"),Buffer.from(hash,"hex"));
}
function portalAuth(req,res,next){
  const token=(req.get("authorization")||"").replace(/^Bearer\s+/,"");
  const session=sessions.get(token);
  if(!session)return res.status(401).json({error:"Unauthorised"});
  req.portalUser=session;
  next();
}




const NOTIFICATION_CATEGORIES=["academics","attendance","finance","admissions","documents","reports","announcements","messages"];
function ensureNotificationPrefs(accountId){
  db.prepare(`INSERT OR IGNORE INTO notification_preferences_v3(account_id) VALUES(?)`).run(accountId);
}
function preferenceEnabled(accountId,category){
  ensureNotificationPrefs(accountId);
  const p=db.prepare("SELECT * FROM notification_preferences_v3 WHERE account_id=?").get(accountId);
  return !!p && !!p[category];
}

function accountEmail(accountId){
  const a=db.prepare("SELECT email FROM auth_accounts WHERE id=?").get(accountId);
  return a?.email||null;
}
function queueEmail({to,name="",subject,text,html="",category="general",sourceEntityType=null,sourceEntityId=null}){
  if(!validEmail(to))return null;
  const ref=`RF-EML-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const stamp=now();
  const result=db.prepare(`INSERT INTO email_jobs(job_ref,recipient_email,recipient_name,subject,body_text,body_html,category,status,attempts,max_attempts,next_attempt_at,last_error,source_entity_type,source_entity_id,created_at,updated_at,sent_at)
    VALUES(?,?,?,?,?,?,?,'Queued',0,5,?,NULL,?,?,?, ?,NULL)`)
    .run(ref,to,cleanString(name,180),cleanString(subject,240),cleanString(text,10000),cleanString(html,20000),cleanString(category,80),stamp,sourceEntityType,sourceEntityId?String(sourceEntityId):null,stamp,stamp);
  return {id:result.lastInsertRowid,jobRef:ref};
}
function queueAccountEmail(accountId,subject,text,category="general",sourceEntityType=null,sourceEntityId=null){
  const email=accountEmail(accountId);
  if(!email)return null;
  return queueEmail({to:email,subject,text,category,sourceEntityType,sourceEntityId});
}

function createNotification(accountId,category,title,body,entityType=null,entityId=null,priority="Normal"){
  if(!NOTIFICATION_CATEGORIES.includes(category)) return null;
  if(!preferenceEnabled(accountId,category)) return null;
  const result=db.prepare(`INSERT INTO notifications_v3(recipient_account_id,category,title,body,entity_type,entity_id,priority,read_at,created_at)
    VALUES(?,?,?,?,?,?,?,NULL,?)`).run(accountId,category,title,body,entityType,entityId?String(entityId):null,priority,now());
  queueAccountEmail(accountId,title,body,category,entityType,entityId);
  return result.lastInsertRowid;
}
function studentAccounts(studentId){
  const out=[];
  const studentAccount=db.prepare("SELECT id FROM auth_accounts WHERE role='student' AND linked_student_id=? AND status='Active'").all(studentId);
  out.push(...studentAccount.map(x=>x.id));
  const parentIds=db.prepare(`SELECT a.id FROM parent_students ps JOIN auth_accounts a ON a.id=ps.parent_id
    WHERE ps.student_id=? AND a.role='parent' AND a.status='Active'`).all(studentId);
  out.push(...parentIds.map(x=>x.id));
  return [...new Set(out)];
}
function notifyStudentFamily(studentId,category,title,body,entityType=null,entityId=null,priority="Normal"){
  const ids=studentAccounts(studentId);
  ids.forEach(id=>createNotification(id,category,title,body,entityType,entityId,priority));
  return ids.length;
}
function teacherAccountsForStudent(studentId){
  const rows=db.prepare(`SELECT DISTINCT aa.id FROM teacher_assignments ta
    JOIN auth_accounts aa ON aa.linked_teacher_id=ta.teacher_id
    WHERE ta.student_id=? AND aa.role='teacher' AND aa.status='Active'`).all(studentId);
  return rows.map(x=>x.id);
}


function ensureDefaultScheduledJobs(){
  const stamp=now();
  const defaults=[
    ["overdue_fee_reminders","finance_overdue",1440],
    ["attendance_escalation","attendance_escalation",1440],
    ["admissions_followup","admissions_followup",1440],
    ["document_reminders","document_reminders",1440],
    ["report_notifications","report_notifications",1440]
  ];
  const stmt=db.prepare(`INSERT OR IGNORE INTO scheduled_jobs(job_key,job_type,schedule_minutes,enabled,last_run_at,next_run_at,last_status,last_message,created_at,updated_at)
    VALUES(?,?,?,1,NULL,?,NULL,NULL,?,?)`);
  defaults.forEach(([key,type,mins])=>stmt.run(key,type,mins,stamp,stamp,stamp));
}
function automationEvent(jobKey,entityType,entityId,action,outcome,details={}){
  db.prepare(`INSERT INTO automation_events(job_key,entity_type,entity_id,action,outcome,details_json,created_at)
    VALUES(?,?,?,?,?,?,?)`).run(jobKey,entityType,entityId?String(entityId):null,action,outcome,JSON.stringify(details||{}),now());
}
ensureDefaultScheduledJobs();


function systemEvent(severity,component,message,details={}){
  try{
    db.prepare(`INSERT INTO system_events(severity,component,message,details_json,created_at) VALUES(?,?,?,?,?)`)
      .run(severity,component,message,JSON.stringify(details||{}),now());
  }catch(e){console.error("systemEvent failed",e.message)}
}
function workerHeartbeat(workerName,status="Running",details={}){
  db.prepare(`INSERT INTO worker_heartbeats(worker_name,status,last_seen_at,details_json)
    VALUES(?,?,?,?)
    ON CONFLICT(worker_name) DO UPDATE SET status=excluded.status,last_seen_at=excluded.last_seen_at,details_json=excluded.details_json`)
    .run(workerName,status,now(),JSON.stringify(details||{}));
}


const ADMISSION_PATHWAYS={
  Cambridge:{
    campus:"25 Wilcock Road, Noordhoek",
    grades:["IGCSE","AS Level"],
    documents:["Birth Certificate / ID","Latest School Report","Proof of Address","Cambridge Documentation"]
  },
  "CAPS Secondary":{
    campus:"22 Maartens Street",
    grades:["Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"],
    documents:["Birth Certificate / ID","Latest School Report","Proof of Address","Transfer / Leaving Certificate"]
  },
  Primary:{
    campus:"22 Maartens Street",
    grades:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7"],
    documents:["Birth Certificate / ID","Latest School Report","Proof of Address","Transfer / Leaving Certificate"]
  }
};
function ensureApplicationChecklist(applicationId,pathway){
  const cfg=ADMISSION_PATHWAYS[pathway];
  if(!cfg)return;
  const ins=db.prepare(`INSERT OR IGNORE INTO application_checklist(application_id,item_key,label,required,status,updated_at)
    VALUES(?,?,?,?, 'Missing',?)`);
  cfg.documents.forEach((label,i)=>ins.run(applicationId,`doc_${i+1}`,label,1,now()));
}
function syncChecklistFromDocuments(applicationId){
  const docs=db.prepare("SELECT document_type,status FROM application_documents WHERE application_id=?").all(applicationId);
  const items=db.prepare("SELECT * FROM application_checklist WHERE application_id=?").all(applicationId);
  for(const item of items){
    const matching=docs.find(d=>d.document_type===item.label);
    let status="Missing";
    if(matching){
      if(matching.status==="Approved")status="Approved";
      else if(["Rejected","Replacement Required"].includes(matching.status))status="Action Required";
      else status="Uploaded";
    }
    db.prepare("UPDATE application_checklist SET status=?,updated_at=? WHERE id=?").run(status,now(),item.id);
  }
}


const ENQUIRY_TYPES=[
  "Admissions",
  "Fees",
  "Cambridge",
  "CAPS Secondary",
  "Primary",
  "Academics",
  "Subjects",
  "Book Lists",
  "Student Support",
  "General"
];
function enquiryCampus(pathway){
  if(pathway==="Cambridge")return "25 Wilcock Road, Noordhoek";
  if(pathway==="CAPS Secondary"||pathway==="Primary")return "22 Maartens Street";
  return "";
}


function validateProductionSafety(){
  if(process.env.NODE_ENV!=="production")return;
  const failures=[];
  try{
    const demo=db.prepare(`SELECT email FROM auth_accounts
      WHERE email LIKE '%.demo@ridgefield.local' OR email LIKE '%@ridgefield.local' LIMIT 1`).get();
    if(demo)failures.push("demo accounts still exist");
  }catch(e){}
  if(String(process.env.COOKIE_SECURE||"true")!=="true")failures.push("COOKIE_SECURE must be true");
  if(!process.env.ALLOWED_ORIGINS)failures.push("ALLOWED_ORIGINS is required");
  if(failures.length){
    console.error("Production safety validation failed:",failures.join("; "));
    process.exit(1);
  }
}
validateProductionSafety();

app.get("/api/v1/status",(req,res)=>{
  const dbOk=(()=>{try{db.prepare("SELECT 1 AS ok").get();return true}catch(e){return false}})();
  res.json({
    ok:true,
    apiVersion:"v1",
    service:"Ridgefield Academy API",
    database:dbOk?"connected":"error",
    campuses:{
      Cambridge:"25 Wilcock Road, Noordhoek",
      "CAPS Secondary":"22 Maartens Street",
      Primary:"22 Maartens Street"
    },
    time:now()
  });
});

app.get("/api/health",(_,res)=>res.json({ok:true,service:"Ridgefield Cambridge Admissions",time:now()}));

app.post("/api/applications", (req,res)=>{
  const b=req.body||{};
  const required=["learnerFirst","learnerLast","dob","learnerGrade","currentSchool","parentFirst","parentLast","email","phone","cambridgeLevel"];
  const missing=required.filter(k=>!String(b[k]||"").trim());
  if(missing.length) return res.status(400).json({error:"Missing required fields",fields:missing});
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return res.status(400).json({error:"Invalid email address"});
  const reference=ref(), timestamp=now();
  let subjects=b.subjects;
  if(!Array.isArray(subjects)) subjects=subjects ? [subjects] : [];
  const stmt=db.prepare(`
    INSERT INTO applications
    (reference,pathway,campus,learner_first,learner_last,dob,learner_grade,current_school,
     parent_first,parent_last,email,phone,address,cambridge_level,subjects_json,academic_notes,status,created_at,updated_at)
    VALUES (@reference,'Cambridge','25 Wilcock Road, Noordhoek',@learnerFirst,@learnerLast,@dob,@learnerGrade,@currentSchool,
     @parentFirst,@parentLast,@email,@phone,@address,@cambridgeLevel,@subjects,@academicNotes,'Pending',@created,@updated)
  `);
  stmt.run({
    reference, learnerFirst:b.learnerFirst.trim(), learnerLast:b.learnerLast.trim(), dob:b.dob,
    learnerGrade:b.learnerGrade, currentSchool:b.currentSchool.trim(), parentFirst:b.parentFirst.trim(),
    parentLast:b.parentLast.trim(), email:b.email.trim(), phone:b.phone.trim(), address:b.address||"",
    cambridgeLevel:b.cambridgeLevel, subjects:JSON.stringify(subjects), academicNotes:b.academicNotes||"",
    created:timestamp,updated:timestamp
  });
  res.status(201).json({ok:true,reference,status:"Pending",message:"Application submitted successfully."});
});

app.get("/api/admin/applications",auth,(req,res)=>{
  const status=req.query.status;
  let rows;
  if(status) rows=db.prepare("SELECT * FROM applications WHERE status=? ORDER BY id DESC").all(status);
  else rows=db.prepare("SELECT * FROM applications ORDER BY id DESC").all();
  rows=rows.map(r=>({...r,subjects:JSON.parse(r.subjects_json||"[]")}));
  res.json({applications:rows});
});

app.get("/api/admin/applications/:reference",auth,(req,res)=>{
  const r=db.prepare("SELECT * FROM applications WHERE reference=?").get(req.params.reference);
  if(!r) return res.status(404).json({error:"Application not found"});
  r.subjects=JSON.parse(r.subjects_json||"[]"); delete r.subjects_json;
  r.documents=db.prepare("SELECT id,original_name,mime_type,size,created_at FROM documents WHERE application_id=? ORDER BY id DESC").all(r.id);
  res.json(r);
});

app.patch("/api/admin/applications/:reference",auth,(req,res)=>{
  const allowed=["Pending","Under Review","Accepted","Declined","Waitlisted"];
  const {status,adminNotes}=req.body||{};
  if(status && !allowed.includes(status)) return res.status(400).json({error:"Invalid status"});
  const current=db.prepare("SELECT id FROM applications WHERE reference=?").get(req.params.reference);
  if(!current) return res.status(404).json({error:"Application not found"});
  db.prepare(`UPDATE applications SET status=COALESCE(?,status),admin_notes=COALESCE(?,admin_notes),updated_at=? WHERE reference=?`)
    .run(status||null,adminNotes??null,now(),req.params.reference);
  res.json({ok:true});
});

app.post("/api/admin/applications/:reference/documents",auth,upload.single("document"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"No document uploaded"});
  const appRow=db.prepare("SELECT id FROM applications WHERE reference=?").get(req.params.reference);
  if(!appRow){fs.unlinkSync(req.file.path);return res.status(404).json({error:"Application not found"});}
  db.prepare(`INSERT INTO documents(application_id,original_name,stored_name,mime_type,size,created_at) VALUES(?,?,?,?,?,?)`)
    .run(appRow.id,req.file.originalname,req.file.filename,req.file.mimetype,req.file.size,now());
  res.status(201).json({ok:true,filename:req.file.originalname});
});


app.get("/api/admin/summary",auth,(req,res)=>{
  const applications=db.prepare("SELECT COUNT(*) c FROM applications").get().c;
  const pending=db.prepare("SELECT COUNT(*) c FROM applications WHERE status='Pending'").get().c;
  const review=db.prepare("SELECT COUNT(*) c FROM applications WHERE status='Under Review'").get().c;
  const accepted=db.prepare("SELECT COUNT(*) c FROM applications WHERE status='Accepted'").get().c;
  const students=db.prepare("SELECT COUNT(*) c FROM students").get().c;
  res.json({applications,pending,review,accepted,students});
});

app.get("/api/admin/students",auth,(req,res)=>{
  res.json({students:db.prepare("SELECT * FROM students ORDER BY id DESC").all()});
});

app.post("/api/admin/students",auth,(req,res)=>{
  const b=req.body||{};
  if(!b.firstName||!b.lastName||!b.grade||!b.pathway||!b.campus)
    return res.status(400).json({error:"firstName, lastName, grade, pathway and campus are required"});
  const ref=`RF-STU-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  db.prepare(`INSERT INTO students(student_ref,first_name,last_name,grade,pathway,campus,parent_email,status,created_at)
    VALUES(?,?,?,?,?,?,?,'Active',?)`).run(ref,b.firstName,b.lastName,b.grade,b.pathway,b.campus,b.parentEmail||"",now());
  res.status(201).json({ok:true,studentRef:ref});
});

app.get("/api/admin/content",auth,(req,res)=>{
  res.json({content:db.prepare("SELECT * FROM website_content ORDER BY section").all()});
});

app.put("/api/admin/content/:section",auth,(req,res)=>{
  const b=req.body||{};
  if(!b.title || !b.body) return res.status(400).json({error:"title and body are required"});
  db.prepare(`INSERT INTO website_content(section,title,body,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(section) DO UPDATE SET title=excluded.title,body=excluded.body,updated_at=excluded.updated_at`)
    .run(req.params.section,b.title,b.body,now());
  res.json({ok:true});
});


app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body||{};
  const user=db.prepare("SELECT * FROM users WHERE email=?").get(String(email||"").trim().toLowerCase());
  if(!user || !verifyPassword(String(password||""),user.password_hash))
    return res.status(401).json({error:"Invalid email or password"});
  const token=crypto.randomBytes(32).toString("hex");
  sessions.set(token,{userId:user.id,role:user.role,studentId:user.student_id,createdAt:Date.now()});
  let student=null;
  if(user.student_id) student=db.prepare("SELECT id,student_ref,first_name,last_name,grade,pathway,campus,status,parent_email FROM students WHERE id=?").get(user.student_id);
  res.json({ok:true,token,role:user.role,student});
});

app.post("/api/admin/users/student",(req,res)=>{
  const key=req.get("x-admin-key");
  if(!key || key!==ADMIN_KEY)return res.status(401).json({error:"Unauthorised"});
  const {studentId,email,password}=req.body||{};
  if(!studentId||!email||!password||String(password).length<8)
    return res.status(400).json({error:"studentId, email and a password of at least 8 characters are required"});
  const student=db.prepare("SELECT id,student_ref FROM students WHERE id=?").get(studentId);
  if(!student)return res.status(404).json({error:"Student not found"});
  const existing=db.prepare("SELECT id FROM users WHERE email=?").get(String(email).trim().toLowerCase());
  if(existing)return res.status(409).json({error:"Email already has an account"});
  const ref=`RF-USR-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  db.prepare(`INSERT INTO users(user_ref,email,password_hash,role,student_id,created_at) VALUES(?,?,?,?,?,?)`)
    .run(ref,String(email).trim().toLowerCase(),hashPassword(password),"student",studentId,now());
  res.status(201).json({ok:true,userRef:ref,studentRef:student.student_ref});
});

app.get("/api/portal/me",portalAuth,(req,res)=>{
  const student=db.prepare("SELECT id,student_ref,first_name,last_name,grade,pathway,campus,status,parent_email FROM students WHERE id=?").get(req.portalUser.studentId);
  if(!student)return res.status(404).json({error:"Student profile not found"});
  const records=db.prepare("SELECT id,subject,assessment,score,max_score,term,academic_year,comment,created_at FROM academic_records WHERE student_id=? ORDER BY academic_year DESC, id DESC").all(student.id);
  const attendance=db.prepare("SELECT attendance_date,status,note FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 100").all(student.id);
  res.json({student,records,attendance});
});

app.get("/api/portal/records",portalAuth,(req,res)=>{
  const rows=db.prepare("SELECT id,subject,assessment,score,max_score,term,academic_year,comment,created_at FROM academic_records WHERE student_id=? ORDER BY academic_year DESC,id DESC").all(req.portalUser.studentId);
  res.json({records:rows});
});

app.get("/api/portal/attendance",portalAuth,(req,res)=>{
  const rows=db.prepare("SELECT attendance_date,status,note FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 365").all(req.portalUser.studentId);
  res.json({attendance:rows});
});

app.post("/api/admin/academic-records",auth,(req,res)=>{
  const b=req.body||{};
  if(!b.studentId||!b.subject||!b.assessment)
    return res.status(400).json({error:"studentId, subject and assessment are required"});
  const student=db.prepare("SELECT id FROM students WHERE id=?").get(b.studentId);
  if(!student)return res.status(404).json({error:"Student not found"});
  db.prepare(`INSERT INTO academic_records(student_id,subject,assessment,score,max_score,term,academic_year,comment,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(b.studentId,b.subject,b.assessment,
    b.score===null||b.score===""?null:Number(b.score),
    b.maxScore===null||b.maxScore===""?null:Number(b.maxScore),
    b.term||"",b.academicYear||"",b.comment||"",now());
  res.status(201).json({ok:true});
});

app.post("/api/admin/attendance",auth,(req,res)=>{
  const b=req.body||{};
  if(!b.studentId||!b.date||!b.status)return res.status(400).json({error:"studentId, date and status are required"});
  db.prepare(`INSERT INTO attendance(student_id,attendance_date,status,note,created_at) VALUES(?,?,?,?,?)`)
    .run(b.studentId,b.date,b.status,b.note||"",now());
  res.status(201).json({ok:true});
});


app.post("/api/auth/teacher-login",(req,res)=>{
  const {email,password}=req.body||{};
  const user=db.prepare("SELECT * FROM teachers WHERE email=? AND status='Active'").get(String(email||"").trim().toLowerCase());
  if(!user || !verifyPassword(String(password||""),user.password_hash))
    return res.status(401).json({error:"Invalid teacher email or password"});
  const token=crypto.randomBytes(32).toString("hex");
  sessions.set(token,{userId:user.id,role:"teacher",teacherId:user.id,createdAt:Date.now()});
  res.json({ok:true,token,role:"teacher",teacher:{teacherRef:user.teacher_ref,firstName:user.first_name,lastName:user.last_name,email:user.email,campus:user.campus,pathway:user.pathway,subjects:JSON.parse(user.subjects_json||"[]")}});
});

function teacherAuth(req,res,next){
  const token=(req.get("authorization")||"").replace(/^Bearer\s+/,"");
  const session=sessions.get(token);
  if(!session || session.role!=="teacher")return res.status(401).json({error:"Teacher authorisation required"});
  req.teacherUser=session;next();
}

app.post("/api/admin/teachers",auth,(req,res)=>{
  const b=req.body||{};
  if(!b.firstName||!b.lastName||!b.email||!b.password||!b.campus||!b.pathway)
    return res.status(400).json({error:"firstName, lastName, email, password, campus and pathway are required"});
  if(String(b.password).length<8)return res.status(400).json({error:"Password must contain at least 8 characters"});
  const email=String(b.email).trim().toLowerCase();
  if(db.prepare("SELECT id FROM teachers WHERE email=?").get(email))return res.status(409).json({error:"Teacher email already exists"});
  let subjects=b.subjects; if(!Array.isArray(subjects))subjects=subjects?[subjects]:[];
  const ref=`RF-TCH-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  db.prepare(`INSERT INTO teachers(teacher_ref,first_name,last_name,email,password_hash,campus,pathway,subjects_json,status,created_at)
    VALUES(?,?,?,?,?,?,?,?, 'Active',?)`).run(ref,b.firstName,b.lastName,email,hashPassword(b.password),b.campus,b.pathway,JSON.stringify(subjects),now());
  res.status(201).json({ok:true,teacherRef:ref});
});

app.get("/api/admin/teachers",auth,(req,res)=>{
  const rows=db.prepare("SELECT id,teacher_ref,first_name,last_name,email,campus,pathway,subjects_json,status,created_at FROM teachers ORDER BY id DESC").all();
  res.json({teachers:rows.map(x=>({...x,subjects:JSON.parse(x.subjects_json||"[]")}))});
});

app.post("/api/admin/teacher-assignments",auth,(req,res)=>{
  const {teacherId,studentId,subject}=req.body||{};
  if(!teacherId||!studentId||!subject)return res.status(400).json({error:"teacherId, studentId and subject are required"});
  const teacher=db.prepare("SELECT id FROM teachers WHERE id=?").get(teacherId);
  const student=db.prepare("SELECT id,pathway,campus FROM students WHERE id=?").get(studentId);
  if(!teacher||!student)return res.status(404).json({error:"Teacher or student not found"});
  try{
    db.prepare("INSERT INTO teacher_assignments(teacher_id,student_id,subject,created_at) VALUES(?,?,?,?)").run(teacherId,studentId,subject,now());
  }catch(e){return res.status(409).json({error:"This teacher/student/subject assignment already exists"})}
  res.status(201).json({ok:true});
});

app.get("/api/teacher/dashboard",teacherAuth,(req,res)=>{
  const teacher=db.prepare("SELECT id,teacher_ref,first_name,last_name,email,campus,pathway,subjects_json,status FROM teachers WHERE id=?").get(req.teacherUser.teacherId);
  const assignments=db.prepare(`SELECT ta.id,ta.subject,s.id student_id,s.student_ref,s.first_name,s.last_name,s.grade,s.pathway,s.campus
    FROM teacher_assignments ta JOIN students s ON s.id=ta.student_id WHERE ta.teacher_id=? ORDER BY s.last_name,s.first_name`).all(teacher.id);
  const records=db.prepare(`SELECT ar.id,ar.student_id,ar.subject,ar.assessment,ar.score,ar.max_score,ar.term,ar.academic_year,ar.comment
    FROM academic_records ar JOIN teacher_assignments ta ON ta.student_id=ar.student_id AND ta.subject=ar.subject
    WHERE ta.teacher_id=? ORDER BY ar.id DESC`).all(teacher.id);
  res.json({teacher:{...teacher,subjects:JSON.parse(teacher.subjects_json||"[]")},assignments,records});
});

app.post("/api/teacher/records",teacherAuth,(req,res)=>{
  const b=req.body||{};
  if(!b.studentId||!b.subject||!b.assessment)return res.status(400).json({error:"studentId, subject and assessment are required"});
  const assigned=db.prepare("SELECT id FROM teacher_assignments WHERE teacher_id=? AND student_id=? AND subject=?")
    .get(req.teacherUser.teacherId,b.studentId,b.subject);
  if(!assigned)return res.status(403).json({error:"You are not assigned to this student for this subject"});
  db.prepare(`INSERT INTO academic_records(student_id,subject,assessment,score,max_score,term,academic_year,comment,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(b.studentId,b.subject,b.assessment,
    b.score===""||b.score==null?null:Number(b.score),b.maxScore===""||b.maxScore==null?null:Number(b.maxScore),
    b.term||"",b.academicYear||"",b.comment||"",now());
  res.status(201).json({ok:true});
});

app.post("/api/teacher/attendance",teacherAuth,(req,res)=>{
  const b=req.body||{};
  if(!b.studentId||!b.date||!b.status)return res.status(400).json({error:"studentId, date and status are required"});
  const assigned=db.prepare("SELECT id FROM teacher_assignments WHERE teacher_id=? AND student_id=? LIMIT 1").get(req.teacherUser.teacherId,b.studentId);
  if(!assigned)return res.status(403).json({error:"You are not assigned to this student"});
  db.prepare(`INSERT INTO attendance(student_id,attendance_date,status,note,created_at) VALUES(?,?,?,?,?)`)
    .run(b.studentId,b.date,b.status,b.note||"",now());
  res.status(201).json({ok:true});
});


function pct(score,max){
  if(score===null||score===undefined||max===null||max===undefined||Number(max)===0)return null;
  return Math.round((Number(score)/Number(max))*10000)/100;
}
app.get("/api/teacher/analytics/:studentId",teacherAuth,(req,res)=>{
  const sid=Number(req.params.studentId);
  const assigned=db.prepare("SELECT id FROM teacher_assignments WHERE teacher_id=? AND student_id=?").get(req.teacherUser.teacherId,sid);
  if(!assigned)return res.status(403).json({error:"You are not assigned to this student"});
  const student=db.prepare("SELECT id,student_ref,first_name,last_name,grade,pathway,campus FROM students WHERE id=?").get(sid);
  const rows=db.prepare(`SELECT subject,assessment,score,max_score,term,academic_year,comment,created_at
    FROM academic_records WHERE student_id=? ORDER BY academic_year,term,created_at`).all(sid).map(x=>({...x,percentage:pct(x.score,x.max_score)}));
  const bySubject={};
  rows.forEach(x=>{if(!bySubject[x.subject])bySubject[x.subject]=[];if(x.percentage!==null)bySubject[x.subject].push(x.percentage)});
  const subjectSummary=Object.entries(bySubject).map(([subject,vals])=>({
    subject,count:vals.length,average:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100,
    latest:vals[vals.length-1],change:vals.length>1?Math.round((vals[vals.length-1]-vals[0])*100)/100:0
  }));
  const valid=rows.filter(x=>x.percentage!==null);
  const overall=valid.length?Math.round(valid.reduce((a,b)=>a+b.percentage,0)/valid.length*100)/100:null;
  const trend=valid.map(x=>({date:x.created_at,assessment:x.assessment,subject:x.subject,percentage:x.percentage}));
  const attendance=db.prepare("SELECT status,COUNT(*) count FROM attendance WHERE student_id=? GROUP BY status").all(sid);
  const totalAtt=attendance.reduce((a,b)=>a+b.count,0);
  const present=attendance.filter(x=>x.status==="Present"||x.status==="Late").reduce((a,b)=>a+b.count,0);
  res.json({student,overall,records:rows,subjectSummary,trend,attendance,attendancePercentage:totalAtt?Math.round(present/totalAtt*10000)/100:null});
});

app.get("/api/portal/analytics",portalAuth,(req,res)=>{
  const sid=req.portalUser.studentId;
  const rows=db.prepare(`SELECT subject,assessment,score,max_score,term,academic_year,comment,created_at
    FROM academic_records WHERE student_id=? ORDER BY academic_year,term,created_at`).all(sid).map(x=>({...x,percentage:pct(x.score,x.max_score)}));
  const bySubject={};
  rows.forEach(x=>{if(!bySubject[x.subject])bySubject[x.subject]=[];if(x.percentage!==null)bySubject[x.subject].push(x.percentage)});
  const subjectSummary=Object.entries(bySubject).map(([subject,vals])=>({subject,average:Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100,latest:vals[vals.length-1],change:vals.length>1?Math.round((vals[vals.length-1]-vals[0])*100)/100:0}));
  const valid=rows.filter(x=>x.percentage!==null);
  const overall=valid.length?Math.round(valid.reduce((a,b)=>a+b.percentage,0)/valid.length*100)/100:null;
  const att=db.prepare("SELECT status,COUNT(*) count FROM attendance WHERE student_id=? GROUP BY status").all(sid);
  const total=att.reduce((a,b)=>a+b.count,0), present=att.filter(x=>x.status==="Present"||x.status==="Late").reduce((a,b)=>a+b.count,0);
  res.json({overall,subjectSummary,trend:valid.map(x=>({date:x.created_at,subject:x.subject,assessment:x.assessment,percentage:x.percentage})),attendance:att,attendancePercentage:total?Math.round(present/total*10000)/100:null});
});

app.get("/api/admin/analytics/student/:studentId",auth,(req,res)=>{
  const sid=Number(req.params.studentId);
  const student=db.prepare("SELECT id,student_ref,first_name,last_name,grade,pathway,campus FROM students WHERE id=?").get(sid);
  if(!student)return res.status(404).json({error:"Student not found"});
  const rows=db.prepare(`SELECT subject,assessment,score,max_score,term,academic_year,comment,created_at
    FROM academic_records WHERE student_id=? ORDER BY academic_year,term,created_at`).all(sid).map(x=>({...x,percentage:pct(x.score,x.max_score)}));
  const valid=rows.filter(x=>x.percentage!==null);
  const overall=valid.length?Math.round(valid.reduce((a,b)=>a+b.percentage,0)/valid.length*100)/100:null;
  const subjectSummary={};
  valid.forEach(x=>(subjectSummary[x.subject]??=[]).push(x.percentage));
  const subjects=Object.entries(subjectSummary).map(([subject,v])=>({subject,average:Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100,latest:v[v.length-1],change:v.length>1?Math.round((v[v.length-1]-v[0])*100)/100:0}));
  res.json({student,overall,subjects,trend:valid.map(x=>({date:x.created_at,subject:x.subject,assessment:x.assessment,percentage:x.percentage}))});
});


function reportData(studentId,term,year){
  const student=db.prepare("SELECT id,student_ref,first_name,last_name,grade,pathway,campus,parent_email FROM students WHERE id=?").get(studentId);
  if(!student) return null;
  const records=db.prepare(`SELECT subject,assessment,score,max_score,term,academic_year,comment,created_at
    FROM academic_records WHERE student_id=? AND term=? AND academic_year=? ORDER BY subject,created_at`).all(studentId,term,year)
    .map(x=>({...x,percentage:pct(x.score,x.max_score)}));
  const subjectMap={};
  records.filter(x=>x.percentage!==null).forEach(x=>(subjectMap[x.subject]??=[]).push(x.percentage));
  const subjects=Object.entries(subjectMap).map(([subject,v])=>({
    subject,average:Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100,
    latest:v[v.length-1]
  }));
  const overall=subjects.length?Math.round(subjects.reduce((a,b)=>a+b.average,0)/subjects.length*100)/100:null;
  const att=db.prepare("SELECT status,COUNT(*) count FROM attendance WHERE student_id=? GROUP BY status").all(studentId);
  const total=att.reduce((a,b)=>a+b.count,0);
  const attended=att.filter(x=>x.status==="Present"||x.status==="Late").reduce((a,b)=>a+b.count,0);
  const attendancePercentage=total?Math.round(attended/total*10000)/100:null;
  const comments=db.prepare(`SELECT rc.comment,rc.term,rc.academic_year,t.first_name teacher_first,t.last_name teacher_last
    FROM report_comments rc LEFT JOIN teachers t ON t.id=rc.teacher_id
    WHERE rc.student_id=? AND rc.term=? AND rc.academic_year=? ORDER BY rc.created_at DESC`).all(studentId,term,year);
  return {student,term,academicYear:year,subjects,overall,attendancePercentage,attendance:att,comments};
}

app.get("/api/teacher/report/:studentId",(req,res,next)=>{teacherAuth(req,res,()=>{const sid=Number(req.params.studentId),b=req.query||{};const term=b.term||"Term 1",year=b.year||String(new Date().getFullYear());const assigned=db.prepare("SELECT id FROM teacher_assignments WHERE teacher_id=? AND student_id=?").get(req.teacherUser.teacherId,sid);if(!assigned)return res.status(403).json({error:"You are not assigned to this student"});const d=reportData(sid,term,year);if(!d)return res.status(404).json({error:"Student not found"});res.json(d);})});

app.post("/api/teacher/report-comment",teacherAuth,(req,res)=>{
  const b=req.body||{};
  if(!b.studentId||!b.term||!b.academicYear||!b.comment)return res.status(400).json({error:"studentId, term, academicYear and comment are required"});
  const assigned=db.prepare("SELECT id FROM teacher_assignments WHERE teacher_id=? AND student_id=?").get(req.teacherUser.teacherId,b.studentId);
  if(!assigned)return res.status(403).json({error:"You are not assigned to this student"});
  db.prepare(`INSERT INTO report_comments(student_id,teacher_id,term,academic_year,comment,created_at) VALUES(?,?,?,?,?,?)`)
    .run(b.studentId,req.teacherUser.teacherId,b.term,b.academicYear,b.comment,now());
  res.status(201).json({ok:true});
});

app.post("/api/admin/reports/generate",auth,(req,res)=>{
  const b=req.body||{}; if(!b.studentId||!b.term||!b.academicYear)return res.status(400).json({error:"studentId, term and academicYear are required"});
  if(!db.prepare("SELECT id FROM students WHERE id=?").get(b.studentId))return res.status(404).json({error:"Student not found"});
  const ref=`RF-REP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  db.prepare(`INSERT INTO generated_reports(report_ref,student_id,term,academic_year,report_status,generated_at) VALUES(?,?,?,?,?,?)`)
    .run(ref,b.studentId,b.term,b.academicYear,"Generated",now());
  res.status(201).json({ok:true,reportRef:ref});
});

app.get("/api/admin/report/:studentId",auth,(req,res)=>{
  const b=req.query||{},d=reportData(Number(req.params.studentId),b.term||"Term 1",b.year||String(new Date().getFullYear()));
  if(!d)return res.status(404).json({error:"Student not found"});res.json(d);
});

app.get("/api/portal/report",portalAuth,(req,res)=>{
  const b=req.query||{},d=reportData(req.portalUser.studentId,b.term||"Term 1",b.year||String(new Date().getFullYear()));
  if(!d)return res.status(404).json({error:"Student not found"});res.json(d);
});


const DOCUMENT_TYPES=["Birth Certificate / ID","Latest School Report","Proof of Address","Transfer / Leaving Certificate","Cambridge Documentation","Other"];
const DOCUMENT_STATUSES=["Uploaded","Under Review","Approved","Rejected","Replacement Required"];
app.get("/api/applications/:ref/documents",(req,res)=>{
  const a=db.prepare("SELECT id,application_ref,status FROM applications WHERE application_ref=?").get(req.params.ref);
  if(!a)return res.status(404).json({error:"Application not found"});
  const docs=db.prepare(`SELECT id,document_type,file_name,mime_type,file_size,status,admin_note,uploaded_at,reviewed_at
    FROM application_documents WHERE application_id=? ORDER BY uploaded_at DESC`).all(a.id);
  res.json({application:a,allowedTypes:DOCUMENT_TYPES,documents:docs});
});
app.post("/api/applications/:ref/documents",(req,res)=>{
  const a=db.prepare("SELECT id FROM applications WHERE application_ref=?").get(req.params.ref);
  if(!a)return res.status(404).json({error:"Application not found"});
  const b=req.body||{};
  if(!DOCUMENT_TYPES.includes(b.documentType)||!b.fileName)return res.status(400).json({error:"Valid document type and file name are required"});
  if((b.fileSize||0)>10*1024*1024)return res.status(400).json({error:"Document exceeds the 10 MB limit"});
  db.prepare(`INSERT INTO application_documents(application_id,document_type,file_name,file_path,mime_type,file_size,status,admin_note,uploaded_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(a.id,b.documentType,b.fileName,b.filePath||("uploads/applications/"+a.id+"/"+b.fileName),b.mimeType||"",Number(b.fileSize||0),"Uploaded","",now());
  db.prepare("UPDATE applications SET status='Documents Required',updated_at=? WHERE id=? AND status='Submitted'").run(now(),a.id);
  res.status(201).json({ok:true});
});
app.get("/api/admin/applications/:id/documents",auth,(req,res)=>{
  const a=db.prepare("SELECT id,application_ref,applicant_first_name,applicant_last_name FROM applications WHERE id=?").get(req.params.id);
  if(!a)return res.status(404).json({error:"Application not found"});
  const docs=db.prepare(`SELECT id,document_type,file_name,mime_type,file_size,status,admin_note,uploaded_at,reviewed_at
    FROM application_documents WHERE application_id=? ORDER BY uploaded_at DESC`).all(a.id);
  res.json({application:a,documents:docs,allowedStatuses:DOCUMENT_STATUSES});
});
app.patch("/api/admin/application-documents/:id",auth,(req,res)=>{
  const b=req.body||{};
  if(b.status&&!DOCUMENT_STATUSES.includes(b.status))return res.status(400).json({error:"Invalid document status"});
  const d=db.prepare("SELECT id FROM application_documents WHERE id=?").get(req.params.id);
  if(!d)return res.status(404).json({error:"Document not found"});
  db.prepare("UPDATE application_documents SET status=?,admin_note=?,reviewed_at=? WHERE id=?")
    .run(b.status||"Under Review",b.adminNote||"",now(),req.params.id);
  res.json({ok:true});
});


// -----------------------
// Ridgefield API v1
// -----------------------

app.get("/api/v1/public/campuses",(req,res)=>{
  res.json({ok:true,campuses:[
    {pathway:"Cambridge",campus:"25 Wilcock Road, Noordhoek"},
    {pathway:"CAPS Secondary",campus:"22 Maartens Street"},
    {pathway:"Primary",campus:"22 Maartens Street"}
  ]});
});

app.post("/api/v1/public/applications",(req,res)=>{
  const b=req.body||{};
  const missing=requireFields(b,["firstName","lastName","parentName","parentEmail","pathway","gradeApplying"]);
  if(missing.length)return jsonError(res,400,"Missing required fields",missing);
  const campus=pathwayCampus(b.pathway);
  if(!campus)return jsonError(res,400,"Invalid pathway");
  if(!validEmail(b.parentEmail))return jsonError(res,400,"Invalid parent email");
  const ref=`RF-APP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const stamp=now();
  const result=db.prepare(`INSERT INTO applications(application_ref,applicant_first_name,applicant_last_name,date_of_birth,parent_name,parent_email,parent_phone,pathway,campus,grade_applying,current_school,preferred_start_date,status,notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ref,cleanString(b.firstName,120),cleanString(b.lastName,120),cleanString(b.dateOfBirth,40),cleanString(b.parentName,180),
      normaliseEmail(b.parentEmail),cleanString(b.parentPhone,60),b.pathway,campus,cleanString(b.gradeApplying,60),
      cleanString(b.currentSchool,180),cleanString(b.preferredStartDate,40),"Submitted",cleanString(b.notes,4000),stamp,stamp);
  audit(req,"public",null,"application.created","application",result.lastInsertRowid,{reference:ref,pathway:b.pathway});
  res.status(201).json({ok:true,application:{id:result.lastInsertRowid,reference:ref,pathway:b.pathway,campus,status:"Submitted"}});
});

app.get("/api/v1/public/applications/:ref/status",(req,res)=>{
  const a=db.prepare(`SELECT application_ref,pathway,campus,grade_applying,status,preferred_start_date,created_at,updated_at
    FROM applications WHERE application_ref=?`).get(req.params.ref);
  if(!a)return jsonError(res,404,"Application not found");
  res.json({ok:true,application:a});
});

app.get("/api/v1/admin/summary",auth,(req,res)=>{
  const one=q=>db.prepare(q).get().c;
  const summary={
    applications:one("SELECT COUNT(*) c FROM applications"),
    pendingApplications:one("SELECT COUNT(*) c FROM applications WHERE status IN ('Submitted','Pending')"),
    underReview:one("SELECT COUNT(*) c FROM applications WHERE status='Under Review'"),
    accepted:one("SELECT COUNT(*) c FROM applications WHERE status='Accepted'"),
    enrolled:one("SELECT COUNT(*) c FROM applications WHERE status='Enrolled'"),
    students:one("SELECT COUNT(*) c FROM students"),
    teachers:one("SELECT COUNT(*) c FROM teachers"),
    academicRecords:one("SELECT COUNT(*) c FROM academic_records"),
    attendanceRecords:one("SELECT COUNT(*) c FROM attendance")
  };
  res.json({ok:true,summary});
});

app.get("/api/v1/admin/students",auth,(req,res)=>{
  const pathway=cleanString(req.query.pathway,80);
  let rows;
  if(pathway) rows=db.prepare("SELECT * FROM students WHERE pathway=? ORDER BY last_name,first_name").all(pathway);
  else rows=db.prepare("SELECT * FROM students ORDER BY last_name,first_name").all();
  res.json({ok:true,students:rows});
});

app.get("/api/v1/admin/students/:id",auth,(req,res)=>{
  const s=db.prepare("SELECT * FROM students WHERE id=?").get(req.params.id);
  if(!s)return jsonError(res,404,"Student not found");
  const records=db.prepare("SELECT * FROM academic_records WHERE student_id=? ORDER BY created_at DESC").all(s.id);
  const attendance=db.prepare("SELECT * FROM attendance WHERE student_id=? ORDER BY attendance_date DESC").all(s.id);
  const invoices=db.prepare("SELECT * FROM finance_invoices WHERE student_id=? ORDER BY created_at DESC").all(s.id);
  res.json({ok:true,student:s,academicRecords:records,attendance,invoices});
});

app.post("/api/v1/admin/students",auth,(req,res)=>{
  const b=req.body||{};
  const missing=requireFields(b,["firstName","lastName","grade","pathway"]);
  if(missing.length)return jsonError(res,400,"Missing required fields",missing);
  const campus=pathwayCampus(b.pathway);
  if(!campus)return jsonError(res,400,"Invalid pathway");
  const ref=`RF-STU-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const result=db.prepare(`INSERT INTO students(student_ref,first_name,last_name,grade,pathway,campus,parent_email,status,created_at)
    VALUES(?,?,?,?,?,?,?,'Active',?)`).run(ref,cleanString(b.firstName,120),cleanString(b.lastName,120),cleanString(b.grade,60),b.pathway,campus,normaliseEmail(b.parentEmail),now());
  audit(req,"admin",null,"student.created","student",result.lastInsertRowid,{studentRef:ref});
  res.status(201).json({ok:true,student:{id:result.lastInsertRowid,studentRef:ref,campus,pathway:b.pathway}});
});

app.get("/api/v1/admin/teachers",auth,(req,res)=>{
  const rows=db.prepare("SELECT id,teacher_ref,first_name,last_name,email,campus,pathway,subjects_json,status,created_at FROM teachers ORDER BY last_name,first_name").all();
  res.json({ok:true,teachers:rows.map(x=>({...x,subjects:JSON.parse(x.subjects_json||"[]")}))});
});

app.get("/api/v1/admin/applications",auth,(req,res)=>{
  const status=cleanString(req.query.status,60);
  const pathway=cleanString(req.query.pathway,80);
  let sql="SELECT * FROM applications WHERE 1=1",params=[];
  if(status){sql+=" AND status=?";params.push(status)}
  if(pathway){sql+=" AND pathway=?";params.push(pathway)}
  sql+=" ORDER BY created_at DESC";
  res.json({ok:true,applications:db.prepare(sql).all(...params)});
});

app.patch("/api/v1/admin/applications/:id",auth,(req,res)=>{
  const b=req.body||{};
  const current=db.prepare("SELECT * FROM applications WHERE id=?").get(req.params.id);
  if(!current)return jsonError(res,404,"Application not found");
  const statuses=["Submitted","Pending","Under Review","Documents Required","Interview","Accepted","Waitlisted","Declined","Enrolled"];
  const status=b.status||current.status;
  if(!statuses.includes(status))return jsonError(res,400,"Invalid application status");
  db.prepare("UPDATE applications SET status=?,notes=?,updated_at=? WHERE id=?").run(status,b.notes!==undefined?cleanString(b.notes,4000):current.notes,now(),req.params.id);
  audit(req,"admin",null,"application.updated","application",req.params.id,{status});
  const appRow=db.prepare("SELECT parent_email,applicant_first_name,applicant_last_name,application_ref FROM applications WHERE id=?").get(req.params.id);
  if(appRow){const linked=db.prepare(`SELECT DISTINCT aa.id FROM auth_accounts aa JOIN parent_students ps ON ps.parent_id=aa.id JOIN students s ON s.id=ps.student_id WHERE aa.role='parent' AND s.parent_email=? AND s.first_name=? AND s.last_name=?`).all(appRow.parent_email,appRow.applicant_first_name,appRow.applicant_last_name);linked.forEach(x=>createNotification(x.id,"admissions",`Application ${status}`,`${appRow.application_ref} is now ${status}.`,"application",req.params.id,status==="Accepted"?"High":"Normal"));}
  res.json({ok:true,status});
});

app.get("/api/v1/admin/audit",auth,(req,res)=>{
  const limit=Math.max(1,Math.min(500,Number(req.query.limit||100)));
  const rows=db.prepare("SELECT * FROM api_audit_log ORDER BY id DESC LIMIT ?").all(limit);
  res.json({ok:true,audit:rows});
});

app.post("/api/v1/admin/academic-records",auth,(req,res)=>{
  const b=req.body||{};
  const missing=requireFields(b,["studentId","subject","assessment"]);
  if(missing.length)return jsonError(res,400,"Missing required fields",missing);
  const student=db.prepare("SELECT id FROM students WHERE id=?").get(Number(b.studentId));
  if(!student)return jsonError(res,404,"Student not found");
  const score=asNumber(b.score),maxScore=asNumber(b.maxScore);
  if(score!==null&&maxScore!==null&&(score<0||maxScore<=0||score>maxScore))return jsonError(res,400,"Invalid score/maxScore");
  const result=db.prepare(`INSERT INTO academic_records(student_id,subject,assessment,score,max_score,term,academic_year,comment,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(Number(b.studentId),cleanString(b.subject,160),cleanString(b.assessment,180),score,maxScore,cleanString(b.term,60),cleanString(b.academicYear,20),cleanString(b.comment,2000),now());
  audit(req,"admin",null,"academic_record.created","academic_record",result.lastInsertRowid,{studentId:b.studentId});
  notifyStudentFamily(Number(b.studentId),"academics","New academic result",`${cleanString(b.subject,160)} — ${cleanString(b.assessment,180)} has been published.`,"academic_record",result.lastInsertRowid,"Normal");
  res.status(201).json({ok:true,id:result.lastInsertRowid});
});

app.post("/api/v1/admin/attendance",auth,(req,res)=>{
  const b=req.body||{};
  const missing=requireFields(b,["studentId","date","status"]);
  if(missing.length)return jsonError(res,400,"Missing required fields",missing);
  const statuses=["Present","Absent","Late","Excused"];
  if(!statuses.includes(b.status))return jsonError(res,400,"Invalid attendance status");
  const student=db.prepare("SELECT id FROM students WHERE id=?").get(Number(b.studentId));
  if(!student)return jsonError(res,404,"Student not found");
  const result=db.prepare(`INSERT INTO attendance(student_id,attendance_date,status,note,created_at) VALUES(?,?,?,?,?)`)
    .run(Number(b.studentId),cleanString(b.date,40),b.status,cleanString(b.note,1000),now());
  audit(req,"admin",null,"attendance.created","attendance",result.lastInsertRowid,{studentId:b.studentId,status:b.status});
  if(b.status==="Absent"||b.status==="Late") notifyStudentFamily(Number(b.studentId),"attendance",`Attendance update: ${b.status}`,`Attendance has been recorded as ${b.status} for ${cleanString(b.date,40)}.`,"attendance",result.lastInsertRowid,b.status==="Absent"?"High":"Normal");
  res.status(201).json({ok:true,id:result.lastInsertRowid});
});

app.post("/api/v1/admin/invoices",auth,(req,res)=>{
  const b=req.body||{};
  const amount=asNumber(b.amount);
  if(!b.studentId||!cleanString(b.description)||amount===null||amount<=0)return jsonError(res,400,"studentId, description and positive amount are required");
  if(!db.prepare("SELECT id FROM students WHERE id=?").get(Number(b.studentId)))return jsonError(res,404,"Student not found");
  const ref=`RF-INV-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const result=db.prepare(`INSERT INTO finance_invoices(invoice_ref,student_id,description,amount,due_date,status,created_at)
    VALUES(?,?,?,?,?,'Outstanding',?)`).run(ref,Number(b.studentId),cleanString(b.description,255),amount,cleanString(b.dueDate,40),now());
  audit(req,"admin",null,"invoice.created","invoice",result.lastInsertRowid,{invoiceRef:ref,studentId:b.studentId,amount});
  notifyStudentFamily(Number(b.studentId),"finance","New invoice",`${ref}: ${cleanString(b.description,255)} — R ${amount.toFixed(2)}`,"invoice",result.lastInsertRowid,"Normal");
  res.status(201).json({ok:true,invoice:{id:result.lastInsertRowid,reference:ref,amount,status:"Outstanding"}});
});

app.post("/api/v1/admin/payments",auth,(req,res)=>{
  const b=req.body||{},amount=asNumber(b.amount);
  if(!b.invoiceId||amount===null||amount<=0||!cleanString(b.method))return jsonError(res,400,"invoiceId, positive amount and method are required");
  const invoice=db.prepare("SELECT * FROM finance_invoices WHERE id=?").get(Number(b.invoiceId));
  if(!invoice)return jsonError(res,404,"Invoice not found");
  const ref=`RF-PAY-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const result=db.prepare(`INSERT INTO finance_payments(payment_ref,invoice_id,amount,method,external_reference,paid_at)
    VALUES(?,?,?,?,?,?)`).run(ref,Number(b.invoiceId),amount,cleanString(b.method,60),cleanString(b.externalReference,160),now());
  const paid=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM finance_payments WHERE invoice_id=?").get(Number(b.invoiceId)).total;
  const status=paid>=invoice.amount?"Paid":"Outstanding";
  db.prepare("UPDATE finance_invoices SET status=? WHERE id=?").run(status,Number(b.invoiceId));
  audit(req,"admin",null,"payment.created","payment",result.lastInsertRowid,{paymentRef:ref,invoiceId:b.invoiceId,amount});
  notifyStudentFamily(Number(invoice.student_id),"finance","Payment recorded",`${ref}: payment of R ${amount.toFixed(2)} has been recorded.`,"payment",result.lastInsertRowid,"Normal");
  res.status(201).json({ok:true,payment:{id:result.lastInsertRowid,reference:ref},invoiceStatus:status});
});

app.get("/api/v1/portal/finance",portalAuth,(req,res)=>{
  const invoices=db.prepare("SELECT * FROM finance_invoices WHERE student_id=? ORDER BY created_at DESC").all(req.portalUser.studentId);
  const detailed=invoices.map(i=>({
    ...i,
    payments:db.prepare("SELECT * FROM finance_payments WHERE invoice_id=? ORDER BY paid_at DESC").all(i.id)
  }));
  res.json({ok:true,invoices:detailed});
});

app.post("/api/v1/admin/communications",auth,(req,res)=>{
  const b=req.body||{};
  const missing=requireFields(b,["recipientType","recipientId","subject","body"]);
  if(missing.length)return jsonError(res,400,"Missing required fields",missing);
  const result=db.prepare(`INSERT INTO communications(sender_type,sender_id,recipient_type,recipient_id,subject,body,status,created_at)
    VALUES('admin',NULL,?,?,?,?, 'Sent',?)`).run(cleanString(b.recipientType,40),Number(b.recipientId),cleanString(b.subject,240),cleanString(b.body,6000),now());
  audit(req,"admin",null,"communication.sent","communication",result.lastInsertRowid,{recipientType:b.recipientType,recipientId:b.recipientId});
  if(b.recipientType==="student"){const acct=db.prepare("SELECT id FROM auth_accounts WHERE role='student' AND linked_student_id=? AND status='Active'").get(Number(b.recipientId));if(acct)createNotification(acct.id,"messages",cleanString(b.subject,240),cleanString(b.body,6000),"communication",result.lastInsertRowid,"Normal");}
  if(b.recipientType==="parent"){createNotification(Number(b.recipientId),"messages",cleanString(b.subject,240),cleanString(b.body,6000),"communication",result.lastInsertRowid,"Normal");}
  res.status(201).json({ok:true,id:result.lastInsertRowid});
});

app.get("/api/v1/portal/messages",portalAuth,(req,res)=>{
  const rows=db.prepare(`SELECT * FROM communications WHERE recipient_type='student' AND recipient_id=? ORDER BY created_at DESC`).all(req.portalUser.studentId);
  res.json({ok:true,messages:rows});
});


// -----------------------
// Phase 62 persistent authentication & RBAC
// -----------------------

app.post("/api/v1/auth/login",(req,res)=>{
  const email=normaliseEmail(req.body?.email);
  const password=String(req.body?.password||"");
  if(!email||!password)return jsonError(res,400,"Email and password are required");

  const a=db.prepare("SELECT * FROM auth_accounts WHERE email=?").get(email);
  if(!a)return jsonError(res,401,"Invalid email or password");
  if(a.status!=="Active")return jsonError(res,403,"Account is not active");

  if(a.locked_until && new Date(a.locked_until).getTime()>Date.now())
    return jsonError(res,423,"Account temporarily locked");

  if(!verifyPassword(password,a.password_hash)){
    const attempts=(a.failed_attempts||0)+1;
    let lockedUntil=null;
    if(attempts>=MAX_LOGIN_FAILURES) lockedUntil=minutesFromNow(LOCK_MINUTES);
    db.prepare("UPDATE auth_accounts SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?")
      .run(attempts,lockedUntil,now(),a.id);
    audit(req,"account",a.id,"auth.login_failed","account",a.id,{attempts});
    return jsonError(res,401,"Invalid email or password");
  }

  db.prepare("UPDATE auth_accounts SET failed_attempts=0,locked_until=NULL,last_login_at=?,updated_at=? WHERE id=?")
    .run(now(),now(),a.id);

  const token=createPersistentSession(req,a);
  res.cookie(SESSION_COOKIE_NAME,token,sessionCookieOptions());
  const csrfToken=issueCsrf(res);
  audit(req,"account",a.id,"auth.login_success","account",a.id,{role:a.role});
  res.json({ok:true,csrfToken,expiresInHours:AUTH_SESSION_HOURS,account:accountPublic({...a,last_login_at:now()})});
});

app.post("/api/v1/auth/logout",persistentAuth,(req,res)=>{
  db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE id=?").run(now(),req.auth.sessionId);
  clearAuthCookies(res);
  audit(req,"account",req.auth.accountId,"auth.logout","session",req.auth.sessionId,{});
  res.json({ok:true});
});

app.get("/api/v1/auth/me",persistentAuth,(req,res)=>{
  const a=db.prepare("SELECT * FROM auth_accounts WHERE id=?").get(req.auth.accountId);
  res.json({ok:true,account:accountPublic(a)});
});

app.get("/api/v1/auth/csrf",persistentAuth,(req,res)=>{
  const csrfToken=issueCsrf(res);
  res.json({ok:true,csrfToken});
});

app.post("/api/v1/auth/change-password",persistentAuth,(req,res)=>{
  const current=String(req.body?.currentPassword||"");
  const next=String(req.body?.newPassword||"");
  if(next.length<10)return jsonError(res,400,"New password must be at least 10 characters");
  const a=db.prepare("SELECT * FROM auth_accounts WHERE id=?").get(req.auth.accountId);
  if(!verifyPassword(current,a.password_hash))return jsonError(res,401,"Current password is incorrect");
  db.prepare("UPDATE auth_accounts SET password_hash=?,password_changed_at=?,updated_at=? WHERE id=?")
    .run(hashPassword(next),now(),now(),a.id);
  db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE account_id=? AND id<>? AND revoked_at IS NULL")
    .run(now(),a.id,req.auth.sessionId);
  audit(req,"account",a.id,"auth.password_changed","account",a.id,{});
  res.json({ok:true});
});

app.post("/api/v1/admin/accounts",requireAdminAccount,(req,res)=>{
  const b=req.body||{};
  const email=normaliseEmail(b.email);
  const password=String(b.password||"");
  const roles=["admin","teacher","parent","student"];
  if(!validEmail(email))return jsonError(res,400,"Valid email is required");
  if(!roles.includes(b.role))return jsonError(res,400,"Invalid role");
  if(password.length<10)return jsonError(res,400,"Password must be at least 10 characters");
  if(db.prepare("SELECT id FROM auth_accounts WHERE email=?").get(email))return jsonError(res,409,"Email already has an account");

  if(b.role==="student" && !b.linkedStudentId)return jsonError(res,400,"Student account requires linkedStudentId");
  if(b.role==="teacher" && !b.linkedTeacherId)return jsonError(res,400,"Teacher account requires linkedTeacherId");

  const ref=`RF-ACT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const stamp=now();
  const result=db.prepare(`INSERT INTO auth_accounts(account_ref,email,password_hash,role,linked_student_id,linked_teacher_id,status,failed_attempts,locked_until,last_login_at,password_changed_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?, 'Active',0,NULL,NULL,?,?,?)`)
    .run(ref,email,hashPassword(password),b.role,b.linkedStudentId||null,b.linkedTeacherId||null,stamp,stamp,stamp);
  audit(req,"account",req.auth.accountId,"account.created","account",result.lastInsertRowid,{role:b.role,email});
  res.status(201).json({ok:true,account:{id:result.lastInsertRowid,accountRef:ref,email,role:b.role}});
});

app.get("/api/v1/admin/accounts",requireAdminAccount,(req,res)=>{
  const rows=db.prepare(`SELECT id,account_ref,email,role,linked_student_id,linked_teacher_id,status,failed_attempts,locked_until,last_login_at,created_at
    FROM auth_accounts ORDER BY id DESC`).all();
  res.json({ok:true,accounts:rows});
});

app.patch("/api/v1/admin/accounts/:id",requireAdminAccount,(req,res)=>{
  const b=req.body||{};
  const a=db.prepare("SELECT * FROM auth_accounts WHERE id=?").get(req.params.id);
  if(!a)return jsonError(res,404,"Account not found");
  const statuses=["Active","Disabled"];
  const status=b.status||a.status;
  if(!statuses.includes(status))return jsonError(res,400,"Invalid account status");
  db.prepare("UPDATE auth_accounts SET status=?,updated_at=? WHERE id=?").run(status,now(),a.id);
  if(status==="Disabled") db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL").run(now(),a.id);
  audit(req,"account",req.auth.accountId,"account.status_changed","account",a.id,{status});
  res.json({ok:true,status});
});

app.post("/api/v1/admin/accounts/:id/reset-password",requireAdminAccount,(req,res)=>{
  const password=String(req.body?.newPassword||"");
  if(password.length<10)return jsonError(res,400,"Password must be at least 10 characters");
  const a=db.prepare("SELECT * FROM auth_accounts WHERE id=?").get(req.params.id);
  if(!a)return jsonError(res,404,"Account not found");
  db.prepare("UPDATE auth_accounts SET password_hash=?,password_changed_at=?,failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?")
    .run(hashPassword(password),now(),now(),a.id);
  db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL").run(now(),a.id);
  audit(req,"account",req.auth.accountId,"account.password_reset","account",a.id,{});
  res.json({ok:true});
});

app.get("/api/v1/admin/auth-sessions",requireAdminAccount,(req,res)=>{
  const rows=db.prepare(`SELECT s.id,s.account_id,a.email,a.role,s.ip_address,s.user_agent,s.expires_at,s.revoked_at,s.created_at,s.last_seen_at
    FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id ORDER BY s.id DESC LIMIT 500`).all();
  res.json({ok:true,sessions:rows});
});

app.post("/api/v1/admin/auth-sessions/:id/revoke",requireAdminAccount,(req,res)=>{
  const s=db.prepare("SELECT id FROM auth_sessions WHERE id=?").get(req.params.id);
  if(!s)return jsonError(res,404,"Session not found");
  db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE id=?").run(now(),s.id);
  audit(req,"account",req.auth.accountId,"session.revoked","session",s.id,{});
  res.json({ok:true});
});


// Secure RBAC aliases for main administrative operations
app.get("/api/v1/rbac/admin/summary",requireAdminAccount,(req,res)=>{
  const one=q=>db.prepare(q).get().c;
  res.json({ok:true,summary:{
    applications:one("SELECT COUNT(*) c FROM applications"),
    students:one("SELECT COUNT(*) c FROM students"),
    teachers:one("SELECT COUNT(*) c FROM teachers"),
    accounts:one("SELECT COUNT(*) c FROM auth_accounts"),
    activeSessions:one("SELECT COUNT(*) c FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > datetime('now')")
  }});
});

app.get("/api/v1/rbac/teacher/dashboard",requireTeacherAccount,(req,res)=>{
  if(req.auth.role==="admin") return res.json({ok:true,role:"admin",message:"Admin has global access"});
  const teacher=db.prepare("SELECT id,teacher_ref,first_name,last_name,email,campus,pathway,subjects_json,status FROM teachers WHERE id=?").get(req.auth.teacherId);
  if(!teacher)return jsonError(res,404,"Linked teacher profile not found");
  const assignments=db.prepare(`SELECT ta.id,ta.subject,s.id student_id,s.student_ref,s.first_name,s.last_name,s.grade,s.pathway,s.campus
    FROM teacher_assignments ta JOIN students s ON s.id=ta.student_id WHERE ta.teacher_id=? ORDER BY s.last_name,s.first_name`).all(teacher.id);
  res.json({ok:true,teacher:{...teacher,subjects:JSON.parse(teacher.subjects_json||"[]")},assignments});
});

app.get("/api/v1/rbac/student/me",requireStudentAccount,(req,res)=>{
  const student=db.prepare("SELECT id,student_ref,first_name,last_name,grade,pathway,campus,status,parent_email FROM students WHERE id=?").get(req.auth.studentId);
  if(!student)return jsonError(res,404,"Linked student profile not found");
  const records=db.prepare("SELECT * FROM academic_records WHERE student_id=? ORDER BY created_at DESC").all(student.id);
  const attendance=db.prepare("SELECT * FROM attendance WHERE student_id=? ORDER BY attendance_date DESC").all(student.id);
  res.json({ok:true,student,records,attendance});
});


// -----------------------
// Phase 63 Parent Portal 3.0
// -----------------------

app.post("/api/v1/admin/parent-links",requireAdminAccount,(req,res)=>{
  const b=req.body||{};
  const parentAccountId=Number(b.parentAccountId);
  const studentId=Number(b.studentId);
  const relationship=cleanString(b.relationship||"Parent/Guardian",80);
  if(!parentAccountId||!studentId)return jsonError(res,400,"parentAccountId and studentId are required");
  const parent=db.prepare("SELECT id,role,status FROM auth_accounts WHERE id=?").get(parentAccountId);
  if(!parent || parent.role!=="parent")return jsonError(res,404,"Parent account not found");
  const student=db.prepare("SELECT id FROM students WHERE id=?").get(studentId);
  if(!student)return jsonError(res,404,"Student not found");
  try{
    db.prepare("INSERT INTO parent_students(parent_id,student_id,relationship) VALUES(?,?,?)")
      .run(parentAccountId,studentId,relationship);
  }catch(e){
    return jsonError(res,409,"Parent is already linked to this student");
  }
  audit(req,"account",req.auth.accountId,"parent_student.linked","student",studentId,{parentAccountId,relationship});
  res.status(201).json({ok:true,parentAccountId,studentId,relationship});
});

app.delete("/api/v1/admin/parent-links",requireAdminAccount,(req,res)=>{
  const parentAccountId=Number(req.body?.parentAccountId);
  const studentId=Number(req.body?.studentId);
  if(!parentAccountId||!studentId)return jsonError(res,400,"parentAccountId and studentId are required");
  const result=db.prepare("DELETE FROM parent_students WHERE parent_id=? AND student_id=?").run(parentAccountId,studentId);
  if(!result.changes)return jsonError(res,404,"Parent/student link not found");
  audit(req,"account",req.auth.accountId,"parent_student.unlinked","student",studentId,{parentAccountId});
  res.json({ok:true});
});

app.get("/api/v1/parent/children",requireParentAccount,(req,res)=>{
  const rows=db.prepare(`SELECT s.id,s.student_ref,s.first_name,s.last_name,s.grade,s.pathway,s.campus,s.status,ps.relationship
    FROM parent_students ps JOIN students s ON s.id=ps.student_id
    WHERE ps.parent_id=? ORDER BY s.last_name,s.first_name`).all(req.auth.accountId);
  res.json({ok:true,children:rows});
});

function parentCanAccess(accountId,studentId){
  return !!db.prepare("SELECT 1 ok FROM parent_students WHERE parent_id=? AND student_id=?").get(accountId,studentId);
}

app.get("/api/v1/parent/children/:studentId/overview",requireParentAccount,(req,res)=>{
  const sid=Number(req.params.studentId);
  if(!parentCanAccess(req.auth.accountId,sid))return jsonError(res,403,"You are not linked to this learner");
  const student=db.prepare("SELECT id,student_ref,first_name,last_name,grade,pathway,campus,status,parent_email FROM students WHERE id=?").get(sid);
  const records=db.prepare("SELECT subject,assessment,score,max_score,term,academic_year,comment,created_at FROM academic_records WHERE student_id=? ORDER BY created_at DESC LIMIT 30").all(sid);
  const attendance=db.prepare("SELECT attendance_date,status,note FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 60").all(sid);
  const invoices=db.prepare("SELECT * FROM finance_invoices WHERE student_id=? ORDER BY created_at DESC").all(sid).map(i=>({
    ...i,payments:db.prepare("SELECT * FROM finance_payments WHERE invoice_id=? ORDER BY paid_at DESC").all(i.id)
  }));
  const reports=db.prepare("SELECT report_ref,term,academic_year,report_status,generated_at FROM generated_reports WHERE student_id=? ORDER BY generated_at DESC").all(sid);
  const comments=db.prepare(`SELECT rc.term,rc.academic_year,rc.comment,rc.created_at,t.first_name teacher_first,t.last_name teacher_last
    FROM report_comments rc LEFT JOIN teachers t ON t.id=rc.teacher_id WHERE rc.student_id=? ORDER BY rc.created_at DESC LIMIT 20`).all(sid);
  const valid=records.filter(x=>x.score!==null&&x.max_score&&Number(x.max_score)>0).map(x=>Number(x.score)/Number(x.max_score)*100);
  const overall=valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length*100)/100:null;
  const totalAtt=attendance.length;
  const attended=attendance.filter(x=>x.status==="Present"||x.status==="Late").length;
  const attendancePercentage=totalAtt?Math.round(attended/totalAtt*10000)/100:null;
  res.json({ok:true,student,overall,attendancePercentage,records,attendance,invoices,reports,comments});
});

app.get("/api/v1/parent/children/:studentId/report",requireParentAccount,(req,res)=>{
  const sid=Number(req.params.studentId);
  if(!parentCanAccess(req.auth.accountId,sid))return jsonError(res,403,"You are not linked to this learner");
  const term=cleanString(req.query.term||"Term 1",40);
  const year=cleanString(req.query.year||String(new Date().getFullYear()),20);
  const d=reportData(sid,term,year);
  if(!d)return jsonError(res,404,"Student not found");
  res.json({ok:true,report:d});
});

app.get("/api/v1/parent/children/:studentId/documents",requireParentAccount,(req,res)=>{
  const sid=Number(req.params.studentId);
  if(!parentCanAccess(req.auth.accountId,sid))return jsonError(res,403,"You are not linked to this learner");
  const student=db.prepare("SELECT parent_email,first_name,last_name FROM students WHERE id=?").get(sid);
  const applications=db.prepare(`SELECT id,application_ref,status,pathway,campus,created_at FROM applications
    WHERE parent_email=? AND applicant_first_name=? AND applicant_last_name=? ORDER BY created_at DESC`).all(student.parent_email,student.first_name,student.last_name);
  const output=applications.map(a=>({
    ...a,
    documents:db.prepare(`SELECT id,document_type,file_name,mime_type,file_size,status,admin_note,uploaded_at,reviewed_at
      FROM application_documents WHERE application_id=? ORDER BY uploaded_at DESC`).all(a.id)
  }));
  res.json({ok:true,applications:output});
});

app.get("/api/v1/parent/children/:studentId/admissions",requireParentAccount,(req,res)=>{
  const sid=Number(req.params.studentId);
  if(!parentCanAccess(req.auth.accountId,sid))return jsonError(res,403,"You are not linked to this learner");
  const student=db.prepare("SELECT parent_email,first_name,last_name FROM students WHERE id=?").get(sid);
  const rows=db.prepare(`SELECT application_ref,pathway,campus,grade_applying,status,preferred_start_date,created_at,updated_at
    FROM applications WHERE parent_email=? AND applicant_first_name=? AND applicant_last_name=? ORDER BY created_at DESC`)
    .all(student.parent_email,student.first_name,student.last_name);
  res.json({ok:true,applications:rows});
});

app.get("/api/v1/parent/messages",requireParentAccount,(req,res)=>{
  const messages=db.prepare(`SELECT * FROM communications WHERE recipient_type='parent' AND recipient_id=? ORDER BY created_at DESC`).all(req.auth.accountId);
  res.json({ok:true,messages});
});

app.post("/api/v1/parent/messages",requireParentAccount,(req,res)=>{
  const b=req.body||{};
  const subject=cleanString(b.subject,240),body=cleanString(b.body,6000);
  if(!subject||!body)return jsonError(res,400,"Subject and message are required");
  const result=db.prepare(`INSERT INTO communications(sender_type,sender_id,recipient_type,recipient_id,subject,body,status,created_at)
    VALUES('parent',?,'admin',NULL,?,?, 'Sent',?)`).run(req.auth.accountId,subject,body,now());
  audit(req,"account",req.auth.accountId,"parent.communication_sent","communication",result.lastInsertRowid,{});
  res.status(201).json({ok:true,id:result.lastInsertRowid});
});


// -----------------------
// Phase 64 Notifications & Communication Automation 3.0
// -----------------------

app.get("/api/v1/notifications",persistentAuth,(req,res)=>{
  const unreadOnly=String(req.query.unreadOnly||"false")==="true";
  let sql=`SELECT id,category,title,body,entity_type,entity_id,priority,read_at,created_at
    FROM notifications_v3 WHERE recipient_account_id=?`;
  if(unreadOnly)sql+=" AND read_at IS NULL";
  sql+=" ORDER BY id DESC LIMIT 300";
  const rows=db.prepare(sql).all(req.auth.accountId);
  res.json({ok:true,notifications:rows});
});

app.get("/api/v1/notifications/count",persistentAuth,(req,res)=>{
  const unread=db.prepare("SELECT COUNT(*) c FROM notifications_v3 WHERE recipient_account_id=? AND read_at IS NULL").get(req.auth.accountId).c;
  res.json({ok:true,unread});
});

app.patch("/api/v1/notifications/:id/read",persistentAuth,(req,res)=>{
  const n=db.prepare("SELECT id FROM notifications_v3 WHERE id=? AND recipient_account_id=?").get(req.params.id,req.auth.accountId);
  if(!n)return jsonError(res,404,"Notification not found");
  db.prepare("UPDATE notifications_v3 SET read_at=? WHERE id=?").run(now(),n.id);
  res.json({ok:true});
});

app.post("/api/v1/notifications/read-all",persistentAuth,(req,res)=>{
  db.prepare("UPDATE notifications_v3 SET read_at=? WHERE recipient_account_id=? AND read_at IS NULL").run(now(),req.auth.accountId);
  res.json({ok:true});
});

app.get("/api/v1/notifications/preferences",persistentAuth,(req,res)=>{
  ensureNotificationPrefs(req.auth.accountId);
  res.json({ok:true,preferences:db.prepare("SELECT * FROM notification_preferences_v3 WHERE account_id=?").get(req.auth.accountId)});
});

app.patch("/api/v1/notifications/preferences",persistentAuth,(req,res)=>{
  ensureNotificationPrefs(req.auth.accountId);
  const b=req.body||{};
  const current=db.prepare("SELECT * FROM notification_preferences_v3 WHERE account_id=?").get(req.auth.accountId);
  const vals={};
  NOTIFICATION_CATEGORIES.forEach(k=>vals[k]=b[k]===undefined?current[k]:(b[k]?1:0));
  db.prepare(`UPDATE notification_preferences_v3 SET academics=?,attendance=?,finance=?,admissions=?,documents=?,reports=?,announcements=?,messages=? WHERE account_id=?`)
    .run(vals.academics,vals.attendance,vals.finance,vals.admissions,vals.documents,vals.reports,vals.announcements,vals.messages,req.auth.accountId);
  res.json({ok:true});
});

app.post("/api/v1/admin/announcements",requireAdminAccount,(req,res)=>{
  const b=req.body||{};
  const title=cleanString(b.title,240),body=cleanString(b.body,6000);
  if(!title||!body)return jsonError(res,400,"Title and body are required");
  const audience=cleanString(b.audience||"all",40);
  const allowed=["all","admin","teacher","parent","student"];
  if(!allowed.includes(audience))return jsonError(res,400,"Invalid audience");
  const result=db.prepare(`INSERT INTO announcements_v3(title,body,audience,pathway,campus,priority,author_account_id,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(title,body,audience,cleanString(b.pathway,80)||null,cleanString(b.campus,180)||null,cleanString(b.priority||"Normal",20),req.auth.accountId,now());
  let sql="SELECT id,role,linked_student_id,linked_teacher_id FROM auth_accounts WHERE status='Active'",params=[];
  if(audience!=="all"){sql+=" AND role=?";params.push(audience)}
  const accounts=db.prepare(sql).all(...params);
  let count=0;
  accounts.forEach(a=>{
    let ok=true;
    if(b.pathway){
      if(a.role==="student"){
        const s=db.prepare("SELECT pathway FROM students WHERE id=?").get(a.linked_student_id); ok=!!s&&s.pathway===b.pathway;
      }else if(a.role==="teacher"){
        const tr=db.prepare("SELECT pathway FROM teachers WHERE id=?").get(a.linked_teacher_id); ok=!!tr&&tr.pathway===b.pathway;
      }else if(a.role==="parent"){
        ok=!!db.prepare(`SELECT 1 FROM parent_students ps JOIN students s ON s.id=ps.student_id WHERE ps.parent_id=? AND s.pathway=? LIMIT 1`).get(a.id,b.pathway);
      }
    }
    if(ok && createNotification(a.id,"announcements",title,body,"announcement",result.lastInsertRowid,b.priority||"Normal"))count++;
  });
  audit(req,"account",req.auth.accountId,"announcement.published","announcement",result.lastInsertRowid,{audience,count});
  res.status(201).json({ok:true,id:result.lastInsertRowid,notificationsCreated:count});
});

app.get("/api/v1/admin/announcements",requireAdminAccount,(req,res)=>{
  res.json({ok:true,announcements:db.prepare("SELECT * FROM announcements_v3 ORDER BY id DESC LIMIT 200").all()});
});

app.post("/api/v1/admin/notifications/test",requireAdminAccount,(req,res)=>{
  const b=req.body||{};
  if(!b.accountId||!b.title||!b.body)return jsonError(res,400,"accountId, title and body are required");
  const a=db.prepare("SELECT id FROM auth_accounts WHERE id=?").get(Number(b.accountId));
  if(!a)return jsonError(res,404,"Account not found");
  const id=createNotification(a.id,NOTIFICATION_CATEGORIES.includes(b.category)?b.category:"messages",cleanString(b.title,240),cleanString(b.body,6000),"test",null,b.priority||"Normal");
  res.status(201).json({ok:true,id});
});


// -----------------------
// Phase 65 Email Delivery & Job Queue
// -----------------------

app.get("/api/v1/admin/email-jobs",requireAdminAccount,(req,res)=>{
  const status=cleanString(req.query.status,40);
  const limit=Math.max(1,Math.min(500,Number(req.query.limit||100)));
  let sql="SELECT * FROM email_jobs",params=[];
  if(status){sql+=" WHERE status=?";params.push(status)}
  sql+=" ORDER BY id DESC LIMIT ?";params.push(limit);
  res.json({ok:true,jobs:db.prepare(sql).all(...params)});
});

app.get("/api/v1/admin/email-jobs/:id",requireAdminAccount,(req,res)=>{
  const job=db.prepare("SELECT * FROM email_jobs WHERE id=?").get(req.params.id);
  if(!job)return jsonError(res,404,"Email job not found");
  const log=db.prepare("SELECT * FROM email_delivery_log WHERE email_job_id=? ORDER BY id DESC").all(job.id);
  res.json({ok:true,job,deliveryLog:log});
});

app.post("/api/v1/admin/email-jobs",requireAdminAccount,(req,res)=>{
  const b=req.body||{};
  if(!validEmail(b.to)||!cleanString(b.subject)||!cleanString(b.text))
    return jsonError(res,400,"Valid recipient email, subject and text body are required");
  const job=queueEmail({
    to:normaliseEmail(b.to),name:cleanString(b.name,180),subject:b.subject,text:b.text,html:b.html||"",
    category:b.category||"general",sourceEntityType:"manual",sourceEntityId:req.auth.accountId
  });
  audit(req,"account",req.auth.accountId,"email.queued","email_job",job.id,{jobRef:job.jobRef,to:normaliseEmail(b.to)});
  res.status(201).json({ok:true,job});
});

app.post("/api/v1/admin/email-jobs/:id/retry",requireAdminAccount,(req,res)=>{
  const job=db.prepare("SELECT * FROM email_jobs WHERE id=?").get(req.params.id);
  if(!job)return jsonError(res,404,"Email job not found");
  db.prepare("UPDATE email_jobs SET status='Queued',next_attempt_at=?,last_error=NULL,updated_at=? WHERE id=?")
    .run(now(),now(),job.id);
  audit(req,"account",req.auth.accountId,"email.retry_requested","email_job",job.id,{});
  res.json({ok:true});
});

app.post("/api/v1/admin/email-jobs/:id/cancel",requireAdminAccount,(req,res)=>{
  const job=db.prepare("SELECT * FROM email_jobs WHERE id=?").get(req.params.id);
  if(!job)return jsonError(res,404,"Email job not found");
  if(job.status==="Sent")return jsonError(res,400,"Sent email cannot be cancelled");
  db.prepare("UPDATE email_jobs SET status='Cancelled',updated_at=? WHERE id=?").run(now(),job.id);
  audit(req,"account",req.auth.accountId,"email.cancelled","email_job",job.id,{});
  res.json({ok:true});
});

app.get("/api/v1/admin/email-summary",requireAdminAccount,(req,res)=>{
  const rows=db.prepare("SELECT status,COUNT(*) count FROM email_jobs GROUP BY status").all();
  const summary={};
  rows.forEach(x=>summary[x.status]=x.count);
  res.json({ok:true,summary});
});


// -----------------------
// Phase 66 Scheduled Background Automation
// -----------------------

app.get("/api/v1/admin/automation/jobs",requireAdminAccount,(req,res)=>{
  res.json({ok:true,jobs:db.prepare("SELECT * FROM scheduled_jobs ORDER BY job_key").all()});
});

app.patch("/api/v1/admin/automation/jobs/:jobKey",requireAdminAccount,(req,res)=>{
  const job=db.prepare("SELECT * FROM scheduled_jobs WHERE job_key=?").get(req.params.jobKey);
  if(!job)return jsonError(res,404,"Automation job not found");
  const enabled=req.body?.enabled===undefined?job.enabled:(req.body.enabled?1:0);
  let mins=Number(req.body?.scheduleMinutes??job.schedule_minutes);
  if(!Number.isFinite(mins)||mins<60)mins=60;
  const next=new Date(Date.now()+mins*60*1000).toISOString();
  db.prepare("UPDATE scheduled_jobs SET enabled=?,schedule_minutes=?,next_run_at=?,updated_at=? WHERE job_key=?")
    .run(enabled,mins,next,now(),job.job_key);
  audit(req,"account",req.auth.accountId,"automation.job_updated","scheduled_job",job.job_key,{enabled,scheduleMinutes:mins});
  res.json({ok:true});
});

app.post("/api/v1/admin/automation/jobs/:jobKey/run",requireAdminAccount,(req,res)=>{
  const job=db.prepare("SELECT * FROM scheduled_jobs WHERE job_key=?").get(req.params.jobKey);
  if(!job)return jsonError(res,404,"Automation job not found");
  // mark due now; worker will execute it on its next poll
  db.prepare("UPDATE scheduled_jobs SET next_run_at=?,updated_at=? WHERE job_key=?").run(now(),now(),job.job_key);
  audit(req,"account",req.auth.accountId,"automation.run_requested","scheduled_job",job.job_key,{});
  res.json({ok:true,queued:true});
});

app.get("/api/v1/admin/automation/events",requireAdminAccount,(req,res)=>{
  const limit=Math.max(1,Math.min(500,Number(req.query.limit||200)));
  const rows=db.prepare("SELECT * FROM automation_events ORDER BY id DESC LIMIT ?").all(limit);
  res.json({ok:true,events:rows});
});


// -----------------------
// Phase 67 Operational Monitoring, Backup & Recovery
// -----------------------

app.get("/api/v1/admin/ops/health",requireAdminAccount,(req,res)=>{
  const dbOk=(()=>{try{db.prepare("SELECT 1 ok").get();return true}catch(e){return false}})();
  const heartbeats=db.prepare("SELECT * FROM worker_heartbeats ORDER BY worker_name").all().map(x=>{
    const ageSeconds=Math.floor((Date.now()-new Date(x.last_seen_at).getTime())/1000);
    return {...x,ageSeconds,healthy:ageSeconds<180};
  });
  const emailSummary={};
  db.prepare("SELECT status,COUNT(*) count FROM email_jobs GROUP BY status").all().forEach(x=>emailSummary[x.status]=x.count);
  const automationSummary={};
  db.prepare("SELECT last_status,COUNT(*) count FROM scheduled_jobs GROUP BY last_status").all().forEach(x=>automationSummary[x.last_status||"NotRun"]=x.count);
  const backup=db.prepare("SELECT * FROM backup_log ORDER BY id DESC LIMIT 1").get()||null;
  res.json({ok:true,health:{
    api:true,database:dbOk,workers:heartbeats,emailQueue:emailSummary,automation:automationSummary,lastBackup:backup,time:now()
  }});
});

app.get("/api/v1/admin/ops/events",requireAdminAccount,(req,res)=>{
  const limit=Math.max(1,Math.min(500,Number(req.query.limit||200)));
  const rows=db.prepare("SELECT * FROM system_events ORDER BY id DESC LIMIT ?").all(limit);
  res.json({ok:true,events:rows});
});

app.get("/api/v1/admin/ops/backups",requireAdminAccount,(req,res)=>{
  const rows=db.prepare("SELECT * FROM backup_log ORDER BY id DESC LIMIT 200").all();
  res.json({ok:true,backups:rows});
});

app.post("/api/v1/admin/ops/backup-request",requireAdminAccount,(req,res)=>{
  const ref=`RF-BKP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  systemEvent("Info","backup","Backup requested by administrator",{accountId:req.auth.accountId,backupRef:ref});
  audit(req,"account",req.auth.accountId,"backup.requested","backup",ref,{});
  res.status(202).json({ok:true,backupRef:ref,message:"Run the backup script on the server to create the physical database backup."});
});

app.post("/api/v1/admin/ops/event",requireAdminAccount,(req,res)=>{
  const b=req.body||{};
  systemEvent(cleanString(b.severity||"Info",20),cleanString(b.component||"admin",80),cleanString(b.message||"",1000),b.details||{});
  res.status(201).json({ok:true});
});

workerHeartbeat("api","Running",{pid:process.pid});
setInterval(()=>workerHeartbeat("api","Running",{pid:process.pid}),60000);


app.get("/api/v1/admin/security/status",requireAdminAccount,(req,res)=>{
  res.json({ok:true,security:{
    environment:process.env.NODE_ENV||"development",
    trustProxy:!!app.get("trust proxy"),
    allowedOrigins:ALLOWED_ORIGINS,
    globalRateLimit:Number(process.env.RATE_LIMIT_GLOBAL||500),
    authRateLimit:Number(process.env.RATE_LIMIT_AUTH||20),
    helmet:true,
    csp:true,
    requestLogging:true,
    smtpConfigured:!!process.env.SMTP_HOST && !!process.env.SMTP_FROM,
    sessionHours:AUTH_SESSION_HOURS
  }});
});


// -----------------------
// Phase 81 Admissions Journey 2.0
// -----------------------

app.get("/api/v1/public/admissions/config",(req,res)=>{
  res.json({ok:true,pathways:ADMISSION_PATHWAYS});
});

app.post("/api/v1/public/admissions/start",(req,res)=>{
  const b=req.body||{};
  const cfg=ADMISSION_PATHWAYS[b.pathway];
  if(!cfg)return jsonError(res,400,"Invalid pathway");
  const missing=requireFields(b,["firstName","lastName","parentName","parentEmail","gradeApplying"]);
  if(missing.length)return jsonError(res,400,"Missing required fields",missing);
  if(!cfg.grades.includes(b.gradeApplying))return jsonError(res,400,"Invalid grade/level for selected pathway");
  if(!validEmail(b.parentEmail))return jsonError(res,400,"Invalid parent email");

  const ref=`RF-APP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const stamp=now();
  const result=db.prepare(`INSERT INTO applications(application_ref,applicant_first_name,applicant_last_name,date_of_birth,parent_name,parent_email,parent_phone,pathway,campus,grade_applying,current_school,preferred_start_date,status,notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ref,cleanString(b.firstName,120),cleanString(b.lastName,120),cleanString(b.dateOfBirth,40),
      cleanString(b.parentName,180),normaliseEmail(b.parentEmail),cleanString(b.parentPhone,60),
      b.pathway,cfg.campus,b.gradeApplying,cleanString(b.currentSchool,180),cleanString(b.preferredStartDate,40),
      "Submitted",cleanString(b.notes,4000),stamp,stamp);

  ensureApplicationChecklist(result.lastInsertRowid,b.pathway);
  audit(req,"public",null,"application.started","application",result.lastInsertRowid,{reference:ref,pathway:b.pathway});
  res.status(201).json({ok:true,application:{
    id:result.lastInsertRowid,reference:ref,pathway:b.pathway,campus:cfg.campus,gradeApplying:b.gradeApplying,status:"Submitted"
  }});
});

app.get("/api/v1/public/admissions/:ref",(req,res)=>{
  const a=db.prepare(`SELECT id,application_ref,applicant_first_name,applicant_last_name,parent_email,pathway,campus,grade_applying,status,preferred_start_date,created_at,updated_at
    FROM applications WHERE application_ref=?`).get(req.params.ref);
  if(!a)return jsonError(res,404,"Application not found");
  syncChecklistFromDocuments(a.id);
  const checklist=db.prepare("SELECT item_key,label,required,status,updated_at FROM application_checklist WHERE application_id=? ORDER BY id").all(a.id);
  const docs=db.prepare(`SELECT document_type,file_name,status,admin_note,uploaded_at,reviewed_at
    FROM application_documents WHERE application_id=? ORDER BY uploaded_at DESC`).all(a.id);
  res.json({ok:true,application:a,checklist,documents:docs});
});

app.get("/api/v1/admin/admissions/:id/review",requireAdminAccount,(req,res)=>{
  const a=db.prepare("SELECT * FROM applications WHERE id=?").get(req.params.id);
  if(!a)return jsonError(res,404,"Application not found");
  syncChecklistFromDocuments(a.id);
  const checklist=db.prepare("SELECT * FROM application_checklist WHERE application_id=? ORDER BY id").all(a.id);
  const docs=db.prepare("SELECT * FROM application_documents WHERE application_id=? ORDER BY uploaded_at DESC").all(a.id);
  const missing=checklist.filter(x=>x.required && x.status!=="Approved");
  res.json({ok:true,application:a,checklist,documents:docs,readyForDecision:missing.length===0,remainingItems:missing.length});
});

app.post("/api/v1/admin/admissions/:id/decision",requireAdminAccount,(req,res)=>{
  const a=db.prepare("SELECT * FROM applications WHERE id=?").get(req.params.id);
  if(!a)return jsonError(res,404,"Application not found");
  const decision=cleanString(req.body?.decision,40);
  if(!["Accepted","Waitlisted","Declined"].includes(decision))return jsonError(res,400,"Invalid decision");
  syncChecklistFromDocuments(a.id);
  const remaining=db.prepare("SELECT COUNT(*) c FROM application_checklist WHERE application_id=? AND required=1 AND status!='Approved'").get(a.id).c;
  if(decision==="Accepted" && remaining>0)return jsonError(res,400,"Application cannot be accepted until all required checklist items are approved");
  db.prepare("UPDATE applications SET status=?,notes=?,updated_at=? WHERE id=?")
    .run(decision,cleanString(req.body?.notes||a.notes,4000),now(),a.id);
  audit(req,"account",req.auth.accountId,"admission.decision","application",a.id,{decision});
  res.json({ok:true,status:decision});
});


// -----------------------
// Phase 82 Contact & Smart Enquiry System
// -----------------------

app.get("/api/v1/public/enquiries/config",(req,res)=>{
  res.json({ok:true,enquiryTypes:ENQUIRY_TYPES,pathways:["Cambridge","CAPS Secondary","Primary"]});
});

app.post("/api/v1/public/enquiries",(req,res)=>{
  const b=req.body||{};
  const missing=requireFields(b,["name","email","enquiryType","subject","message"]);
  if(missing.length)return jsonError(res,400,"Missing required fields",missing);
  if(!validEmail(b.email))return jsonError(res,400,"Invalid email");
  if(!ENQUIRY_TYPES.includes(b.enquiryType))return jsonError(res,400,"Invalid enquiry type");
  if(b.pathway && !["Cambridge","CAPS Secondary","Primary"].includes(b.pathway))
    return jsonError(res,400,"Invalid pathway");

  const ref=`RF-ENQ-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const campus=enquiryCampus(b.pathway);
  const stamp=now();

  const result=db.prepare(`INSERT INTO enquiries_v2(enquiry_ref,name,email,phone,enquiry_type,pathway,campus,subject,message,status,admin_note,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'New','',?,?)`)
    .run(ref,cleanString(b.name,180),normaliseEmail(b.email),cleanString(b.phone,60),b.enquiryType,
      cleanString(b.pathway,80),campus,cleanString(b.subject,240),cleanString(b.message,6000),stamp,stamp);

  const adminAccounts=db.prepare("SELECT id FROM auth_accounts WHERE role='admin' AND status='Active'").all();
  adminAccounts.forEach(a=>createNotification(a.id,"messages","New website enquiry",
    `${ref}: ${cleanString(b.subject,240)} from ${cleanString(b.name,180)}.`,
    "enquiry",result.lastInsertRowid,"Normal"));

  audit(req,"public",null,"enquiry.created","enquiry",result.lastInsertRowid,{reference:ref,type:b.enquiryType,pathway:b.pathway||null});
  res.status(201).json({ok:true,enquiry:{id:result.lastInsertRowid,reference:ref,status:"New"}});
});

app.get("/api/v1/admin/enquiries",requireAdminAccount,(req,res)=>{
  const status=cleanString(req.query.status,40),type=cleanString(req.query.type,80);
  let sql="SELECT * FROM enquiries_v2 WHERE 1=1",params=[];
  if(status){sql+=" AND status=?";params.push(status)}
  if(type){sql+=" AND enquiry_type=?";params.push(type)}
  sql+=" ORDER BY created_at DESC";
  res.json({ok:true,enquiries:db.prepare(sql).all(...params)});
});

app.patch("/api/v1/admin/enquiries/:id",requireAdminAccount,(req,res)=>{
  const e=db.prepare("SELECT * FROM enquiries_v2 WHERE id=?").get(req.params.id);
  if(!e)return jsonError(res,404,"Enquiry not found");
  const statuses=["New","In Progress","Replied","Closed"];
  const status=req.body?.status||e.status;
  if(!statuses.includes(status))return jsonError(res,400,"Invalid status");
  const note=req.body?.adminNote!==undefined?cleanString(req.body.adminNote,4000):e.admin_note;
  db.prepare("UPDATE enquiries_v2 SET status=?,admin_note=?,updated_at=? WHERE id=?").run(status,note,now(),e.id);
  audit(req,"account",req.auth.accountId,"enquiry.updated","enquiry",e.id,{status});
  res.json({ok:true,status});
});


app.get("/api/v1/admin/security/audit",requireAdminAccount,(req,res)=>{
  const demoAccounts=db.prepare(`SELECT id,email,role,status FROM auth_accounts
    WHERE email LIKE '%.demo@ridgefield.local' OR email LIKE '%@ridgefield.local' ORDER BY id`).all();
  const activeSessions=db.prepare(`SELECT COUNT(*) c FROM auth_sessions
    WHERE revoked_at IS NULL AND expires_at > ?`).get(now()).c;
  const failedEmailJobs=db.prepare("SELECT COUNT(*) c FROM email_jobs WHERE status='Failed'").get().c;
  res.json({ok:true,audit:{
    environment:process.env.NODE_ENV||"development",
    cookieSecure:COOKIE_SECURE,
    allowedOrigins:ALLOWED_ORIGINS,
    demoAccounts,
    activeSessions,
    failedEmailJobs
  }});
});

app.post("/api/send-application", (req, res) => {
  const b = req.body || {};
  const refNum = b.reference || b.ref || ('RF-APP-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + crypto.randomBytes(3).toString("hex").toUpperCase());
  const stamp = now();
  const pathway = b.pathway || 'Cambridge';
  const campus = (pathway === 'Cambridge' ? '25 Wilcock Road, Noordhoek' : '22 Maartens Street');

  let lFirst = b.learnerFirst || '';
  let lLast = b.learnerLast || '';
  if (!lFirst && b.learnerName) {
    const parts = b.learnerName.trim().split(/\s+/);
    lFirst = parts[0] || '';
    lLast = parts.slice(1).join(' ') || '';
  }
  let pFirst = b.parentFirst || '';
  let pLast = b.parentLast || '';
  if (!pFirst && b.parentName) {
    const parts = b.parentName.trim().split(/\s+/);
    pFirst = parts[0] || '';
    pLast = parts.slice(1).join(' ') || '';
  }

  const email = b.email || b.parentEmail || '';
  const phone = b.phone || b.parentPhone || '';
  const grade = b.learnerGrade || b.grade || b.gradeApplying || '';
  const dob = b.dob || b.dateOfBirth || '';
  const currentSchool = b.currentSchool || '';
  const notes = b.academicNotes || b.notes || b.adminSummary || '';
  const subjects = b.subjects ? (Array.isArray(b.subjects) ? b.subjects : [b.subjects]) : [];

  try {
    const stmt = db.prepare(`
      INSERT INTO applications (
        reference, application_ref, pathway, campus, learner_first, applicant_first_name,
        learner_last, applicant_last_name, dob, date_of_birth, learner_grade, grade_applying,
        current_school, parent_first, parent_last, parent_name, email, parent_email,
        phone, parent_phone, address, cambridge_level, subjects_json, academic_notes, notes,
        status, admin_notes, created_at, updated_at
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )
    `);
    stmt.run(
      refNum, refNum, pathway, campus, lFirst, lFirst,
      lLast, lLast, dob, dob, grade, grade,
      currentSchool, pFirst, pLast, (pFirst + ' ' + pLast).trim(), email, email,
      phone, phone, b.address || '', b.cambridgeLevel || '', JSON.stringify(subjects), notes, notes,
      'Pending', '', stamp, stamp
    );
  } catch (err) {
    console.error("Failed to insert application:", err.message);
  }

  res.status(201).json({ ok: true, reference: refNum, status: "Submitted", message: "Application submitted successfully." });
});

app.post("/api/send-enquiry", (req, res) => {
  const b = req.body || {};
  const refNum = b.reference || b.ref || ('RF-ENQ-' + new Date().getFullYear() + '-' + crypto.randomBytes(4).toString("hex").toUpperCase());
  const stamp = now();
  const pathway = b.pathway || 'General';
  const campus = (pathway === 'Cambridge' ? '25 Wilcock Road, Noordhoek' : '22 Maartens Street');
  const enqType = b.enquiryType || b.topic || 'General Enquiry';
  const subject = b.subject || ('Enquiry from ' + (b.name || 'Visitor'));
  const message = b.message || '';
  const name = b.name || '';
  const email = b.email || '';
  const phone = b.phone || '';

  try {
    db.prepare(`
      INSERT INTO enquiries_v2 (
        enquiry_ref, name, email, phone, enquiry_type, pathway, campus, subject, message, status, admin_note, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,'New','',?,?)
    `).run(refNum, name, email, phone, enqType, pathway, campus, subject, message, stamp, stamp);
  } catch (err) {
    console.error("Failed to insert enquiry:", err.message);
  }

  res.status(201).json({ ok: true, reference: refNum, status: "New", message: "Enquiry submitted successfully." });
});

app.listen(PORT,()=>console.log(`Ridgefield admissions API running on http://localhost:${PORT}`));
