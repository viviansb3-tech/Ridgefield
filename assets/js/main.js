document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });
    nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => nav.classList.remove("open")));
  }

  // Phase 49 — smoother, staggered scroll reveals.
  // Respect reduced-motion preferences and avoid hiding content when observers are unavailable.
  const reveal = document.querySelectorAll(
    ".reveal, .content-card, .feature-card, .stat, .section-heading, .section > .container, .page-hero > .container"
  );
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion && "IntersectionObserver" in window) {
    reveal.forEach((el, index) => {
      if (el.dataset.revealBound) return;
      el.dataset.revealBound = "true";
      el.classList.add("reveal-ready");
      el.style.setProperty("--reveal-delay", `${Math.min(index % 5, 4) * 70}ms`);
    });
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, {threshold:.08, rootMargin:"0px 0px -8% 0px"});
    reveal.forEach(el => observer.observe(el));
  } else {
    reveal.forEach(el => el.classList.add("is-visible"));
  }

  // Smooth in-page navigation with a small offset for the sticky header.
  document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach(link => {
    link.addEventListener("click", event => {
      const id = link.getAttribute("href");
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block:"start"});
      history.replaceState(null, "", id);
    });
  });

  // Gallery lightbox
  const lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.innerHTML = '<button aria-label="Close image">&times;</button><img alt="Expanded gallery image">';
  document.body.appendChild(lightbox);
  const lbImg = lightbox.querySelector("img");
  document.querySelectorAll(".gallery-grid img[data-lightbox]").forEach(img => {
    img.addEventListener("click", () => { lbImg.src = img.src; lbImg.alt = img.alt; lightbox.classList.add("open"); document.body.style.overflow="hidden"; });
  });
  lightbox.addEventListener("click", e => { if(e.target===lightbox || e.target.tagName==='BUTTON'){ lightbox.classList.remove("open"); document.body.style.overflow=""; }});

  // Apply/contact forms: client-side validation + email handoff for a static site.
  document.querySelectorAll("form[data-mailto]").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = new FormData(form);
      const subject = encodeURIComponent(data.get("subject") || "Ridgefield Academy enquiry");
      const lines = [];
      for (const [key,value] of data.entries()) if (key !== "subject") lines.push(`${key}: ${value}`);
      const body = encodeURIComponent(lines.join("\n"));
      window.location.href = `mailto:${form.dataset.mailto}?subject=${subject}&body=${body}`;
      const status = form.querySelector(".form-status");
      if(status) status.textContent = "Your email application is being opened. Please review and send it from your email app.";
    });
  });

  // Current year
  document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

  // Lightweight cookie preference (no tracking scripts are installed).
  const banner = document.querySelector(".cookie-banner");
  const accept = document.querySelector("[data-cookie-accept]");
  if (banner && !localStorage.getItem("ridgefield-cookie-choice")) banner.classList.add("show");
  if (accept) accept.addEventListener("click", () => { localStorage.setItem("ridgefield-cookie-choice","accepted"); banner.classList.remove("show"); });
});
