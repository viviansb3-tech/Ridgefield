// First-party REST APIs avoid an additional runtime dependency in this function.
const SB_URL = Deno.env.get('SUPABASE_URL')!;
function envKey(group: string, fallback: string): string {
  const keys = JSON.parse(Deno.env.get(group) || '{}');
  return keys.default || Deno.env.get(fallback) || '';
}
const SECRET = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC_KEY = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const legacySecret = SECRET.startsWith('eyJ');
const adminHeaders: Record<string,string> = { apikey: SECRET, ...(legacySecret ? { Authorization: `Bearer ${SECRET}` } : {}), 'Content-Type': 'application/json' };
const ORIGINS = new Set(['http://localhost:8080','http://127.0.0.1:8080','https://www.ridgefieldacademy.co.za','https://ridgefieldacademy.co.za']);
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ORIGINS.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.pages\.dev$/i.test(origin)) return true;
  return false;
}
const STATUS = ['Pending','Under Review','Documents Required','Interview','Accepted','Waitlisted','Declined','Enrolled'];
const DOC_STATUS = ['Pending','Verified','Rejected','Resubmit'];
const PATHWAYS: Record<string,{campus:string,grades:string[]}> = {
 Cambridge: { campus:'25 Wilcock Road, Noordhoek',grades:['Pre-IGCSE (Grade 8)','IGCSE (Grades 9–10)','AS Level (Grades 11–12)'] },
 'CAPS Secondary':{campus:'22 Maartens Street',grades:['Grade 8','Grade 9','Grade 10','Grade 11','Grade 12 (consultation required)']},
 Primary:{campus:'22 Maartens Street',grades:['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7']}
};
class ApiError extends Error {
 status:number;
 constructor(status:number,message:string){super(message);this.status=status;}
}
async function backend(path:string, options:RequestInit={}) {
 const response=await fetch(SB_URL+path,{...options,headers:{...adminHeaders,...options.headers}});
 const value=await response.json().catch(()=>null);
 if(!response.ok) { if(value?.code==='PT409'||value?.code==='PT404')throw new ApiError(response.status,value.message); console.error('Supabase request failed',response.status,path.split('?')[0],value?.code||''); throw new ApiError(503,'The service is temporarily unavailable. Please try again.'); }
 return value;
}
const db=(path:string,options:RequestInit={})=>backend('/rest/v1/'+path,options);
const insert=(table:string,body:unknown)=>db(table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
async function digest(value:string){const bytes=new TextEncoder().encode(value);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
function text(value:unknown,max=200){if(typeof value!=='string'||value.length>max)throw new ApiError(400,'A field is missing or too long.');return value.trim();}
function required(value:unknown,max=200){const s=text(value,max);if(!s)throw new ApiError(400,'Please complete all required fields.');return s;}
function email(value:unknown){const s=required(value,254).toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))throw new ApiError(400,'Please enter a valid email address.');return s;}
function phone(value:unknown,mandatory=false){const s=text(value||'',25);if((mandatory||s)&&!/^\+?[\d\s()\-]{7,25}$/.test(s))throw new ApiError(400,'Please enter a valid telephone number.');return s;}
function uuid(value:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new ApiError(400,'Invalid record identifier.');return value;}
function consent(value:unknown){if(!['agreed','yes','true','on','1'].includes(String(value).toLowerCase()))throw new ApiError(400,'Privacy consent is required.');}
async function readBody(req:Request,max=65536){
 const reader=req.body?.getReader();if(!reader)return {};let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new ApiError(413,'The request is too large.');}chunks.push(value);}
 const b=new Uint8Array(size);let n=0;for(const c of chunks){b.set(c,n);n+=c.length;}const raw=new TextDecoder().decode(b);
 try {const v=(req.headers.get('content-type')||'').includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw));if(!v||typeof v!=='object'||Array.isArray(v))throw 0;return v;}catch{throw new ApiError(400,'Invalid request data.');}
}
async function currentUser(req:Request){
 const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))throw new ApiError(401,'Please sign in.');
 const r=await fetch(SB_URL+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:auth}});
 if(!r.ok)throw new ApiError(401,'Your session has expired. Please sign in again.');
 const user=await r.json();if(!user.email_confirmed_at)throw new ApiError(403,'Please verify your email address.');return user;
}
async function staff(req:Request,adminOnly=false){
 const user=await currentUser(req);const rows=await db('rf_staff?user_id=eq.'+user.id+'&active=eq.true&select=role');
 if(!rows.length||(adminOnly&&rows[0].role!=='admin'))throw new ApiError(403,'Your account does not have access to this area.');return user;
}
async function activeTeacher(req:Request){
 const user=await currentUser(req);const rows=await db('rf_teacher_accounts?user_id=eq.'+user.id+'&select=user_id,email,first_name,last_name,campus,pathway,subjects_json,status');
 if(!rows.length||rows[0].status!=='Active')throw new ApiError(403,'Teacher portal access is awaiting administrator approval.');
 return {user,teacher:rows[0]};
}
function subjects(value:unknown){
 if(!Array.isArray(value)||value.length<1||value.length>20)throw new ApiError(400,'Enter between 1 and 20 subjects.');
 const result=[...new Set(value.map((x:unknown)=>required(x,100)))];
 if(result.length!==value.length)throw new ApiError(400,'Remove duplicate subjects.');
 return result;
}
function isoDate(value:unknown){
 const date=required(value,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new ApiError(400,'Enter a valid date.');
 return date;
}
function randomToken(){
 return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
}
async function audit(userId:string,action:string,targetId?:string){await insert('rf_audit',{actor_id:userId,action,target_id:targetId||null});}
async function rate(req:Request){
 const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
 const key=await digest('ridgefield:'+ip);const ok=await db('rpc/rf_allow_request',{method:'POST',body:JSON.stringify({rate_key:key,max_hits:15})});
 if(!ok)throw new ApiError(429,'Too many requests. Please wait a minute and try again.');
}
async function submit(req:Request,kind:string){
 await rate(req);const b=await readBody(req);if(text(b['bot-field']||''))throw new ApiError(400,'Unable to accept this submission.');consent(b['privacy-consent']);
 let row:Record<string,unknown>={};
 const allowedKeys=kind==='application'?['learner-first-name','learner-last-name','date-of-birth','guardian-name','guardian-email','guardian-phone','pathway','grade-applying','current-school','main-enquiry','academic-notes','privacy-consent','preferred-start','preferred-start-date','home-language','learner-gender','guardian-relationship','address','q1','q2','q3','q4','q5','q6','cambridge-experience','cambridge-subjects','caps-current-grade','caps-support','primary-current-grade','primary-support','application-source','document-prep-report','document-prep-address','document-prep-birth','document-prep-id','document-prep-additional']:['name','email','phone','enquiry-type','pathway','subject','urgency','preferred-contact','message','privacy-consent'];
 const payload=Object.fromEntries(allowedKeys.filter(k=>b[k]!==undefined).map(k=>[k,text(b[k],['message','academic-notes','main-enquiry'].includes(k)?3000:1000)]));
 if(kind==='application'){
  const pathway=required(b.pathway);const config=PATHWAYS[pathway];if(!config)throw new ApiError(400,'Please select a valid pathway.');
  const grade=required(b['grade-applying']);if(!config.grades.includes(grade))throw new ApiError(400,'Please select a valid grade for this pathway.');
  required(b['current-school'],160);
  const start=required(b['preferred-start'],7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start))throw new ApiError(400,'Please choose a valid preferred start month.');
  for(const q of ['q1','q2','q3','q4','q5','q6'])required(b[q],200);
  const conditional=pathway==='Cambridge'?['cambridge-experience','cambridge-subjects']:pathway==='Primary'?['primary-current-grade','primary-support']:['caps-current-grade','caps-support'];
  for(const field of conditional)required(b[field],1000);
  const dob=required(b['date-of-birth']);if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||Number.isNaN(Date.parse(dob))||new Date(dob).toISOString().slice(0,10)!==dob||dob>new Date().toISOString().slice(0,10))throw new ApiError(400,'Please enter a valid date of birth.');
  row={learner_first:required(b['learner-first-name'],100),learner_last:required(b['learner-last-name'],100),dob,guardian_name:required(b['guardian-name'],120),guardian_email:email(b['guardian-email']),guardian_phone:phone(b['guardian-phone'],true),pathway,campus:config.campus,learner_grade:grade};
 }else{
  const type=required(b['enquiry-type']);if(!['Admissions','Fees','Academics','Cambridge','CAPS Secondary','Primary','Book Lists','General','General Enquiries','Campus Tours & Visits'].includes(type))throw new ApiError(400,'Please choose a valid enquiry type.');
  const preferred=required(b['preferred-contact']);if(!['Email','Phone call','Either phone or email'].includes(preferred))throw new ApiError(400,'Please choose a valid contact preference.');
  const message=required(b.message,3000);if(message.length<5)throw new ApiError(400,'Please include a message of at least five characters.');
  row={name:required(b.name,120),email:email(b.email),phone:phone(b.phone,preferred==='Phone call'),enquiry_type:type,subject:required(b.subject,200),message};
 }
 const requestId=required(b[kind+'-reference'],100);if(!/^[a-z0-9_-]{6,100}$/i.test(requestId))throw new ApiError(400,'Invalid submission reference.');
 const payloadDigest=await digest(JSON.stringify(payload));const table=kind==='application'?'rf_applications':'rf_enquiries';
 const ref=kind==='application'?undefined:'RF-ENQ-'+crypto.randomUUID().toUpperCase();
 const response=await fetch(SB_URL+'/rest/v1/'+table,{method:'POST',headers:{...adminHeaders,Prefer:'return=representation'},body:JSON.stringify({...row,reference:ref,request_id:requestId,payload_digest:payloadDigest,payload})});
 if(response.status===409){const old=(await db(table+'?request_id=eq.'+encodeURIComponent(requestId)+'&select=reference,payload_digest'))[0];if(old?.payload_digest===payloadDigest)return {ok:true,reference:old.reference,...(kind==='application'?{studentNumber:old.reference}:{}),duplicate:true};throw new ApiError(409,'This submission reference has already been used. Please reload the page.');}
 if(!response.ok)throw new ApiError(503,'The submission could not be saved. Please try again.');
 const saved=await response.json();const assigned=saved[0].reference;
 return {ok:true,reference:assigned,...(kind==='application'?{studentNumber:assigned}:{})};
}
async function documentUpload(req:Request,user:any){
 const b=await readBody(req,7500000);const appId=uuid(required(b.applicationId));const exists=await db('rf_applications?id=eq.'+appId+'&select=id');if(!exists.length)throw new ApiError(404,'Application not found.');
 const name=required(b.fileName,180);const type=required(b.documentType,100);let bytes:Uint8Array;
 try{bytes=Uint8Array.from(atob(required(b.base64,7000000)),c=>c.charCodeAt(0));}catch{throw new ApiError(400,'Invalid file data.');}
 if(!bytes.length||bytes.length>5242880)throw new ApiError(413,'Files must be no larger than 5 MB.');
 const starts=(a:number[])=>a.every((x,i)=>bytes[i]===x);
 const mime=starts([37,80,68,70,45])?'application/pdf':starts([255,216,255])?'image/jpeg':starts([137,80,78,71,13,10,26,10])?'image/png':null;
 if(!mime)throw new ApiError(400,'Only PDF, JPEG and PNG documents are accepted.');
 const path=appId+'/'+crypto.randomUUID();const uploaded=await fetch(SB_URL+'/storage/v1/object/ridgefield-documents/'+path,{method:'POST',headers:{...adminHeaders,'Content-Type':mime,'x-upsert':'false'},body:bytes});
 if(!uploaded.ok)throw new ApiError(503,'The document could not be uploaded.');
 try{const rows=await insert('rf_documents',{application_id:appId,storage_path:path,file_name:name,mime_type:mime,file_size:bytes.length,document_type:type,uploaded_by:user.id});await audit(user.id,'document.upload',rows[0].id);return {ok:true,document:rows[0]};}
 catch(e){await backend('/storage/v1/object/ridgefield-documents',{method:'DELETE',body:JSON.stringify({prefixes:[path]})});throw e;}
}
export async function handler(req:Request):Promise<Response>{
 const origin=req.headers.get('origin');const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, PATCH, PUT, DELETE, OPTIONS'};
 if(origin&&isOriginAllowed(origin))headers['Access-Control-Allow-Origin']=origin;
 const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 try{
  if(origin&&!isOriginAllowed(origin))throw new ApiError(403,'Origin not allowed.');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  const validKeys=[...Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}')),Deno.env.get('SUPABASE_ANON_KEY')].filter(Boolean);
  if(!validKeys.includes(req.headers.get('apikey')||''))throw new ApiError(401,'Missing or invalid application key.');
  const url=new URL(req.url);const route=url.pathname.replace(/^.*\/ridgefield-api/,'');const method=req.method;
  if(route==='/health'&&method==='GET'){await db('rf_content?select=section&limit=1');return response({ok:true,service:'Ridgefield Academy',database:'connected'});}
  if(route==='/send-application'&&method==='POST')return response(await submit(req,'application'));
  if(route==='/send-enquiry'&&method==='POST')return response(await submit(req,'enquiry'));
  if(route==='/content'&&method==='GET')return response({ok:true,content:await db('rf_content?published=eq.true&select=section,title,body')});
  if(route==='/setup'&&method==='POST'){
   await rate(req);const b=await readBody(req);const token=required(b.token,100);const tokenDigest=await digest(token);
   const matches=await db('rf_bootstrap?token_digest=eq.'+tokenDigest+'&consumed_at=is.null&select=email,created_at');
   if(!matches.length||Date.now()-Date.parse(matches[0].created_at)>86400000)throw new ApiError(403,'This setup link is invalid or expired.');
   const password=b.password;if(typeof password!=='string'||password.length<12||password.length>128)throw new ApiError(400,'Use a password between 12 and 128 characters.');
   const result=await backend('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:matches[0].email,password,email_confirm:true})});
   const created=result.user||result;
   await insert('rf_staff',{user_id:created.id,role:'admin',active:true});
   await db('rf_bootstrap?token_digest=eq.'+tokenDigest,{method:'PATCH',body:JSON.stringify({consumed_at:new Date().toISOString()})});
   await audit(created.id,'administrator.setup');
   return response({ok:true,email:matches[0].email});
  }
  if(route==='/student/activate'&&method==='POST'){
   await rate(req);const b=await readBody(req,8192);const token=required(b.token,64);if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError(400,'This student invitation is invalid or expired.');
   const inviteEmail=email(b.email);const password=b.password;if(typeof password!=='string'||password.length<12||password.length>128)throw new ApiError(400,'Use a password between 12 and 128 characters.');
   const claimId=crypto.randomUUID();const claims=await db('rpc/rf_claim_student_invite',{method:'POST',body:JSON.stringify({p_token_digest:await digest(token),p_email:inviteEmail,p_claim_id:claimId})});
   if(!claims?.length)throw new ApiError(403,'This student invitation is invalid, expired or already used.');
   let createdId:string|undefined;
   try{
    const result=await backend('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:inviteEmail,password,email_confirm:true,user_metadata:{portal:'student'}})});
    const created=result.user||result;createdId=uuid(created.id);
    await db('rpc/rf_finalize_student_invite',{method:'POST',body:JSON.stringify({p_invite_id:claims[0].invite_id,p_claim_id:claimId,p_user_id:createdId})});
   }catch(error){
    if(createdId){
     try{await backend('/auth/v1/admin/users/'+createdId,{method:'DELETE'});}
     catch(cleanupError){console.error('Student invite account cleanup failed',cleanupError instanceof Error?cleanupError.name:'unknown');}
    }
    await db('rpc/rf_release_student_invite',{method:'POST',body:JSON.stringify({p_invite_id:claims[0].invite_id,p_claim_id:claimId})});
    throw error;
   }
   if(!createdId)throw new ApiError(500,'Student account activation could not be completed.');
   await audit(createdId,'student.invite.activate',claims[0].student_id);
   return response({ok:true,email:inviteEmail});
  }
  if(route==='/teacher/register'&&method==='POST'){
   await rate(req);const user=await currentUser(req);const b=await readBody(req);
   if(!user.email)throw new ApiError(400,'A verified email address is required.');
   const pathway=required(b.pathway,40);const pathwayInfo=PATHWAYS[pathway];if(!pathwayInfo)throw new ApiError(400,'Choose a valid teaching pathway.');
   const campus=required(b.campus,120);if(campus!==pathwayInfo.campus)throw new ApiError(400,'Choose the campus assigned to this pathway.');
   const submitted=subjects(b.subjects);const result=await db('rpc/rf_submit_teacher_registration',{method:'POST',body:JSON.stringify({
    p_user_id:user.id,p_email:email(user.email),p_first_name:required(b.firstName,100),p_last_name:required(b.lastName,100),
    p_campus:campus,p_pathway:pathway,p_subjects:submitted
   })});
   const status=typeof result==='string'?result:result?.[0];
   if(status==='Active')return response({ok:true,status:'Active',message:'Your teacher account is already approved.'});
   await audit(user.id,'teacher.register');
   return response({ok:true,status:'Pending',message:'Your registration was sent to an administrator for approval.'});
  }
  if(route==='/me'&&method==='GET'){
   const user=await currentUser(req);
   const [staffRows,teacherRows,learnerRows]=await Promise.all([
    db('rf_staff?user_id=eq.'+user.id+'&active=eq.true&select=role'),
    db('rf_teacher_accounts?user_id=eq.'+user.id+'&select=status,email,first_name,last_name,campus,pathway,subjects_json'),
    db('rf_learner_access?user_id=eq.'+user.id+'&relationship=eq.student&select=student_id')
   ]);
   if(staffRows.length)return response({ok:true,user:{id:user.id,email:user.email},role:staffRows[0].role,status:'Active'});
   if(teacherRows.length)return response({ok:true,user:{id:user.id,email:user.email},role:'teacher',...teacherRows[0]});
   if(learnerRows.length)return response({ok:true,user:{id:user.id,email:user.email},role:'student',status:'Active'});
   const registration=user.user_metadata?.teacher_application;
   return response({ok:true,user:{id:user.id,email:user.email},role:'unregistered',status:'Unregistered',registration:registration&&typeof registration==='object'?registration:null});
  }
  if(route==='/teacher/dashboard'&&method==='GET'){
   const {user,teacher}=await activeTeacher(req);
   const assignments=await db('rf_teacher_assignments?teacher_id=eq.'+user.id+'&select=student_id,subject&order=subject,student_id');
   if(!assignments.length)return response({ok:true,teacher,assignments:[],records:[],attendance:[]});
   const ids=[...new Set(assignments.map((x:any)=>uuid(x.student_id)))];const filter='in.('+ids.join(',')+')';
   const [students,records,attendance]=await Promise.all([
    db('rf_students?id='+filter+'&select=id,student_ref,first_name,last_name,grade,pathway,campus,status&order=last_name,first_name'),
    db('rf_academic_records?student_id='+filter+'&select=id,student_id,subject,assessment,score,max_score,term,academic_year,comment,created_at&order=created_at.desc&limit=250'),
    db('rf_attendance?student_id='+filter+'&select=student_id,attendance_date,status,note&order=attendance_date.desc&limit=250')
   ]);
   return response({ok:true,teacher,assignments:assignments.map((x:any)=>({...x,student:students.find((s:any)=>s.id===x.student_id)||null})),records,attendance});
  }
  if(route==='/teacher/records'&&method==='POST'){
   const {user}=await activeTeacher(req);const b=await readBody(req);const studentId=uuid(required(b.studentId,36));const subject=required(b.subject,100);
   const assigned=await db('rf_teacher_assignments?teacher_id=eq.'+user.id+'&student_id=eq.'+studentId+'&select=subject');
   if(!assigned.some((x:any)=>x.subject===subject))throw new ApiError(403,'You may only publish records for a learner and subject assigned to you.');
   const hasScore=b.score!==''&&b.score!==null&&b.score!==undefined;const hasMax=b.maxScore!==''&&b.maxScore!==null&&b.maxScore!==undefined;
   if(hasScore&&typeof b.score!=='number'&&typeof b.score!=='string'||hasMax&&typeof b.maxScore!=='number'&&typeof b.maxScore!=='string')throw new ApiError(400,'Enter a valid score and maximum score.');
   const score=hasScore?Number(b.score):null;const maxScore=hasMax?Number(b.maxScore):null;
   if((score===null)!==(maxScore===null)||score!==null&&(!Number.isFinite(score)||!Number.isFinite(maxScore)||score<0||maxScore<=0||score>maxScore))throw new ApiError(400,'Enter a valid score and maximum score.');
   const academicYear=b.academicYear===''||b.academicYear===null||b.academicYear===undefined?null:Number(b.academicYear);
   if(academicYear!==null&&(!Number.isInteger(academicYear)||academicYear<1900||academicYear>2200))throw new ApiError(400,'Enter a valid academic year.');
   await insert('rf_academic_records',{student_id:studentId,subject,assessment:required(b.assessment,150),score,max_score:maxScore,term:text(b.term||'',80)||null,academic_year:academicYear,comment:text(b.comment||'',2000)||null});
   await audit(user.id,'teacher.record.create',studentId);
   return response({ok:true});
  }
  if(route==='/teacher/attendance'&&method==='POST'){
   const {user}=await activeTeacher(req);const b=await readBody(req);const studentId=uuid(required(b.studentId,36));const date=isoDate(b.date);const status=required(b.status,20);
   if(!['Present','Absent','Late','Excused'].includes(status))throw new ApiError(400,'Choose a valid attendance status.');
   const assigned=await db('rf_teacher_assignments?teacher_id=eq.'+user.id+'&student_id=eq.'+studentId+'&select=student_id&limit=1');
   if(!assigned.length)throw new ApiError(403,'You may only update attendance for a learner assigned to you.');
   await db('rf_attendance?on_conflict=student_id,attendance_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({student_id:studentId,attendance_date:date,status,note:text(b.note||'',500)||null})});
   await audit(user.id,'teacher.attendance.save',studentId);
   return response({ok:true});
  }
  if(route==='/student/dashboard'&&method==='GET'){
   const user=await currentUser(req);const links=await db('rf_learner_access?user_id=eq.'+user.id+'&relationship=eq.student&select=student_id');
   if(!links.length)throw new ApiError(403,'This account is not linked to an active student record.');
   const studentIds=[...new Set(links.map((x:any)=>uuid(x.student_id)))];const filter='in.('+studentIds.join(',')+')';
   const [students,records,attendance]=await Promise.all([
    db('rf_students?id='+filter+'&select=id,student_ref,first_name,last_name,grade,pathway,campus,status'),
    db('rf_academic_records?student_id='+filter+'&select=id,student_id,subject,assessment,score,max_score,term,academic_year,comment,created_at&order=created_at.desc&limit=250'),
    db('rf_attendance?student_id='+filter+'&select=student_id,attendance_date,status,note&order=attendance_date.desc&limit=250')
   ]);
   return response({ok:true,students,records,attendance});
  }
  const user=await staff(req); // Every route below requires a server-verified active staff account.
  if(route==='/admin/teachers'&&method==='GET'){
   await staff(req,true);const status=url.searchParams.get('status');if(status&&!['Pending','Active','Rejected'].includes(status))throw new ApiError(400,'Invalid teacher status.');
   return response({ok:true,teachers:await db('rf_teacher_accounts?select=user_id,email,first_name,last_name,campus,pathway,subjects_json,status,created_at&order=created_at.desc&limit=500'+(status?'&status=eq.'+status:''))});
  }
  const teacherReview=route.match(/^\/admin\/teachers\/([0-9a-f-]+)$/);
  if(teacherReview&&method==='PATCH'){
   await staff(req,true);const teacherId=uuid(teacherReview[1]);const b=await readBody(req);
   if(!['Active','Rejected'].includes(b.status))throw new ApiError(400,'Choose approval or rejection.');
   const rows=await db('rf_teacher_accounts?user_id=eq.'+teacherId,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:b.status,updated_at:new Date().toISOString()})});
   if(!rows.length)throw new ApiError(404,'Teacher registration not found.');
   await audit(user.id,'teacher.'+b.status.toLowerCase(),teacherId);
   return response({ok:true,status:b.status});
  }
  if(route==='/admin/assignments'&&method==='GET'){
   await staff(req,true);return response({ok:true,assignments:await db('rf_teacher_assignments?select=teacher_id,student_id,subject,created_at&order=created_at.desc&limit=1000')});
  }
  if(route==='/admin/assignments'&&method==='POST'){
   await staff(req,true);const b=await readBody(req);const teacherId=uuid(required(b.teacherId,36));const studentId=uuid(required(b.studentId,36));const subject=required(b.subject,100);
   const [teachers,students]=await Promise.all([
    db('rf_teacher_accounts?user_id=eq.'+teacherId+'&status=eq.Active&select=user_id,subjects_json'),
    db('rf_students?id=eq.'+studentId+'&status=eq.Active&select=id')
   ]);
   if(!teachers.length)throw new ApiError(404,'An approved teacher is required.');
   if(!students.length)throw new ApiError(404,'An active student is required.');
   const teacherSubjects=Array.isArray(teachers[0].subjects_json)?teachers[0].subjects_json:[];
   if(!teacherSubjects.includes(subject))throw new ApiError(400,'Choose a subject listed on the teacher registration.');
   const rows=await insert('rf_teacher_assignments',{teacher_id:teacherId,student_id:studentId,subject,created_by:user.id});
   await audit(user.id,'teacher.assignment.create',rows[0].student_id);
   return response({ok:true});
  }
  if(route==='/admin/students/tester'&&method==='POST'){
   await staff(req,true);let student=(await db('rf_students?is_test_fixture=eq.true&select=id,student_ref,first_name,last_name,grade,pathway,campus,status&limit=1'))[0];
   if(!student){
    const rows=await insert('rf_students',{first_name:'Fictional',last_name:'Test Learner',grade:'IGCSE (Grades 9–10)',pathway:'Cambridge',campus:PATHWAYS.Cambridge.campus,status:'Active',is_test_fixture:true});
    student=rows[0];
   }
   await audit(user.id,'student.test_fixture.create',student.id);
   return response({ok:true,student:{id:student.id,studentRef:student.student_ref,firstName:student.first_name,lastName:student.last_name}});
  }
  const studentInvite=route.match(/^\/admin\/students\/([0-9a-f-]+)\/invite$/);
  if(studentInvite&&method==='POST'){
   await staff(req,true);const studentId=uuid(studentInvite[1]);const b=await readBody(req);const inviteEmail=email(b.email);
   const students=await db('rf_students?id=eq.'+studentId+'&status=eq.Active&select=id');if(!students.length)throw new ApiError(404,'An active student is required.');
   const existingAccess=await db('rf_learner_access?student_id=eq.'+studentId+'&relationship=eq.student&select=user_id');
   if(existingAccess.length)throw new ApiError(409,'This student already has an account.');
   const token=randomToken();const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
   await db('rf_student_invites?student_id=eq.'+studentId+'&consumed_at=is.null&revoked_at=is.null',{method:'PATCH',body:JSON.stringify({revoked_at:new Date().toISOString()})});
   await insert('rf_student_invites',{student_id:studentId,email:inviteEmail,token_digest:await digest(token),expires_at:expiresAt,created_by:user.id});
   await audit(user.id,'student.invite.create',studentId);
   return response({ok:true,email:inviteEmail,token,expiresAt});
  }
  if(route==='/admin/summary'&&method==='GET'){
   const [apps,students]=await Promise.all([db('rf_applications?select=status'),db('rf_students?select=id')]);
   return response({applications:apps.length,pending:apps.filter((x:any)=>x.status==='Pending').length,review:apps.filter((x:any)=>x.status==='Under Review').length,accepted:apps.filter((x:any)=>x.status==='Accepted').length,students:students.length});
  }
  if(route==='/admin/applications'&&method==='GET'){
   const status=url.searchParams.get('status');if(status&&!STATUS.includes(status))throw new ApiError(400,'Invalid status.');
   const number=url.searchParams.get('number');if(number&&!/^(RIDC\d{9,}|RF-APP-[A-Z0-9-]{6,})$/.test(number))throw new ApiError(400,'Enter a complete learner number or original application reference.');
   const filter=number?'&or='+encodeURIComponent('(reference.eq.'+number+',legacy_reference.eq.'+number+')'):'';
   const applications=await db('rf_applications?select=*&order=created_at.desc&limit=500'+(status?'&status=eq.'+encodeURIComponent(status):'')+filter);return response({ok:true,applications});
  }
  const match=route.match(/^\/admin\/applications\/([0-9a-f-]+)$/);
  if(match&&method==='PATCH'){
   const id=uuid(match[1]);const b=await readBody(req);if(!STATUS.includes(b.status))throw new ApiError(400,'Invalid application status.');
   if(b.status==='Enrolled'){await staff(req,true);const enrolled=await db('rpc/rf_enrol_application',{method:'POST',body:JSON.stringify({p_application_id:id})});await audit(user.id,'application.enrol',id);const application=(await db('rf_applications?id=eq.'+id+'&select=*'))[0];return response({...enrolled,application});}
   const rows=await db('rf_applications?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:b.status,admin_notes:text(b.adminNotes||'',3000),updated_at:new Date().toISOString()})});if(!rows.length)throw new ApiError(404,'Application not found.');await audit(user.id,'application.update',id);return response({ok:true,application:rows[0]});
  }
  const enrol=route.match(/^\/admin\/applications\/([0-9a-f-]+)\/enrol$/);
  if(enrol&&method==='POST'){await staff(req,true);const id=uuid(enrol[1]);const result=await db('rpc/rf_enrol_application',{method:'POST',body:JSON.stringify({p_application_id:id})});await audit(user.id,'application.enrol',id);return response(result);}
  if(route==='/admin/enquiries'&&method==='GET')return response({ok:true,enquiries:await db('rf_enquiries?select=*&order=created_at.desc&limit=500')});
  const enq=route.match(/^\/admin\/enquiries\/([0-9a-f-]+)$/);
  if(enq&&method==='PATCH'){const id=uuid(enq[1]);const b=await readBody(req);if(!['New','In Progress','Resolved'].includes(b.status))throw new ApiError(400,'Invalid status.');const rows=await db('rf_enquiries?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:b.status})});if(!rows.length)throw new ApiError(404,'Enquiry not found.');await audit(user.id,'enquiry.update',id);return response({ok:true});}
  if(route==='/admin/students'&&method==='GET')return response({ok:true,students:await db('rf_students?select=*&order=created_at.desc&limit=500')});
  if(route==='/admin/students'&&method==='POST'){
   await staff(req,true);const b=await readBody(req);if(!PATHWAYS[b.pathway])throw new ApiError(400,'Invalid pathway.');
   if(b.applicationId){const id=uuid(required(b.applicationId));const result=await db('rpc/rf_enrol_application',{method:'POST',body:JSON.stringify({p_application_id:id})});await audit(user.id,'application.enrol',id);return response(result);}
   const rows=await insert('rf_students',{first_name:required(b.firstName,100),last_name:required(b.lastName,100),grade:required(b.grade,100),pathway:b.pathway,campus:PATHWAYS[b.pathway].campus,parent_email:b.parentEmail?email(b.parentEmail):null});await audit(user.id,'student.create',rows[0].id);return response({ok:true,studentRef:rows[0].student_ref});
  }
  if(route==='/admin/content'&&method==='GET')return response({ok:true,content:await db('rf_content?select=*&order=section')});
  const content=route.match(/^\/admin\/content\/([a-z0-9_-]+)$/);
  if(content&&method==='PUT'){await staff(req,true);const b=await readBody(req);await db('rf_content?on_conflict=section',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({section:content[1],title:required(b.title,200),body:required(b.body,20000),published:b.published===true,updated_at:new Date().toISOString()})});await audit(user.id,'content.save');return response({ok:true});}
  if(route==='/admin/documents/upload'&&method==='POST')return response(await documentUpload(req,user));
  if(route==='/admin/documents'&&method==='GET'){const id=uuid(url.searchParams.get('applicationId')||'');return response({ok:true,documents:await db('rf_documents?application_id=eq.'+id+'&select=*&order=created_at.desc')});}
  const doc=route.match(/^\/admin\/documents\/([0-9a-f-]+)(\/link)?$/);
  if(doc){
   const id=uuid(doc[1]);const docs=await db('rf_documents?id=eq.'+id+'&select=*');if(!docs.length)throw new ApiError(404,'Document not found.');
   if(method==='GET'&&doc[2]){const signed=await backend('/storage/v1/object/sign/ridgefield-documents/'+docs[0].storage_path,{method:'POST',body:JSON.stringify({expiresIn:60})});await audit(user.id,'document.read',id);return response({ok:true,url:SB_URL+'/storage/v1'+signed.signedURL});}
   if(method==='PATCH'&&!doc[2]){const b=await readBody(req);if(!DOC_STATUS.includes(b.status))throw new ApiError(400,'Invalid document status.');await db('rf_documents?id=eq.'+id,{method:'PATCH',body:JSON.stringify({status:b.status,admin_note:text(b.adminNote||'',3000)})});await audit(user.id,'document.review',id);return response({ok:true});}
   if(method==='DELETE'&&!doc[2]){
    await staff(req,true);
    await backend('/storage/v1/object/ridgefield-documents',{method:'DELETE',body:JSON.stringify({prefixes:[docs[0].storage_path]})});
    await db('rf_documents?id=eq.'+id,{method:'DELETE'});await audit(user.id,'document.delete',id);return response({ok:true});
   }
  }
  throw new ApiError(404,'This service endpoint does not exist.');
 }catch(e){if(e instanceof ApiError)return response({ok:false,error:e.message},e.status);console.error('Unexpected Ridgefield API error',e instanceof Error?e.name:'unknown');return response({ok:false,error:'An unexpected error occurred. Please try again.'},500);}
}
Deno.serve(handler);
