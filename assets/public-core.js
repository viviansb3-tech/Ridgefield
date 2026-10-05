/* ===== ridgefield-production.js ===== */
/* ---- phase77-modern-ui.js ---- */

(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const items=[...document.querySelectorAll("section > *, .card, .panel, article")].filter(el=>!el.closest(".rf-app-sidebar"));
  items.slice(0,120).forEach(el=>{
    el.style.opacity="0";
    el.style.transform="translateY(18px)";
    el.style.transition="opacity .6s cubic-bezier(.2,.8,.2,1),transform .6s cubic-bezier(.2,.8,.2,1)";
  });
  const io=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.style.opacity="1";
        e.target.style.transform="none";
        io.unobserve(e.target);
      }
    });
  },{threshold:.08,rootMargin:"0px 0px -4% 0px"});
  items.slice(0,120).forEach(el=>io.observe(el));
})();


/* ---- phase78-premium-polish.js ---- */

(() => {
  document.body.classList.add("rf78-ready");

  const header =
    document.querySelector(".rf75-topbar") ||
    document.querySelector(".rf-app-top") ||
    document.querySelector("header");

  const setScrolled=()=>{
    if(!header)return;
    header.classList.toggle("rf78-scrolled",window.scrollY>18);
  };
  setScrolled();
  window.addEventListener("scroll",setScrolled,{passive:true});

  // Improve external links and keyboard accessibility.
  document.querySelectorAll('a[target="_blank"]').forEach(a=>{
    const rel=(a.getAttribute("rel")||"").split(/\s+/).filter(Boolean);
    if(!rel.includes("noopener"))rel.push("noopener");
    if(!rel.includes("noreferrer"))rel.push("noreferrer");
    a.setAttribute("rel",rel.join(" "));
  });

  // Avoid double submissions on forms while keeping native validation.
  document.querySelectorAll("form").forEach(form=>{
    if(["ridgefieldApplication","ridgefieldEnquiry"].includes(form.id))return;
    form.addEventListener("submit",()=>{
      const btn=form.querySelector('button[type="submit"],input[type="submit"]');
      if(!btn)return;
      setTimeout(()=>{
        if(form.checkValidity()){
          btn.dataset.rf78Label=btn.textContent||btn.value||"";
          if(btn.tagName==="BUTTON")btn.textContent="Processing…";
          else btn.value="Processing…";
          btn.disabled=true;
        }
      },0);
    });
  });

  // Restore controls if navigation returns via back-forward cache.
  window.addEventListener("pageshow",()=>{
    document.querySelectorAll("[data-rf78-label]").forEach(btn=>{
      if(btn.tagName==="BUTTON")btn.textContent=btn.dataset.rf78Label;
      else btn.value=btn.dataset.rf78Label;
      btn.disabled=false;
      delete btn.dataset.rf78Label;
    });
  });
})();


/* ===== phase83-mobile-final.js ===== */

(() => {
  // Wrap wide tables automatically.
  document.querySelectorAll("table").forEach(table=>{
    if(table.parentElement?.classList.contains("rf83-table-scroll")) return;
    const wrap=document.createElement("div");
    wrap.className="rf83-table-scroll";
    wrap.style.overflowX="auto";
    wrap.style.webkitOverflowScrolling="touch";
    table.parentNode.insertBefore(wrap,table);
    wrap.appendChild(table);
  });

  // Close app sidebar when a nav link is selected on small screens.
  document.querySelectorAll(".rf-app-sidebar a").forEach(a=>{
    a.addEventListener("click",()=>{
      if(window.innerWidth<=850){
        document.getElementById("rfAppSidebar")?.classList.remove("open");
      }
    });
  });

  // Prevent accidental double-tap zoom on controls is intentionally avoided;
  // preserve native browser accessibility/zoom.
})();


/* ===== phase84-performance.js ===== */

(() => {
  // Lazy-load images/iframes that are not marked eager.
  document.querySelectorAll("img:not([loading]), iframe:not([loading])").forEach(el=>{
    if(!el.closest(".hero,[class*='hero']")) el.setAttribute("loading","lazy");
  });

  // Decode images asynchronously where supported.
  document.querySelectorAll("img:not([decoding])").forEach(img=>img.setAttribute("decoding","async"));

  // Preconnect only when known third-party resources are actually used.
  const thirdParty=[...document.querySelectorAll("script[src^='http'],link[href^='http']")]
    .map(el=>new URL(el.src||el.href).origin);
  [...new Set(thirdParty)].forEach(origin=>{
    if(document.querySelector(`link[rel="preconnect"][href="${origin}"]`))return;
    const l=document.createElement("link");
    l.rel="preconnect";l.href=origin;l.crossOrigin="";
    document.head.appendChild(l);
  });
})();


