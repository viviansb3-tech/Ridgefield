// Requires a disposable setup capability explicitly seeded for this test, never a real administrator.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=process.env.RF_NUMBER_QA_FIXTURE||'/private/tmp/rf-number-qa.json';
if (!fs.existsSync(file)) {
  console.log('SKIP: learner-numbers-live.cjs requires live test fixture at ' + file);
  process.exit(0);
}
const f=JSON.parse(fs.readFileSync(file,'utf8')),ctx={window:{}};vm.runInNewContext(fs.readFileSync('assets/rf-baas-config.js','utf8'),ctx);
const c=ctx.window.RidgefieldBaasConfig;const base=c.url+'/functions/v1/ridgefield-api';let token;
async function call(path,method='GET',body,auth=false){const r=await fetch(base+path,{method,headers:{apikey:c.publishableKey,...(body?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};}
function payload(pathway,index){return {
 'application-reference':'RF-NUMBER-QA-'+f.nonce+'-'+index,'learner-first-name':'Synthetic','learner-last-name':'NumberVerification','date-of-birth':'2012-01-01','guardian-name':'Synthetic Guardian','guardian-email':f.email,'guardian-phone':'+27000000000',pathway,'grade-applying':pathway==='Cambridge'?'IGCSE (Grades 9–10)':pathway==='Primary'?'Grade 5':'Grade 9','current-school':'Synthetic School','preferred-start':'2027-01','privacy-consent':'Agreed','main-enquiry':'Synthetic academic questions','q1':'New school application','q2':'Very confident','q3':'Academic performance','q4':'Email','q5':'Within a few days','q6':'No, not necessary yet',
 ...(pathway==='Cambridge'?{'cambridge-experience':'No previous Cambridge study','cambridge-subjects':'Mathematics'}:pathway==='Primary'?{'primary-current-grade':'Grade 4','primary-support':'Literacy'}:{'caps-current-grade':'Grade 8','caps-support':'Mathematics'})};}
(async()=>{
 const inputs=['Cambridge','CAPS Secondary','Primary'].map(payload);
 const responses=await Promise.all(inputs.map(b=>call('/send-application','POST',b)));
 f.requestIds=inputs.map(x=>x['application-reference']);
 for(let i=0;i<responses.length;i++){const r=responses[i];assert.equal(r.status,200,JSON.stringify(r));assert(/^RIDC\d{9,}$/.test(r.data.reference));assert.equal(r.data.studentNumber,r.data.reference);assert.equal(Number(r.data.reference.slice(8))%2,i===0?0:1);}
 const numbers=responses.map(x=>x.data.reference);assert.equal(new Set(numbers).size,3);f.numbers=numbers;
 console.log('PASS: concurrent Cambridge, CAPS and Primary applications receive unique numbers with correct parity');
 const retries=await Promise.all([call('/send-application','POST',inputs[0]),call('/send-application','POST',inputs[0])]);for(const r of retries){assert.equal(r.status,200);assert.equal(r.data.reference,numbers[0]);assert(r.data.duplicate);}
 console.log('PASS: concurrent duplicate retries preserve the same permanent number');
 const incomplete={...inputs[0],'application-reference':'RF-NUMBER-QA-BAD-'+f.nonce};delete incomplete.q4;assert.equal((await call('/send-application','POST',incomplete)).status,400);console.log('PASS: incomplete application steps are rejected by the backend');
 let r=await call('/setup','POST',{token:f.token,password:f.password});assert.equal(r.status,200,JSON.stringify(r));
 const login=await fetch(c.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:f.email,password:f.password})});assert.equal(login.status,200);const session=await login.json();token=session.access_token;f.userId=session.user.id;
 r=await call('/admin/applications?number='+numbers[0],'GET',undefined,true);assert.equal(r.status,200);assert.equal(r.data.applications.length,1);const a=r.data.applications[0];assert.equal(a.payload['preferred-start'],'2027-01');assert.equal(a.payload['cambridge-subjects'],'Mathematics');assert.equal(a.payload['main-enquiry'],'Synthetic academic questions');assert(a.payload.q6);f.applicationId=a.id;
 console.log('PASS: completed application and questionnaire are visible in administration under the permanent number');
 assert.equal((await call('/admin/applications/'+a.id+'/enrol','POST',undefined,true)).status,409);console.log('PASS: pending applications cannot be enrolled');
 assert.equal((await call('/admin/applications/'+a.id,'PATCH',{status:'Accepted'},true)).status,200);
 const enrolled=await Promise.all([call('/admin/applications/'+a.id+'/enrol','POST',undefined,true),call('/admin/applications/'+a.id+'/enrol','POST',undefined,true)]);
 for(const v of enrolled){assert.equal(v.status,200,JSON.stringify(v));assert.equal(v.data.studentRef,numbers[0]);}
 assert.equal(enrolled[0].data.studentId,enrolled[1].data.studentId);f.studentId=enrolled[0].data.studentId;
 console.log('PASS: simultaneous enrolment requests create one learner and retain the original application number');
 r=await call('/admin/students','GET',undefined,true);const s=r.data.students.find(x=>x.id===f.studentId);assert(s);assert.equal(s.student_ref,numbers[0]);assert.equal(s.application_id,a.id);
 r=await call('/admin/applications?number='+numbers[0],'GET',undefined,true);assert.equal(r.data.applications[0].status,'Enrolled');
 console.log('PASS: application and learner register keep the same lifelong number after enrolment');
 fs.writeFileSync(file,JSON.stringify(f));
})().catch(e=>{fs.writeFileSync(file,JSON.stringify(f));console.error(e.message);process.exitCode=1});
