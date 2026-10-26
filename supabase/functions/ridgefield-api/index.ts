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
class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
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
  const user=await staff(req); // Every route below requires a server-verified active staff account.
  if(route==='/me'&&method==='GET')return response({ok:true,user:{id:user.id,email:user.email}});
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
