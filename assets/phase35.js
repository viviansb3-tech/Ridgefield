
/* Ridgefield Phase 35 — scroll storytelling engine */
(() => {
  const root=document.documentElement;
  const update=()=>{
    const y=window.scrollY||0;
    root.style.setProperty('--rf35-parallax', `${Math.min(y,1200)*-.08}px`);
  };
  window.addEventListener('scroll',update,{passive:true}); update();

  const io=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting) entry.target.classList.add('in');
    });
  },{threshold:.14,rootMargin:'0px 0px -70px'});
  document.querySelectorAll('.rf35-reveal35,.rf35-stagger').forEach(el=>io.observe(el));

  // Add subtle active state to any Phase-35 section navigation.
  const navLinks=[...document.querySelectorAll('a[href^="#"]')];
  const sections=[...document.querySelectorAll('.rf35-snap[id]')];
  const nio=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        navLinks.forEach(a=>{
          if(a.getAttribute('href')?.startsWith('#'))
            a.classList.toggle('rf35-active',a.getAttribute('href')==='#'+entry.target.id);
        });
      }
    });
  },{threshold:.45});
  sections.forEach(s=>nio.observe(s));
})();
