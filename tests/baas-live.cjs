// Runs against the isolated Ridgefield project using an explicitly seeded synthetic setup account.
// Never runs with a real administrator's password or sends mail.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const vm = require('node:vm');
const fixturePath = process.env.RF_BAAS_FIXTURE || '/private/tmp/rf-baas-test.json';
if (!fs.existsSync(fixturePath)) {
  console.log('SKIP: baas-live.cjs requires live test fixture at ' + fixturePath);
  process.exit(0);
}
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const ctx = {window:{}}; vm.runInNewContext(fs.readFileSync('assets/rf-baas-config.js','utf8'), ctx);
const {url,publishableKey} = ctx.window.RidgefieldBaasConfig;
const base = url + '/functions/v1/ridgefield-api'; let token;
const results=[];
async function call(path,method='GET',body,authenticated=false,extra={}) {
 const response=await fetch(base+path,{method,headers:{apikey:publishableKey,...(authenticated?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>({}));return {status:response.status,data};
}
const check=(label)=>{results.push(label);fixture.results=results;console.log('PASS: '+label)};
(async()=>{
 let r=await call('/health');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.database,'connected');check('deployed API and database health');
 r=await call('/admin/applications');assert.equal(r.status,401);check('anonymous users cannot read applications');
 r=await call('/admin/applications','GET',undefined,false,{Authorization:'Bearer forged'});assert.equal(r.status,401);check('forged user credentials are rejected');
 r=await call('/health','GET',undefined,false,{Origin:'https://untrusted.example'});assert.equal(r.status,403);check('unapproved browser origins are rejected');
 const raw=await fetch(url+'/rest/v1/rf_applications?select=*',{headers:{apikey:publishableKey}});assert([401,403].includes(raw.status));check('direct anonymous database access is denied');
 r=await call('/send-enquiry','POST',{'privacy-consent':'no'});assert.equal(r.status,400);check('privacy consent is enforced by the server');
 const enquiry={'enquiry-reference':'RF-QA-ENQ-'+fixture.nonce,name:'Synthetic verification',email:fixture.email,phone:'','enquiry-type':'General','preferred-contact':'Email',subject:'Automated integration check',message:'Synthetic data for verification only.','privacy-consent':'agreed'};
 r=await call('/send-enquiry','POST',enquiry);assert.equal(r.status,200,JSON.stringify(r));assert(r.data.reference.startsWith('RF-ENQ-'));fixture.enquiryReference=r.data.reference;
 const again=await call('/send-enquiry','POST',enquiry);assert.equal(again.data.reference,r.data.reference);assert.equal(again.data.duplicate,true);check('enquiry persistence, server receipt and idempotent retry');
 const app={'application-reference':'RF-QA-APP-'+fixture.nonce,'learner-first-name':'Synthetic','learner-last-name':'Verification','date-of-birth':'2015-02-01','guardian-name':'Synthetic Guardian','guardian-email':fixture.email,'guardian-phone':'+27000000000',pathway:'Primary',campus:'Untrusted client value','grade-applying':'Grade 5','current-school':'Synthetic School','preferred-start':'2027-01','q1':'New school application','q2':'Very confident','q3':'Academic performance','q4':'Email','q5':'Within a few days','q6':'No, not necessary yet','primary-current-grade':'Grade 4','primary-support':'Literacy','privacy-consent':'agreed'};
 r=await call('/send-application','POST',{...app,'date-of-birth':'2026-02-31'});assert.equal(r.status,400);check('invalid calendar dates are rejected');
 r=await call('/send-application','POST',app);assert.equal(r.status,200,JSON.stringify(r));fixture.applicationReference=r.data.reference;check('application persistence and server-generated receipt');
 r=await call('/setup','POST',{token:fixture.token,password:fixture.password});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.email,fixture.email);check('one-time account setup without sending an email');
 r=await call('/setup','POST',{token:fixture.token,password:fixture.password});assert.equal(r.status,403);check('consumed setup links cannot be reused');
 const auth=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.email,password:fixture.password})});const session=await auth.json();assert.equal(auth.status,200,JSON.stringify(session));token=session.access_token;fixture.userId=session.user.id;fixture.accessToken=token;check('real Supabase password sign-in');
 r=await call('/me','GET',undefined,true);assert.equal(r.status,200);assert.equal(r.data.user.id,fixture.userId);
 r=await call('/admin/applications','GET',undefined,true);assert.equal(r.status,200);const saved=r.data.applications.find(x=>x.reference===fixture.applicationReference);assert(saved);assert.equal(saved.campus,'22 Maartens Street');fixture.applicationId=saved.id;check('authenticated administration reads persisted records and trusted campus assignment');
 r=await call('/admin/applications/'+saved.id,'PATCH',{status:'Under Review',adminNotes:'Synthetic review'},true);assert.equal(r.status,200);assert.equal(r.data.application.status,'Under Review');check('application status updates persist');
 r=await call('/admin/enquiries','GET',undefined,true);assert.equal(r.status,200);const enq=r.data.enquiries.find(x=>x.reference===fixture.enquiryReference);assert(enq);fixture.enquiryId=enq.id;
 r=await call('/admin/enquiries/'+enq.id,'PATCH',{status:'Resolved'},true);assert.equal(r.status,200);check('enquiry review updates');
 r=await call('/admin/content/qa-'+fixture.nonce,'PUT',{title:'Synthetic test content',body:'Verification only',published:false},true);assert.equal(r.status,200);
 r=await call('/content');assert(!r.data.content.some(x=>x.section==='qa-'+fixture.nonce));check('draft content is excluded from public responses');
 r=await call('/admin/students','POST',{firstName:'Synthetic',lastName:'Verification',grade:'Grade 5',pathway:'Primary',parentEmail:fixture.email},true);assert.equal(r.status,200);fixture.studentRef=r.data.studentRef;check('student register writes');
 r=await call('/admin/documents/upload','POST',{applicationId:saved.id,fileName:'not-a-pdf.pdf',documentType:'Other',base64:Buffer.from('<script>test</script>').toString('base64')},true);assert.equal(r.status,400);check('document uploads validate content signatures');
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
 r=await call('/admin/documents/upload','POST',{applicationId:saved.id,fileName:'synthetic.pdf',documentType:'Other',base64:pdf.toString('base64')},true);assert.equal(r.status,200,JSON.stringify(r));fixture.document=r.data.document;
 r=await call('/admin/documents/'+fixture.document.id+'/link','GET',undefined,true);assert.equal(r.status,200,JSON.stringify(r));const download=await fetch(r.data.url);assert.equal(download.status,200);assert.equal(Buffer.from(await download.arrayBuffer()).toString(),pdf.toString());check('private upload, checked signed link and downloaded content');
 const publicFile=await fetch(url+'/storage/v1/object/public/ridgefield-documents/'+fixture.document.storage_path);assert.notEqual(publicFile.status,200);check('uploaded documents cannot be downloaded through public URLs');
 r=await call('/admin/documents/'+fixture.document.id,'PATCH',{status:'Verified',adminNote:'Synthetic verification'},true);assert.equal(r.status,200);check('document reviews persist');
 const escalation=await fetch(url+'/rest/v1/rf_staff?user_id=eq.'+fixture.userId,{method:'PATCH',headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({role:'admin'})});assert.equal(escalation.status,403);check('users cannot grant their own staff permissions through the Data API');
 fixture.results=results;fs.writeFileSync(fixturePath,JSON.stringify(fixture));
 console.log('LIVE CHECKS PASSED: '+results.length);
})().catch(error=>{fs.writeFileSync(fixturePath,JSON.stringify(fixture));console.error('LIVE CHECK FAILED:',error.message);process.exitCode=1});
