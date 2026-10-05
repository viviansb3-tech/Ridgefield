
(() => {
  "use strict";
  const header=document.querySelector("[data-rf-header]");
  if(!header)return;

  const menu=header.querySelector(".rf-public-menu");
  const drawer=document.getElementById("rfMobileDrawer");
  const sections=[...header.querySelectorAll(".rf-nav-section")];

  const closeMega=(except=null)=>{
    sections.forEach(sec=>{
      if(sec===except)return;
      sec.classList.remove("is-open");
      sec.querySelector("[data-nav-toggle]")?.setAttribute("aria-expanded","false");
    });
  };

  sections.forEach(sec=>{
    const toggle=sec.querySelector("[data-nav-toggle]");
    if(!toggle)return;
    toggle.addEventListener("click",e=>{
      e.stopPropagation();
      const open=!sec.classList.contains("is-open");
      closeMega(sec);
      sec.classList.toggle("is-open",open);
      toggle.setAttribute("aria-expanded",String(open));
      if(open)sec.querySelector(".rf-nav-item")?.focus({preventScroll:true});
    });
    sec.addEventListener("mouseenter",()=>{
      if(matchMedia("(hover:hover) and (min-width:981px)").matches){
        closeMega(sec);sec.classList.add("is-open");toggle.setAttribute("aria-expanded","true");
      }
    });
    sec.addEventListener("mouseleave",()=>{
      if(matchMedia("(hover:hover) and (min-width:981px)").matches){
        sec.classList.remove("is-open");toggle.setAttribute("aria-expanded","false");
      }
    });
  });

  const setDrawer=open=>{
    if(!menu||!drawer)return;
    menu.setAttribute("aria-expanded",String(open));
    menu.setAttribute("aria-label",open?"Close navigation":"Open navigation");
    if(open)drawer.removeAttribute("hidden");
    else drawer.setAttribute("hidden","");
    document.documentElement.classList.toggle("rf-menu-open",open);
  };

  menu?.addEventListener("click",e=>{
    e.stopPropagation();
    setDrawer(menu.getAttribute("aria-expanded")!=="true");
  });
  drawer?.addEventListener("click",e=>{
    if(e.target.closest("a"))setDrawer(false);
  });

  document.addEventListener("click",e=>{
    if(!e.target.closest(".rf-nav-section"))closeMega();
    if(menu&&drawer&&menu.getAttribute("aria-expanded")==="true"&&!header.contains(e.target))setDrawer(false);
  });

  document.addEventListener("keydown",e=>{
    if(e.key!=="Escape")return;
    closeMega();
    if(menu?.getAttribute("aria-expanded")==="true"){setDrawer(false);menu.focus()}
  });

  matchMedia("(min-width:981px)").addEventListener("change",e=>{if(e.matches)setDrawer(false)});

  const scrolled=()=>header.classList.toggle("is-scrolled",scrollY>8);
  scrolled();addEventListener("scroll",scrolled,{passive:true});

  const excluded=new Set(["apply.html","contact.html","application-success.html","enquiry-success.html","search.html","status.html","404.html","netlify-forms.html"]);
  const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
  if(!excluded.has(page)&&!document.querySelector(".rf-back-top")){
    const btn=document.createElement("button");
    btn.type="button";btn.className="rf-back-top";btn.setAttribute("aria-label","Back to top");
    btn.textContent="↑";document.body.appendChild(btn);
    const update=()=>btn.classList.toggle("is-visible",scrollY>600);
    update();addEventListener("scroll",update,{passive:true});
    btn.addEventListener("click",()=>scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));
  }

  /* ============================================================
     LIVE SITE SEARCH & INSTANT FINDER ENGINE
     ============================================================ */
  let searchIndexCache=null;
  let activeToken = 0;
  const isSafeUrl = url => {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (/^(https?:\/\/|\/|\.\/|[a-zA-Z0-9_#-]+\.html)/i.test(trimmed)) {
      return !/^javascript:/i.test(trimmed);
    }
    return false;
  };
  const loadSearchIndex=()=>{
    if(!searchIndexCache){
      searchIndexCache=fetch("data/search-index.json").then(response=>{
        if(!response.ok)throw new Error("Search unavailable");
        return response.json();
      }).then(data=>{
        if(!Array.isArray(data))throw new Error("Invalid search index");
        return data;
      }).catch(error=>{searchIndexCache=null;throw error});
    }
    return searchIndexCache;
  };

  const searchInto=async(query,input,container,limit,token)=>{
    const loadingP = document.createElement("p");
    loadingP.setAttribute("role", "status");
    loadingP.textContent = "Searching…";
    if(container.replaceChildren) container.replaceChildren(loadingP);
    else { container.innerHTML = ""; container.appendChild(loadingP); }
    try{
      const data=await loadSearchIndex();
      if(token !== activeToken)return;
      renderResults(queryIndex(query,data,limit),container);
    }catch(error){
      if(token !== activeToken)return;
      const errP = document.createElement("p");
      errP.setAttribute("role", "status");
      errP.textContent = "Search is temporarily unavailable. Try typing again or ";
      const errA = document.createElement("a");
      errA.href = "contact.html";
      errA.textContent = "contact the school";
      errP.appendChild(errA);
      errP.appendChild(document.createTextNode("."));
      if(container.replaceChildren) container.replaceChildren(errP);
      else { container.innerHTML = ""; container.appendChild(errP); }
    }
  };

  const getCategory=(url,title)=>{
    const u=(url||"").toLowerCase();
    const t=(title||"").toLowerCase();
    if(/cambridge|caps|primary|distance|academic|subject|syllabus|recognition/.test(u)||/cambridge|caps|primary|syllabus|curriculum/.test(t))return "Academics";
    if(/admission|require|fee|tuition|prospectus|apply|document/.test(u)||/admission|fee|tuition|apply|enrol/.test(t))return "Admissions";
    if(/campus|direction/.test(u)||/campus|location|noordhoek|maartens/.test(t))return "Campuses";
    if(/meet|story|staff|privacy/.test(u)||/about|story|staff/.test(t))return "About";
    if(/student|book|news/.test(u)||/student|book|life|news/.test(t))return "Student Life & News";
    if(/contact/.test(u)||/contact|enquiry/.test(t))return "Contact";
    return "Explore";
  };

  const escapeHtml=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  const queryIndex=(query,data,limit=8)=>{
    const term=(query||"").trim().toLowerCase();
    if(term.length<1)return [];
    const words=term.split(/\s+/).filter(Boolean);
    return data.filter(item => isSafeUrl(item.url)).map(item=>{
      const title=(item.title||"").toLowerCase();
      const desc=(item.description||"").toLowerCase();
      const text=(item.text||"").toLowerCase();
      const url=(item.url||"").toLowerCase();
      const cat=getCategory(item.url,item.title).toLowerCase();
      let score=0;
      words.forEach(w=>{
        if(title.includes(w))score+=15;
        if(url.includes(w))score+=10;
        if(cat.includes(w))score+=8;
        if(desc.includes(w))score+=5;
        if(text.includes(w))score+=2;
      });
      return {...item,category:getCategory(item.url,item.title),score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
  };

  const renderResults=(results,container)=>{
    if(!container)return;
    if(!results||results.length===0){
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "rf-search-no-results";
      const emptyP = document.createElement("p");
      const strongWords = ["Cambridge", "fees", "subjects", "admissions"];
      emptyP.appendChild(document.createTextNode("No matching pages found. Try broader terms like "));
      strongWords.forEach((word, idx) => {
        const strong = document.createElement("strong");
        strong.textContent = word;
        emptyP.appendChild(strong);
        if (idx < strongWords.length - 2) emptyP.appendChild(document.createTextNode(", "));
        else if (idx === strongWords.length - 2) emptyP.appendChild(document.createTextNode(", or "));
      });
      emptyP.appendChild(document.createTextNode("."));
      emptyDiv.appendChild(emptyP);
      if(container.replaceChildren) container.replaceChildren(emptyDiv);
      else { container.innerHTML = ""; container.appendChild(emptyDiv); }
      return;
    }
    const summaryDiv = document.createElement("div");
    summaryDiv.className = "rf-search-summary-count";
    summaryDiv.textContent = `Found ${results.length} relevant page${results.length===1?"":"s"}:`;
    
    const items = results.map(r => {
      const a = document.createElement("a");
      a.className = "rf-live-result-item";
      a.href = r.url;
      const headerDiv = document.createElement("div");
      headerDiv.className = "rf-live-result-header";
      const titleSpan = document.createElement("span");
      titleSpan.className = "rf-live-result-title";
      titleSpan.textContent = (r.title||"").split('|')[0].trim();
      const badgeSpan = document.createElement("span");
      badgeSpan.className = "rf-live-result-badge";
      badgeSpan.textContent = r.category;
      headerDiv.appendChild(titleSpan);
      headerDiv.appendChild(badgeSpan);
      const descP = document.createElement("p");
      descP.className = "rf-live-result-desc";
      descP.textContent = r.description || "Explore information on the official Ridgefield Academy website.";
      const metaSpan = document.createElement("span");
      metaSpan.className = "rf-live-result-meta";
      metaSpan.textContent = "Visit page →";
      
      a.appendChild(headerDiv);
      a.appendChild(descP);
      a.appendChild(metaSpan);
      return a;
    });
    
    if(container.replaceChildren) container.replaceChildren(summaryDiv, ...items);
    else { container.innerHTML = ""; container.appendChild(summaryDiv); items.forEach(i => container.appendChild(i)); }
  };

  // Homepage Live Finder handler
  const homeSearchInput=document.getElementById("homeSiteSearch");
  const homeSearchResults=document.getElementById("homeSearchResults");
  if(homeSearchInput&&homeSearchResults){
    homeSearchResults.setAttribute("aria-live","polite");
    const doHomeSearch=async()=>{
      const currentToken = ++activeToken;
      const q=homeSearchInput.value;
      if(!q.trim()){
        if(homeSearchResults.replaceChildren) homeSearchResults.replaceChildren();
        else homeSearchResults.innerHTML="";
        return;
      }
      await searchInto(q,homeSearchInput,homeSearchResults,6,currentToken);
    };

    homeSearchInput.addEventListener("input",doHomeSearch);

    document.querySelectorAll(".rf-search-pill").forEach(pill=>{
      pill.addEventListener("click",e=>{
        e.preventDefault();
        const term=pill.textContent.trim();
        homeSearchInput.value=term;
        homeSearchInput.focus();
        doHomeSearch();
      });
    });
  }

  // Global Search Modal setup (Cmd+K / Click search link)
  let searchModal=null, searchOpener=null;
  let backgroundState=[];
  const closeSearchModal=()=>{
    if(!searchModal?.classList.contains("is-open"))return;
    searchModal.classList.remove("is-open");
    document.documentElement.classList.remove("rf-search-open");
    backgroundState.forEach(([element,inert])=>{element.inert=inert});
    backgroundState=[];
    searchOpener?.focus({preventScroll:true});
  };
  const openSearchModal=async()=>{
    if(!searchModal){
      searchModal=document.createElement("div");
      searchModal.className="rf-modal-backdrop";
      searchModal.innerHTML=`
        <div class="rf-modal-dialog" role="dialog" aria-modal="true" aria-label="Site Search">
          <div class="rf-modal-head">
            <div class="rf-modal-input-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="search" placeholder="Search anything (Cambridge, fees, subjects, campus, admissions)..." aria-label="Search site">
            </div>
            <button type="button" class="rf-modal-close" aria-label="Close search">Close</button>
          </div>
          <div class="rf-modal-body" aria-live="polite"></div>
          <div class="rf-modal-footer">
            <span>Tap outside or press Esc to close</span>
            <span><a href="search.html" class="rf-modal-footer-link">Full search page →</a></span>
          </div>
        </div>
      `;
      document.body.appendChild(searchModal);

      const input=searchModal.querySelector("input");
      const body=searchModal.querySelector(".rf-modal-body");

      const runModalSearch=async()=>{
        const currentToken = ++activeToken;
        const q=input.value;
        if(!q.trim()){
          const wrapper = document.createElement("div");
          wrapper.className = "rf-modal-prompt-wrap";
          
          const p = document.createElement("p");
          p.className = "rf-modal-prompt-title";
          p.textContent = "Type what you are looking for, or try:";
          
          const pillsDiv = document.createElement("div");
          pillsDiv.className = "rf-modal-prompt-pills";
          
          const pills = [
            { text: "Cambridge", url: "search.html?q=Cambridge" },
            { text: "CAPS Secondary", url: "search.html?q=CAPS" },
            { text: "Fees", url: "search.html?q=Fees" },
            { text: "Subjects", url: "search.html?q=Subjects" },
            { text: "Apply", url: "search.html?q=Apply" }
          ];
          pills.forEach(pillInfo => {
            const a = document.createElement("a");
            a.className = "rf-search-pill";
            a.href = pillInfo.url;
            a.textContent = pillInfo.text;
            pillsDiv.appendChild(a);
          });
          
          wrapper.appendChild(p);
          wrapper.appendChild(pillsDiv);
          
          if(body.replaceChildren) body.replaceChildren(wrapper);
          else { body.innerHTML=""; body.appendChild(wrapper); }
          return;
        }
        await searchInto(q,input,body,7,currentToken);
      };

      input.addEventListener("input",runModalSearch);
      searchModal.querySelector(".rf-modal-close").addEventListener("click",closeSearchModal);
      body.addEventListener("click",e=>{
        const pill=e.target.closest(".rf-search-pill");
        if(!pill || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)return;
        e.preventDefault();
        input.value=new URL(pill.href).searchParams.get("q")||"";
        input.focus();
        runModalSearch();
      });
      searchModal.addEventListener("click",e=>{
        if(e.target===searchModal)closeSearchModal();
      });
      runModalSearch();
    }

    if(searchModal.classList.contains("is-open"))return;
    searchOpener=document.activeElement;
    if(drawer?.contains(searchOpener))searchOpener=menu;
    closeMega();
    setDrawer(false);
    backgroundState=[...document.body.children].filter(el=>el!==searchModal).map(el=>[el,el.inert]);
    backgroundState.forEach(([element])=>{element.inert=true});
    searchModal.classList.add("is-open");
    document.documentElement.classList.add("rf-search-open");
    const input=searchModal.querySelector("input");
    input?.focus({preventScroll:true});
  };

  document.querySelectorAll("[data-rf-search-trigger], a[href='search.html']").forEach(trigger=>{
    trigger.addEventListener("click",e=>{
      if(!location.pathname.endsWith("search.html") && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey){
        e.preventDefault();
        openSearchModal();
      }
    });
  });

  document.addEventListener("keydown",e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){
      e.preventDefault();
      openSearchModal();
    }
    if(e.key==="Tab"&&searchModal?.classList.contains("is-open")){
      const items=[...searchModal.querySelectorAll('a[href],button,input')].filter(el=>!el.disabled);
      const first=items[0],last=items[items.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus()}
    }
    if(e.key==="Escape"&&searchModal?.classList.contains("is-open")){
      closeSearchModal();
    }
  });
})();
