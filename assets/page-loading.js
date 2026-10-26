(() => {
  if (document.readyState !== 'loading' || !document.body) return;
  const shell = document.createElement('div');
  shell.className = 'rf-page-skeleton';
  shell.setAttribute('role', 'status');
  shell.setAttribute('aria-label', 'Loading page');
  shell.innerHTML = '<span class="rf-loading-label">Loading page…</span><div class="rf-skeleton-nav"></div><div class="rf-skeleton-title"></div><div class="rf-skeleton-line"></div><div class="rf-skeleton-line short"></div><div class="rf-skeleton-cards"><div></div><div></div><div></div></div>';
  let shown = false;
  const timer = setTimeout(() => { if(document.readyState === 'loading'){document.body.append(shell);shown=true;} }, 150);
  function clear(){clearTimeout(timer);if(shown)shell.remove();}
  document.addEventListener('DOMContentLoaded',clear,{once:true});
  window.addEventListener('pageshow',clear,{once:true});
  // Always release the page, including a failed or stalled dependent script.
  setTimeout(clear,5000);
})();
