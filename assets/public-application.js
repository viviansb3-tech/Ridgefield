
(() => {
  const form=document.getElementById("ridgefieldApplication");
  if(!form)return;
  // Validate visible steps ourselves; native validation cannot focus hidden fields.
  form.noValidate=true;
  const birthDate=document.getElementById("dateOfBirth");
  const today=new Date();
  birthDate.max=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");

  const pathways={
    Cambridge:{
      campus:"25 Wilcock Road, Noordhoek",
      grades:["Pre-IGCSE (Grade 8)","IGCSE (Grades 9–10)","AS Level (Grades 11–12)"],
      docs:["Birth certificate / ID","Latest school report","Proof of address","Relevant Cambridge records (if applicable)"],
      conditional:["cambridgeExperience","cambridgeSubjects"]
    },
    "CAPS Secondary":{
      campus:"22 Maartens Street",
      grades:["Grade 8","Grade 9","Grade 10","Grade 11","Grade 12 (consultation required)"],
      docs:["Birth certificate / ID","Latest school report","Proof of address","Transfer / leaving documentation (if applicable)"],
      conditional:["capsCurrentGrade","capsSupport"]
    },
    Primary:{
      campus:"22 Maartens Street",
      grades:["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7"],
      docs:["Birth certificate / ID","Latest school report (Grades 2–7)","Proof of address","Clinic / immunisation card (Primary)"],
      conditional:["primaryCurrentGrade","primarySupport"]
    }
  };

  const DRAFT_KEY="rf_application_draft";
  const REQUEST_KEY="rf_application_request_id";
  let current=1, pathway="", submitted=false, dirty=false;
  const sections=[...document.querySelectorAll("[data-app-step]")];
  const progress=[...document.querySelectorAll(".rf-apply-step")];
  const grade=document.getElementById("gradeApplying");
  const campus=document.getElementById("campusDisplay");
  const hiddenCampus=document.getElementById("campus");
  const hiddenPathway=document.getElementById("pathway");
  const docs=document.getElementById("documentGuide");
  const status=document.getElementById("formStatus");
  const refInput=document.getElementById("applicationReference");
  const summaryInput=document.getElementById("adminSummary");
  const sourceInput=document.querySelector('input[name="application-source"]');
  const draftNotice=document.getElementById("draftNotice");

  function setStatus(msg,focusTarget){
    status.textContent=msg||"";
    status.classList.toggle("rf-hidden",!msg);
    status.classList.toggle("rf-form-error-summary",!!msg);
    if(msg && focusTarget){
      focusTarget.classList.add("rf-field-error");
      focusTarget.setAttribute("aria-invalid","true");
      focusTarget.focus();
    }
  }

  form.querySelectorAll("input,select,textarea").forEach(el=>{
    if(el.type==="hidden"||el.name==="bot-field")return;
    el.addEventListener("input",()=>{dirty=true;el.classList.remove("rf-field-error");el.removeAttribute("aria-invalid")});
    el.addEventListener("change",()=>{dirty=true;el.classList.remove("rf-field-error");el.removeAttribute("aria-invalid")});
  });

  function saveSafeDraft(){
    try{
      sessionStorage.setItem(DRAFT_KEY,JSON.stringify({pathway,grade:grade.value||""}));
    }catch(e){}
  }

  function clearDraft(){
    try{sessionStorage.removeItem(DRAFT_KEY);sessionStorage.removeItem(REQUEST_KEY)}catch(e){}
  }

  function updateProgress(n){
    progress.forEach((step,i)=>{
      const num=i+1;
      step.classList.toggle("active",num===n);
      step.classList.toggle("done",num<n);
      if(num===n)step.setAttribute("aria-current","step");
      else step.removeAttribute("aria-current");
    });
  }

  function showStep(n){
    current=n;
    sections.forEach(s=>s.classList.toggle("rf-hidden",Number(s.dataset.appStep)!==n));
    updateProgress(n);
    setStatus("");
    const target=document.querySelector("[data-app-step='"+n+"']");
    target?.focus?.({preventScroll:true});
    window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
    if(n===6)buildSummary();
  }

  function updateConditional(){
    document.querySelectorAll("[data-pathway-fields]").forEach(box=>{
      const active=box.dataset.pathwayFields===pathway;
      box.classList.toggle("rf-hidden",!active);
      box.querySelectorAll("input,select,textarea").forEach(el=>{
        el.disabled=!active;
        if(active)el.setAttribute("required","");
        else{
          el.removeAttribute("required");
          el.classList.remove("rf-field-error");el.removeAttribute("aria-invalid");
        }
      });
    });
  }

  function selectPathway(value,card,restoredGrade=""){
    if(!pathways[value])return;
    const samePathway = (pathway === value);
    const gradeToRestore = restoredGrade || (samePathway ? grade.value : "");
    pathway=value;
    document.querySelectorAll(".rf-apply-path").forEach(c=>{
      const selected=c===card || c.dataset.pathway===value;
      c.classList.toggle("active",selected);
      c.setAttribute("aria-pressed",String(selected));
    });
    hiddenPathway.value=pathway;
    hiddenCampus.value=pathways[pathway].campus;
    campus.textContent="Campus: "+pathways[pathway].campus;
    grade.innerHTML='<option value="">Select grade / level</option>'+pathways[pathway].grades.map(g=>`<option value="${g}">${g}</option>`).join("");
    if(gradeToRestore && pathways[pathway].grades.includes(gradeToRestore))grade.value=gradeToRestore;
    docs.innerHTML="<strong>Prepare for your admissions consultation:</strong><br>"+pathways[pathway].docs.join(" · ");
    // Update Step 5 checklist item labels to be pathway-specific
    const addTitle=document.getElementById("docAdditionalTitle");
    const addHint=document.getElementById("docAdditionalHint");
    const reportHint=document.querySelector('[name="document-prep-report"]')?.closest("label")?.querySelector("small");
    if(addTitle && addHint){
      if(pathway==="Primary"){
        addTitle.textContent="Clinic / immunisation card";
        addHint.textContent="Provide the Road to Health booklet or immunisation record for your child.";
      } else if(pathway==="Cambridge"){
        addTitle.textContent="Cambridge / transfer records";
        addHint.textContent="Any previous Cambridge result slips, IGCSE certificates, or transfer documents where applicable.";
      } else {
        addTitle.textContent="Transfer / leaving documentation";
        addHint.textContent="Transfer or leaving certificate from the previous school, where applicable.";
      }
    }
    if(reportHint){
      reportHint.textContent=pathway==="Primary"
        ? "Prepare the most recent available school report (Grades 2–7; not required for Grade 1)."
        : "Prepare the most recent available report (Grades 2–12).";
    }
    updateConditional();
    saveSafeDraft();
  }


  document.querySelectorAll(".rf-apply-path").forEach(card=>{
    card.addEventListener("click",()=>selectPathway(card.dataset.pathway,card));
  });
  grade.addEventListener("change",saveSafeDraft);

  function checkIds(ids){
    for(const id of ids){
      const el=document.getElementById(id);
      if(!el || !String(el.value||"").trim()){
        setStatus("Please complete the highlighted field before continuing.",el);
        return false;
      }
      if(!el.checkValidity()){
        setStatus(el.type==="email"?"Please enter a valid email address.":"Please check the highlighted field.",el);
        return false;
      }
    }
    return true;
  }

  function quizComplete(){
    for(const name of ["q1","q2","q3","q4","q5","q6"]){
      if(!form.querySelector(`input[name="${name}"]:checked`)){
        const first=form.querySelector(`input[name="${name}"]`);
        setStatus("Please answer every admissions questionnaire item.",first);
        return false;
      }
    }
    const cfg=pathways[pathway];
    if(cfg && !checkIds(cfg.conditional))return false;
    return true;
  }


  function validateStep(step){
    if(step===1){
      if(!pathway){setStatus("Please select Cambridge, CAPS Secondary or Primary.",document.querySelector(".rf-apply-path"));return false}
      if(!grade.value){setStatus("Please select the grade or level.",grade);return false}
    }
    if(step===2 && !checkIds(["learnerFirstName","learnerLastName","dateOfBirth","currentSchool"]))return false;
    if(step===3 && !checkIds(["guardianName","guardianEmail","guardianPhone","preferredStart"]))return false;
    if(step===4 && !quizComplete())return false;
    return true;
  }

  document.querySelectorAll("[data-next]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      if(validateStep(current))showStep(Number(btn.dataset.next));
    });
  });
  document.querySelectorAll("[data-back]").forEach(btn=>btn.addEventListener("click",()=>showStep(Number(btn.dataset.back))));

  function val(id){return document.getElementById(id)?.value?.trim()||""}
  function radio(name){return form.querySelector(`input[name="${name}"]:checked`)?.value||""}
  function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
  function preparedDocuments(){
    const labels={
      "document-prep-report":"Latest school report",
      "document-prep-id":"Birth certificate / learner ID",
      "document-prep-address":"Proof of address",
      "document-prep-additional":"Programme-specific records"
    };
    return [...form.querySelectorAll('input[name^="document-prep-"]:checked')].map(el=>labels[el.name]).filter(Boolean);
  }
  function conditionalRows(){
    if(pathway==="Cambridge")return [["Current Cambridge experience",val("cambridgeExperience")],["Cambridge subjects of interest",val("cambridgeSubjects")]];
    if(pathway==="CAPS Secondary")return [["Current CAPS grade",val("capsCurrentGrade")],["CAPS support priority",val("capsSupport")]];
    return [["Current primary grade",val("primaryCurrentGrade")],["Primary support priority",val("primarySupport")]];
  }

  function buildSummary(){
    if(!refInput.value){
      try{refInput.value=sessionStorage.getItem(REQUEST_KEY)||""}catch(e){}
      if(!refInput.value)refInput.value=RidgefieldWorkflow.makeRef("RF-APP");
      try{sessionStorage.setItem(REQUEST_KEY,refInput.value)}catch(e){}
    }
    const rows=[
      ["Application reference",refInput.value],
      ["Pathway",pathway],["Campus",hiddenCampus.value],["Grade / level",grade.value],
      ["Learner",val("learnerFirstName")+" "+val("learnerLastName")],["Date of birth",val("dateOfBirth")],
      ["Current school",val("currentSchool")],["Main enquiry",val("mainEnquiry")||"Not supplied"],
      ["Guardian",val("guardianName")],["Guardian email",val("guardianEmail")],["Guardian phone",val("guardianPhone")],
      ["Preferred start",val("preferredStart")],
      ["Reason for enquiry",radio("q1")],["Learner confidence",radio("q2")],["Support priority",radio("q3")],
      ["Preferred contact",radio("q4")],["Response urgency",radio("q5")],["Visit preference",radio("q6")],
      ...conditionalRows(),
      ["Documents prepared for consultation",preparedDocuments().join(", ")||"Not confirmed in this form"],
      ["Application source",sourceInput?.value||"direct"]
    ];
    const groups=[
      {title:"Programme",step:1,rows:rows.slice(1,4)},
      {title:"Learner details",step:2,rows:rows.slice(4,8)},
      {title:"Parent / guardian",step:3,rows:rows.slice(8,12)},
      {title:"Admissions questionnaire",step:4,rows:rows.slice(12,20)},
      {title:"Document preparation",step:5,rows:rows.slice(20,21)}
    ];
    document.getElementById("applicationSummary").innerHTML=groups.map(group=>`
      <div class="rf-review-group">
        <div class="rf-review-heading"><h3>${group.title}</h3>
          <button type="button" class="rf-review-edit" data-review-edit="${group.step}" aria-label="Edit ${group.title}">Edit</button>
        </div>
        ${group.rows.map(([key,value])=>`<div class="rf-summary-row"><strong>${esc(key)}</strong><span>${esc(value)}</span></div>`).join("")}
      </div>`).join("");
    summaryInput.value=rows.map(([k,v])=>`${k}: ${v}`).join("\n");
    document.getElementById("quizSummary").value=rows.slice(12,20).map(([k,v])=>`${k}: ${v}`).join("\n");
  }


  document.getElementById("applicationSummary").addEventListener("click",event=>{
    const button=event.target.closest("[data-review-edit]");
    if(!button || current!==6)return;
    const step=Number(button.dataset.reviewEdit);
    if(Number.isInteger(step) && step>=1 && step<=5)showStep(step);
  });

  function isLocalMailMode(){
    return !!window.RidgefieldBaas?.enabled;
  }

  async function sendApplicationLocally(){
    const submit=form.querySelector('button[type="submit"]');
    if(submit){
      submit.disabled=true;
      submit.dataset.submitLock="true";
      submit.textContent="Sending application…";
    }
    setStatus("Sending your application to Ridgefield Academy…");
    try{
      const body=new URLSearchParams();
      new FormData(form).forEach((value,key)=>body.append(key,String(value)));
      if(!window.RidgefieldBaas?.enabled)throw new Error("The admissions service is unavailable. Please reload and try again.");
      const response=await window.RidgefieldBaas.request("/send-application",{
        method:"POST",
        body,
        headers:{"Accept":"application/json"}
      });
      let result={};
      try{result=await response.json()}catch(e){}
      if(!response.ok || !result.ok){
        throw new Error(result.error || "The application could not be sent.");
      }
      const permanentNumber=result.studentNumber||result.reference;
      if(!/^RIDC\d{9,}$/.test(permanentNumber||""))throw new Error("The service did not confirm a permanent learner number. Please try again.");
      submitted=true;
      clearDraft();
      try{sessionStorage.setItem("rf_last_reference",permanentNumber);sessionStorage.setItem("rf_last_app_reference",permanentNumber);sessionStorage.setItem("rf_last_student_number",permanentNumber);}catch(e){}
      location.href="/application-success.html?ref="+encodeURIComponent(permanentNumber);
    }catch(err){
      submitted=false;
      if(submit){
        submit.disabled=false;
        submit.removeAttribute("data-submit-lock");
        submit.textContent="Send application";
      }
      setStatus(
        "The application was not sent. "+(err?.message||"Please try again or contact the school."),
        submit
      );
    }
  }

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(form.querySelector('[data-submit-lock]')){e.preventDefault();return}
    // Enter advances the current step; only the review step can send.
    if(current<6){
      e.preventDefault();
      if(validateStep(current))showStep(current+1);
      return;
    }
    // Recheck all earlier steps and reveal the first field needing attention.
    for(let step=1;step<=4;step++){
      showStep(step);
      if(!validateStep(step)){e.preventDefault();return}
    }
    showStep(6);
    if(!document.getElementById("privacyConsent").checked){
      e.preventDefault();setStatus("Please confirm the privacy consent before submitting.",document.getElementById("privacyConsent"));return;
    }
    buildSummary();

    if(isLocalMailMode()){
      await sendApplicationLocally();
      return;
    }
    setStatus("The admissions service is unavailable. Your details are still here. Please reload and try again.");
  });

  window.addEventListener("pageshow",()=>{
    submitted=false;
    const submit=form.querySelector('button[type="submit"]');
    if(submit){submit.disabled=false;submit.removeAttribute("data-submit-lock");submit.textContent="Send application"}
  });

  window.addEventListener("beforeunload",e=>{
    if(dirty&&!submitted){
      e.preventDefault();
      e.returnValue="";
    }
  });

  const query=new URLSearchParams(location.search);
  const requestedPathway=query.get("pathway")||"";
  const requestedGrade=query.get("grade")||"";
  const requestedSource=query.get("source")||"";

  if(sourceInput){
    let source="direct";
    if(/^[a-z0-9-]{1,64}$/i.test(requestedSource)) source=requestedSource;
    else{
      try{source=sessionStorage.getItem("rf_apply_source")||"direct"}catch(e){}
    }
    sourceInput.value=source;
  }

  // Prefer an explicit pathway from a Ridgefield pathway page.
  let restoredFromUrl=false;
  if(requestedPathway && pathways[requestedPathway]){
    const card=document.querySelector(`.rf-apply-path[data-pathway="${CSS.escape(requestedPathway)}"]`);
    selectPathway(requestedPathway,card,requestedGrade);
    restoredFromUrl=true;
    if(draftNotice){
      draftNotice.textContent=requestedPathway+" was selected from the pathway page. Confirm the grade or level before continuing.";
      draftNotice.classList.remove("rf-hidden");
    }
  }

  // Otherwise restore only the non-sensitive programme selection in this browser tab.
  if(!restoredFromUrl){
    try{
      const saved=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||"null");
      if(saved?.pathway&&pathways[saved.pathway]){
        const card=document.querySelector(`.rf-apply-path[data-pathway="${CSS.escape(saved.pathway)}"]`);
        selectPathway(saved.pathway,card,saved.grade||"");
        if(draftNotice){
          draftNotice.textContent="Your previous programme selection was restored in this tab. Personal details are not stored for recovery.";
          draftNotice.classList.remove("rf-hidden");
        }
      }
    }catch(e){}
  }

  updateConditional();
  document.querySelectorAll(".rf-apply-path").forEach(card=>card.setAttribute("aria-pressed",String(card.dataset.pathway===pathway)));
  showStep(1);
})();
