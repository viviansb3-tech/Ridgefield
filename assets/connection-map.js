(() => {
  const rows = [
    ['apply','Public pages','Submit application','apply.html','POST /send-application','Ridgefield API','rf_applications + learner-number ledger','Implemented','Validates and saves the application; returns the permanent learner number.'],
    ['enquiry','Public pages','Send enquiry','contact.html','POST /send-enquiry','Ridgefield API','rf_enquiries','Implemented','Saves the enquiry and returns a reference.'],
    ['login','School admin','Staff sign-in','admin.html','POST /auth/v1/token; GET /me','Supabase Auth + Ridgefield API','Auth account + rf_staff membership','Implemented','The API checks the signed-in account and active staff membership.'],
    ['dashboard','School admin','Dashboard','admin.html#dashboard','GET /admin/summary','Ridgefield API','rf_applications + rf_students','Implemented','Shows authorised staff the admissions and learner counts.'],
    ['applications','School admin','Applications / Save status','admin.html#applications','GET /admin/applications; PATCH /admin/applications/:id','Ridgefield API','rf_applications + rf_audit','Implemented','Reviews application details and updates status.'],
    ['enrol','School admin','Enrol learner','admin.html#applications','POST /admin/applications/:id/enrol','Ridgefield API','rf_enrol_application → rf_students','Implemented','Administrator enrolment retains the same learner number. It does not create a notebook account.'],
    ['enquiries','School admin','Enquiries / Save','admin.html#enquiries','GET /admin/enquiries; PATCH /admin/enquiries/:id','Ridgefield API','rf_enquiries + rf_audit','Implemented','Reviews and updates enquiry status.'],
    ['documents','School admin','Upload / Review / View document','admin.html#documents','POST /admin/documents/upload; PATCH /admin/documents/:id; GET /admin/documents/:id/link','Ridgefield API + private storage','rf_documents + ridgefield-documents bucket','Implemented','Authorised staff upload and review files. Viewing links expire after 60 seconds.'],
    ['students','School admin','Students / Add student','admin.html#students','GET /admin/students; POST /admin/students','Ridgefield API','rf_students + learner-number ledger','Implemented','Manual additions issue a permanent number; application enrolment reuses the existing number.'],
    ['content','School admin','Save website content','admin.html#content','GET /admin/content; PUT /admin/content/:key','Ridgefield API','rf_content','Implemented','Saves drafts and publication status. Static pages are not automatically rewritten.'],
    ['math','Mathematics','Notebook sign-in / School portal',null,'/ridgefield/login → /ridgefield/portal','Notebook authentication + school permissions','Separate approved notebook memberships','Local preview pending','Local notebook routes exist. No running notebook origin has been verified; school and notebook sessions remain separate.'],
    ['mathadmin','Mathematics','Notebook access administration',null,'/ridgefield/admin','Notebook access administration','Approved roles, subjects and academic year','Local preview pending','An authorised notebook administrator approves access. School enrolment is not an automatic grant.'],
    ['mathrecords','Mathematics','Assignments / Marks / Reports',null,'/ridgefield/records → /api/ridgefield','Notebook school service','Notebook records and report storage','Local preview pending','Implemented in the notebook checkout. The local school-to-notebook browser flow still needs verification.'],
    ['humanities','Other services','Humanities books / Teacher / Admin','humanities/index.html','/api/humanities/auth/login; /modules; /teacher/resources; /admin/enrolments','Local humanities service','Local SQLite + private resources','Separate local service','Uses its own accounts and enrolments, separate from school administration and mathematics.'],
    ['legacy','Other services','Student / Teacher portals','student-portal.html','/api/auth/login; /api/auth/teacher-login; /api/portal/me; /api/teacher/dashboard','Legacy portal service','Legacy learner, marks and attendance data','Separate service','These pages are not migrated to the school Supabase backend. Their matching server must run.'],
    ['cloudflare','Other services','Cloudflare',null,'No application route configured','Hosting / routing configuration','No school data connection configured','Not connected','Opening Cloudflare does not connect the services. No Cloudflare deployment or tunnel is configured by this map.']
  ];
  const list = document.getElementById('connections');
  const detail = document.getElementById('connectionDetail');
  const el = (tag,text,cls) => {const n=document.createElement(tag); if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  function render(group='All') {
    list.replaceChildren();
    rows.filter(r=>group==='All'||r[1]===group).forEach(r=>{
      const line=el('article',null,'connection');
      const front=el('a',r[2],'map-node front');front.href='#'+r[0];front.append(el('small',r[1]));
      const arrow=el('span','→','arrow');arrow.setAttribute('aria-hidden','true');
      const back=el('a',r[5],'map-node');back.href='#'+r[0];back.append(el('small',r[7]));
      const arrow2=arrow.cloneNode(true);const data=el('span',r[6],'map-node data');
      line.append(front,arrow,back,arrow2,data);list.append(line);
    });
  }
  function select(){
    const r=rows.find(r=>r[0]===location.hash.slice(1));if(!r)return;
    detail.hidden=false;detail.replaceChildren(el('span',r[7],'badge'),el('h2',r[2]),el('p',r[8]));
    const dl=el('dl');[['Frontend',r[3]||r[4]],['Backend service',r[5]],['Route / operation',r[4]],['Stored in',r[6]]].forEach(([k,v])=>dl.append(el('dt',k),el('dd',v)));detail.append(dl);
    if(r[3]){const a=el('a','Open frontend page →','action');a.href=r[3];detail.append(a);}
    const note=el('p','Route labels document the connection; selecting a node never submits data or changes records.','muted');detail.append(note);
    detail.scrollIntoView({block:'nearest',behavior:'auto'});
  }
  document.querySelectorAll('[data-group]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-group]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render(b.dataset.group);}));
  window.addEventListener('hashchange',select);render();select();
})();