/* ===== phase86-accessibility.js ===== */

(() => {
  // Ensure a main landmark exists.
  let main=document.querySelector("main");
  if(!main){
    main=document.createElement("main");
    main.id="main-content";
    const movable=[...document.body.children].filter(el=>!["SCRIPT","STYLE"].includes(el.tagName));
    movable.forEach(el=>main.appendChild(el));
    document.body.prepend(main);
  }
  if(!main.id) main.id="main-content";

  // Add skip link once if not already present in static HTML.
  if(!document.querySelector(".rf86-skip, .skip-link, a[href^='#main']")){
    const skip=document.createElement("a");
    skip.className="rf86-skip";
    skip.href="#"+main.id;
    skip.textContent="Skip to main content";
    document.body.prepend(skip);
  }

  // Ensure images have alt attributes; empty alt for decorative/unlabelled assets.
  document.querySelectorAll("img:not([alt])").forEach(img=>img.setAttribute("alt",""));

  // Infer labels for unlabeled form controls when possible; skip hidden/administrative controls.
  document.querySelectorAll("input,select,textarea").forEach((el,i)=>{
    if(
      el.type==="hidden" ||
      el.hidden ||
      el.hasAttribute?.("hidden") ||
      el.getAttribute?.("aria-hidden")==="true" ||
      el.classList?.contains?.("rf-hidden") ||
      el.closest?.("[hidden], [aria-hidden='true'], .rf-hidden")
    ) return;
    if(!el.id) el.id="rf86-field-"+i;
    const hasLabel=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if(!hasLabel){
      const parentLabel=el.closest?.("label");
      if(parentLabel) return;
      const label=document.createElement("label");
      label.setAttribute("for",el.id);
      label.className="rf86-sr-only";
      label.textContent=el.getAttribute("placeholder")||el.getAttribute("name")||"Form field";
      el.parentNode.insertBefore(label,el);
    }
  });

  // Mark required fields semantically if HTML already says required in surrounding text.
  document.querySelectorAll("[required]").forEach(el=>el.setAttribute("aria-required","true"));

  // Buttons/links with icon-only content get fallback accessible names.
  document.querySelectorAll("button,a").forEach(el=>{
    const text=(el.textContent||"").trim();
    if(!text && !el.getAttribute("aria-label")){
      const title=el.getAttribute("title");
      el.setAttribute("aria-label",title||"Action");
    }
  });

  // Dynamic messages should be announced.
  ["msg","error","success","result","content"].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&!el.getAttribute("aria-live")) el.setAttribute("aria-live","polite");
  });

  // Tables: identify headers.
  document.querySelectorAll("table thead th").forEach(th=>th.setAttribute("scope","col"));

  // External new-window links announce behavior.
  document.querySelectorAll('a[target="_blank"]').forEach(a=>{
    if(!a.getAttribute("aria-label")){
      a.setAttribute("aria-label",((a.textContent||"Link").trim())+" (opens in a new tab)");
    }
  });
})();


/* ===== public-workflow.js ===== */

(() => {
  function pad(n){return String(n).padStart(2,"0")}
  function token(){
    if(window.crypto?.getRandomValues){
      const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0].toString(36).toUpperCase().slice(-5);
    }
    return Math.random().toString(36).slice(2,7).toUpperCase();
  }
  function makeRef(prefix){
    const d=new Date();
    return `${prefix}-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${token()}`;
  }
  function showReference(){
    const el=document.querySelector("[data-reference-output]");
    if(!el)return;
    const p=new URLSearchParams(location.search);
    const path = (typeof location !== 'undefined' && location.pathname) || '';
    const docTitle = (typeof document !== 'undefined' && document.title) || '';
    const isApp = path.includes("application-success") || docTitle.includes("Application");
    const isEnq = path.includes("enquiry-success") || docTitle.includes("Enquiry");
    let ref=p.get("ref")||"";
    if(ref){
      if(isApp && !ref.startsWith("RF-APP")) ref="";
      if(isEnq && !ref.startsWith("RF-ENQ")) ref="";
    }
    if(!ref){
      try{
        if(isApp) ref=sessionStorage.getItem("rf_last_app_reference")||"";
        else if(isEnq) ref=sessionStorage.getItem("rf_last_enq_reference")||"";
        else ref=sessionStorage.getItem("rf_last_reference")||"";
      }catch(e){}
    }
    if(ref){el.textContent=ref;document.querySelector("[data-reference-wrap]")?.classList.remove("rf-hidden")}
  }
  window.RidgefieldWorkflow={makeRef,showReference};
  document.addEventListener("DOMContentLoaded",showReference);
})();


