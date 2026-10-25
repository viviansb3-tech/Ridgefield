#!/usr/bin/env node
const path=require("path");
try { require(path.join(__dirname,"..","server","node_modules","dotenv")).config({path:process.env.ENV_FILE||undefined}); } catch(e){}
const crypto=require("crypto");
const Database = typeof Bun !== "undefined" ? require("bun:sqlite").Database : require("better-sqlite3");

const db = new Database(path.join(__dirname,"..","server","data","ridgefield.db"));
if (typeof db.pragma === "function") db.pragma("journal_mode = WAL"); else db.exec("PRAGMA journal_mode = WAL;");

function now(){return new Date().toISOString()}
function hashPassword(password){
  const salt=crypto.randomBytes(16).toString("hex");
  const hash=crypto.scryptSync(password,salt,64).toString("hex");
  return `${salt}:${hash}`;
}
function ensureAccount(email,password,role,studentId=null,teacherId=null){
  let a=db.prepare("SELECT * FROM auth_accounts WHERE email=?").get(email);
  if(a)return a;
  const ref=`RF-ACT-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const stamp=now();
  const info=db.prepare(`INSERT INTO auth_accounts(account_ref,email,password_hash,role,linked_student_id,linked_teacher_id,status,failed_attempts,locked_until,last_login_at,password_changed_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?, 'Active',0,NULL,NULL,?,?,?)`)
    .run(ref,email,hashPassword(password),role,studentId,teacherId,stamp,stamp,stamp);
  return db.prepare("SELECT * FROM auth_accounts WHERE id=?").get(info.lastInsertRowid);
}
function ensureStudent(ref,first,last,grade,pathway,campus,parentEmail){
  let s=db.prepare("SELECT * FROM students WHERE student_ref=?").get(ref);
  if(s)return s;
  const info=db.prepare(`INSERT INTO students(student_ref,first_name,last_name,grade,pathway,campus,parent_email,status,created_at)
    VALUES(?,?,?,?,?,?,?,'Active',?)`).run(ref,first,last,grade,pathway,campus,parentEmail,now());
  return db.prepare("SELECT * FROM students WHERE id=?").get(info.lastInsertRowid);
}
function ensureTeacher(ref,first,last,email,password,pathway,campus,subjects){
  let t=db.prepare("SELECT * FROM teachers WHERE teacher_ref=?").get(ref);
  if(t)return t;
  const info=db.prepare(`INSERT INTO teachers(teacher_ref,first_name,last_name,email,password_hash,campus,pathway,subjects_json,status,created_at)
    VALUES(?,?,?,?,?,?,?,?, 'Active',?)`).run(ref,first,last,email,hashPassword(password),campus,pathway,JSON.stringify(subjects),now());
  return db.prepare("SELECT * FROM teachers WHERE id=?").get(info.lastInsertRowid);
}

const PASSWORD="DemoPass123!";

const student=ensureStudent(
  "RF-STU-DEMO-001","Amahle","Mokoena","Grade 10","Cambridge",
  "25 Wilcock Road, Noordhoek","parent.demo@ridgefield.local"
);

const teacher=ensureTeacher(
  "RF-TCH-DEMO-001","Daniel","Khumalo","teacher.demo@ridgefield.local",PASSWORD,
  "Cambridge","25 Wilcock Road, Noordhoek",["Mathematics","Physics"]
);

const admin=ensureAccount("admin.demo@ridgefield.local",PASSWORD,"admin");
const teacherAccount=ensureAccount("teacher.demo@ridgefield.local",PASSWORD,"teacher",null,teacher.id);
const parentAccount=ensureAccount("parent.demo@ridgefield.local",PASSWORD,"parent");
const studentAccount=ensureAccount("student.demo@ridgefield.local",PASSWORD,"student",student.id,null);

db.prepare("INSERT OR IGNORE INTO parent_students(parent_id,student_id,relationship) VALUES(?,?,?)")
  .run(parentAccount.id,student.id,"Parent/Guardian");

for(const subject of ["Mathematics","Physics"]){
  db.prepare("INSERT OR IGNORE INTO teacher_assignments(teacher_id,student_id,subject,created_at) VALUES(?,?,?,?)")
    .run(teacher.id,student.id,subject,now());
}

const recCount=db.prepare("SELECT COUNT(*) c FROM academic_records WHERE student_id=?").get(student.id).c;
if(recCount===0){
  const ins=db.prepare(`INSERT INTO academic_records(student_id,subject,assessment,score,max_score,term,academic_year,comment,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  [
    ["Mathematics","Test 1",72,100,"Term 1","2026","Solid start."],
    ["Mathematics","Test 2",81,100,"Term 1","2026","Good improvement."],
    ["Physics","Practical 1",78,100,"Term 1","2026","Good laboratory work."],
    ["Physics","Test 1",74,100,"Term 1","2026","Revise vectors."]
  ].forEach(r=>ins.run(student.id,...r,now()));
}

const attCount=db.prepare("SELECT COUNT(*) c FROM attendance WHERE student_id=?").get(student.id).c;
if(attCount===0){
  const ins=db.prepare("INSERT INTO attendance(student_id,attendance_date,status,note,created_at) VALUES(?,?,?,?,?)");
  [
    ["2026-08-10","Present",""],
    ["2026-08-11","Present",""],
    ["2026-08-12","Late","Transport delay"],
    ["2026-08-13","Present",""],
    ["2026-08-14","Absent","Parent informed"]
  ].forEach(r=>ins.run(student.id,...r,now()));
}

let invoice=db.prepare("SELECT * FROM finance_invoices WHERE invoice_ref='RF-INV-DEMO-001'").get();
if(!invoice){
  const info=db.prepare(`INSERT INTO finance_invoices(invoice_ref,student_id,description,amount,due_date,status,created_at)
    VALUES('RF-INV-DEMO-001',?,?,?,?, 'Outstanding',?)`).run(student.id,"Monthly tuition",3700,"2026-08-31",now());
  invoice=db.prepare("SELECT * FROM finance_invoices WHERE id=?").get(info.lastInsertRowid);
}

let app=db.prepare("SELECT * FROM applications WHERE application_ref='RF-APP-DEMO-001'").get();
if(!app){
  const stamp=now();
  db.prepare(`INSERT INTO applications(reference,application_ref,learner_first,applicant_first_name,learner_last,applicant_last_name,dob,date_of_birth,learner_grade,grade_applying,current_school,parent_first,parent_last,parent_name,email,parent_email,phone,parent_phone,pathway,campus,cambridge_level,subjects_json,preferred_start_date,status,notes,created_at,updated_at)
    VALUES('RF-APP-DEMO-001','RF-APP-DEMO-001','Amahle','Amahle','Mokoena','Mokoena','2010-04-10','2010-04-10','Grade 10','Grade 10','Demo School','Nomsa','Mokoena','Nomsa Mokoena','parent.demo@ridgefield.local','parent.demo@ridgefield.local','0710000000','0710000000','Cambridge','25 Wilcock Road, Noordhoek','IGCSE','[]','2026-09-01','Accepted','Demo application',?,?)`)
    .run(stamp,stamp);
}

let report=db.prepare("SELECT * FROM generated_reports WHERE report_ref='RF-REP-DEMO-001'").get();
if(!report){
  db.prepare(`INSERT INTO generated_reports(report_ref,student_id,term,academic_year,report_status,generated_at)
    VALUES('RF-REP-DEMO-001',?,'Term 1','2026','Generated',?)`).run(student.id,now());
}

const notifCount=db.prepare("SELECT COUNT(*) c FROM notifications_v3 WHERE recipient_account_id=?").get(parentAccount.id).c;
if(notifCount===0){
  db.prepare(`INSERT INTO notifications_v3(recipient_account_id,category,title,body,entity_type,entity_id,priority,read_at,created_at)
    VALUES(?,?,?,?,?,?,?,NULL,?)`).run(parentAccount.id,"academics","Demo result published","Amahle has a new Mathematics result.","academic_record","demo","Normal",now());
}

console.log("Demo seed complete.");
console.log("Password for all demo users:",PASSWORD);
console.log("Admin: admin.demo@ridgefield.local");
console.log("Teacher: teacher.demo@ridgefield.local");
console.log("Parent: parent.demo@ridgefield.local");
console.log("Student: student.demo@ridgefield.local");
