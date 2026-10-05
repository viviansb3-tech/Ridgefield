(() => {
  "use strict";

  const q = document.getElementById("siteSearch");
  const results = document.getElementById("searchResults");
  const count = document.getElementById("searchCount");
  const button = document.getElementById("siteSearchButton");

  if (!q || !results || !count) return;

  let indexPromise = null;
  let activeToken = 0;

  const getCategory = (url, title) => {
    const u = (url || "").toLowerCase();
    const t = (title || "").toLowerCase();
    if (/cambridge|caps|primary|distance|academic|subject|syllabus|recognition/.test(u) || /cambridge|caps|primary|syllabus|curriculum/.test(t)) return "Academics";
    if (/admission|require|fee|tuition|prospectus|apply|document/.test(u) || /admission|fee|tuition|apply|enrol/.test(t)) return "Admissions";
    if (/campus|direction/.test(u) || /campus|location|noordhoek|maartens/.test(t)) return "Campuses";
    if (/meet|story|staff|privacy/.test(u) || /about|story|staff/.test(t)) return "About";
    if (/student|book|news/.test(u) || /student|book|life|news/.test(t)) return "Student Life & News";
    if (/contact/.test(u) || /contact|enquiry/.test(t)) return "Contact";
    return "Explore";
  };

  const isSafeUrl = url => {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (/^(https?:\/\/|\/|\.\/|[a-zA-Z0-9_#-]+\.html)/i.test(trimmed)) {
      return !/^javascript:/i.test(trimmed);
    }
    return false;
  };

  const loadIndex = () => {
    if (!indexPromise) {
      indexPromise = fetch("data/search-index.json").then(response => {
        if (!response.ok) throw new Error("Search index request failed");
        return response.json();
      }).then(data => {
        if (!Array.isArray(data)) throw new Error("Invalid search index payload");
        return data;
      }).catch(err => {
        indexPromise = null;
        throw err;
      });
    }
    return indexPromise;
  };

  const queryIndex = (term, data) => {
    const words = term.toLowerCase().split(/\s+/).filter(Boolean);
    return data.filter(item => isSafeUrl(item.url)).map(item => {
      const title = (item.title || "").toLowerCase();
      const desc = (item.description || "").toLowerCase();
      const text = (item.text || "").toLowerCase();
      const url = (item.url || "").toLowerCase();
      const cat = getCategory(item.url, item.title).toLowerCase();
      let score = 0;
      words.forEach(w => {
        if (title.includes(w)) score += 15;
        if (url.includes(w)) score += 10;
        if (cat.includes(w)) score += 8;
        if (desc.includes(w)) score += 5;
        if (text.includes(w)) score += 2;
      });
      return { ...item, category: getCategory(item.url, item.title), score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  };

  const setBusy = busy => {
    results.setAttribute("aria-busy", busy ? "true" : "false");
  };

  const updateUrl = term => {
    try {
      if (typeof history !== "undefined" && history.replaceState) {
        const nextUrl = term.length >= 2 ? `${location.pathname || "search.html"}?q=${encodeURIComponent(term)}` : (location.pathname || "search.html");
        history.replaceState(null, "", nextUrl);
      }
    } catch (e) {}
  };

  const showPrompt = () => {
    setBusy(false);
    count.textContent = "";
    const msg = document.createElement("p");
    msg.textContent = "Enter at least two characters to search.";
    msg.setAttribute("role", "status");
    if (results.replaceChildren) {
      results.replaceChildren(msg);
    } else if (results.appendChild) {
      results.innerHTML = "";
      results.appendChild(msg);
    } else {
      results.innerHTML = '<p role="status">Enter at least two characters to search.</p>';
    }
  };

  const showError = () => {
    setBusy(false);
    count.textContent = "Search is temporarily unavailable.";
    const p = document.createElement("p");
    p.textContent = "We could not load search results. Please try again.";
    p.setAttribute("role", "status");
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = "Retry search";
    retryBtn.className = "rf-contact-btn rf-mt-sm";
    retryBtn.addEventListener("click", () => run());
    if (results.replaceChildren) {
      results.replaceChildren(p, retryBtn);
    } else if (results.appendChild) {
      results.innerHTML = "";
      results.appendChild(p);
      results.appendChild(retryBtn);
    } else {
      results.innerHTML = '<p role="status">We could not load search results. Please try again.</p><button type="button" class="rf-contact-btn">Retry search</button>';
    }
  };

  const run = async () => {
    const currentToken = ++activeToken;
    const term = q.value.trim();
    updateUrl(term);

    if (term.length < 2) {
      showPrompt();
      return;
    }

    setBusy(true);

    const loadingP = document.createElement("p");
    loadingP.textContent = "Searching…";
    loadingP.setAttribute("role", "status");
    if (results.replaceChildren) {
      results.replaceChildren(loadingP);
    } else if (results.appendChild) {
      results.innerHTML = "";
      results.appendChild(loadingP);
    } else {
      results.innerHTML = '<p role="status">Searching…</p>';
    }

    try {
      const data = await loadIndex();
      if (currentToken !== activeToken) return;

      const matches = queryIndex(term, data);
      const total = matches.length;
      const display = matches.slice(0, 15);

      setBusy(false);
      if (total === 0) {
        count.textContent = "0 results";
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "rf-search-no-results";
        const emptyP = document.createElement("p");
        emptyP.textContent = "No matching pages found. Try broader terms like Cambridge, fees, subjects, or admissions.";
        emptyDiv.appendChild(emptyP);
        if (results.replaceChildren) {
          results.replaceChildren(emptyDiv);
        } else if (results.appendChild) {
          results.innerHTML = "";
          results.appendChild(emptyDiv);
        } else {
          results.innerHTML = '<div class="rf-search-no-results"><p>No matching pages found. Try broader terms like Cambridge, fees, subjects, or admissions.</p></div>';
        }
      } else {
        count.textContent = total > 15 ? `Showing 15 of ${total} results` : `${total} result${total === 1 ? "" : "s"}`;
        const articles = display.map(item => {
          const article = document.createElement("article");
          article.className = "rf-search-result";

          const headerDiv = document.createElement("div");
          headerDiv.className = "rf-live-result-header";

          const link = document.createElement("a");
          link.href = item.url;
          link.textContent = (item.title || "").split("|")[0].trim();

          const badge = document.createElement("span");
          badge.className = "rf-live-result-badge";
          badge.textContent = item.category;

          headerDiv.appendChild(link);
          headerDiv.appendChild(badge);

          const desc = document.createElement("p");
          desc.textContent = item.description || "Ridgefield Academy information page.";

          article.appendChild(headerDiv);
          article.appendChild(desc);
          return article;
        });

        if (results.replaceChildren) {
          results.replaceChildren(...articles);
        } else if (results.appendChild) {
          results.innerHTML = "";
          articles.forEach(a => results.appendChild(a));
        } else {
          results.innerHTML = display.map(item => `
            <article class="rf-search-result">
              <div class="rf-live-result-header">
                <a href="${item.url}">${(item.title || "").split("|")[0].trim()}</a>
                <span class="rf-live-result-badge">${item.category}</span>
              </div>
              <p>${item.description || "Ridgefield Academy information page."}</p>
            </article>
          `).join("");
        }
      }
    } catch (err) {
      if (currentToken !== activeToken) return;
      showError();
    }
  };

  q.addEventListener("input", () => run());
  button?.addEventListener("click", () => run());
  q.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });

  const initialQuery = new URLSearchParams(location.search).get("q");
  if (initialQuery) {
    q.value = initialQuery;
    run();
  }
})();