/* ===== public-architecture.js ===== */

(() => {
  const nav=document.querySelector(".rf-public-nav");
  const menu=document.querySelector(".rf-public-menu");
  if(nav&&menu&&!document.querySelector('[data-rf-header]')){
    menu.addEventListener("click",()=>{
      const open=nav.classList.toggle("open");
      menu.setAttribute("aria-expanded",String(open));
      menu.setAttribute("aria-label",open?"Close navigation":"Open navigation");
      menu.textContent=open?"×":"☰";
    });
    document.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&nav.classList.contains("open")){
        nav.classList.remove("open");
        menu.setAttribute("aria-expanded","false");
        menu.textContent="☰";
        menu.focus();
      }
    });
  }

  // Active navigation state
  const current=(location.pathname.split("/").pop()||"index.html").toLowerCase();
  document.querySelectorAll(".rf-public-header a").forEach(a=>{
    const href=(a.getAttribute("href")||"").split("#")[0].toLowerCase();
    if(href===current)a.setAttribute("aria-current","page");
  });

  // External links are explicitly identified.
  document.querySelectorAll('a[href^="http"]').forEach(a=>{
    try{
      if(new URL(a.href).origin!==location.origin){
        a.rel="noopener noreferrer";
      }
    }catch(e){}
  });

  // Preserve application source so Ridgefield can see which public page led to Apply.
  document.querySelectorAll('a[href="apply.html"]').forEach(a=>{
    a.addEventListener("click",()=>{
      try{sessionStorage.setItem("rf_apply_source",current)}catch(e){}
    });
  });
  const source=document.querySelector('input[name="application-source"]');
  if(source){
    try{source.value=sessionStorage.getItem("rf_apply_source")||"direct"}catch(e){source.value="direct"}
  }
})();


/* ===== release-version.js ===== */
window.RIDGEFIELD_RELEASE={"release":"B-ANTIGRAVITY-MERGED","buildId":"B-ANTIGRAVITY-MERGED-20260928T000000Z","generatedAt":"2026-09-28T00:00:00.000000+00:00","branch":"B","profile":"static-public-production","productionDomain":"https://www.ridgefieldacademy.co.za","stage":"production-release-candidate","pathways":{"cambridge":true,"capsSecondary":true,"primary":true},"conversionReadiness":true,"antigravityMerge":"validated-selective"};


/* ===== B7 conversion & workflow UX ===== */
(() => {
  const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
  const excluded=new Set([
    "apply.html","contact.html","application-success.html","enquiry-success.html",
    "search.html","status.html","404.html","netlify-forms.html"
  ]);
  if(!excluded.has(page) && !document.querySelector(".rf-conversion-bar")){
    const bar=document.createElement("nav");
    bar.className="rf-conversion-bar";
    bar.setAttribute("aria-label","Admissions quick actions");
    bar.innerHTML='<a class="rf-conversion-enquire" href="contact.html">Enquire</a><a class="rf-conversion-apply" href="apply.html">Apply now</a>';
    document.body.appendChild(bar);
    document.body.classList.add("rf-has-conversion-bar");
  }

  // Keep the browser back/forward cache experience clean.
  window.addEventListener("pageshow",()=>{
    document.querySelectorAll("button[disabled][data-submit-lock]").forEach(b=>{
      b.disabled=false;b.removeAttribute("data-submit-lock");
    });
  });
})();


/* ===== B7 success cleanup ===== */
(() => {
  const page=(location.pathname.split("/").pop()||"").toLowerCase();
  try{
    if(page==="application-success.html")sessionStorage.removeItem("rf_application_draft");
    if(page==="enquiry-success.html")sessionStorage.removeItem("rf_enquiry_draft");
  }catch(e){}
})();
