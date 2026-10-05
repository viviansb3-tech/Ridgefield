
(() => {
  const cards=[...document.querySelectorAll('.rf36-card')];
  const selected=document.querySelector('#rf36-selected-programme');
  const name=document.querySelector('#rf36-programme-name');
  const copy=document.querySelector('#rf36-programme-copy');
  const link=document.querySelector('#rf36-enrol-link');

  cards.forEach(card=>{
    card.addEventListener('click',()=>{
      cards.forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      const programme=card.dataset.programme||'';
      if(name) name.textContent=programme;
      if(copy) copy.textContent=card.dataset.enrol||'Select this programme before continuing with enrolment.';
      if(link){
        link.href=card.dataset.apply||'#rf36-selected-programme';
        link.textContent=`Continue with ${programme} enrolment`;
      }
      if(selected) selected.scrollIntoView({behavior:'smooth',block:'center'});
    });
  });
})();
