const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/rf-admin.js','utf8');
function element(){return {children:[],append(...xs){this.children.push(...xs)},prepend(...xs){this.children.unshift(...xs)},replaceChildren(){this.children=[]},setAttribute(){}};}
(async()=>{
 const app={id:'application-id',reference:'RIDC202600002',learner_first:'Synthetic',learner_last:'Learner',dob:'2012-01-01',pathway:'Cambridge',learner_grade:'IGCSE',guardian_name:'Guardian',guardian_email:'test@example.com',guardian_phone:'0000000000',status:'Accepted',payload:{'cambridge-subjects':'Mathematics'},created_at:new Date().toISOString()};
 const controls={appFilter:{value:''},appSearch:{value:'ridc202600002'},appRows:element()};const buttons=[];let reads=0,enrols=0,notification='';
 const ctx={URLSearchParams,Date,Promise,encodeURIComponent,byId:id=>controls[id],node:()=>element(),cell:(row)=>{const x=element();row.append(x);return x},empty:()=>{},select:()=>({value:'Accepted',setAttribute(){}}),button:(label,callback)=>{buttons.push({label,callback});return element()},message:x=>{notification=x},summary:async()=>{},request:async(path,options)=>{
  if(path.endsWith('/enrol')){enrols++;app.status='Enrolled';return {studentRef:app.reference};}
  if(options?.method==='PATCH')return {ok:true};
  assert(path.includes('number=RIDC202600002'));reads++;return {applications:[app]};
 },json:(method,value)=>({method,body:JSON.stringify(value)})};
 const start=source.indexOf('  async function applications()');const end=source.indexOf('  async function students()',start);
 vm.runInNewContext(source.slice(start,end)+'\nthis.run=applications;',ctx);
 await ctx.run();assert.equal(reads,1);
 await buttons.find(x=>x.label==='Save').callback();assert.equal(reads,2,'Saving must reload applications without shadowing the loader');
 await buttons.find(x=>x.label==='Enrol learner').callback();assert.equal(enrols,1);assert(notification.includes(app.reference));assert.equal(reads,3);
 console.log('PASS: permanent-number search, status-save reload and enrolment action');
})().catch(e=>{console.error(e);process.exitCode=1});
