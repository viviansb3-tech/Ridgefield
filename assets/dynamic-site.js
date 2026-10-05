
(() => {
  const body=document.body;
  const header=document.querySelector('.rf-header');
  const progress=document.querySelector('.rf-progress');
  const menu=document.querySelector('.rf-menu');
  const toggle=document.querySelector('.rf-menu-toggle');

  const update=()=>{
    const y=window.scrollY;
    body.style.setProperty('--scroll-y', `${y}px`);
    body.style.setProperty('--scroll-shift', `${Math.min(y,900)}px`);
    if(header) header.classList.toggle('scrolled', y>40);
    if(progress){
      const max=document.documentElement.scrollHeight-window.innerHeight;
      progress.style.width=`${max>0 ? Math.min(100,(y/max)*100) : 0}%`;
    }
  };
  window.addEventListener('scroll',update,{passive:true});
  update();

  if(toggle && menu){
    toggle.addEventListener('click',()=>menu.classList.toggle('open'));
  }

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting) e.target.classList.add('visible');
    });
  },{threshold:.14,rootMargin:'0px 0px -60px'});
  document.querySelectorAll('.rf-reveal').forEach(el=>observer.observe(el));

  document.querySelectorAll('[data-counter]').forEach(el=>{
    const target=Number(el.dataset.counter)||0;
    const suffix=el.dataset.suffix||'';
    let done=false;
    const obs=new IntersectionObserver(es=>{
      es.forEach(e=>{
        if(e.isIntersecting && !done){
          done=true; const start=performance.now(),duration=1200;
          const tick=t=>{
            const p=Math.min(1,(t-start)/duration);
            const eased=1-Math.pow(1-p,3);
            el.textContent=Math.round(target*eased).toLocaleString()+suffix;
            if(p<1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
    });
    obs.observe(el);
  });

  // Active navigation section
  const links=[...document.querySelectorAll('.rf-menu a[href^="#"]')];
  const sections=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const navObs=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+entry.target.id));
      }
    });
  },{threshold:.35});
  sections.forEach(s=>navObs.observe(s));
})();
