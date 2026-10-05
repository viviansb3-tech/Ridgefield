import re

with open('assets/rf-nav.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add activeToken and isSafeUrl
if 'let activeToken = 0;' not in code:
    code = code.replace('let searchIndexCache=null;', 'let searchIndexCache=null;\n  let activeToken = 0;\n  const isSafeUrl = url => {\n    if (!url || typeof url !== "string") return false;\n    const trimmed = url.trim();\n    if (/^(https?:\\/\\/|\\/|\\.\\/|[a-zA-Z0-9_#-]+\\.html)/i.test(trimmed)) {\n      return !/^javascript:/i.test(trimmed);\n    }\n    return false;\n  };')

# 2. modify searchInto
searchIntoPattern = re.compile(r'const searchInto=async\(query,input,container,limit\)=>\{[\s\S]*?\};\n')
searchIntoReplacement = """const searchInto=async(query,input,container,limit,token)=>{
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
  };\n"""
code = searchIntoPattern.sub(searchIntoReplacement, code)

# 3. modify queryIndex to use isSafeUrl
code = code.replace(
    'return data.map(item=>{',
    'return data.filter(item => isSafeUrl(item.url)).map(item=>{'
)

# 4. modify renderResults
renderResultsPattern = re.compile(r'const renderResults=\(results,container\)=>\{[\s\S]*?\};\n')
renderResultsReplacement = """const renderResults=(results,container)=>{
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
  };\n"""
code = renderResultsPattern.sub(renderResultsReplacement, code)

# 5. doHomeSearch
doHomeSearchPattern = re.compile(r'const doHomeSearch=async\(\)=>\{[\s\S]*?await searchInto\(q,homeSearchInput,homeSearchResults,6\);\n    \};')
doHomeSearchReplacement = """const doHomeSearch=async()=>{
      const currentToken = ++activeToken;
      const q=homeSearchInput.value;
      if(!q.trim()){
        if(homeSearchResults.replaceChildren) homeSearchResults.replaceChildren();
        else homeSearchResults.innerHTML="";
        return;
      }
      await searchInto(q,homeSearchInput,homeSearchResults,6,currentToken);
    };"""
code = doHomeSearchPattern.sub(doHomeSearchReplacement, code)

# 6. runModalSearch
runModalSearchPattern = re.compile(r'const runModalSearch=async\(\)=>\{[\s\S]*?await searchInto\(q,input,body,7\);\n      \};')
runModalSearchReplacement = """const runModalSearch=async()=>{
        const currentToken = ++activeToken;
        const q=input.value;
        if(!q.trim()){
          const wrapper = document.createElement("div");
          wrapper.style.padding = "16px 8px";
          wrapper.style.textAlign = "center";
          wrapper.style.color = "#66736d";
          
          const p = document.createElement("p");
          p.style.margin = "0 0 10px";
          p.style.fontWeight = "700";
          p.textContent = "Type what you are looking for, or try:";
          
          const pillsDiv = document.createElement("div");
          pillsDiv.style.display = "flex";
          pillsDiv.style.gap = "6px";
          pillsDiv.style.flexWrap = "wrap";
          pillsDiv.style.justifyContent = "center";
          
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
      };"""
code = runModalSearchPattern.sub(runModalSearchReplacement, code)

with open('assets/rf-nav.js', 'w', encoding='utf-8') as f:
    f.write(code)

print('patched via python')
