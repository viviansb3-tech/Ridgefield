#!/usr/bin/env node
require("dotenv").config({path:process.env.ENV_FILE||undefined});
const BASE=process.env.TEST_BASE_URL||"http://127.0.0.1:4000";
const PASSWORD=process.env.DEMO_PASSWORD||"DemoPass123!";

async function request(path,opts={}){
  const r=await fetch(BASE+path,opts);
  let d={}; try{d=await r.json()}catch(e){}
  if(!r.ok) throw new Error(`${opts.method||"GET"} ${path} -> ${r.status}: ${d.error||"error"}`);
  return {r,d};
}
async function login(email){
  const {r,d}=await request("/api/v1/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:PASSWORD})});
  const cookie=(r.headers.get("set-cookie")||"").split(";")[0];
  return {cookie,csrf:d.csrfToken,account:d.account};
}
async function cookieReq(path,session,opts={}){
  const headers={...(opts.headers||{}),Cookie:session.cookie};
  const method=(opts.method||"GET").toUpperCase();
  if(!["GET","HEAD","OPTIONS"].includes(method))headers["x-csrf-token"]=session.csrf;
  return request(path,{...opts,headers});
}
(async()=>{
  const checks=[];
  const check=(name,fn)=>checks.push([name,fn]);
  check("Public status",()=>request("/api/v1/status"));
  check("Public campuses",()=>request("/api/v1/public/campuses"));

  const admin=await login("admin.demo@ridgefield.local");
  const teacher=await login("teacher.demo@ridgefield.local");
  const parent=await login("parent.demo@ridgefield.local");
  const student=await login("student.demo@ridgefield.local");

  check("Admin role",async()=>{if(admin.account.role!=="admin")throw new Error("wrong admin role")});
  check("Teacher role",async()=>{if(teacher.account.role!=="teacher")throw new Error("wrong teacher role")});
  check("Parent role",async()=>{if(parent.account.role!=="parent")throw new Error("wrong parent role")});
  check("Student role",async()=>{if(student.account.role!=="student")throw new Error("wrong student role")});

  check("Admin summary",()=>cookieReq("/api/v1/rbac/admin/summary",admin));
  check("Teacher dashboard",()=>cookieReq("/api/v1/rbac/teacher/dashboard",teacher));
  check("Parent children",()=>cookieReq("/api/v1/parent/children",parent));
  check("Student profile",()=>cookieReq("/api/v1/rbac/student/me",student));
  check("Student notifications",()=>cookieReq("/api/v1/notifications",student));
  check("Parent notifications",()=>cookieReq("/api/v1/notifications",parent));
  check("Student finance",()=>cookieReq("/api/v1/portal/finance",student));

  let failed=0;
  for(const [name,fn] of checks){
    try{await fn();console.log("PASS",name)}
    catch(e){failed++;console.error("FAIL",name,"-",e.message)}
  }
  if(failed){process.exitCode=1}else console.log("All end-to-end smoke checks passed.");
})().catch(e=>{console.error(e);process.exit(1)});
