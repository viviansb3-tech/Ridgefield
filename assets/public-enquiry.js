
(() => {
  const form=document.getElementById("ridgefieldEnquiry");
  if(!form)return;

  const status=document.createElement("p");
  status.className="rf-status rf-hidden";
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  form.appendChild(status);
  function setStatus(message){
    status.textContent=message;
    status.classList.toggle("rf-hidden",!message);
  }

  const DRAFT_KEY="rf_enquiry_draft";
  let dirty=false,submitted=false;
  const ref=form.querySelector('[name="enquiry-reference"]');
  const summary=form.querySelector('[name="admin-summary"]');
  const type=document.getElementById("enqType");
  const path=document.getElementById("enqPath");
  const priority=document.getElementById("enqUrgency");
  const contact=document.getElementById("enqContact");
  const notice=document.getElementById("enquiryDraftNotice");

  const phone=document.getElementById("enqPhone");
  const phoneLabel=document.getElementById("enqPhoneLabel");
  const phoneHint=document.getElementById("enqPhoneHint");
  function updatePhoneRequirement(){
    const required=contact.value==="Phone call";
    phone.required=required;
    phone.setAttribute("aria-required",String(required));
    phone.setCustomValidity(required && !phone.value.trim()?"Please provide a phone number so we can call you.":"");
    if(phoneLabel)phoneLabel.textContent=required?"Phone *":"Phone (optional)";
    if(phoneHint)phoneHint.textContent=required?"Enter the number the school should call.":"Required if you prefer a phone call.";
  }
  contact.addEventListener("change",updatePhoneRequirement);
  phone.addEventListener("input",updatePhoneRequirement);
  updatePhoneRequirement();

  function saveSafeDraft(){
    try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify({type:type.value,pathway:path.value}))}catch(e){}
  }
  function clearDraft(){try{sessionStorage.removeItem(DRAFT_KEY)}catch(e){}}

  [type,path].forEach(el=>el.addEventListener("change",()=>{dirty=true;saveSafeDraft()}));
  form.querySelectorAll("input,textarea,select").forEach(el=>{
    if(el.type==="hidden"||el.name==="bot-field")return;
    el.addEventListener("input",()=>{dirty=true;el.classList.remove("rf-field-error")});
    el.addEventListener("change",()=>{dirty=true;el.classList.remove("rf-field-error")});
  });

  try{
    const saved=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||"null");
    if(saved){
      if(saved.type&&[...type.options].some(o=>o.value===saved.type))type.value=saved.type;
      if(saved.pathway&&[...path.options].some(o=>o.value===saved.pathway))path.value=saved.pathway;
      if(notice){
        notice.textContent="Your previous enquiry category was restored in this tab. Contact details and message text are not stored.";
        notice.classList.remove("rf-hidden");
      }
    }
  }catch(e){}


  // Explicit request links take precedence over a previously saved category.
  const topics={
    fees:{type:"Fees",subject:"Request current fee schedule"},
    prospectus:{type:"Admissions",subject:"Request current digital prospectus"},
    tuition:{type:"Academics",subject:"Tuition and academic support enquiry"},
    visit:{type:"Admissions",subject:"Request a campus visit / consultation"},
    academics:{type:"Academics",subject:"Academic programme enquiry"},
    cambridge:{type:"Cambridge",defaultPathway:"Cambridge",subject:"Cambridge programme enquiry"},
    caps:{type:"CAPS Secondary",defaultPathway:"CAPS Secondary",subject:"CAPS Secondary enquiry"},
    primary:{type:"Primary",defaultPathway:"Primary",subject:"Primary school enquiry"},
    syllabus:{type:"Academics",subject:"Curriculum and syllabus enquiry"},
    books:{type:"Book Lists",subject:"Textbook and stationery enquiry"},
    general:{type:"General",subject:"General school enquiry"}
  };
  const query=new URLSearchParams(location.search);
  const topicKey=(query.get("topic")||"").toLowerCase();
  const topic=Object.prototype.hasOwnProperty.call(topics,topicKey)?topics[topicKey]:null;
  const requestedPath=query.get("pathway");
  const validPath=requestedPath && [...path.options].some(option=>option.value===requestedPath);
  if(topic || validPath){
    if(topic){
      if(!type.options || [...type.options].some(o=>o.value===topic.type))type.value=topic.type;
      const subject=document.getElementById("enqSubject");
      if(subject&&!subject.value)subject.value=topic.subject;
      // Do not silently attach a pathway remembered from a different enquiry.
      path.value=validPath?requestedPath:(topic.defaultPathway||"");
    }else if(validPath){path.value=requestedPath}
    saveSafeDraft();
    if(notice){
      notice.textContent="Your request details have been selected from the page you visited. You can change them below.";
      notice.classList.remove("rf-hidden");
    }
  }

  function isLocalEnquiryMailMode(){
    return location.hostname==="localhost" || location.hostname==="127.0.0.1";
  }

  async function sendEnquiryLocally(){
    const submit=form.querySelector('button[type="submit"]');
    if(submit){
      submit.disabled=true;
      submit.dataset.submitLock="true";
      submit.textContent="Sending enquiry…";
    }
    setStatus("Sending your enquiry…");
    try{
      const body=new URLSearchParams(new FormData(form));
      const response=await fetch("/api/send-enquiry",{
        method:"POST",
        body,
        headers:{
          "Accept":"application/json",
          "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"
        }
      });
      let result={};
      try{result=await response.json()}catch(e){}
      if(!response.ok || !result.ok){
        throw new Error(result.error || "The enquiry could not be sent.");
      }
      submitted=true;
      clearDraft();
      try{sessionStorage.setItem("rf_last_reference",ref.value);sessionStorage.setItem("rf_last_enq_reference",ref.value)}catch(e){}
      location.href="/enquiry-success.html?ref="+encodeURIComponent(ref.value);
    }catch(err){
      submitted=false;
      if(submit){
        submit.disabled=false;
        submit.removeAttribute("data-submit-lock");
        submit.textContent="Send enquiry";
      }
      setStatus("Your enquiry could not be sent. Your details are still here. Please try again or contact the school by phone.");
      submit?.focus();
    }
  }

  form.addEventListener("submit",async e=>{
    if(form.querySelector("[data-submit-lock]")){e.preventDefault();return}
    updatePhoneRequirement();
    if(!form.reportValidity()){e.preventDefault();return}
    if(!ref.value)ref.value=RidgefieldWorkflow.makeRef("RF-ENQ");
    const rows=[
      ["Enquiry reference",ref.value],
      ["Name",document.getElementById("enqName").value],
      ["Email",document.getElementById("enqEmail").value],
      ["Phone",document.getElementById("enqPhone").value||"Not supplied"],
      ["Type",type.value],["Pathway",path.value||"Not pathway-specific"],
      ["Subject",document.getElementById("enqSubject").value],
      ["Urgency",priority.value],["Preferred contact",contact.value],
      ["Message",document.getElementById("enqMessage").value]
    ];
    summary.value=rows.map(([k,v])=>`${k}: ${v}`).join("\n");
    if(isLocalEnquiryMailMode()){
      e.preventDefault();
      await sendEnquiryLocally();
      return;
    }

    submitted=true;
    try{sessionStorage.setItem("rf_last_reference",ref.value);sessionStorage.setItem("rf_last_enq_reference",ref.value)}catch(e){}
    clearDraft();
    const submit=form.querySelector('button[type="submit"]');
    if(submit){submit.disabled=true;submit.dataset.submitLock="true";submit.textContent="Sending…"}
    form.action="/enquiry-success.html?ref="+encodeURIComponent(ref.value);
  });

  window.addEventListener("pageshow",()=>{
    updatePhoneRequirement();
    submitted=false;
    const submit=form.querySelector('button[type="submit"]');
    if(submit){submit.disabled=false;submit.removeAttribute("data-submit-lock");submit.textContent="Send enquiry"}
    setStatus("");
  });

  window.addEventListener("beforeunload",e=>{
    if(dirty&&!submitted){
      e.preventDefault();
      e.returnValue="";
    }
  });
})();
