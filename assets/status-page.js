
fetch("health.json",{cache:"no-store"}).then(r=>r.json()).then(x=>{
 document.getElementById("release").textContent=x.release||"B-ANTIGRAVITY-MERGED";
 document.getElementById("build").textContent=x.buildId||"B-ANTIGRAVITY-MERGED-20261005T214100Z";
}).catch(()=>{});
